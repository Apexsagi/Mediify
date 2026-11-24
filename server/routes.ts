import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  generateTotpCode,
  hashPassword,
  rateLimit,
  requireAuth,
  requireRole,
  signSessionToken,
  verifyPassword,
  verifyTotpCode,
  writeAuditLog,
} from './auth';
import { db, UPLOADS_ROOT } from './db';
import {
  performGeminiOcrExtraction,
  runClinicalExtractionAndCoding,
  validateExternalInferenceUrl,
} from './ai/providerRegistry';
import {
  evaluateDenialRisks,
  evaluateRevenueIntegrity,
  runDeterministicCodingValidation,
} from '../src/lib/codingValidator';
import { sanitizeClinicalDocument } from '../src/lib/promptSanitizer';
import type {
  AIModelConfig,
  CodingRecommendation,
  EligibilityVerification,
  Encounter,
  ExtractedEntity,
  NcciEditRule,
  Patient,
  PayerPolicyRule,
  ReferenceCode,
  UserRole,
} from '../src/lib/types';

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_ROOT),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    cb(null, `doc-${crypto.randomUUID()}${safeExt}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/plain',
      'application/pdf',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/webp',
      'text/csv',
    ];
    if (allowed.includes(file.mimetype) || /\.(txt|pdf|json|hl7|png|jpg|jpeg|webp)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported clinical document format. Allowed: PDF, TXT, JSON/FHIR, HL7, PNG, JPG, WEBP.'));
    }
  },
});

function loadCatalog(): ReferenceCode[] {
  return db.prepare('SELECT * FROM reference_codes ORDER BY code_system, code').all() as unknown as ReferenceCode[];
}

function loadNcciRules(): NcciEditRule[] {
  return db.prepare('SELECT * FROM ncci_edit_rules').all() as unknown as NcciEditRule[];
}

function loadPayerPolicies(): PayerPolicyRule[] {
  const rows = db.prepare('SELECT * FROM payer_policies').all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    policy_code: String(r.policy_code),
    policy_type: r.policy_type as PayerPolicyRule['policy_type'],
    payer_name: String(r.payer_name),
    title: String(r.title),
    procedure_codes: JSON.parse(String(r.procedure_codes_json || '[]')) as string[],
    covered_icd10_codes: JSON.parse(String(r.covered_icd10_codes_json || '[]')) as string[],
    documentation_requirements: String(r.documentation_requirements),
    timely_filing_days: Number(r.timely_filing_days),
    prior_auth_required: Number(r.prior_auth_required),
  }));
}

function recomputeEncounterValidationAndRisks(organizationId: string, encounterId: string) {
  const encounter = db
    .prepare('SELECT * FROM encounters WHERE id = ? AND organization_id = ?')
    .get(encounterId, organizationId) as unknown as Encounter | undefined;
  if (!encounter) return null;

  const patient = db
    .prepare('SELECT * FROM patients WHERE id = ? AND organization_id = ?')
    .get(encounter.patient_id, organizationId) as unknown as Patient | undefined;
  if (!patient) return null;

  const recommendations = db
    .prepare('SELECT * FROM coding_recommendations WHERE encounter_id = ? AND organization_id = ? ORDER BY created_at ASC')
    .all(encounterId, organizationId) as unknown as CodingRecommendation[];

  const entities = db
    .prepare('SELECT * FROM extracted_clinical_entities WHERE encounter_id = ? AND organization_id = ?')
    .all(encounterId, organizationId) as unknown as ExtractedEntity[];

  const latestEligibility = db
    .prepare(
      'SELECT * FROM eligibility_verifications WHERE patient_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(patient.id, organizationId) as unknown as EligibilityVerification | undefined;

  const catalog = loadCatalog();
  const ncciRules = loadNcciRules();
  const payerPolicies = loadPayerPolicies();

  const validations = runDeterministicCodingValidation({
    encounter,
    patient,
    recommendations,
    entities,
    catalog,
    ncciRules,
    payerPolicies,
    latestEligibility: latestEligibility ?? null,
  });

  const denialRisks = evaluateDenialRisks({
    encounter,
    recommendations,
    validations,
    payerPolicies,
    catalog,
    latestEligibility: latestEligibility ?? null,
  });

  const integrityFindings = evaluateRevenueIntegrity({
    encounter,
    entities,
    recommendations,
    validations,
  });

  const now = new Date().toISOString();

  db.prepare('DELETE FROM coding_validations WHERE encounter_id = ? AND organization_id = ?').run(encounterId, organizationId);
  const insertVal = db.prepare(`
    INSERT INTO coding_validations (id, organization_id, encounter_id, rule_category, severity, code_involved, message, policy_reference, remediation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const v of validations) {
    insertVal.run(`val-${crypto.randomUUID()}`, organizationId, encounterId, v.rule_category, v.severity, v.code_involved, v.message, v.policy_reference, v.remediation, now);
  }

  db.prepare('DELETE FROM denial_risks WHERE encounter_id = ? AND organization_id = ?').run(encounterId, organizationId);
  const insertRisk = db.prepare(`
    INSERT INTO denial_risks (id, organization_id, encounter_id, risk_category, severity, supporting_evidence, applicable_policy, recommended_action, review_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of denialRisks) {
    insertRisk.run(`dr-${crypto.randomUUID()}`, organizationId, encounterId, r.risk_category, r.severity, r.supporting_evidence, r.applicable_policy, r.recommended_action, r.review_status, now);
  }

  db.prepare('DELETE FROM revenue_integrity_findings WHERE encounter_id = ? AND organization_id = ?').run(encounterId, organizationId);
  const insertInt = db.prepare(`
    INSERT INTO revenue_integrity_findings (id, organization_id, encounter_id, finding_type, code_involved, summary, clinical_evidence, compliance_note, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const f of integrityFindings) {
    insertInt.run(`rif-${crypto.randomUUID()}`, organizationId, encounterId, f.finding_type, f.code_involved, f.summary, f.clinical_evidence, f.compliance_note, f.priority, f.status, now);
  }

  // Update individual recommendation validation_status based on deterministic checks
  for (const rec of recommendations) {
    const codeErrors = validations.filter((v) => v.severity === 'ERROR' && v.code_involved.includes(rec.code));
    const codeWarnings = validations.filter((v) => v.severity === 'WARNING' && v.code_involved.includes(rec.code));
    const nextStatus = codeErrors.length > 0 ? 'FAILED' : codeWarnings.length > 0 ? 'WARNING' : 'PASSED';
    db.prepare('UPDATE coding_recommendations SET validation_status = ? WHERE id = ? AND organization_id = ?').run(
      nextStatus,
      rec.id,
      organizationId,
    );
  }

  return { validations, denialRisks, integrityFindings };
}

export function createApiRouter(): Router {
  const router = express.Router();

  // Healthcheck
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mediify-api', timestamp: new Date().toISOString() });
  });

  // --- AUTHENTICATION & ONBOARDING ---
  router.get('/auth/status', (_req, res) => {
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get()?.c as number) ?? 0;
    const orgCount = (db.prepare('SELECT COUNT(*) as c FROM organizations').get()?.c as number) ?? 0;
    res.json({
      hasUsers: userCount > 0,
      hasOrganizations: orgCount > 0,
      syntheticSandboxAvailable: true,
    });
  });

  router.post('/auth/register', rateLimit(20, 60_000), (req, res) => {
    const schema = z.object({
      organizationName: z.string().min(2).max(120),
      npi: z.string().regex(/^\d{10}$/, 'Organization NPI must be 10 digits'),
      taxId: z.string().min(4).max(20),
      specialty: z.string().min(2).max(120),
      fullName: z.string().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(10, 'Password must be at least 10 characters'),
      credentials: z.string().max(40).default(''),
      syntheticMode: z.boolean().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration payload' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email.toLowerCase());
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const orgId = `org-${crypto.randomUUID()}`;
    const userId = `usr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO organizations (id, name, npi, tax_id, specialty, retention_days, baa_attested, synthetic_mode, onboarding_completed, created_at)
      VALUES (?, ?, ?, ?, ?, 2555, 0, ?, 0, ?)
    `).run(
      orgId,
      parsed.data.organizationName.trim(),
      parsed.data.npi,
      parsed.data.taxId.trim(),
      parsed.data.specialty.trim(),
      parsed.data.syntheticMode ? 1 : 0,
      now,
    );

    db.prepare(`
      INSERT INTO users (id, organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 'admin', ?, 0, 1, ?)
    `).run(
      userId,
      orgId,
      parsed.data.email.toLowerCase(),
      hashPassword(parsed.data.password),
      parsed.data.fullName.trim(),
      parsed.data.credentials.trim(),
      now,
    );

    // Provision default AI model & integration templates for the new org
    db.prepare(`
      INSERT INTO ai_model_configs (id, organization_id, display_name, provider_type, model_name, api_url, timeout_ms, max_tokens, is_active, approved_for_phi, baa_status, last_health_status, last_health_message)
      VALUES (?, ?, 'Google Gemini Clinical Extraction', 'gemini', 'gemini-4-hydrogen', 'https://generativelanguage.googleapis.com', 35000, 8192, 1, 0, 'NOT_APPLICABLE_SYNTHETIC', ?, ?)
    `).run(
      `ai-${crypto.randomUUID()}`,
      orgId,
      process.env.GEMINI_API_KEY ? 'HEALTHY' : 'UNCONFIGURED',
      process.env.GEMINI_API_KEY ? 'Server-side GEMINI_API_KEY active.' : 'GEMINI_API_KEY not configured.',
    );

    db.prepare(`
      INSERT INTO ai_model_configs (id, organization_id, display_name, provider_type, model_name, api_url, timeout_ms, max_tokens, is_active, approved_for_phi, baa_status, last_health_status, last_health_message)
      VALUES (?, ?, 'LingSante-3.1-air-VL (Primary Medical VLM)', 'lingsante', 'inclusionAI/LingSante-3.1-air-VL', '', 45000, 8192, 0, 0, 'REQUIRES_BAA', 'UNCONFIGURED', 'Configure LINGSANTE_API_URL and credentials.')
    `).run(`ai-${crypto.randomUUID()}`, orgId);

    const token = signSessionToken({
      uid: userId,
      oid: orgId,
      email: parsed.data.email.toLowerCase(),
      role: 'admin',
      mfa: false,
    });

    writeAuditLog({
      organizationId: orgId,
      userId,
      userEmail: parsed.data.email.toLowerCase(),
      action: 'ORGANIZATION_REGISTERED',
      resourceType: 'organization',
      resourceId: orgId,
      details: `Registered organization "${parsed.data.organizationName}" (NPI: ${parsed.data.npi}).`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        organization_id: orgId,
        email: parsed.data.email.toLowerCase(),
        full_name: parsed.data.fullName.trim(),
        role: 'admin',
        credentials: parsed.data.credentials.trim(),
        mfa_enabled: 0,
      },
    });
  });

  router.post('/auth/login', rateLimit(20, 60_000), (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      mfaCode: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password are required.' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(parsed.data.email.toLowerCase()) as
      | {
          id: string;
          organization_id: string;
          email: string;
          password_hash: string;
          full_name: string;
          role: UserRole;
          credentials: string;
          mfa_enabled: number;
          mfa_secret: string | null;
          is_active: number;
        }
      | undefined;

    if (!user || user.is_active !== 1 || !verifyPassword(parsed.data.password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (user.mfa_enabled === 1 && user.mfa_secret) {
      if (!parsed.data.mfaCode) {
        res.status(200).json({ mfaRequired: true, email: user.email });
        return;
      }
      if (!verifyTotpCode(user.mfa_secret, parsed.data.mfaCode)) {
        res.status(401).json({ error: 'Invalid MFA verification code.' });
        return;
      }
    }

    const token = signSessionToken({
      uid: user.id,
      oid: user.organization_id,
      email: user.email,
      role: user.role,
      mfa: user.mfa_enabled === 1,
    });

    writeAuditLog({
      organizationId: user.organization_id,
      userId: user.id,
      userEmail: user.email,
      action: 'USER_LOGIN',
      resourceType: 'session',
      resourceId: user.id,
      details: `User authenticated (${user.role}).`,
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: user.id,
        organization_id: user.organization_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        credentials: user.credentials,
        mfa_enabled: user.mfa_enabled,
      },
    });
  });

  // Explicit Synthetic Sandbox Login (for testing/evaluation only, scoped strictly to synthetic org)
  router.post('/auth/demo-sandbox', rateLimit(30, 60_000), (req, res) => {
    const user = db
      .prepare('SELECT * FROM users WHERE id = ? AND organization_id = ?')
      .get('usr-demo-director', 'org-synthetic-sandbox') as
      | {
          id: string;
          organization_id: string;
          email: string;
          full_name: string;
          role: UserRole;
          credentials: string;
          mfa_enabled: number;
        }
      | undefined;

    if (!user) {
      res.status(404).json({ error: 'Synthetic sandbox organization is not initialized.' });
      return;
    }

    const token = signSessionToken({
      uid: user.id,
      oid: user.organization_id,
      email: user.email,
      role: user.role,
      mfa: false,
    });

    // Ensure initial validations/risks are populated for seeded encounters
    recomputeEncounterValidationAndRisks(user.organization_id, 'enc-syn-1');
    recomputeEncounterValidationAndRisks(user.organization_id, 'enc-syn-2');
    recomputeEncounterValidationAndRisks(user.organization_id, 'enc-syn-3');

    writeAuditLog({
      organizationId: user.organization_id,
      userId: user.id,
      userEmail: user.email,
      action: 'SYNTHETIC_SANDBOX_LOGIN',
      resourceType: 'session',
      resourceId: user.id,
      details: 'Authenticated into clearly labeled Synthetic Sandbox evaluation environment.',
      ipAddress: req.ip,
    });

    res.json({
      token,
      user,
      isSyntheticSandbox: true,
    });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    const org = db
      .prepare('SELECT * FROM organizations WHERE id = ?')
      .get(req.auth!.organizationId);
    const user = db
      .prepare('SELECT id, organization_id, email, full_name, role, credentials, mfa_enabled, created_at FROM users WHERE id = ?')
      .get(req.auth!.userId);
    res.json({ user, organization: org });
  });

  router.post('/auth/mfa/enroll', requireAuth, (req, res) => {
    const secretHex = crypto.randomBytes(20).toString('hex');
    const previewCode = generateTotpCode(secretHex);
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(secretHex, req.auth!.userId);
    res.json({
      secretHex,
      verificationHint: `Current 6-digit TOTP code for verification: ${previewCode}`,
    });
  });

  router.post('/auth/mfa/enable', requireAuth, (req, res) => {
    const schema = z.object({ code: z.string().regex(/^\d{6}$/) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid 6-digit verification code.' });
      return;
    }
    const row = db.prepare('SELECT mfa_secret FROM users WHERE id = ?').get(req.auth!.userId) as
      | { mfa_secret: string | null }
      | undefined;
    if (!row?.mfa_secret || !verifyTotpCode(row.mfa_secret, parsed.data.code)) {
      res.status(400).json({ error: 'Invalid TOTP verification code.' });
      return;
    }
    db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(req.auth!.userId);
    writeAuditLog({
      organizationId: req.auth!.organizationId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'MFA_ENABLED',
      resourceType: 'user',
      resourceId: req.auth!.userId,
      details: 'Multi-factor authentication enabled for user account.',
      ipAddress: req.ip,
    });
    res.json({ mfa_enabled: 1 });
  });

  // --- ORGANIZATION SETTINGS & ONBOARDING ---
  router.put('/organizations/current', requireAuth, requireRole('admin', 'coding_director'), (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(140),
      npi: z.string().regex(/^\d{10}$/),
      tax_id: z.string().min(4).max(30),
      specialty: z.string().min(2).max(120),
      retention_days: z.number().int().min(365).max(3650),
      baa_attested: z.boolean(),
      onboarding_completed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid organization data' });
      return;
    }

    db.prepare(`
      UPDATE organizations
      SET name = ?, npi = ?, tax_id = ?, specialty = ?, retention_days = ?, baa_attested = ?, onboarding_completed = COALESCE(?, onboarding_completed)
      WHERE id = ?
    `).run(
      parsed.data.name.trim(),
      parsed.data.npi,
      parsed.data.tax_id.trim(),
      parsed.data.specialty.trim(),
      parsed.data.retention_days,
      parsed.data.baa_attested ? 1 : 0,
      parsed.data.onboarding_completed === undefined ? null : parsed.data.onboarding_completed ? 1 : 0,
      req.auth!.organizationId,
    );

    writeAuditLog({
      organizationId: req.auth!.organizationId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'ORGANIZATION_UPDATED',
      resourceType: 'organization',
      resourceId: req.auth!.organizationId,
      details: `Updated organization profile & retention policy (${parsed.data.retention_days} days).`,
      ipAddress: req.ip,
    });

    const updated = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.auth!.organizationId);
    res.json({ organization: updated });
  });

  // --- DASHBOARD & ANALYTICS (100% REAL DATABASE QUERIES) ---
  router.get('/dashboard/metrics', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const totalRecords = db.prepare('SELECT COUNT(*) as c FROM medical_records WHERE organization_id = ?').get(orgId)?.c as number;
    const totalEncounters = db.prepare('SELECT COUNT(*) as c FROM encounters WHERE organization_id = ?').get(orgId)?.c as number;
    const completedEncounters = db
      .prepare("SELECT COUNT(*) as c FROM encounters WHERE organization_id = ? AND coding_status IN ('APPROVED', 'CLAIM_READY')")
      .get(orgId)?.c as number;
    const pendingReviews = db
      .prepare("SELECT COUNT(*) as c FROM encounters WHERE organization_id = ? AND coding_status IN ('NEEDS_CODING_REVIEW', 'PENDING_EXTRACTION', 'ESCALATED')")
      .get(orgId)?.c as number;

    const totalReviewedRecs = db
      .prepare("SELECT COUNT(*) as c FROM coding_recommendations WHERE organization_id = ? AND approval_status IN ('APPROVED', 'MODIFIED', 'REJECTED')")
      .get(orgId)?.c as number;
    const approvedWithoutMod = db
      .prepare("SELECT COUNT(*) as c FROM coding_recommendations WHERE organization_id = ? AND approval_status = 'APPROVED'")
      .get(orgId)?.c as number;
    const codingAccuracyPct = totalReviewedRecs > 0 ? Math.round((approvedWithoutMod / totalReviewedRecs) * 1000) / 10 : null;

    const docDeficiencies = db
      .prepare("SELECT COUNT(*) as c FROM coding_recommendations WHERE organization_id = ? AND documentation_completeness != 'COMPLETE'")
      .get(orgId)?.c as number;
    const openDenialRisks = db
      .prepare("SELECT COUNT(*) as c FROM denial_risks WHERE organization_id = ? AND review_status = 'OPEN'")
      .get(orgId)?.c as number;
    const claimReadyCount = db
      .prepare("SELECT COUNT(*) as c FROM claims WHERE organization_id = ? AND readiness_status = 'READY_FOR_SUBMISSION'")
      .get(orgId)?.c as number;
    const claimBlockedCount = db
      .prepare("SELECT COUNT(*) as c FROM claims WHERE organization_id = ? AND readiness_status = 'BLOCKED'")
      .get(orgId)?.c as number;

    const denialBreakdown = db
      .prepare(`
        SELECT risk_category as category, severity, COUNT(*) as count
        FROM denial_risks
        WHERE organization_id = ? AND review_status = 'OPEN'
        GROUP BY risk_category, severity
        ORDER BY count DESC
      `)
      .all(orgId);

    const reimbursementStats = db
      .prepare(`
        SELECT COALESCE(SUM(total_charge_amount), 0) as total_billed,
               COALESCE(SUM(paid_amount), 0) as total_paid,
               COUNT(paid_amount) as paid_claims_count
        FROM claims WHERE organization_id = ?
      `)
      .get(orgId);

    const recentEncounters = db
      .prepare(`
        SELECT e.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn,
               pr.full_name as provider_name,
               (SELECT COUNT(*) FROM denial_risks dr WHERE dr.encounter_id = e.id AND dr.review_status = 'OPEN') as open_risks,
               (SELECT COUNT(*) FROM coding_recommendations cr WHERE cr.encounter_id = e.id AND cr.approval_status = 'PENDING') as pending_codes
        FROM encounters e
        JOIN patients p ON p.id = e.patient_id
        JOIN providers pr ON pr.id = e.provider_id
        WHERE e.organization_id = ?
        ORDER BY e.date_of_service DESC
        LIMIT 10
      `)
      .all(orgId);

    const coderProductivity = db
      .prepare(`
        SELECT actor_email, COUNT(*) as actions_count,
               SUM(CASE WHEN action = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
               SUM(CASE WHEN action = 'MODIFIED' THEN 1 ELSE 0 END) as modified_count,
               SUM(CASE WHEN action = 'REJECTED' THEN 1 ELSE 0 END) as rejected_count
        FROM coding_approvals
        WHERE organization_id = ?
        GROUP BY actor_email
      `)
      .all(orgId);

    res.json({
      kpis: {
        totalRecords,
        totalEncounters,
        completedEncounters,
        pendingReviews,
        codingAccuracyPct,
        totalReviewedRecs,
        docDeficiencies,
        openDenialRisks,
        claimReadyCount,
        claimBlockedCount,
      },
      denialBreakdown,
      reimbursementStats,
      recentEncounters,
      coderProductivity,
    });
  });

  // --- PATIENTS & PROVIDERS ---
  router.get('/patients', requireAuth, (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const orgId = req.auth!.organizationId;
    const rows = q
      ? db
          .prepare(`
            SELECT p.*,
              (SELECT COUNT(*) FROM encounters e WHERE e.patient_id = p.id) as encounter_count,
              (SELECT payer_name FROM insurance_policies ip WHERE ip.patient_id = p.id AND ip.priority = 'PRIMARY' LIMIT 1) as primary_payer
            FROM patients p
            WHERE p.organization_id = ? AND (LOWER(p.first_name || ' ' || p.last_name) LIKE ? OR LOWER(p.mrn) LIKE ?)
            ORDER BY p.created_at DESC
          `)
          .all(orgId, `%${q}%`, `%${q}%`)
      : db
          .prepare(`
            SELECT p.*,
              (SELECT COUNT(*) FROM encounters e WHERE e.patient_id = p.id) as encounter_count,
              (SELECT payer_name FROM insurance_policies ip WHERE ip.patient_id = p.id AND ip.priority = 'PRIMARY' LIMIT 1) as primary_payer
            FROM patients p
            WHERE p.organization_id = ?
            ORDER BY p.created_at DESC
          `)
          .all(orgId);
    res.json({ patients: rows });
  });

  router.post('/patients', requireAuth, (req, res) => {
    const schema = z.object({
      mrn: z.string().min(2).max(40),
      first_name: z.string().min(1).max(80),
      last_name: z.string().min(1).max(80),
      dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      sex: z.enum(['M', 'F', 'U']),
      city: z.string().max(80).default(''),
      state: z.string().max(2).default(''),
      is_synthetic: z.boolean().default(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid patient fields' });
      return;
    }

    const id = `pat-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO patients (id, organization_id, mrn, first_name, last_name, dob, sex, city, state, is_synthetic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.auth!.organizationId,
      parsed.data.mrn.trim(),
      parsed.data.first_name.trim(),
      parsed.data.last_name.trim(),
      parsed.data.dob,
      parsed.data.sex,
      parsed.data.city.trim(),
      parsed.data.state.toUpperCase(),
      parsed.data.is_synthetic ? 1 : 0,
      now,
    );

    writeAuditLog({
      organizationId: req.auth!.organizationId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'PATIENT_CREATED',
      resourceType: 'patient',
      resourceId: id,
      details: `Created patient record MRN ${parsed.data.mrn}.`,
      ipAddress: req.ip,
    });

    const created = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    res.status(201).json({ patient: created });
  });

  router.get('/providers', requireAuth, (req, res) => {
    const providers = db
      .prepare('SELECT * FROM providers WHERE organization_id = ? ORDER BY full_name ASC')
      .all(req.auth!.organizationId);
    res.json({ providers });
  });

  // --- ENCOUNTERS & MEDICAL RECORDS (UPLOAD + OCR + CLASSIFICATION) ---
  router.get('/encounters', requireAuth, (req, res) => {
    const rows = db
      .prepare(`
        SELECT e.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn, p.dob as patient_dob, p.sex as patient_sex,
               pr.full_name as provider_name, pr.npi as provider_npi
        FROM encounters e
        JOIN patients p ON p.id = e.patient_id
        JOIN providers pr ON pr.id = e.provider_id
        WHERE e.organization_id = ?
        ORDER BY e.date_of_service DESC
      `)
      .all(req.auth!.organizationId);
    res.json({ encounters: rows });
  });

  router.get('/medical-records', requireAuth, (req, res) => {
    const records = db
      .prepare(`
        SELECT mr.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn,
               e.encounter_number, e.date_of_service, e.coding_status
        FROM medical_records mr
        JOIN patients p ON p.id = mr.patient_id
        JOIN encounters e ON e.id = mr.encounter_id
        WHERE mr.organization_id = ?
        ORDER BY mr.created_at DESC
      `)
      .all(req.auth!.organizationId);
    res.json({ records });
  });

  router.post('/medical-records/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
      const schema = z.object({
        patient_id: z.string().min(1),
        provider_id: z.string().min(1).optional(),
        date_of_service: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        encounter_type: z.enum(['Outpatient', 'Inpatient', 'Emergency', 'Operative', 'Telehealth']).default('Outpatient'),
        document_type: z.string().min(2).max(80).default('Clinical Encounter Note'),
        chief_complaint: z.string().min(2).max(200).default('Clinical documentation upload'),
        raw_text_input: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid document upload fields' });
        return;
      }

      const orgId = req.auth!.organizationId;
      const patient = db
        .prepare('SELECT * FROM patients WHERE id = ? AND organization_id = ?')
        .get(parsed.data.patient_id, orgId);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found in current organization.' });
        return;
      }

      let providerId = parsed.data.provider_id;
      if (!providerId) {
        const firstProv = db.prepare('SELECT id FROM providers WHERE organization_id = ? LIMIT 1').get(orgId) as
          | { id: string }
          | undefined;
        providerId = firstProv?.id;
      }
      if (!providerId) {
        providerId = `prov-${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO providers (id, organization_id, npi, full_name, specialty, credential, network_status)
          VALUES (?, ?, '1000000000', 'Attending Provider', 'General Medicine', 'MD', 'UNVERIFIED')
        `).run(providerId, orgId);
      }

      let extractedText = (parsed.data.raw_text_input ?? '').trim();
      let fileName = `Clinical_Note_${parsed.data.date_of_service}.txt`;
      let mimeType = 'text/plain';
      let storagePath = '';
      let ocrStatus: 'COMPLETED' | 'PENDING' | 'FAILED' = 'COMPLETED';

      if (req.file) {
        const resolved = path.resolve(req.file.path);
        if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
          res.status(400).json({ error: 'Invalid upload file path.' });
          return;
        }
        storagePath = resolved;
        fileName = req.file.originalname;
        mimeType = req.file.mimetype;

        if (mimeType === 'text/plain' || mimeType === 'application/json' || mimeType === 'text/csv' || /\.(txt|hl7|json)$/i.test(fileName)) {
          extractedText = fs.readFileSync(resolved, 'utf8');
        } else if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
          const buf = fs.readFileSync(resolved);
          try {
            extractedText = await performGeminiOcrExtraction({
              mimeType,
              base64Data: buf.toString('base64'),
              fileName,
            });
          } catch (ocrErr) {
            ocrStatus = 'FAILED';
            extractedText =
              extractedText ||
              `OCR requires active server-side GEMINI_API_KEY or external OCR engine. (${ocrErr instanceof Error ? ocrErr.message : 'OCR error'})`;
          }
        }
      }

      if (!extractedText) {
        res.status(400).json({ error: 'Provide either a clinical document file or clinical note text.' });
        return;
      }

      const sanitization = sanitizeClinicalDocument(extractedText);
      const now = new Date().toISOString();
      const encounterId = `enc-${crypto.randomUUID()}`;
      const recordId = `rec-${crypto.randomUUID()}`;
      const encNumber = `ENC-${new Date().getUTCFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      db.prepare(`
        INSERT INTO encounters (id, organization_id, patient_id, provider_id, encounter_number, date_of_service, encounter_type, place_of_service, chief_complaint, coding_status, is_synthetic, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_EXTRACTION', 1, ?)
      `).run(
        encounterId,
        orgId,
        parsed.data.patient_id,
        providerId,
        encNumber,
        parsed.data.date_of_service,
        parsed.data.encounter_type,
        parsed.data.encounter_type === 'Inpatient' ? '21' : '11',
        parsed.data.chief_complaint,
        now,
      );

      const pageCount = Math.max(1, (sanitization.sanitizedText.match(/\[PAGE \d+\]/gi) ?? []).length || Math.ceil(sanitization.sanitizedText.length / 2200));

      db.prepare(`
        INSERT INTO medical_records (id, organization_id, patient_id, encounter_id, document_type, file_name, mime_type, storage_path, page_count, ocr_status, raw_text, prompt_injection_flagged, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        recordId,
        orgId,
        parsed.data.patient_id,
        encounterId,
        parsed.data.document_type,
        fileName,
        mimeType,
        storagePath,
        pageCount,
        ocrStatus,
        sanitization.sanitizedText,
        sanitization.injectionDetected ? 1 : 0,
        req.auth!.userId,
        now,
      );

      writeAuditLog({
        organizationId: orgId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: sanitization.injectionDetected ? 'DOCUMENT_UPLOADED_INJECTION_FLAGGED' : 'DOCUMENT_UPLOADED',
        resourceType: 'medical_record',
        resourceId: recordId,
        details: `Uploaded "${fileName}" (${parsed.data.document_type}) for encounter ${encNumber}.`,
        ipAddress: req.ip,
      });

      res.status(201).json({
        encounter_id: encounterId,
        record_id: recordId,
        promptInjectionDetected: sanitization.injectionDetected,
        matchedInjectionPatterns: sanitization.matchedPatterns,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Document upload failed.' });
    }
  });

  // --- 3-PANEL CODING WORKSPACE ---
  router.get('/coding-workspace/:encounterId', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const encounterId = String(req.params.encounterId);

    const encounter = db
      .prepare(`
        SELECT e.*, pr.full_name as provider_name, pr.npi as provider_npi, pr.specialty as provider_specialty, pr.network_status as provider_network_status
        FROM encounters e
        JOIN providers pr ON pr.id = e.provider_id
        WHERE e.id = ? AND e.organization_id = ?
      `)
      .get(encounterId, orgId) as unknown as (Encounter & Record<string, unknown>) | undefined;

    if (!encounter) {
      res.status(404).json({ error: 'Encounter not found.' });
      return;
    }

    const patient = db
      .prepare('SELECT * FROM patients WHERE id = ? AND organization_id = ?')
      .get(encounter.patient_id, orgId);

    const patientEncounters = db
      .prepare('SELECT id, encounter_number, date_of_service, encounter_type, chief_complaint, coding_status FROM encounters WHERE patient_id = ? AND organization_id = ? ORDER BY date_of_service DESC')
      .all(encounter.patient_id, orgId);

    const records = db
      .prepare('SELECT * FROM medical_records WHERE encounter_id = ? AND organization_id = ? ORDER BY created_at ASC')
      .all(encounterId, orgId);

    const entities = db
      .prepare('SELECT * FROM extracted_clinical_entities WHERE encounter_id = ? AND organization_id = ? ORDER BY page_number ASC')
      .all(encounterId, orgId);

    const policies = db
      .prepare('SELECT * FROM insurance_policies WHERE patient_id = ? AND organization_id = ?')
      .all(encounter.patient_id, orgId);

    const eligibility = db
      .prepare('SELECT * FROM eligibility_verifications WHERE patient_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(encounter.patient_id, orgId);

    // Run deterministic validation & denial checks fresh
    recomputeEncounterValidationAndRisks(orgId, encounterId);

    const recommendations = db
      .prepare("SELECT * FROM coding_recommendations WHERE encounter_id = ? AND organization_id = ? ORDER BY CASE diagnosis_role WHEN 'PRIMARY' THEN 1 WHEN 'SECONDARY' THEN 2 ELSE 3 END, created_at ASC")
      .all(encounterId, orgId);

    const validations = db
      .prepare('SELECT * FROM coding_validations WHERE encounter_id = ? AND organization_id = ?')
      .all(encounterId, orgId);

    const denialRisks = db
      .prepare('SELECT * FROM denial_risks WHERE encounter_id = ? AND organization_id = ?')
      .all(encounterId, orgId);

    const integrityFindings = db
      .prepare('SELECT * FROM revenue_integrity_findings WHERE encounter_id = ? AND organization_id = ?')
      .all(encounterId, orgId);

    const approvals = db
      .prepare('SELECT * FROM coding_approvals WHERE encounter_id = ? AND organization_id = ? ORDER BY created_at DESC')
      .all(encounterId, orgId);

    res.json({
      encounter,
      patient,
      patientEncounters,
      records,
      entities,
      insurancePolicies: policies,
      eligibility,
      recommendations,
      validations,
      denialRisks,
      integrityFindings,
      approvals,
    });
  });

  // Trigger AI Clinical Entity Extraction & Coding Recommendation (uses active modular AI provider)
  router.post('/coding-workspace/:encounterId/analyze', requireAuth, rateLimit(15, 60_000), async (req, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const encounterId = String(req.params.encounterId);

      const encounter = db
        .prepare('SELECT * FROM encounters WHERE id = ? AND organization_id = ?')
        .get(encounterId, orgId) as unknown as Encounter | undefined;
      if (!encounter) {
        res.status(404).json({ error: 'Encounter not found.' });
        return;
      }

      const org = db.prepare('SELECT synthetic_mode FROM organizations WHERE id = ?').get(orgId) as
        | { synthetic_mode: number }
        | undefined;

      const record = db
        .prepare('SELECT * FROM medical_records WHERE encounter_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(encounterId, orgId) as
        | { id: string; file_name: string; raw_text: string }
        | undefined;

      if (!record) {
        res.status(400).json({ error: 'No clinical document attached to this encounter.' });
        return;
      }

      const modelId = typeof req.body?.modelConfigId === 'string' ? req.body.modelConfigId : null;
      const modelConfig = (
        modelId
          ? db.prepare('SELECT * FROM ai_model_configs WHERE id = ? AND organization_id = ?').get(modelId, orgId)
          : db.prepare('SELECT * FROM ai_model_configs WHERE organization_id = ? AND is_active = 1 LIMIT 1').get(orgId)
      ) as unknown as AIModelConfig | undefined;

      if (!modelConfig) {
        res.status(400).json({ error: 'No active AI model configuration found. Configure one in AI Model Settings.' });
        return;
      }

      const catalog = loadCatalog();
      const result = await runClinicalExtractionAndCoding({
        modelConfig,
        documentName: record.file_name,
        rawText: record.raw_text,
        encounterType: encounter.encounter_type,
        dateOfService: encounter.date_of_service,
        catalog,
        orgIsSynthetic: org?.synthetic_mode === 1,
      });

      const now = new Date().toISOString();

      // Persist extracted entities
      db.prepare('DELETE FROM extracted_clinical_entities WHERE encounter_id = ? AND organization_id = ?').run(encounterId, orgId);
      const insertEnt = db.prepare(`
        INSERT INTO extracted_clinical_entities (id, organization_id, encounter_id, medical_record_id, entity_type, entity_text, normalized_concept, certainty, laterality, anatomical_site, page_number, evidence_snippet, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of result.extractedEntities) {
        insertEnt.run(
          `ent-${crypto.randomUUID()}`,
          orgId,
          encounterId,
          record.id,
          e.entity_type,
          e.entity_text,
          e.normalized_concept,
          e.certainty,
          e.laterality,
          e.anatomical_site,
          e.page_number,
          e.evidence_snippet,
          now,
        );
      }

      // Persist verified recommendations (all require human review!)
      db.prepare("DELETE FROM coding_recommendations WHERE encounter_id = ? AND organization_id = ? AND approval_status = 'PENDING'").run(encounterId, orgId);
      const insertRec = db.prepare(`
        INSERT INTO coding_recommendations (
          id, organization_id, encounter_id, code, code_system, description, diagnosis_role,
          diagnosis_pointers, units, modifiers, supporting_evidence, source_document, page_reference,
          coding_rationale, guideline_citation, documentation_completeness, validation_status,
          compliance_risk, requires_human_review, approval_status, ai_provider, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEEDS_REVIEW', ?, 1, 'PENDING', ?, ?)
      `);

      for (const r of result.verifiedRecommendations) {
        insertRec.run(
          `crec-${crypto.randomUUID()}`,
          orgId,
          encounterId,
          r.code,
          r.code_system,
          r.catalogDescription,
          r.diagnosis_role ?? 'SECONDARY',
          r.diagnosis_pointers ?? '',
          r.units ?? 1,
          r.modifiers ?? '',
          r.supporting_evidence,
          record.file_name,
          r.page_reference ?? 1,
          r.coding_rationale,
          r.guideline_citation,
          r.documentation_completeness ?? 'COMPLETE',
          r.uncertainty_note ?? 'Pending deterministic rules & human coder sign-off',
          `${result.providerUsed}:${result.modelUsed}`,
          now,
        );
      }

      db.prepare("UPDATE encounters SET coding_status = 'NEEDS_CODING_REVIEW' WHERE id = ? AND organization_id = ?").run(encounterId, orgId);
      recomputeEncounterValidationAndRisks(orgId, encounterId);

      writeAuditLog({
        organizationId: orgId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'AI_CLINICAL_CODING_RUN',
        resourceType: 'encounter',
        resourceId: encounterId,
        details: `Ran ${result.modelUsed}: extracted ${result.extractedEntities.length} entities, ${result.verifiedRecommendations.length} verified recommendations (${result.rejectedRecommendations.length} blocked by hallucination guard).`,
        ipAddress: req.ip,
      });

      res.json({
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        verifiedCount: result.verifiedRecommendations.length,
        rejectedRecommendations: result.rejectedRecommendations,
        promptInjectionDetected: result.promptInjectionDetected,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'AI coding inference failed.' });
    }
  });

  // Add manual code to encounter (validated against authoritative catalog)
  router.post('/coding-workspace/:encounterId/recommendations', requireAuth, requireRole('admin', 'coding_director', 'medical_coder'), (req, res) => {
    const schema = z.object({
      code: z.string().min(2).max(20),
      code_system: z.enum(['ICD-10-CM', 'ICD-10-PCS', 'CPT', 'HCPCS', 'MODIFIER']),
      diagnosis_role: z.enum(['PRIMARY', 'SECONDARY', 'PROCEDURE', 'MODIFIER']).default('PROCEDURE'),
      diagnosis_pointers: z.string().max(20).default('A'),
      units: z.number().int().min(1).max(99).default(1),
      modifiers: z.string().max(30).default(''),
      supporting_evidence: z.string().min(4),
      coding_rationale: z.string().min(4),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid code payload' });
      return;
    }

    const orgId = req.auth!.organizationId;
    const encounterId = String(req.params.encounterId);
    const ref = db
      .prepare('SELECT * FROM reference_codes WHERE code = ? AND code_system = ?')
      .get(parsed.data.code.trim().toUpperCase(), parsed.data.code_system) as unknown as ReferenceCode | undefined;

    if (!ref) {
      res.status(400).json({ error: `Code ${parsed.data.code} (${parsed.data.code_system}) is not in the authoritative code catalog.` });
      return;
    }

    const id = `crec-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO coding_recommendations (
        id, organization_id, encounter_id, code, code_system, description, diagnosis_role,
        diagnosis_pointers, units, modifiers, supporting_evidence, source_document, page_reference,
        coding_rationale, guideline_citation, documentation_completeness, validation_status,
        compliance_risk, requires_human_review, approval_status, approved_by, approved_at, ai_provider, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Manual Coder Entry', 1, ?, ?, 'COMPLETE', 'NEEDS_REVIEW', '', 1, 'APPROVED', ?, ?, 'human_coder', ?)
    `).run(
      id,
      orgId,
      encounterId,
      ref.code,
      ref.code_system,
      ref.description,
      parsed.data.diagnosis_role,
      parsed.data.diagnosis_pointers,
      parsed.data.units,
      parsed.data.modifiers.toUpperCase(),
      parsed.data.supporting_evidence,
      parsed.data.coding_rationale,
      ref.guideline_reference,
      req.auth!.userId,
      now,
      now,
    );

    recomputeEncounterValidationAndRisks(orgId, encounterId);

    writeAuditLog({
      organizationId: orgId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'MANUAL_CODE_ADDED',
      resourceType: 'coding_recommendation',
      resourceId: id,
      details: `Added ${ref.code_system} ${ref.code} with modifiers "${parsed.data.modifiers}".`,
      ipAddress: req.ip,
    });

    res.status(201).json({ id });
  });

  // Human Coder Approval / Modify / Reject / Escalate action
  router.post('/coding-recommendations/:id/decision', requireAuth, requireRole('admin', 'coding_director', 'medical_coder', 'auditor'), (req, res) => {
    const schema = z.object({
      action: z.enum(['APPROVED', 'MODIFIED', 'REJECTED', 'ESCALATED']),
      new_code: z.string().optional(),
      modifiers: z.string().optional(),
      units: z.number().int().min(1).max(99).optional(),
      diagnosis_pointers: z.string().optional(),
      notes: z.string().max(500).default(''),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid decision payload' });
      return;
    }

    const orgId = req.auth!.organizationId;
    const recId = String(req.params.id);
    const existing = db
      .prepare('SELECT * FROM coding_recommendations WHERE id = ? AND organization_id = ?')
      .get(recId, orgId) as unknown as CodingRecommendation | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Coding recommendation not found.' });
      return;
    }

    const now = new Date().toISOString();
    let finalCode = existing.code;
    let finalDesc = existing.description;

    if (parsed.data.action === 'MODIFIED' && parsed.data.new_code && parsed.data.new_code.trim().toUpperCase() !== existing.code) {
      const targetCode = parsed.data.new_code.trim().toUpperCase();
      const ref = db
        .prepare('SELECT * FROM reference_codes WHERE code = ? AND code_system = ?')
        .get(targetCode, existing.code_system) as unknown as ReferenceCode | undefined;
      if (!ref) {
        res.status(400).json({ error: `Replacement code ${targetCode} does not exist in authoritative ${existing.code_system} catalog.` });
        return;
      }
      finalCode = ref.code;
      finalDesc = ref.description;
    }

    const nextMods = parsed.data.modifiers !== undefined ? parsed.data.modifiers.trim().toUpperCase() : existing.modifiers;
    const nextUnits = parsed.data.units !== undefined ? parsed.data.units : existing.units;
    const nextPointers = parsed.data.diagnosis_pointers !== undefined ? parsed.data.diagnosis_pointers.trim().toUpperCase() : existing.diagnosis_pointers;

    db.prepare(`
      UPDATE coding_recommendations
      SET code = ?, description = ?, modifiers = ?, units = ?, diagnosis_pointers = ?,
          approval_status = ?, approved_by = ?, approved_at = ?
      WHERE id = ? AND organization_id = ?
    `).run(
      finalCode,
      finalDesc,
      nextMods,
      nextUnits,
      nextPointers,
      parsed.data.action,
      req.auth!.userId,
      now,
      recId,
      orgId,
    );

    db.prepare(`
      INSERT INTO coding_approvals (id, organization_id, encounter_id, recommendation_id, action, previous_code, new_code, notes, actor_user_id, actor_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `appr-${crypto.randomUUID()}`,
      orgId,
      existing.encounter_id,
      recId,
      parsed.data.action,
      existing.code,
      finalCode,
      parsed.data.notes,
      req.auth!.userId,
      req.auth!.email,
      now,
    );

    const recomputed = recomputeEncounterValidationAndRisks(orgId, existing.encounter_id);

    // Update encounter coding_status based on remaining pending items
    const pendingCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM coding_recommendations WHERE encounter_id = ? AND organization_id = ? AND approval_status = 'PENDING'")
        .get(existing.encounter_id, orgId)?.c as number
    ) ?? 0;

    if (parsed.data.action === 'ESCALATED') {
      db.prepare("UPDATE encounters SET coding_status = 'ESCALATED' WHERE id = ? AND organization_id = ?").run(existing.encounter_id, orgId);
    } else if (pendingCount === 0) {
      db.prepare("UPDATE encounters SET coding_status = 'APPROVED' WHERE id = ? AND organization_id = ?").run(existing.encounter_id, orgId);
    }

    writeAuditLog({
      organizationId: orgId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: `CODING_${parsed.data.action}`,
      resourceType: 'coding_recommendation',
      resourceId: recId,
      details: `${parsed.data.action} code ${existing.code}${finalCode !== existing.code ? ` -> ${finalCode}` : ''} (modifiers: "${nextMods}", units: ${nextUnits}). ${parsed.data.notes}`,
      ipAddress: req.ip,
    });

    res.json({
      status: 'updated',
      approval_status: parsed.data.action,
      validations: recomputed?.validations ?? [],
    });
  });

  // --- REFERENCE CODE EXPLORERS & MEDICAL NECESSITY CHECKER ---
  router.get('/codes', requireAuth, (req, res) => {
    const system = String(req.query.system ?? '').trim();
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const rows = db
      .prepare(`
        SELECT * FROM reference_codes
        WHERE (? = '' OR code_system = ?)
          AND (? = '' OR LOWER(code) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?)
        ORDER BY code_system ASC, code ASC
      `)
      .all(system, system, q, `%${q}%`, `%${q}%`, `%${q}%`);
    res.json({ codes: rows });
  });

  router.get('/policies/necessity', requireAuth, (_req, res) => {
    const policies = loadPayerPolicies();
    const ncciRules = loadNcciRules();
    const guidelines = db.prepare('SELECT * FROM coding_guidelines').all();
    res.json({ policies, ncciRules, guidelines });
  });

  router.post('/policies/check-necessity', requireAuth, (req, res) => {
    const schema = z.object({
      procedureCodes: z.array(z.string().min(2)).min(1),
      diagnosisCodes: z.array(z.string().min(2)).min(1),
      dateOfService: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      patientAge: z.number().int().min(0).max(120).default(55),
      patientSex: z.enum(['M', 'F', 'U']).default('U'),
      modifiers: z.string().default(''),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid necessity check input' });
      return;
    }

    const catalog = loadCatalog();
    const ncciRules = loadNcciRules();
    const payerPolicies = loadPayerPolicies();

    const birthYear = new Date(parsed.data.dateOfService).getUTCFullYear() - parsed.data.patientAge;
    const syntheticPatient: Patient = {
      id: 'check-pat',
      organization_id: req.auth!.organizationId,
      mrn: 'CHECK',
      first_name: 'Check',
      last_name: 'Patient',
      dob: `${birthYear}-01-01`,
      sex: parsed.data.patientSex,
      city: '',
      state: '',
      is_synthetic: 1,
      created_at: new Date().toISOString(),
    };
    const syntheticEncounter: Encounter = {
      id: 'check-enc',
      organization_id: req.auth!.organizationId,
      patient_id: 'check-pat',
      provider_id: 'check-prov',
      encounter_number: 'CHECK-ONLY',
      date_of_service: parsed.data.dateOfService,
      encounter_type: 'Outpatient',
      place_of_service: '11',
      chief_complaint: 'Medical necessity rule check',
      coding_status: 'NEEDS_CODING_REVIEW',
      is_synthetic: 1,
      created_at: new Date().toISOString(),
    };

    const recs: CodingRecommendation[] = [
      ...parsed.data.diagnosisCodes.map((c, idx) => ({
        id: `dx-${idx}`,
        organization_id: req.auth!.organizationId,
        encounter_id: 'check-enc',
        code: c.trim().toUpperCase(),
        code_system: 'ICD-10-CM' as const,
        description: '',
        diagnosis_role: idx === 0 ? ('PRIMARY' as const) : ('SECONDARY' as const),
        diagnosis_pointers: '',
        units: 1,
        modifiers: '',
        supporting_evidence: 'Interactive checker',
        source_document: 'Checker',
        page_reference: 1,
        coding_rationale: '',
        guideline_citation: '',
        documentation_completeness: 'COMPLETE' as const,
        validation_status: 'NEEDS_REVIEW' as const,
        compliance_risk: '',
        requires_human_review: 1,
        approval_status: 'PENDING' as const,
        approved_by: null,
        approved_at: null,
        ai_provider: 'deterministic',
        created_at: new Date().toISOString(),
      })),
      ...parsed.data.procedureCodes.map((c, idx) => {
        const clean = c.trim().toUpperCase();
        const ref = catalog.find((r) => r.code === clean && (r.code_system === 'CPT' || r.code_system === 'HCPCS'));
        return {
          id: `px-${idx}`,
          organization_id: req.auth!.organizationId,
          encounter_id: 'check-enc',
          code: clean,
          code_system: ref?.code_system ?? ('CPT' as const),
          description: ref?.description ?? '',
          diagnosis_role: 'PROCEDURE' as const,
          diagnosis_pointers: 'A',
          units: 1,
          modifiers: parsed.data.modifiers,
          supporting_evidence: 'Interactive checker',
          source_document: 'Checker',
          page_reference: 1,
          coding_rationale: '',
          guideline_citation: '',
          documentation_completeness: 'COMPLETE' as const,
          validation_status: 'NEEDS_REVIEW' as const,
          compliance_risk: '',
          requires_human_review: 1,
          approval_status: 'PENDING' as const,
          approved_by: null,
          approved_at: null,
          ai_provider: 'deterministic',
          created_at: new Date().toISOString(),
        };
      }),
    ];

    const validations = runDeterministicCodingValidation({
      encounter: syntheticEncounter,
      patient: syntheticPatient,
      recommendations: recs,
      entities: [],
      catalog,
      ncciRules,
      payerPolicies,
    });

    res.json({ validations });
  });

  // --- INSURANCE VERIFICATION WORKSPACE ---
  router.get('/insurance', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const policies = db
      .prepare(`
        SELECT ip.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn, p.dob as patient_dob
        FROM insurance_policies ip
        JOIN patients p ON p.id = ip.patient_id
        WHERE ip.organization_id = ?
        ORDER BY ip.patient_id, ip.priority
      `)
      .all(orgId);

    const verifications = db
      .prepare(`
        SELECT ev.*, ip.payer_name, ip.member_id, ip.priority, p.first_name || ' ' || p.last_name as patient_name
        FROM eligibility_verifications ev
        JOIN insurance_policies ip ON ip.id = ev.insurance_policy_id
        JOIN patients p ON p.id = ev.patient_id
        WHERE ev.organization_id = ?
        ORDER BY ev.created_at DESC
      `)
      .all(orgId);

    const clearinghouseConfig = db
      .prepare("SELECT * FROM integration_configs WHERE organization_id = ? AND integration_type = 'CLEARINGHOUSE_X12' LIMIT 1")
      .get(orgId);

    res.json({ policies, verifications, clearinghouseConfig });
  });

  router.post('/insurance/verify', requireAuth, async (req, res) => {
    const schema = z.object({
      insurance_policy_id: z.string().min(1),
      service_type_code: z.string().default('30'),
      date_of_service: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid insurance_policy_id and date_of_service are required.' });
      return;
    }

    const orgId = req.auth!.organizationId;
    const policy = db
      .prepare(`
        SELECT ip.*, p.first_name, p.last_name, p.dob, o.npi as org_npi, o.name as org_name
        FROM insurance_policies ip
        JOIN patients p ON p.id = ip.patient_id
        JOIN organizations o ON o.id = ip.organization_id
        WHERE ip.id = ? AND ip.organization_id = ?
      `)
      .get(parsed.data.insurance_policy_id, orgId) as Record<string, unknown> | undefined;

    if (!policy) {
      res.status(404).json({ error: 'Insurance policy not found.' });
      return;
    }

    // Build standards-compliant X12 270 inquiry structure
    const x12_270 = [
      `ISA*00*          *00*          *ZZ*MEDIIFY        *ZZ*${String(policy.payer_id).padEnd(15, ' ')}*261123*2130*^*00501*000000001*0*T*:~`,
      `GS*HS*MEDIIFY*${String(policy.payer_id)}*20261123*2130*1*X*005010X279A1~`,
      `ST*270*0001*005010X279A1~`,
      `NM1*1P*2*${String(policy.org_name)}*****XX*${String(policy.org_npi)}~`,
      `NM1*IL*1*${String(policy.last_name)}*${String(policy.first_name)}****MI*${String(policy.member_id)}~`,
      `DMG*D8*${String(policy.dob).replace(/-/g, '')}~`,
      `DTP*291*D8*${parsed.data.date_of_service.replace(/-/g, '')}~`,
      `EQ*${parsed.data.service_type_code}~`,
      `SE*8*0001~`,
    ].join('\n');

    const clearinghouseUrl = process.env.CLEARINGHOUSE_API_URL;
    const clearinghouseClientId = process.env.CLEARINGHOUSE_CLIENT_ID;
    const clearinghouseSecret = process.env.CLEARINGHOUSE_CLIENT_SECRET;

    const verId = `elig-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Never simulate successful verification without a legitimate clearinghouse endpoint & credentials!
    if (!clearinghouseUrl || !clearinghouseClientId || !clearinghouseSecret) {
      db.prepare(`
        INSERT INTO eligibility_verifications (
          id, organization_id, patient_id, insurance_policy_id, verification_source,
          clearinghouse_transaction_id, x12_270_payload, x12_271_status, prior_auth_required,
          referral_required, network_status, limitations_notes, verified_at, created_at
        ) VALUES (?, ?, ?, ?, 'EXTRACTED_FROM_DOCUMENT', NULL, ?, 'NOT_VERIFIED_REQUIRES_CLEARINGHOUSE', 0, 0, 'UNVERIFIED', ?, NULL, ?)
      `).run(
        verId,
        orgId,
        String(policy.patient_id),
        String(policy.id),
        x12_270,
        'Generated X12 270 inquiry payload, but live verification was NOT executed because CLEARINGHOUSE_API_URL / CLEARINGHOUSE_CLIENT_ID / CLEARINGHOUSE_CLIENT_SECRET are not configured.',
        now,
      );

      writeAuditLog({
        organizationId: orgId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'ELIGIBILITY_270_GENERATED_UNVERIFIED',
        resourceType: 'eligibility_verification',
        resourceId: verId,
        details: 'Generated X12 270 payload; clearinghouse credentials not configured (no fake verification performed).',
        ipAddress: req.ip,
      });

      res.status(202).json({
        status: 'NOT_VERIFIED_REQUIRES_CLEARINGHOUSE',
        message: 'X12 270 inquiry generated, but live eligibility verification requires authorized clearinghouse credentials (CLEARINGHOUSE_API_URL, CLEARINGHOUSE_CLIENT_ID, CLEARINGHOUSE_CLIENT_SECRET).',
        x12_270_payload: x12_270,
      });
      return;
    }

    const urlValidation = validateExternalInferenceUrl(clearinghouseUrl);
    if (!urlValidation.valid) {
      res.status(400).json({ error: `Clearinghouse URL rejected: ${urlValidation.reason}` });
      return;
    }

    try {
      const resp = await fetch(clearinghouseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': clearinghouseClientId,
          Authorization: `Bearer ${clearinghouseSecret}`,
        },
        body: JSON.stringify({ x12_270, payer_id: policy.payer_id, member_id: policy.member_id, date_of_service: parsed.data.date_of_service }),
      });

      if (!resp.ok) {
        throw new Error(`Clearinghouse HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as {
        transaction_id?: string;
        active?: boolean;
        copay?: number;
        deductible_remaining?: number;
        coinsurance_percent?: number;
        prior_auth_required?: boolean;
        network_status?: 'IN_NETWORK' | 'OUT_OF_NETWORK';
        notes?: string;
      };

      db.prepare(`
        INSERT INTO eligibility_verifications (
          id, organization_id, patient_id, insurance_policy_id, verification_source,
          clearinghouse_transaction_id, x12_270_payload, x12_271_status, copay_amount,
          deductible_remaining, coinsurance_percent, prior_auth_required, referral_required,
          network_status, limitations_notes, verified_at, created_at
        ) VALUES (?, ?, ?, ?, 'VERIFIED_CLEARINGHOUSE', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        verId,
        orgId,
        String(policy.patient_id),
        String(policy.id),
        data.transaction_id ?? null,
        x12_270,
        data.active ? 'VERIFIED_ACTIVE' : 'VERIFIED_INACTIVE',
        data.copay ?? null,
        data.deductible_remaining ?? null,
        data.coinsurance_percent ?? null,
        data.prior_auth_required ? 1 : 0,
        data.network_status ?? 'UNVERIFIED',
        data.notes ?? 'Verified via authorized clearinghouse endpoint.',
        now,
        now,
      );

      res.json({ status: data.active ? 'VERIFIED_ACTIVE' : 'VERIFIED_INACTIVE', verificationId: verId });
    } catch (err) {
      res.status(502).json({ error: `Clearinghouse verification failed: ${err instanceof Error ? err.message : 'Upstream error'}` });
    }
  });

  // --- DENIAL PREVENTION, REVENUE INTEGRITY, AUDITS & CLAIMS ---
  router.get('/denial-prevention', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const risks = db
      .prepare(`
        SELECT dr.*, e.encounter_number, e.date_of_service, p.first_name || ' ' || p.last_name as patient_name
        FROM denial_risks dr
        JOIN encounters e ON e.id = dr.encounter_id
        JOIN patients p ON p.id = e.patient_id
        WHERE dr.organization_id = ?
        ORDER BY CASE dr.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, dr.created_at DESC
      `)
      .all(orgId);
    res.json({ risks });
  });

  router.patch('/denial-prevention/:id', requireAuth, (req, res) => {
    const schema = z.object({ review_status: z.enum(['OPEN', 'MITIGATED', 'DISMISSED']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid review_status.' });
      return;
    }
    db.prepare('UPDATE denial_risks SET review_status = ? WHERE id = ? AND organization_id = ?').run(
      parsed.data.review_status,
      String(req.params.id),
      req.auth!.organizationId,
    );
    writeAuditLog({
      organizationId: req.auth!.organizationId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'DENIAL_RISK_UPDATED',
      resourceType: 'denial_risk',
      resourceId: String(req.params.id),
      details: `Marked denial risk status as ${parsed.data.review_status}.`,
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  router.get('/revenue-integrity', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const findings = db
      .prepare(`
        SELECT rif.*, e.encounter_number, e.date_of_service, p.first_name || ' ' || p.last_name as patient_name
        FROM revenue_integrity_findings rif
        JOIN encounters e ON e.id = rif.encounter_id
        JOIN patients p ON p.id = e.patient_id
        WHERE rif.organization_id = ?
        ORDER BY CASE rif.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, rif.created_at DESC
      `)
      .all(orgId);
    res.json({ findings });
  });

  router.get('/audit-center', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const approvals = db
      .prepare(`
        SELECT ca.*, e.encounter_number, e.date_of_service, p.first_name || ' ' || p.last_name as patient_name
        FROM coding_approvals ca
        JOIN encounters e ON e.id = ca.encounter_id
        JOIN patients p ON p.id = e.patient_id
        WHERE ca.organization_id = ?
        ORDER BY ca.created_at DESC
      `)
      .all(orgId);

    const summary = db
      .prepare(`
        SELECT
          COUNT(*) as total_decisions,
          SUM(CASE WHEN action = 'APPROVED' THEN 1 ELSE 0 END) as approved_as_recommended,
          SUM(CASE WHEN action = 'MODIFIED' THEN 1 ELSE 0 END) as modified_by_coder,
          SUM(CASE WHEN action = 'REJECTED' THEN 1 ELSE 0 END) as rejected_by_coder,
          SUM(CASE WHEN action = 'ESCALATED' THEN 1 ELSE 0 END) as escalated
        FROM coding_approvals
        WHERE organization_id = ?
      `)
      .get(orgId);

    res.json({ approvals, summary });
  });

  router.get('/claims', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const claims = db
      .prepare(`
        SELECT c.*, e.encounter_number, e.date_of_service, e.coding_status,
               p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn
        FROM claims c
        JOIN encounters e ON e.id = c.encounter_id
        JOIN patients p ON p.id = c.patient_id
        WHERE c.organization_id = ?
        ORDER BY c.created_at DESC
      `)
      .all(orgId);
    res.json({ claims });
  });

  router.post('/claims/:id/evaluate-readiness', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const claimId = String(req.params.id);
    const claim = db
      .prepare('SELECT * FROM claims WHERE id = ? AND organization_id = ?')
      .get(claimId, orgId) as { id: string; encounter_id: string } | undefined;
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }

    recomputeEncounterValidationAndRisks(orgId, claim.encounter_id);

    const blocking: string[] = [];
    const pendingCodes = (
      db
        .prepare("SELECT COUNT(*) as c FROM coding_recommendations WHERE encounter_id = ? AND organization_id = ? AND approval_status = 'PENDING'")
        .get(claim.encounter_id, orgId)?.c as number
    ) ?? 0;
    if (pendingCodes > 0) blocking.push(`${pendingCodes} coding recommendation(s) pending certified coder approval`);

    const validationErrors = (
      db
        .prepare("SELECT COUNT(*) as c FROM coding_validations WHERE encounter_id = ? AND organization_id = ? AND severity = 'ERROR'")
        .get(claim.encounter_id, orgId)?.c as number
    ) ?? 0;
    if (validationErrors > 0) blocking.push(`${validationErrors} deterministic coding validation error(s)`);

    const criticalRisks = (
      db
        .prepare("SELECT COUNT(*) as c FROM denial_risks WHERE encounter_id = ? AND organization_id = ? AND review_status = 'OPEN' AND severity IN ('CRITICAL', 'HIGH')")
        .get(claim.encounter_id, orgId)?.c as number
    ) ?? 0;
    if (criticalRisks > 0) blocking.push(`${criticalRisks} open high/critical denial risk(s)`);

    const status = blocking.length === 0 ? 'READY_FOR_SUBMISSION' : 'BLOCKED';
    db.prepare('UPDATE claims SET readiness_status = ?, blocking_reasons_json = ? WHERE id = ? AND organization_id = ?').run(
      status,
      JSON.stringify(blocking),
      claimId,
      orgId,
    );

    res.json({ readiness_status: status, blocking_reasons: blocking });
  });

  // --- TEAM MANAGEMENT ---
  router.get('/team', requireAuth, (req, res) => {
    const users = db
      .prepare('SELECT id, organization_id, email, full_name, role, credentials, mfa_enabled, is_active, created_at FROM users WHERE organization_id = ? ORDER BY created_at ASC')
      .all(req.auth!.organizationId);
    const roles = db.prepare('SELECT * FROM roles_permissions').all();
    res.json({ users, roles });
  });

  router.post('/team', requireAuth, requireRole('admin', 'coding_director'), (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      full_name: z.string().min(2).max(120),
      role: z.enum(['admin', 'coding_director', 'medical_coder', 'auditor', 'physician', 'rcm_analyst']),
      credentials: z.string().max(40).default(''),
      temporary_password: z.string().min(10),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid team member input' });
      return;
    }

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email.toLowerCase());
    if (exists) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }

    const id = `usr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
    `).run(
      id,
      req.auth!.organizationId,
      parsed.data.email.toLowerCase(),
      hashPassword(parsed.data.temporary_password),
      parsed.data.full_name.trim(),
      parsed.data.role,
      parsed.data.credentials.trim(),
      now,
    );

    writeAuditLog({
      organizationId: req.auth!.organizationId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'TEAM_MEMBER_ADDED',
      resourceType: 'user',
      resourceId: id,
      details: `Added ${parsed.data.email} with role ${parsed.data.role}.`,
      ipAddress: req.ip,
    });

    res.status(201).json({ id });
  });

  // --- AI MODEL SETTINGS (MODULAR PROVIDER REGISTRY) ---
  router.get('/ai-models', requireAuth, (req, res) => {
    const models = db
      .prepare('SELECT id, organization_id, display_name, provider_type, model_name, api_url, timeout_ms, max_tokens, is_active, approved_for_phi, baa_status, last_health_status, last_health_message, last_health_checked_at FROM ai_model_configs WHERE organization_id = ?')
      .all(req.auth!.organizationId) as Array<Record<string, unknown>>;

    const enriched = models.map((m) => {
      const pType = String(m.provider_type);
      const hasEnvCreds =
        pType === 'gemini'
          ? Boolean(process.env.GEMINI_API_KEY)
          : pType === 'lingsante'
            ? Boolean(process.env.LINGSANTE_API_KEY)
            : pType === 'huggingface'
              ? Boolean(process.env.HUGGINGFACE_API_TOKEN)
              : Boolean(process.env.OPENAI_COMPATIBLE_API_KEY);
      return { ...m, has_credentials: hasEnvCreds ? 1 : 0 };
    });

    res.json({ models: enriched });
  });

  router.put('/ai-models/:id', requireAuth, requireRole('admin', 'coding_director'), (req, res) => {
    const schema = z.object({
      model_name: z.string().min(2).max(160),
      api_url: z.string().max(400).default(''),
      timeout_ms: z.number().int().min(3000).max(120000),
      max_tokens: z.number().int().min(256).max(32768),
      is_active: z.boolean(),
      approved_for_phi: z.boolean(),
      baa_status: z.enum(['NOT_APPLICABLE_SYNTHETIC', 'BAA_EXECUTED', 'REQUIRES_BAA']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid AI model config' });
      return;
    }

    const orgId = req.auth!.organizationId;
    const modelId = String(req.params.id);

    if (parsed.data.api_url) {
      const urlCheck = validateExternalInferenceUrl(parsed.data.api_url);
      if (!urlCheck.valid) {
        res.status(400).json({ error: urlCheck.reason });
        return;
      }
    }

    if (parsed.data.is_active) {
      db.prepare('UPDATE ai_model_configs SET is_active = 0 WHERE organization_id = ?').run(orgId);
    }

    db.prepare(`
      UPDATE ai_model_configs
      SET model_name = ?, api_url = ?, timeout_ms = ?, max_tokens = ?, is_active = ?, approved_for_phi = ?, baa_status = ?
      WHERE id = ? AND organization_id = ?
    `).run(
      parsed.data.model_name.trim(),
      parsed.data.api_url.trim(),
      parsed.data.timeout_ms,
      parsed.data.max_tokens,
      parsed.data.is_active ? 1 : 0,
      parsed.data.approved_for_phi ? 1 : 0,
      parsed.data.baa_status,
      modelId,
      orgId,
    );

    writeAuditLog({
      organizationId: orgId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'AI_MODEL_CONFIG_UPDATED',
      resourceType: 'ai_model_config',
      resourceId: modelId,
      details: `Updated model "${parsed.data.model_name}" (active=${parsed.data.is_active}, baa=${parsed.data.baa_status}).`,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  });

  router.post('/ai-models/:id/health', requireAuth, async (req, res) => {
    const orgId = req.auth!.organizationId;
    const modelId = String(req.params.id);
    const model = db
      .prepare('SELECT * FROM ai_model_configs WHERE id = ? AND organization_id = ?')
      .get(modelId, orgId) as unknown as AIModelConfig | undefined;

    if (!model) {
      res.status(404).json({ error: 'AI model config not found.' });
      return;
    }

    const now = new Date().toISOString();
    let status: AIModelConfig['last_health_status'] = 'UNCONFIGURED';
    let message = '';

    if (model.provider_type === 'gemini') {
      if (process.env.GEMINI_API_KEY) {
        status = 'HEALTHY';
        message = 'Server-side GEMINI_API_KEY present and SDK initialized.';
      } else {
        status = 'UNCONFIGURED';
        message = 'GEMINI_API_KEY is not set in server environment.';
      }
    } else {
      const token =
        model.provider_type === 'lingsante'
          ? process.env.LINGSANTE_API_KEY
          : model.provider_type === 'huggingface'
            ? process.env.HUGGINGFACE_API_TOKEN
            : process.env.OPENAI_COMPATIBLE_API_KEY;

      if (!model.api_url || !token) {
        status = 'UNCONFIGURED';
        message = `Missing ${model.api_url ? 'server-side API credential env var' : 'inference endpoint URL'}.`;
      } else {
        const urlCheck = validateExternalInferenceUrl(model.api_url);
        if (!urlCheck.valid) {
          status = 'UNREACHABLE';
          message = urlCheck.reason ?? 'Invalid endpoint URL.';
        } else {
          try {
            const resp = await fetch(model.api_url, {
              method: 'HEAD',
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(5000),
            });
            status = resp.status < 500 ? 'HEALTHY' : 'UNREACHABLE';
            message = `Endpoint responded with HTTP ${resp.status}.`;
          } catch (err) {
            status = 'UNREACHABLE';
            message = err instanceof Error ? err.message : 'Endpoint unreachable.';
          }
        }
      }
    }

    db.prepare(`
      UPDATE ai_model_configs
      SET last_health_status = ?, last_health_message = ?, last_health_checked_at = ?
      WHERE id = ? AND organization_id = ?
    `).run(status, message, now, modelId, orgId);

    res.json({ last_health_status: status, last_health_message: message, last_health_checked_at: now });
  });

  // --- EHR / EMR & CLEARINGHOUSE INTEGRATIONS ---
  router.get('/integrations', requireAuth, (req, res) => {
    const integrations = db
      .prepare('SELECT * FROM integration_configs WHERE organization_id = ? ORDER BY vendor_name ASC')
      .all(req.auth!.organizationId);
    res.json({ integrations });
  });

  router.post('/integrations/:id/test-connection', requireAuth, requireRole('admin', 'coding_director'), async (req, res) => {
    const orgId = req.auth!.organizationId;
    const intId = String(req.params.id);
    const schema = z.object({ endpoint_url: z.string().max(400).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid integration endpoint URL.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM integration_configs WHERE id = ? AND organization_id = ?')
      .get(intId, orgId) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'Integration not found.' });
      return;
    }

    const urlToTest = (parsed.data.endpoint_url ?? String(row.endpoint_url ?? '')).trim();
    if (!urlToTest) {
      db.prepare(`
        UPDATE integration_configs
        SET connection_status = 'CONFIGURATION_REQUIRED', last_error = 'Endpoint URL and OAuth client credentials are required before testing connectivity.'
        WHERE id = ? AND organization_id = ?
      `).run(intId, orgId);
      res.status(400).json({
        connection_status: 'CONFIGURATION_REQUIRED',
        error: 'Cannot mark integration as connected without a verified endpoint URL and credentials.',
      });
      return;
    }

    const urlCheck = validateExternalInferenceUrl(urlToTest);
    if (!urlCheck.valid) {
      db.prepare(`
        UPDATE integration_configs
        SET endpoint_url = ?, connection_status = 'ERROR', last_error = ?
        WHERE id = ? AND organization_id = ?
      `).run(urlToTest, urlCheck.reason ?? 'Invalid URL', intId, orgId);
      res.status(400).json({ connection_status: 'ERROR', error: urlCheck.reason });
      return;
    }

    try {
      const resp = await fetch(urlToTest, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE integration_configs
        SET endpoint_url = ?, connection_status = 'VERIFIED_CONNECTED', last_sync_at = ?, last_error = NULL
        WHERE id = ? AND organization_id = ?
      `).run(urlToTest, now, intId, orgId);
      res.json({ connection_status: 'VERIFIED_CONNECTED', last_sync_at: now });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connectivity check failed';
      db.prepare(`
        UPDATE integration_configs
        SET endpoint_url = ?, connection_status = 'ERROR', last_error = ?
        WHERE id = ? AND organization_id = ?
      `).run(urlToTest, msg, intId, orgId);
      res.status(502).json({ connection_status: 'ERROR', error: msg });
    }
  });

  // --- SECURITY OVERVIEW & AUDIT LOGS ---
  router.get('/security/overview', requireAuth, (req, res) => {
    const orgId = req.auth!.organizationId;
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE organization_id = ?').get(orgId)?.c as number;
    const mfaUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE organization_id = ? AND mfa_enabled = 1').get(orgId)?.c as number;
    const injectionFlagged = db
      .prepare('SELECT COUNT(*) as c FROM medical_records WHERE organization_id = ? AND prompt_injection_flagged = 1')
      .get(orgId)?.c as number;
    const totalAuditEvents = db.prepare('SELECT COUNT(*) as c FROM audit_logs WHERE organization_id = ?').get(orgId)?.c as number;

    res.json({
      organization: org,
      controls: {
        totalUsers,
        mfaUsers,
        injectionFlaggedDocuments: injectionFlagged,
        totalAuditEvents,
        passwordHashing: 'scrypt (per-user 16-byte salt)',
        sessionMechanism: 'HMAC-SHA256 signed Bearer token (in-memory client state)',
        organizationIsolation: 'Enforced on all tenant SQL queries & Supabase RLS migrations',
        complianceNote:
          'Security safeguards are aligned with HIPAA technical controls. Formal HIPAA compliance requires signed BAAs with infrastructure/AI vendors, organizational policies, and independent audit attestation.',
      },
    });
  });

  router.get('/audit-logs', requireAuth, (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const orgId = req.auth!.organizationId;
    const logs = q
      ? db
          .prepare(`
            SELECT * FROM audit_logs
            WHERE organization_id = ? AND (LOWER(action) LIKE ? OR LOWER(user_email) LIKE ? OR LOWER(details) LIKE ?)
            ORDER BY created_at DESC LIMIT 200
          `)
          .all(orgId, `%${q}%`, `%${q}%`, `%${q}%`)
      : db
          .prepare('SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 200')
          .all(orgId);
    res.json({ logs });
  });

  // --- GLOBAL SEARCH ---
  router.get('/search', requireAuth, (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (!q) {
      res.json({ patients: [], encounters: [], codes: [] });
      return;
    }
    const orgId = req.auth!.organizationId;
    const patients = db
      .prepare("SELECT id, mrn, first_name || ' ' || last_name as name, dob FROM patients WHERE organization_id = ? AND (LOWER(first_name || ' ' || last_name) LIKE ? OR LOWER(mrn) LIKE ?) LIMIT 5")
      .all(orgId, `%${q}%`, `%${q}%`);
    const encounters = db
      .prepare('SELECT id, encounter_number, date_of_service, chief_complaint, coding_status FROM encounters WHERE organization_id = ? AND (LOWER(encounter_number) LIKE ? OR LOWER(chief_complaint) LIKE ?) LIMIT 5')
      .all(orgId, `%${q}%`, `%${q}%`);
    const codes = db
      .prepare('SELECT code, code_system, description FROM reference_codes WHERE LOWER(code) LIKE ? OR LOWER(description) LIKE ? LIMIT 8')
      .all(`%${q}%`, `%${q}%`);

    res.json({ patients, encounters, codes });
  });

  return router;
}
