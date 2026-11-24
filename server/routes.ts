import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  createPersistedSession,
  hashPassword,
  rateLimit,
  requireAuth,
  requireRole,
  revokeSessionByJti,
  verifyPassword,
  writeAuditLog,
} from './auth';
import {
  checkAiProviderHealth,
  performMultimodalOcrExtraction,
  validateExternalInferenceUrl,
} from './ai/providerRegistry';
import {
  loadNcciRulesPg,
  loadPayerPoliciesPg,
  loadReferenceCatalogPg,
  recomputeEncounterValidationPg,
  runAiExtractionJob,
} from './services/aiJobQueue';
import { importReferenceDatasetTx } from './services/codingDatasetImporter';
import {
  ConfigurationRequiredError,
  createPrivateMedicalRecordSignedUrl,
  downloadPrivateMedicalRecord,
  getPgPool,
  getSupabaseAdmin,
  getSupabaseConfigurationStatus,
  uploadPrivateMedicalRecord,
  withOrgTransaction,
  withTransaction,
} from './supabase';
import {
  checkReferenceDatasetAvailability,
  runDeterministicCodingValidation,
} from '../src/lib/codingValidator';
import { MAX_CLINICAL_FILE_BYTES, validateClinicalUploadFile } from '../src/lib/fileValidator';
import { sanitizeClinicalDocument } from '../src/lib/promptSanitizer';
import {
  buildOtpAuthUri,
  generateBase32Secret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyTotpCode,
} from '../src/lib/totp';
import type {
  AIModelConfig,
  CodingRecommendation,
  Encounter,
  Patient,
  UserRole,
} from '../src/lib/types';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CLINICAL_FILE_BYTES },
});

function parsePagination(req: Request, defaultPageSize = 25) {
  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || defaultPageSize) || defaultPageSize));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function createApiRouter(): Router {
  const router = express.Router();

  // --- HEALTH & PLATFORM CONFIGURATION ---
  router.get('/health', async (_req, res) => {
    const configStatus = getSupabaseConfigurationStatus();
    if (!configStatus.configured) {
      res.status(200).json({
        status: 'configuration_required',
        service: 'mediify-api',
        database: 'Not configured',
        supabase: configStatus,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const pool = getPgPool();
      await pool.query('SELECT 1');
      res.json({
        status: 'ok',
        service: 'mediify-api',
        database: 'connected',
        supabase: configStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: 'degraded',
        service: 'mediify-api',
        database: 'unreachable',
        error: err instanceof Error ? err.message : 'Database connectivity check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // --- AUTHENTICATION & SECURE TENANT ONBOARDING ---
  router.get('/auth/status', async (_req, res, next) => {
    try {
      const config = getSupabaseConfigurationStatus();
      if (!config.configured) {
        res.json({
          configured: false,
          missingVariables: config.missingVariables,
          hasUsers: false,
          hasOrganizations: false,
          syntheticSandboxAvailable: false,
        });
        return;
      }
      const pool = getPgPool();
      const [uRes, oRes] = await Promise.all([
        pool.query('SELECT COUNT(*)::int as c FROM users'),
        pool.query('SELECT COUNT(*)::int as c FROM organizations'),
      ]);
      res.json({
        configured: true,
        missingVariables: [],
        hasUsers: Number(uRes.rows[0]?.c || 0) > 0,
        hasOrganizations: Number(oRes.rows[0]?.c || 0) > 0,
        syntheticSandboxAvailable: false,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/register', rateLimit(20, 60_000), async (req, res, next) => {
    try {
      const schema = z.object({
        organizationName: z.string().min(2).max(140),
        npi: z.string().regex(/^\d{10}$/, 'Organization NPI must be 10 digits'),
        taxId: z.string().min(4).max(24),
        specialty: z.string().min(2).max(120),
        fullName: z.string().min(2).max(120),
        email: z.string().email(),
        password: z.string().min(12, 'Password must be at least 12 characters for healthcare accounts'),
        credentials: z.string().max(40).default(''),
        syntheticMode: z.boolean().default(false),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration payload' });
        return;
      }

      const email = parsed.data.email.trim().toLowerCase();
      const pool = getPgPool();
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
      if (existing.rows.length > 0) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      // Optionally provision Supabase Auth user if configured
      let authUserId: string | null = null;
      const supabaseAdmin = getSupabaseAdmin();
      if (supabaseAdmin) {
        const createdAuth = await supabaseAdmin.auth.admin.createUser({
          email,
          password: parsed.data.password,
          email_confirm: true,
          user_metadata: {
            full_name: parsed.data.fullName.trim(),
            credentials: parsed.data.credentials.trim(),
          },
        });
        if (!createdAuth.error && createdAuth.data.user) {
          authUserId = createdAuth.data.user.id;
        }
      }

      const passwordHash = hashPassword(parsed.data.password);

      const { orgId, userId } = await withTransaction(async (client) => {
        const orgRes = await client.query(
          `INSERT INTO organizations (name, npi, tax_id, specialty, retention_days, baa_attested, synthetic_mode, onboarding_completed)
           VALUES ($1, $2, $3, $4, 2555, FALSE, $5, FALSE)
           RETURNING id`,
          [
            parsed.data.organizationName.trim(),
            parsed.data.npi,
            parsed.data.taxId.trim(),
            parsed.data.specialty.trim(),
            parsed.data.syntheticMode,
          ],
        );
        const createdOrgId = orgRes.rows[0].id as string;

        const userRes = await client.query(
          `INSERT INTO users (auth_user_id, organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, is_active)
           VALUES ($1, $2, $3, $4, $5, 'admin', $6, FALSE, TRUE)
           RETURNING id`,
          [
            authUserId,
            createdOrgId,
            email,
            passwordHash,
            parsed.data.fullName.trim(),
            parsed.data.credentials.trim(),
          ],
        );
        const createdUserId = userRes.rows[0].id as string;

        // Provision AI provider configuration templates (strictly empty workspace: 0 patients/encounters/records/claims)
        await client.query(
          `INSERT INTO ai_model_configs (organization_id, display_name, provider_type, model_name, api_url, timeout_ms, max_tokens, is_active, approved_for_phi, baa_status, last_health_status, last_health_message)
           VALUES
             ($1, 'Google Gemini Clinical Extraction', 'gemini', 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com', 35000, 8192, TRUE, FALSE, 'REQUIRES_BAA', 'UNKNOWN', 'Run health check to verify upstream reachability.'),
             ($1, 'LingSante-3.1-air-VL (Primary Medical VLM)', 'lingsante', 'inclusionAI/LingSante-3.1-air-VL', '', 45000, 8192, FALSE, FALSE, 'REQUIRES_BAA', 'UNCONFIGURED', 'Configure LINGSANTE_API_URL and LINGSANTE_API_KEY.'),
             ($1, 'Hugging Face Medical Inference', 'huggingface', 'meta-llama/Llama-3.3-70B-Instruct', '', 45000, 4096, FALSE, FALSE, 'REQUIRES_BAA', 'UNCONFIGURED', 'Configure dedicated inference URL and HUGGINGFACE_API_TOKEN.'),
             ($1, 'VPC OpenAI-Compatible Medical LLM', 'openai_compatible', 'custom-medical-coder', '', 45000, 4096, FALSE, FALSE, 'REQUIRES_BAA', 'UNCONFIGURED', 'Configure private VPC inference URL and credentials.')`,
          [createdOrgId],
        );

        await client.query(
          `INSERT INTO integration_configs (organization_id, vendor_name, integration_type, endpoint_url, auth_method, connection_status, permissions_scope)
           VALUES
             ($1, 'X12 270/271 Clearinghouse Eligibility', 'CLEARINGHOUSE_X12', '', 'OAuth 2.0 Client Credentials + mTLS', 'CONFIGURATION_REQUIRED', 'eligibility.270 eligibility.271 claims.837'),
             ($1, 'Epic Systems (SMART on FHIR R4)', 'EHR_FHIR_R4', '', 'OAuth 2.0 SMART Backend Services', 'CONFIGURATION_REQUIRED', 'patient/*.read encounter/*.read documentreference/*.read'),
             ($1, 'Oracle Health / Cerner (FHIR R4)', 'EHR_FHIR_R4', '', 'OAuth 2.0 SMART Backend Services', 'CONFIGURATION_REQUIRED', 'patient/*.read encounter/*.read'),
             ($1, 'athenahealth EHR & Practice API', 'EHR_FHIR_R4', '', 'OAuth 2.0 Client Credentials', 'CONFIGURATION_REQUIRED', 'patients encounters insurance')`,
          [createdOrgId],
        );

        return { orgId: createdOrgId, userId: createdUserId };
      });

      const session = await createPersistedSession({
        userId,
        organizationId: orgId,
        email,
        role: 'admin',
        mfaVerified: false,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      await writeAuditLog({
        organizationId: orgId,
        userId,
        userEmail: email,
        action: 'ORGANIZATION_REGISTERED',
        resourceType: 'organization',
        resourceId: orgId,
        details: `Registered empty workspace for "${parsed.data.organizationName}" (NPI: ${parsed.data.npi}).`,
        ipAddress: req.ip,
      });

      res.status(201).json({
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: userId,
          organization_id: orgId,
          email,
          full_name: parsed.data.fullName.trim(),
          role: 'admin',
          credentials: parsed.data.credentials.trim(),
          mfa_enabled: false,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', rateLimit(20, 60_000), async (req, res, next) => {
    try {
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

      const pool = getPgPool();
      const email = parsed.data.email.trim().toLowerCase();
      const userRes = await pool.query(
        `SELECT id, auth_user_id, organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, mfa_secret, is_active, created_at
         FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [email],
      );
      const user = userRes.rows[0];

      if (!user || !user.is_active) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      let passwordValid = verifyPassword(parsed.data.password, user.password_hash);
      if (!passwordValid && user.auth_user_id) {
        const supabaseAdmin = getSupabaseAdmin();
        const url = process.env.SUPABASE_URL?.trim();
        const anon = process.env.SUPABASE_ANON_KEY?.trim();
        if (supabaseAdmin && url && anon) {
          const authResp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: anon },
            body: JSON.stringify({ email, password: parsed.data.password }),
          });
          passwordValid = authResp.ok;
        }
      }

      if (!passwordValid) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      if (user.mfa_enabled && user.mfa_secret) {
        if (!parsed.data.mfaCode) {
          res.status(200).json({ mfaRequired: true, email: user.email });
          return;
        }
        const totpOk = verifyTotpCode(user.mfa_secret, parsed.data.mfaCode);
        let recoveryUsed = false;
        if (!totpOk) {
          const codeHash = hashRecoveryCode(parsed.data.mfaCode);
          const recRes = await pool.query(
            `UPDATE mfa_recovery_codes SET used_at = NOW()
             WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
             RETURNING id`,
            [user.id, codeHash],
          );
          recoveryUsed = recRes.rows.length > 0;
        }
        if (!totpOk && !recoveryUsed) {
          res.status(401).json({ error: 'Invalid MFA verification or recovery code.' });
          return;
        }
      }

      const session = await createPersistedSession({
        userId: user.id,
        organizationId: user.organization_id,
        email: user.email,
        role: user.role as UserRole,
        mfaVerified: Boolean(user.mfa_enabled),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      await writeAuditLog({
        organizationId: user.organization_id,
        userId: user.id,
        userEmail: user.email,
        action: 'USER_LOGIN',
        resourceType: 'session',
        resourceId: session.jti,
        details: `User authenticated (${user.role}).`,
        ipAddress: req.ip,
      });

      res.json({
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          organization_id: user.organization_id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          credentials: user.credentials,
          mfa_enabled: user.mfa_enabled,
          is_active: user.is_active,
          created_at: user.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', requireAuth, async (req, res, next) => {
    try {
      if (req.auth?.sessionJti) {
        await revokeSessionByJti(req.auth.sessionJti, req.auth.organizationId);
      }
      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'USER_LOGOUT',
        resourceType: 'session',
        resourceId: req.auth!.sessionJti ?? req.auth!.userId,
        details: 'Session terminated by user logout.',
        ipAddress: req.ip,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/sessions', requireAuth, async (req, res, next) => {
    try {
      const sessions = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const result = await client.query(
          `SELECT id, token_jti, ip_address, user_agent, mfa_verified, expires_at, revoked_at, created_at
           FROM user_sessions
           WHERE user_id = $1 AND organization_id = $2
           ORDER BY created_at DESC LIMIT 20`,
          [req.auth!.userId, req.auth!.organizationId],
        );
        return result.rows.map((s) => ({
          ...s,
          is_current: s.token_jti === req.auth!.sessionJti,
          token_jti: undefined,
        }));
      });
      res.json({ sessions });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/sessions/:id/revoke', requireAuth, async (req, res, next) => {
    try {
      await withOrgTransaction(req.auth!.organizationId, async (client) => {
        await client.query(
          `UPDATE user_sessions SET revoked_at = NOW()
           WHERE id = $1 AND user_id = $2 AND organization_id = $3 AND revoked_at IS NULL`,
          [String(req.params.id), req.auth!.userId, req.auth!.organizationId],
        );
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/me', requireAuth, async (req, res, next) => {
    try {
      const data = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const orgRes = await client.query('SELECT * FROM organizations WHERE id = $1', [req.auth!.organizationId]);
        const userRes = await client.query(
          'SELECT id, organization_id, email, full_name, role, credentials, mfa_enabled, is_active, created_at FROM users WHERE id = $1',
          [req.auth!.userId],
        );
        return { organization: orgRes.rows[0], user: userRes.rows[0] };
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // SECURE MFA ENROLLMENT: Never returns live 6-digit TOTP code!
  router.post('/auth/mfa/enroll', requireAuth, async (req, res, next) => {
    try {
      const secretBase32 = generateBase32Secret(20);
      const otpauthUri = buildOtpAuthUri({
        issuer: 'MEDIIFY',
        accountEmail: req.auth!.email,
        secretBase32,
      });

      await withOrgTransaction(req.auth!.organizationId, async (client) => {
        await client.query('UPDATE users SET mfa_secret = $1 WHERE id = $2 AND organization_id = $3', [
          secretBase32,
          req.auth!.userId,
          req.auth!.organizationId,
        ]);
      });

      res.json({
        secretBase32,
        otpauthUri,
        instructions: 'Add this Base32 secret or otpauth URI to your authenticator app (Google Authenticator, Authy, 1Password), then verify with a generated 6-digit code.',
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/mfa/enable', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({ code: z.string().regex(/^\d{6}$/) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Provide a valid 6-digit verification code from your authenticator app.' });
        return;
      }

      const recoveryCodes = generateRecoveryCodes(8);

      await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const rowRes = await client.query('SELECT mfa_secret FROM users WHERE id = $1', [req.auth!.userId]);
        const secret = rowRes.rows[0]?.mfa_secret as string | undefined;
        if (!secret || !verifyTotpCode(secret, parsed.data.code)) {
          throw Object.assign(new Error('Invalid TOTP verification code.'), { statusCode: 400 });
        }
        await client.query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [req.auth!.userId]);
        await client.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [req.auth!.userId]);
        for (const rc of recoveryCodes) {
          await client.query('INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)', [
            req.auth!.userId,
            hashRecoveryCode(rc),
          ]);
        }
      });

      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'MFA_ENABLED',
        resourceType: 'user',
        resourceId: req.auth!.userId,
        details: 'TOTP Multi-Factor Authentication enabled with 8 single-use recovery codes.',
        ipAddress: req.ip,
      });

      res.json({ mfa_enabled: true, recoveryCodes });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/mfa/disable', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({ password: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Password confirmation is required to disable MFA.' });
        return;
      }

      await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const userRes = await client.query('SELECT password_hash FROM users WHERE id = $1', [req.auth!.userId]);
        if (!verifyPassword(parsed.data.password, userRes.rows[0]?.password_hash)) {
          throw Object.assign(new Error('Invalid password confirmation.'), { statusCode: 401 });
        }
        await client.query('UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1', [req.auth!.userId]);
        await client.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [req.auth!.userId]);
      });

      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'MFA_DISABLED',
        resourceType: 'user',
        resourceId: req.auth!.userId,
        details: 'Multi-factor authentication disabled after password verification.',
        ipAddress: req.ip,
      });

      res.json({ mfa_enabled: false });
    } catch (err) {
      next(err);
    }
  });

  // --- ORGANIZATION SETTINGS & ONBOARDING ---
  router.put('/organizations/current', requireAuth, requireRole('admin', 'coding_director'), async (req, res, next) => {
    try {
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

      const updated = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const upd = await client.query(
          `UPDATE organizations
           SET name = $1, npi = $2, tax_id = $3, specialty = $4, retention_days = $5, baa_attested = $6,
               onboarding_completed = COALESCE($7, onboarding_completed)
           WHERE id = $8
           RETURNING *`,
          [
            parsed.data.name.trim(),
            parsed.data.npi,
            parsed.data.tax_id.trim(),
            parsed.data.specialty.trim(),
            parsed.data.retention_days,
            parsed.data.baa_attested,
            parsed.data.onboarding_completed ?? null,
            req.auth!.organizationId,
          ],
        );
        return upd.rows[0];
      });

      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'ORGANIZATION_UPDATED',
        resourceType: 'organization',
        resourceId: req.auth!.organizationId,
        details: `Updated organization profile & retention policy (${parsed.data.retention_days} days, BAA=${parsed.data.baa_attested}).`,
        ipAddress: req.ip,
      });

      res.json({ organization: updated });
    } catch (err) {
      next(err);
    }
  });

  // --- DASHBOARD, WORKLIST, NOTIFICATIONS & QA (100% REAL DATABASE QUERIES WITH FILTERS) ---
  router.get('/dashboard/metrics', requireAuth, async (req, res, next) => {
    try {
      const orgId = req.auth!.organizationId;
      const dateFrom = typeof req.query.dateFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom) ? req.query.dateFrom : null;
      const dateTo = typeof req.query.dateTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo) ? req.query.dateTo : null;
      const specialty = typeof req.query.specialty === 'string' && req.query.specialty.trim() ? req.query.specialty.trim() : null;
      const providerId = typeof req.query.providerId === 'string' && req.query.providerId.trim() ? req.query.providerId.trim() : null;
      const payer = typeof req.query.payer === 'string' && req.query.payer.trim() ? req.query.payer.trim() : null;
      const reviewerId = typeof req.query.reviewerId === 'string' && req.query.reviewerId.trim() ? req.query.reviewerId.trim() : null;

      const payload = await withOrgTransaction(orgId, async (client) => {
        const encWhere: string[] = ['e.organization_id = $1'];
        const encParams: unknown[] = [orgId];
        let pIdx = 2;

        if (dateFrom) {
          encWhere.push(`e.date_of_service >= $${pIdx++}`);
          encParams.push(dateFrom);
        }
        if (dateTo) {
          encWhere.push(`e.date_of_service <= $${pIdx++}`);
          encParams.push(dateTo);
        }
        if (specialty) {
          encWhere.push(`LOWER(e.specialty) = LOWER($${pIdx++})`);
          encParams.push(specialty);
        }
        if (providerId) {
          encWhere.push(`e.provider_id = $${pIdx++}`);
          encParams.push(providerId);
        }
        if (reviewerId) {
          encWhere.push(`(e.assigned_reviewer_id = $${pIdx} OR e.assigned_coder_id = $${pIdx})`);
          encParams.push(reviewerId);
          pIdx += 1;
        }
        if (payer) {
          encWhere.push(`EXISTS (SELECT 1 FROM insurance_policies ip WHERE ip.patient_id = e.patient_id AND LOWER(ip.payer_name) LIKE LOWER($${pIdx++}))`);
          encParams.push(`%${payer}%`);
        }

        const whereSql = encWhere.join(' AND ');

        const kpiRes = await client.query(
          `SELECT
             (SELECT COUNT(*)::int FROM medical_records mr JOIN encounters e ON e.id = mr.encounter_id WHERE ${whereSql}) as total_records,
             COUNT(*)::int as total_encounters,
             COUNT(*) FILTER (WHERE e.coding_status IN ('APPROVED', 'CLAIM_READY'))::int as completed_encounters,
             COUNT(*) FILTER (WHERE e.coding_status IN ('NEEDS_CODING_REVIEW', 'PENDING_EXTRACTION', 'ESCALATED'))::int as pending_reviews
           FROM encounters e WHERE ${whereSql}`,
          encParams,
        );

        const recsRes = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE cr.approval_status IN ('APPROVED', 'MODIFIED', 'REJECTED'))::int as total_reviewed_recs,
             COUNT(*) FILTER (WHERE cr.approval_status = 'APPROVED')::int as approved_without_mod,
             COUNT(*) FILTER (WHERE cr.documentation_completeness != 'COMPLETE')::int as doc_deficiencies
           FROM coding_recommendations cr
           JOIN encounters e ON e.id = cr.encounter_id
           WHERE ${whereSql}`,
          encParams,
        );

        const risksRes = await client.query(
          `SELECT COUNT(*)::int as open_denial_risks
           FROM denial_risks dr JOIN encounters e ON e.id = dr.encounter_id
           WHERE ${whereSql} AND dr.review_status = 'OPEN'`,
          encParams,
        );

        const claimsRes = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE c.readiness_status = 'READY_FOR_SUBMISSION')::int as claim_ready_count,
             COUNT(*) FILTER (WHERE c.readiness_status = 'BLOCKED')::int as claim_blocked_count,
             COALESCE(SUM(c.total_charge_amount), 0)::float as total_billed,
             COALESCE(SUM(c.paid_amount), 0)::float as total_paid,
             COUNT(c.paid_amount)::int as paid_claims_count
           FROM claims c JOIN encounters e ON e.id = c.encounter_id
           WHERE ${whereSql}`,
          encParams,
        );

        const denialBreakdownRes = await client.query(
          `SELECT dr.risk_category as category, dr.severity, COUNT(*)::int as count
           FROM denial_risks dr JOIN encounters e ON e.id = dr.encounter_id
           WHERE ${whereSql} AND dr.review_status = 'OPEN'
           GROUP BY dr.risk_category, dr.severity
           ORDER BY count DESC`,
          encParams,
        );

        const recentEncRes = await client.query(
          `SELECT e.id, e.encounter_number, e.date_of_service::text, e.encounter_type, e.specialty, e.chief_complaint, e.coding_status,
                  p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn,
                  pr.full_name as provider_name,
                  (SELECT COUNT(*)::int FROM denial_risks dr WHERE dr.encounter_id = e.id AND dr.review_status = 'OPEN') as open_risks,
                  (SELECT COUNT(*)::int FROM coding_recommendations cr WHERE cr.encounter_id = e.id AND cr.approval_status = 'PENDING') as pending_codes
           FROM encounters e
           JOIN patients p ON p.id = e.patient_id
           JOIN providers pr ON pr.id = e.provider_id
           WHERE ${whereSql}
           ORDER BY e.date_of_service DESC
           LIMIT 15`,
          encParams,
        );

        const prodRes = await client.query(
          `SELECT ca.actor_email, COUNT(*)::int as actions_count,
                  COUNT(*) FILTER (WHERE ca.action = 'APPROVED')::int as approved_count,
                  COUNT(*) FILTER (WHERE ca.action = 'MODIFIED')::int as modified_count,
                  COUNT(*) FILTER (WHERE ca.action = 'REJECTED')::int as rejected_count
           FROM coding_approvals ca
           JOIN encounters e ON e.id = ca.encounter_id
           WHERE ${whereSql}
           GROUP BY ca.actor_email`,
          encParams,
        );

        const aiJobsRes = await client.query(
          `SELECT
             COUNT(*)::int as total_jobs,
             COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed_jobs,
             COUNT(*) FILTER (WHERE status = 'FAILED')::int as failed_jobs,
             COUNT(*) FILTER (WHERE status IN ('QUEUED', 'OCR_PROCESSING', 'CLINICAL_EXTRACTION', 'RULE_VALIDATION'))::int as active_jobs,
             AVG(latency_ms)::int as avg_latency_ms
           FROM ai_processing_jobs WHERE organization_id = $1`,
          [orgId],
        );

        const integrationsRes = await client.query(
          `SELECT vendor_name, integration_type, connection_status, last_sync_at FROM integration_configs WHERE organization_id = $1 ORDER BY vendor_name`,
          [orgId],
        );

        const filterOptionsRes = await client.query(
          `SELECT
             ARRAY(SELECT DISTINCT specialty FROM encounters WHERE organization_id = $1 AND specialty != '') as specialties,
             ARRAY(SELECT DISTINCT payer_name FROM insurance_policies WHERE organization_id = $1) as payers`,
          [orgId],
        );

        const providersListRes = await client.query(
          `SELECT id, full_name FROM providers WHERE organization_id = $1 ORDER BY full_name`,
          [orgId],
        );
        const reviewersListRes = await client.query(
          `SELECT id, full_name, email FROM users WHERE organization_id = $1 ORDER BY full_name`,
          [orgId],
        );

        const totalReviewedRecs = Number(recsRes.rows[0]?.total_reviewed_recs || 0);
        const approvedWithoutMod = Number(recsRes.rows[0]?.approved_without_mod || 0);
        const codingAccuracyPct =
          totalReviewedRecs > 0 ? Math.round((approvedWithoutMod / totalReviewedRecs) * 1000) / 10 : null;

        return {
          kpis: {
            totalRecords: Number(kpiRes.rows[0]?.total_records || 0),
            totalEncounters: Number(kpiRes.rows[0]?.total_encounters || 0),
            completedEncounters: Number(kpiRes.rows[0]?.completed_encounters || 0),
            pendingReviews: Number(kpiRes.rows[0]?.pending_reviews || 0),
            codingAccuracyPct,
            totalReviewedRecs,
            docDeficiencies: Number(recsRes.rows[0]?.doc_deficiencies || 0),
            openDenialRisks: Number(risksRes.rows[0]?.open_denial_risks || 0),
            claimReadyCount: Number(claimsRes.rows[0]?.claim_ready_count || 0),
            claimBlockedCount: Number(claimsRes.rows[0]?.claim_blocked_count || 0),
          },
          denialBreakdown: denialBreakdownRes.rows,
          reimbursementStats: {
            total_billed: claimsRes.rows[0]?.total_billed ?? 0,
            total_paid: claimsRes.rows[0]?.total_paid ?? 0,
            paid_claims_count: claimsRes.rows[0]?.paid_claims_count ?? 0,
          },
          recentEncounters: recentEncRes.rows,
          coderProductivity: prodRes.rows,
          aiHealthSummary: aiJobsRes.rows[0],
          integrationHealth: integrationsRes.rows,
          filterOptions: {
            specialties: filterOptionsRes.rows[0]?.specialties ?? [],
            payers: filterOptionsRes.rows[0]?.payers ?? [],
            providers: providersListRes.rows,
            reviewers: reviewersListRes.rows,
          },
        };
      });

      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  router.get('/worklist', requireAuth, async (req, res, next) => {
    try {
      const scope = String(req.query.scope ?? 'all');
      const items = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const whereClause =
          scope === 'mine'
            ? `e.organization_id = $1 AND (e.assigned_coder_id = $2 OR e.assigned_reviewer_id = $2)`
            : `e.organization_id = $1 AND e.coding_status IN ('PENDING_EXTRACTION', 'NEEDS_CODING_REVIEW', 'ESCALATED')`;
        const params = scope === 'mine' ? [req.auth!.organizationId, req.auth!.userId] : [req.auth!.organizationId];
        const resRows = await client.query(
          `SELECT e.id, e.encounter_number, e.date_of_service::text, e.encounter_type, e.specialty, e.chief_complaint, e.coding_status,
                  p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn,
                  pr.full_name as provider_name,
                  u.email as assigned_coder_email,
                  (SELECT COUNT(*)::int FROM coding_recommendations cr WHERE cr.encounter_id = e.id AND cr.approval_status = 'PENDING') as pending_codes,
                  (SELECT COUNT(*)::int FROM denial_risks dr WHERE dr.encounter_id = e.id AND dr.review_status = 'OPEN') as open_risks
           FROM encounters e
           JOIN patients p ON p.id = e.patient_id
           JOIN providers pr ON pr.id = e.provider_id
           LEFT JOIN users u ON u.id = e.assigned_coder_id
           WHERE ${whereClause}
           ORDER BY e.date_of_service DESC`,
          params,
        );
        return resRows.rows;
      });
      res.json({ worklist: items });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications', requireAuth, async (req, res, next) => {
    try {
      const notifications = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const resRows = await client.query(
          `SELECT id, category, severity, title, message, resource_type, resource_id, is_read, created_at
           FROM notifications
           WHERE organization_id = $1 AND (recipient_user_id IS NULL OR recipient_user_id = $2)
           ORDER BY created_at DESC LIMIT 60`,
          [req.auth!.organizationId, req.auth!.userId],
        );
        return resRows.rows;
      });
      res.json({ notifications });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/:id/read', requireAuth, async (req, res, next) => {
    try {
      await withOrgTransaction(req.auth!.organizationId, async (client) => {
        await client.query(
          `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND organization_id = $2`,
          [String(req.params.id), req.auth!.organizationId],
        );
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/quality-assurance', requireAuth, async (req, res, next) => {
    try {
      const qa = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const escalated = await client.query(
          `SELECT e.id, e.encounter_number, e.date_of_service::text, e.chief_complaint,
                  p.first_name || ' ' || p.last_name as patient_name,
                  ca.notes, ca.actor_email, ca.created_at
           FROM encounters e
           JOIN patients p ON p.id = e.patient_id
           LEFT JOIN LATERAL (
             SELECT notes, actor_email, created_at FROM coding_approvals
             WHERE encounter_id = e.id AND action = 'ESCALATED' ORDER BY created_at DESC LIMIT 1
           ) ca ON TRUE
           WHERE e.organization_id = $1 AND e.coding_status = 'ESCALATED'
           ORDER BY e.date_of_service DESC`,
          [req.auth!.organizationId],
        );

        const annotations = await client.query(
          `SELECT a.*, e.encounter_number
           FROM coding_annotations a
           JOIN encounters e ON e.id = a.encounter_id
           WHERE a.organization_id = $1 AND a.annotation_type IN ('DEFICIENCY_ALERT', 'PHYSICIAN_QUERY', 'AUDITOR_FLAG')
           ORDER BY a.created_at DESC LIMIT 50`,
          [req.auth!.organizationId],
        );

        const totals = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE approval_status IN ('APPROVED', 'MODIFIED', 'REJECTED'))::int as reviewed_count,
             COUNT(*) FILTER (WHERE approval_status = 'APPROVED')::int as first_pass_count,
             COUNT(*) FILTER (WHERE approval_status = 'MODIFIED')::int as modified_count,
             COUNT(*) FILTER (WHERE approval_status = 'ESCALATED')::int as escalated_count
           FROM coding_recommendations WHERE organization_id = $1`,
          [req.auth!.organizationId],
        );

        return {
          escalatedEncounters: escalated.rows,
          qaAnnotations: annotations.rows,
          summary: totals.rows[0],
        };
      });
      res.json(qa);
    } catch (err) {
      next(err);
    }
  });

  // --- PATIENTS & PROVIDERS ---
  router.get('/patients', requireAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '').trim().toLowerCase();
      const { page, pageSize, offset } = parsePagination(req, 25);

      const result = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const where = q
          ? `p.organization_id = $1 AND (LOWER(p.first_name || ' ' || p.last_name) LIKE $2 OR LOWER(p.mrn) LIKE $2)`
          : `p.organization_id = $1`;
        const params = q ? [req.auth!.organizationId, `%${q}%`] : [req.auth!.organizationId];

        const countRes = await client.query(`SELECT COUNT(*)::int as total FROM patients p WHERE ${where}`, params);
        const rowsRes = await client.query(
          `SELECT p.id, p.organization_id, p.mrn, p.first_name, p.last_name, p.dob::text, p.sex, p.city, p.state, p.is_synthetic, p.created_at,
                  (SELECT COUNT(*)::int FROM encounters e WHERE e.patient_id = p.id) as encounter_count,
                  (SELECT payer_name FROM insurance_policies ip WHERE ip.patient_id = p.id AND ip.priority = 'PRIMARY' LIMIT 1) as primary_payer
           FROM patients p
           WHERE ${where}
           ORDER BY p.created_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, offset],
        );

        return {
          patients: rowsRes.rows,
          total: Number(countRes.rows[0]?.total || 0),
          page,
          pageSize,
        };
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/patients', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        mrn: z.string().min(2).max(40),
        first_name: z.string().min(1).max(80),
        last_name: z.string().min(1).max(80),
        dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        sex: z.enum(['M', 'F', 'U']),
        city: z.string().max(80).default(''),
        state: z.string().max(2).default(''),
        is_synthetic: z.boolean().default(false),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid patient fields' });
        return;
      }

      const created = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const resInsert = await client.query(
          `INSERT INTO patients (organization_id, mrn, first_name, last_name, dob, sex, city, state, is_synthetic)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *, dob::text`,
          [
            req.auth!.organizationId,
            parsed.data.mrn.trim(),
            parsed.data.first_name.trim(),
            parsed.data.last_name.trim(),
            parsed.data.dob,
            parsed.data.sex,
            parsed.data.city.trim(),
            parsed.data.state.toUpperCase(),
            parsed.data.is_synthetic,
          ],
        );
        return resInsert.rows[0];
      });

      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'PATIENT_CREATED',
        resourceType: 'patient',
        resourceId: created.id,
        details: `Registered patient MRN ${parsed.data.mrn}.`,
        ipAddress: req.ip,
      });

      res.status(201).json({ patient: created });
    } catch (err) {
      next(err);
    }
  });

  router.get('/providers', requireAuth, async (req, res, next) => {
    try {
      const providers = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const resRows = await client.query(
          'SELECT * FROM providers WHERE organization_id = $1 ORDER BY full_name ASC',
          [req.auth!.organizationId],
        );
        return resRows.rows;
      });
      res.json({ providers });
    } catch (err) {
      next(err);
    }
  });

  router.post('/providers', requireAuth, requireRole('admin', 'coding_director'), async (req, res, next) => {
    try {
      const schema = z.object({
        npi: z.string().regex(/^\d{10}$/, 'Provider NPI must be 10 digits'),
        full_name: z.string().min(2).max(120),
        specialty: z.string().min(2).max(120),
        credential: z.string().min(1).max(40),
        network_status: z.enum(['IN_NETWORK', 'OUT_OF_NETWORK', 'UNVERIFIED']).default('UNVERIFIED'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid provider fields' });
        return;
      }

      const provider = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const resIns = await client.query(
          `INSERT INTO providers (organization_id, npi, full_name, specialty, credential, network_status)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            req.auth!.organizationId,
            parsed.data.npi,
            parsed.data.full_name.trim(),
            parsed.data.specialty.trim(),
            parsed.data.credential.trim(),
            parsed.data.network_status,
          ],
        );
        return resIns.rows[0];
      });

      res.status(201).json({ provider });
    } catch (err) {
      next(err);
    }
  });

  // --- ENCOUNTERS & MEDICAL RECORDS (PRIVATE SUPABASE STORAGE + MAGIC-BYTE VALIDATION) ---
  router.get('/encounters', requireAuth, async (req, res, next) => {
    try {
      const statusFilter = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
      const { page, pageSize, offset } = parsePagination(req, 50);

      const data = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const where = statusFilter ? `e.organization_id = $1 AND e.coding_status = $2` : `e.organization_id = $1`;
        const params = statusFilter ? [req.auth!.organizationId, statusFilter] : [req.auth!.organizationId];

        const countRes = await client.query(`SELECT COUNT(*)::int as total FROM encounters e WHERE ${where}`, params);
        const rowsRes = await client.query(
          `SELECT e.*, e.date_of_service::text as date_of_service,
                  p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn, p.dob::text as patient_dob, p.sex as patient_sex,
                  pr.full_name as provider_name, pr.npi as provider_npi
           FROM encounters e
           JOIN patients p ON p.id = e.patient_id
           JOIN providers pr ON pr.id = e.provider_id
           WHERE ${where}
           ORDER BY e.date_of_service DESC, e.created_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, offset],
        );

        return {
          encounters: rowsRes.rows,
          total: Number(countRes.rows[0]?.total || 0),
          page,
          pageSize,
        };
      });

      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/medical-records', requireAuth, async (req, res, next) => {
    try {
      const { page, pageSize, offset } = parsePagination(req, 25);
      const result = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const countRes = await client.query(
          `SELECT COUNT(*)::int as total FROM medical_records WHERE organization_id = $1`,
          [req.auth!.organizationId],
        );
        const rowsRes = await client.query(
          `SELECT mr.id, mr.organization_id, mr.patient_id, mr.encounter_id, mr.document_type, mr.file_name,
                  mr.mime_type, mr.storage_bucket_path, mr.file_size_bytes, mr.page_count, mr.ocr_status, mr.ocr_error,
                  mr.prompt_injection_flagged, mr.created_at,
                  p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn,
                  e.encounter_number, e.date_of_service::text as date_of_service, e.coding_status
           FROM medical_records mr
           JOIN patients p ON p.id = mr.patient_id
           JOIN encounters e ON e.id = mr.encounter_id
           WHERE mr.organization_id = $1
           ORDER BY mr.created_at DESC
           LIMIT $2 OFFSET $3`,
          [req.auth!.organizationId, pageSize, offset],
        );
        return {
          records: rowsRes.rows,
          total: Number(countRes.rows[0]?.total || 0),
          page,
          pageSize,
        };
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/medical-records/upload', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
      const schema = z.object({
        patient_id: z.string().uuid('Valid patient_id is required'),
        provider_id: z.string().uuid().optional(),
        date_of_service: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        encounter_type: z.enum(['Outpatient', 'Inpatient', 'Emergency', 'Operative', 'Telehealth']).default('Outpatient'),
        specialty: z.string().max(120).default('General Medicine'),
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
      let extractedText = (parsed.data.raw_text_input ?? '').trim();
      let fileName = `Clinical_Note_${parsed.data.date_of_service}.txt`;
      let mimeType = 'text/plain';
      let fileSizeBytes = Buffer.byteLength(extractedText, 'utf8');
      let fileSha256 = extractedText ? crypto.createHash('sha256').update(extractedText).digest('hex') : '';
      let uploadBuffer: Buffer | null = extractedText ? Buffer.from(extractedText, 'utf8') : null;
      let ocrStatus: 'COMPLETED' | 'PENDING' | 'FAILED' = 'COMPLETED';
      let ocrError: string | null = null;

      if (req.file) {
        const validation = validateClinicalUploadFile({
          buffer: req.file.buffer,
          declaredMime: req.file.mimetype,
          originalName: req.file.originalname,
        });
        if (!validation.valid) {
          res.status(400).json({ error: validation.rejectionReason ?? 'Invalid clinical file signature.' });
          return;
        }
        fileName = req.file.originalname;
        mimeType = validation.detectedMime;
        fileSizeBytes = validation.sizeBytes;
        fileSha256 = validation.sha256;
        uploadBuffer = req.file.buffer;

        if (mimeType === 'text/plain' || mimeType === 'application/json' || mimeType === 'text/csv') {
          extractedText = req.file.buffer.toString('utf8');
        } else {
          // PDF or Scanned Image -> invoke configured OCR engine
          const activeModel = await withOrgTransaction(orgId, async (client) => {
            const m = await client.query(`SELECT * FROM ai_model_configs WHERE organization_id = $1 AND is_active = TRUE LIMIT 1`, [orgId]);
            return m.rows[0] as AIModelConfig | undefined;
          });
          try {
            extractedText = await performMultimodalOcrExtraction({
              mimeType,
              base64Data: req.file.buffer.toString('base64'),
              fileName,
              activeModelConfig: activeModel ?? null,
            });
          } catch (ocrErr) {
            ocrStatus = 'FAILED';
            ocrError = ocrErr instanceof Error ? ocrErr.message : 'OCR processing unavailable';
            if (!extractedText) {
              extractedText = `[OCR PENDING / UNAVAILABLE: ${ocrError}]`;
            }
          }
        }
      }

      if (!extractedText || !uploadBuffer) {
        res.status(400).json({ error: 'Provide either a validated clinical document file or clinical note text.' });
        return;
      }

      const sanitization = sanitizeClinicalDocument(extractedText);
      const recordId = crypto.randomUUID();

      // Upload raw clinical artifact into private Supabase Storage bucket (organization-isolated)
      const bucketPath = await uploadPrivateMedicalRecord({
        organizationId: orgId,
        recordId,
        fileName,
        buffer: uploadBuffer,
        mimeType,
      });

      const created = await withOrgTransaction(orgId, async (client) => {
        const patRes = await client.query(`SELECT id FROM patients WHERE id = $1 AND organization_id = $2`, [
          parsed.data.patient_id,
          orgId,
        ]);
        if (patRes.rows.length === 0) {
          throw Object.assign(new Error('Patient not found in current organization.'), { statusCode: 404 });
        }

        let providerId = parsed.data.provider_id;
        if (!providerId) {
          const provRes = await client.query(`SELECT id FROM providers WHERE organization_id = $1 LIMIT 1`, [orgId]);
          providerId = provRes.rows[0]?.id as string | undefined;
        }
        if (!providerId) {
          const newProv = await client.query(
            `INSERT INTO providers (organization_id, npi, full_name, specialty, credential, network_status)
             VALUES ($1, '0000000000', 'Unassigned Rendering Provider', $2, 'MD', 'UNVERIFIED')
             RETURNING id`,
            [orgId, parsed.data.specialty],
          );
          providerId = newProv.rows[0].id as string;
        }

        const seqCode = crypto.randomBytes(2).toString('hex').toUpperCase();
        const encNumber = `ENC-${new Date().getUTCFullYear()}-${seqCode}`;
        const encRes = await client.query(
          `INSERT INTO encounters (organization_id, patient_id, provider_id, encounter_number, date_of_service, encounter_type, place_of_service, specialty, chief_complaint, coding_status, assigned_coder_id, is_synthetic)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_EXTRACTION', $10, FALSE)
           RETURNING id`,
          [
            orgId,
            parsed.data.patient_id,
            providerId,
            encNumber,
            parsed.data.date_of_service,
            parsed.data.encounter_type,
            parsed.data.encounter_type === 'Inpatient' ? '21' : '11',
            parsed.data.specialty,
            parsed.data.chief_complaint,
            req.auth!.userId,
          ],
        );
        const encounterId = encRes.rows[0].id as string;

        const pageCount = Math.max(
          1,
          (sanitization.sanitizedText.match(/\[PAGE \d+\]/gi) ?? []).length || Math.ceil(sanitization.sanitizedText.length / 2200),
        );

        await client.query(
          `INSERT INTO medical_records (id, organization_id, patient_id, encounter_id, document_type, file_name, mime_type, storage_bucket_path, file_size_bytes, file_sha256, page_count, ocr_status, ocr_error, raw_text, prompt_injection_flagged, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            recordId,
            orgId,
            parsed.data.patient_id,
            encounterId,
            parsed.data.document_type,
            fileName,
            mimeType,
            bucketPath,
            fileSizeBytes,
            fileSha256,
            pageCount,
            ocrStatus,
            ocrError,
            sanitization.sanitizedText,
            sanitization.injectionDetected,
            req.auth!.userId,
          ],
        );

        return { encounterId, encNumber };
      });

      await writeAuditLog({
        organizationId: orgId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: sanitization.injectionDetected ? 'DOCUMENT_UPLOADED_INJECTION_FLAGGED' : 'DOCUMENT_UPLOADED',
        resourceType: 'medical_record',
        resourceId: recordId,
        details: `Stored "${fileName}" (${mimeType}, ${fileSizeBytes} bytes) in private encrypted storage for encounter ${created.encNumber}.`,
        ipAddress: req.ip,
      });

      res.status(201).json({
        encounter_id: created.encounterId,
        record_id: recordId,
        ocrStatus,
        ocrError,
        promptInjectionDetected: sanitization.injectionDetected,
        matchedInjectionPatterns: sanitization.matchedPatterns,
      });
    } catch (err) {
      next(err);
    }
  });

  // Authenticated private document stream / signed URL preview for PDF/images
  router.get('/medical-records/:id/content', requireAuth, async (req, res, next) => {
    try {
      const record = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const resRec = await client.query(
          `SELECT id, file_name, mime_type, storage_bucket_path FROM medical_records WHERE id = $1 AND organization_id = $2`,
          [String(req.params.id), req.auth!.organizationId],
        );
        return resRec.rows[0] as { id: string; file_name: string; mime_type: string; storage_bucket_path: string } | undefined;
      });

      if (!record || !record.storage_bucket_path) {
        res.status(404).json({ error: 'Medical document binary artifact not found.' });
        return;
      }

      if (req.query.mode === 'signed-url') {
        const signedUrl = await createPrivateMedicalRecordSignedUrl(record.storage_bucket_path, 120);
        res.json({ signedUrl, mimeType: record.mime_type, fileName: record.file_name });
        return;
      }

      const buf = await downloadPrivateMedicalRecord(record.storage_bucket_path);
      res.setHeader('Content-Type', record.mime_type);
      res.setHeader('Content-Disposition', `inline; filename="${record.file_name.replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(buf);
    } catch (err) {
      next(err);
    }
  });

  // --- 3-PANEL CODING WORKSPACE ---
  router.get('/coding-workspace/:encounterId', requireAuth, async (req, res, next) => {
    try {
      const orgId = req.auth!.organizationId;
      const encounterId = String(req.params.encounterId);

      const ws = await withOrgTransaction(orgId, async (client) => {
        const encRes = await client.query(
          `SELECT e.*, e.date_of_service::text as date_of_service,
                  pr.full_name as provider_name, pr.npi as provider_npi, pr.specialty as provider_specialty, pr.network_status as provider_network_status
           FROM encounters e
           JOIN providers pr ON pr.id = e.provider_id
           WHERE e.id = $1 AND e.organization_id = $2`,
          [encounterId, orgId],
        );
        const encounter = encRes.rows[0] as Encounter | undefined;
        if (!encounter) return null;

        await recomputeEncounterValidationPg(client, orgId, encounterId);

        const [
          patRes,
          patEncRes,
          recRes,
          entRes,
          polRes,
          eligRes,
          recsRes,
          valRes,
          drRes,
          rifRes,
          apprRes,
          annRes,
          jobsRes,
          verRes,
          teamRes,
        ] = await Promise.all([
          client.query(`SELECT *, dob::text as dob FROM patients WHERE id = $1 AND organization_id = $2`, [
            encounter.patient_id,
            orgId,
          ]),
          client.query(
            `SELECT id, encounter_number, date_of_service::text as date_of_service, encounter_type, chief_complaint, coding_status
             FROM encounters WHERE patient_id = $1 AND organization_id = $2 ORDER BY date_of_service DESC`,
            [encounter.patient_id, orgId],
          ),
          client.query(`SELECT * FROM medical_records WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at ASC`, [
            encounterId,
            orgId,
          ]),
          client.query(
            `SELECT * FROM extracted_clinical_entities WHERE encounter_id = $1 AND organization_id = $2 ORDER BY page_number ASC`,
            [encounterId, orgId],
          ),
          client.query(`SELECT *, effective_date::text as effective_date FROM insurance_policies WHERE patient_id = $1 AND organization_id = $2`, [
            encounter.patient_id,
            orgId,
          ]),
          client.query(
            `SELECT * FROM eligibility_verifications WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [encounter.patient_id, orgId],
          ),
          client.query(
            `SELECT * FROM coding_recommendations WHERE encounter_id = $1 AND organization_id = $2
             ORDER BY CASE diagnosis_role WHEN 'PRIMARY' THEN 1 WHEN 'SECONDARY' THEN 2 ELSE 3 END, created_at ASC`,
            [encounterId, orgId],
          ),
          client.query(`SELECT * FROM coding_validations WHERE encounter_id = $1 AND organization_id = $2`, [encounterId, orgId]),
          client.query(`SELECT * FROM denial_risks WHERE encounter_id = $1 AND organization_id = $2`, [encounterId, orgId]),
          client.query(`SELECT * FROM revenue_integrity_findings WHERE encounter_id = $1 AND organization_id = $2`, [
            encounterId,
            orgId,
          ]),
          client.query(`SELECT * FROM coding_approvals WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at DESC`, [
            encounterId,
            orgId,
          ]),
          client.query(`SELECT * FROM coding_annotations WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at DESC`, [
            encounterId,
            orgId,
          ]),
          client.query(`SELECT * FROM ai_processing_jobs WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 10`, [
            encounterId,
            orgId,
          ]),
          client.query(
            `SELECT * FROM coding_recommendation_versions WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 40`,
            [encounterId, orgId],
          ),
          client.query(`SELECT id, full_name, email, role FROM users WHERE organization_id = $1 AND is_active = TRUE ORDER BY full_name`, [
            orgId,
          ]),
        ]);

        return {
          encounter,
          patient: patRes.rows[0],
          patientEncounters: patEncRes.rows,
          records: recRes.rows,
          entities: entRes.rows,
          insurancePolicies: polRes.rows,
          eligibility: eligRes.rows[0] ?? null,
          recommendations: recsRes.rows,
          validations: valRes.rows,
          denialRisks: drRes.rows,
          integrityFindings: rifRes.rows,
          approvals: apprRes.rows,
          annotations: annRes.rows,
          aiJobs: jobsRes.rows,
          versions: verRes.rows,
          reviewers: teamRes.rows,
        };
      });

      if (!ws) {
        res.status(404).json({ error: 'Encounter not found.' });
        return;
      }

      res.json(ws);
    } catch (err) {
      next(err);
    }
  });

  // Autosave coder draft notes & reviewer assignment
  router.put('/coding-workspace/:encounterId/draft', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        draft_notes: z.string().max(10000).optional(),
        assigned_coder_id: z.string().uuid().nullable().optional(),
        assigned_reviewer_id: z.string().uuid().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid draft payload.' });
        return;
      }

      const updated = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const resUpd = await client.query(
          `UPDATE encounters
           SET draft_notes = COALESCE($1, draft_notes),
               assigned_coder_id = CASE WHEN $2::boolean THEN $3 ELSE assigned_coder_id END,
               assigned_reviewer_id = CASE WHEN $4::boolean THEN $5 ELSE assigned_reviewer_id END,
               draft_updated_at = NOW()
           WHERE id = $6 AND organization_id = $7
           RETURNING draft_updated_at`,
          [
            parsed.data.draft_notes ?? null,
            parsed.data.assigned_coder_id !== undefined,
            parsed.data.assigned_coder_id ?? null,
            parsed.data.assigned_reviewer_id !== undefined,
            parsed.data.assigned_reviewer_id ?? null,
            String(req.params.encounterId),
            req.auth!.organizationId,
          ],
        );
        return resUpd.rows[0];
      });

      res.json({ ok: true, draft_updated_at: updated?.draft_updated_at });
    } catch (err) {
      next(err);
    }
  });

  // Annotations & Deficiency Alerts inside Coding Workspace
  router.post('/coding-workspace/:encounterId/annotations', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        medical_record_id: z.string().uuid().nullable().optional(),
        page_number: z.number().int().min(1).default(1),
        anchor_snippet: z.string().max(400).default(''),
        annotation_type: z.enum(['EVIDENCE_NOTE', 'DEFICIENCY_ALERT', 'PHYSICIAN_QUERY', 'AUDITOR_FLAG']),
        content: z.string().min(3).max(2000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid annotation.' });
        return;
      }

      const annotation = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const ins = await client.query(
          `INSERT INTO coding_annotations (organization_id, encounter_id, medical_record_id, page_number, anchor_snippet, annotation_type, content, author_user_id, author_email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            req.auth!.organizationId,
            String(req.params.encounterId),
            parsed.data.medical_record_id ?? null,
            parsed.data.page_number,
            parsed.data.anchor_snippet,
            parsed.data.annotation_type,
            parsed.data.content.trim(),
            req.auth!.userId,
            req.auth!.email,
          ],
        );
        return ins.rows[0];
      });

      res.status(201).json({ annotation });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/coding-annotations/:id', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({ resolved: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid annotation update.' });
        return;
      }
      await withOrgTransaction(req.auth!.organizationId, async (client) => {
        await client.query(
          `UPDATE coding_annotations SET resolved = $1 WHERE id = $2 AND organization_id = $3`,
          [parsed.data.resolved, String(req.params.id), req.auth!.organizationId],
        );
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Trigger AI Clinical Extraction & Coding Job
  router.post('/coding-workspace/:encounterId/analyze', requireAuth, rateLimit(15, 60_000), async (req, res, next) => {
    try {
      const result = await runAiExtractionJob({
        organizationId: req.auth!.organizationId,
        encounterId: String(req.params.encounterId),
        modelConfigId: typeof req.body?.modelConfigId === 'string' ? req.body.modelConfigId : null,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        ipAddress: req.ip,
      });

      res.json({
        jobId: result.jobId,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        verifiedCount: result.verifiedRecommendations.length,
        rejectedRecommendations: result.rejectedRecommendations,
        promptInjectionDetected: result.promptInjectionDetected,
      });
    } catch (err) {
      if (err instanceof ConfigurationRequiredError) {
        next(err);
        return;
      }
      res.status(502).json({
        error: err instanceof Error ? err.message : 'AI coding inference failed.',
        retryable: true,
      });
    }
  });

  // Add manual code to encounter (validated against authoritative catalog)
  router.post(
    '/coding-workspace/:encounterId/recommendations',
    requireAuth,
    requireRole('admin', 'coding_director', 'medical_coder'),
    async (req, res, next) => {
      try {
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
        const targetCode = parsed.data.code.trim().toUpperCase();

        const createdId = await withOrgTransaction(orgId, async (client) => {
          const catalog = await loadReferenceCatalogPg(client);
          const ref = catalog.find((c) => c.code === targetCode && c.code_system === parsed.data.code_system);
          if (!ref) {
            throw Object.assign(
              new Error(`Code ${targetCode} (${parsed.data.code_system}) is not present in the imported authoritative reference catalog.`),
              { statusCode: 400 },
            );
          }

          const recRes = await client.query(
            `INSERT INTO coding_recommendations (
               organization_id, encounter_id, code, code_system, description, diagnosis_role,
               diagnosis_pointers, units, modifiers, supporting_evidence, source_document, page_reference,
               coding_rationale, guideline_citation, documentation_completeness, validation_status,
               compliance_risk, requires_human_review, approval_status, approved_by, approved_at, ai_provider
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Manual Coder Entry', 1, $11, $12, 'COMPLETE', 'NEEDS_REVIEW', '', TRUE, 'APPROVED', $13, NOW(), 'human_coder')
             RETURNING id`,
            [
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
            ],
          );
          const recId = recRes.rows[0].id as string;

          await client.query(
            `INSERT INTO coding_recommendation_versions (organization_id, encounter_id, recommendation_id, version_number, snapshot, change_reason, changed_by, changed_by_email)
             VALUES ($1, $2, $3, 1, $4::jsonb, 'Manual verified code added by coder', $5, $6)`,
            [
              orgId,
              encounterId,
              recId,
              JSON.stringify({
                code: ref.code,
                modifiers: parsed.data.modifiers.toUpperCase(),
                units: parsed.data.units,
                diagnosis_pointers: parsed.data.diagnosis_pointers,
                coding_rationale: parsed.data.coding_rationale,
              }),
              req.auth!.userId,
              req.auth!.email,
            ],
          );

          await recomputeEncounterValidationPg(client, orgId, encounterId);
          return recId;
        });

        await writeAuditLog({
          organizationId: orgId,
          userId: req.auth!.userId,
          userEmail: req.auth!.email,
          action: 'MANUAL_CODE_ADDED',
          resourceType: 'coding_recommendation',
          resourceId: createdId,
          details: `Added ${parsed.data.code_system} ${targetCode} with modifiers "${parsed.data.modifiers}".`,
          ipAddress: req.ip,
        });

        res.status(201).json({ id: createdId });
      } catch (err) {
        next(err);
      }
    },
  );

  // Human Coder Approval / Modify / Reject / Escalate action with Version Snapshot
  router.post(
    '/coding-recommendations/:id/decision',
    requireAuth,
    requireRole('admin', 'coding_director', 'medical_coder', 'auditor'),
    async (req, res, next) => {
      try {
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

        const out = await withOrgTransaction(orgId, async (client) => {
          const recRes = await client.query(
            `SELECT * FROM coding_recommendations WHERE id = $1 AND organization_id = $2`,
            [recId, orgId],
          );
          const existing = recRes.rows[0] as CodingRecommendation | undefined;
          if (!existing) {
            throw Object.assign(new Error('Coding recommendation not found.'), { statusCode: 404 });
          }

          let finalCode = existing.code;
          let finalDesc = existing.description;

          if (
            parsed.data.action === 'MODIFIED' &&
            parsed.data.new_code &&
            parsed.data.new_code.trim().toUpperCase() !== existing.code
          ) {
            const targetCode = parsed.data.new_code.trim().toUpperCase();
            const catalog = await loadReferenceCatalogPg(client);
            const ref = catalog.find((c) => c.code === targetCode && c.code_system === existing.code_system);
            if (!ref) {
              throw Object.assign(
                new Error(`Replacement code ${targetCode} does not exist in imported authoritative ${existing.code_system} catalog.`),
                { statusCode: 400 },
              );
            }
            finalCode = ref.code;
            finalDesc = ref.description;
          }

          const nextMods =
            parsed.data.modifiers !== undefined ? parsed.data.modifiers.trim().toUpperCase() : existing.modifiers;
          const nextUnits = parsed.data.units !== undefined ? parsed.data.units : existing.units;
          const nextPointers =
            parsed.data.diagnosis_pointers !== undefined
              ? parsed.data.diagnosis_pointers.trim().toUpperCase()
              : existing.diagnosis_pointers;

          await client.query(
            `UPDATE coding_recommendations
             SET code = $1, description = $2, modifiers = $3, units = $4, diagnosis_pointers = $5,
                 approval_status = $6, approved_by = $7, approved_at = NOW(), updated_at = NOW()
             WHERE id = $8 AND organization_id = $9`,
            [finalCode, finalDesc, nextMods, nextUnits, nextPointers, parsed.data.action, req.auth!.userId, recId, orgId],
          );

          await client.query(
            `INSERT INTO coding_approvals (organization_id, encounter_id, recommendation_id, action, previous_code, new_code, notes, actor_user_id, actor_email)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [orgId, existing.encounter_id, recId, parsed.data.action, existing.code, finalCode, parsed.data.notes, req.auth!.userId, req.auth!.email],
          );

          const verCountRes = await client.query(
            `SELECT COALESCE(MAX(version_number), 0)::int as max_v FROM coding_recommendation_versions WHERE recommendation_id = $1`,
            [recId],
          );
          const nextVer = Number(verCountRes.rows[0]?.max_v || 0) + 1;
          await client.query(
            `INSERT INTO coding_recommendation_versions (organization_id, encounter_id, recommendation_id, version_number, snapshot, change_reason, changed_by, changed_by_email)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
            [
              orgId,
              existing.encounter_id,
              recId,
              nextVer,
              JSON.stringify({
                action: parsed.data.action,
                code: finalCode,
                modifiers: nextMods,
                units: nextUnits,
                diagnosis_pointers: nextPointers,
              }),
              parsed.data.notes || `Coder decision: ${parsed.data.action}`,
              req.auth!.userId,
              req.auth!.email,
            ],
          );

          const recomputed = await recomputeEncounterValidationPg(client, orgId, existing.encounter_id);

          const pendingRes = await client.query(
            `SELECT COUNT(*)::int as c FROM coding_recommendations WHERE encounter_id = $1 AND organization_id = $2 AND approval_status = 'PENDING'`,
            [existing.encounter_id, orgId],
          );
          const pendingCount = Number(pendingRes.rows[0]?.c || 0);

          if (parsed.data.action === 'ESCALATED') {
            await client.query(`UPDATE encounters SET coding_status = 'ESCALATED' WHERE id = $1 AND organization_id = $2`, [
              existing.encounter_id,
              orgId,
            ]);
          } else if (pendingCount === 0) {
            await client.query(`UPDATE encounters SET coding_status = 'APPROVED' WHERE id = $1 AND organization_id = $2`, [
              existing.encounter_id,
              orgId,
            ]);
          }

          return {
            existing,
            finalCode,
            nextMods,
            nextUnits,
            validations: recomputed?.validations ?? [],
          };
        });

        await writeAuditLog({
          organizationId: orgId,
          userId: req.auth!.userId,
          userEmail: req.auth!.email,
          action: `CODING_${parsed.data.action}`,
          resourceType: 'coding_recommendation',
          resourceId: recId,
          details: `${parsed.data.action} code ${out.existing.code}${out.finalCode !== out.existing.code ? ` -> ${out.finalCode}` : ''} (modifiers: "${out.nextMods}", units: ${out.nextUnits}). ${parsed.data.notes}`,
          ipAddress: req.ip,
        });

        res.json({
          status: 'updated',
          approval_status: parsed.data.action,
          validations: out.validations,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- AUTHORITATIVE REFERENCE CODE EXPLORERS & DATASET IMPORT FRAMEWORK ---
  router.get('/codes', requireAuth, async (req, res, next) => {
    try {
      const system = String(req.query.system ?? '').trim();
      const q = String(req.query.q ?? '').trim().toLowerCase();
      const { page, pageSize, offset } = parsePagination(req, 50);

      const pool = getPgPool();
      const catalog = await loadReferenceCatalogPg(pool as unknown as import('pg').PoolClient);

      const filtered = catalog.filter((c) => {
        if (system === 'ICD-10') {
          if (c.code_system !== 'ICD-10-CM' && c.code_system !== 'ICD-10-PCS') return false;
        } else if (system && c.code_system !== system) {
          return false;
        }
        if (q) {
          return (
            c.code.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q)
          );
        }
        return true;
      });

      const datasetCounts = {
        icd10Count: catalog.filter((c) => c.code_system === 'ICD-10-CM' || c.code_system === 'ICD-10-PCS').length,
        cptCount: catalog.filter((c) => c.code_system === 'CPT').length,
        hcpcsCount: catalog.filter((c) => c.code_system === 'HCPCS').length,
        modifierCount: catalog.filter((c) => c.code_system === 'MODIFIER').length,
      };

      res.json({
        codes: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
        page,
        pageSize,
        datasetCounts,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reference-datasets/imports', requireAuth, async (req, res, next) => {
    try {
      const imports = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const rows = await client.query(
          `SELECT id, dataset_type, version_label, source_name, file_name, records_imported, effective_date::text, ama_license_attested, imported_by_email, status, notes, created_at
           FROM reference_dataset_imports
           WHERE organization_id IS NULL OR organization_id = $1
           ORDER BY created_at DESC LIMIT 50`,
          [req.auth!.organizationId],
        );
        return rows.rows;
      });
      res.json({ imports });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/reference-datasets/import',
    requireAuth,
    requireRole('admin', 'coding_director'),
    async (req, res, next) => {
      try {
        const schema = z.object({
          datasetType: z.enum(['ICD-10-CM', 'ICD-10-PCS', 'CPT', 'HCPCS', 'MODIFIER', 'NCCI_PTP', 'LCD_NCD']),
          versionLabel: z.string().min(2).max(80),
          sourceName: z.string().min(2).max(120),
          fileName: z.string().min(2).max(120),
          effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          amaLicenseAttested: z.boolean().default(false),
          content: z.string().min(5),
          notes: z.string().max(400).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid dataset import payload' });
          return;
        }

        const result = await withOrgTransaction(req.auth!.organizationId, async (client) =>
          importReferenceDatasetTx(client, {
            organizationId: req.auth!.organizationId,
            userId: req.auth!.userId,
            userEmail: req.auth!.email,
            datasetType: parsed.data.datasetType,
            versionLabel: parsed.data.versionLabel,
            sourceName: parsed.data.sourceName,
            fileName: parsed.data.fileName,
            content: parsed.data.content,
            effectiveDate: parsed.data.effectiveDate,
            amaLicenseAttested: parsed.data.amaLicenseAttested,
            notes: parsed.data.notes,
          }),
        );

        await writeAuditLog({
          organizationId: req.auth!.organizationId,
          userId: req.auth!.userId,
          userEmail: req.auth!.email,
          action: 'REFERENCE_DATASET_IMPORTED',
          resourceType: 'reference_dataset_import',
          resourceId: result.importId,
          details: `Imported ${result.recordsImported} ${parsed.data.datasetType} records (${parsed.data.versionLabel} from ${parsed.data.sourceName}).`,
          ipAddress: req.ip,
        });

        res.status(201).json(result);
      } catch (err) {
        if (err instanceof Error && err.message.includes('AMA CPT License Attestation')) {
          res.status(400).json({ error: err.message });
          return;
        }
        next(err);
      }
    },
  );

  router.get('/policies/necessity', requireAuth, async (_req, res, next) => {
    try {
      const pool = getPgPool();
      const client = pool as unknown as import('pg').PoolClient;
      const [policies, ncciRules, guideRes] = await Promise.all([
        loadPayerPoliciesPg(client),
        loadNcciRulesPg(client),
        pool.query('SELECT * FROM coding_guidelines ORDER BY effective_year DESC, section ASC'),
      ]);
      res.json({ policies, ncciRules, guidelines: guideRes.rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/policies/check-necessity', requireAuth, async (req, res, next) => {
    try {
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

      const pool = getPgPool();
      const client = pool as unknown as import('pg').PoolClient;
      const [catalog, ncciRules, payerPolicies] = await Promise.all([
        loadReferenceCatalogPg(client),
        loadNcciRulesPg(client),
        loadPayerPoliciesPg(client),
      ]);

      const birthYear = new Date(parsed.data.dateOfService).getUTCFullYear() - parsed.data.patientAge;
      const ruleCheckPatient: Patient = {
        id: 'rule-check-context',
        organization_id: req.auth!.organizationId,
        mrn: 'RULE-CHECK',
        first_name: 'Rule',
        last_name: 'Context',
        dob: `${birthYear}-01-01`,
        sex: parsed.data.patientSex,
        city: '',
        state: '',
        is_synthetic: false,
        created_at: new Date().toISOString(),
      };
      const ruleCheckEncounter: Encounter = {
        id: 'rule-check-encounter',
        organization_id: req.auth!.organizationId,
        patient_id: 'rule-check-context',
        provider_id: 'rule-check-provider',
        encounter_number: 'RULE-CHECK',
        date_of_service: parsed.data.dateOfService,
        encounter_type: 'Outpatient',
        place_of_service: '11',
        chief_complaint: 'Interactive medical necessity rule check',
        coding_status: 'NEEDS_CODING_REVIEW',
        is_synthetic: false,
        created_at: new Date().toISOString(),
      };

      const recs: CodingRecommendation[] = [
        ...parsed.data.diagnosisCodes.map((c, idx) => ({
          id: `dx-${idx}`,
          organization_id: req.auth!.organizationId,
          encounter_id: 'rule-check-encounter',
          code: c.trim().toUpperCase(),
          code_system: 'ICD-10-CM' as const,
          description: '',
          diagnosis_role: idx === 0 ? ('PRIMARY' as const) : ('SECONDARY' as const),
          diagnosis_pointers: '',
          units: 1,
          modifiers: '',
          supporting_evidence: 'Rule check input',
          source_document: 'Rule Checker',
          page_reference: 1,
          coding_rationale: '',
          guideline_citation: '',
          documentation_completeness: 'COMPLETE' as const,
          validation_status: 'NEEDS_REVIEW' as const,
          compliance_risk: '',
          requires_human_review: true,
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
            encounter_id: 'rule-check-encounter',
            code: clean,
            code_system: ref?.code_system ?? ('CPT' as const),
            description: ref?.description ?? '',
            diagnosis_role: 'PROCEDURE' as const,
            diagnosis_pointers: 'A',
            units: 1,
            modifiers: parsed.data.modifiers,
            supporting_evidence: 'Rule check input',
            source_document: 'Rule Checker',
            page_reference: 1,
            coding_rationale: '',
            guideline_citation: '',
            documentation_completeness: 'COMPLETE' as const,
            validation_status: 'NEEDS_REVIEW' as const,
            compliance_risk: '',
            requires_human_review: true,
            approval_status: 'PENDING' as const,
            approved_by: null,
            approved_at: null,
            ai_provider: 'deterministic',
            created_at: new Date().toISOString(),
          };
        }),
      ];

      const validations = runDeterministicCodingValidation({
        encounter: ruleCheckEncounter,
        patient: ruleCheckPatient,
        recommendations: recs,
        entities: [],
        catalog,
        ncciRules,
        payerPolicies,
      });

      res.json({ validations });
    } catch (err) {
      next(err);
    }
  });

  // --- INSURANCE VERIFICATION WORKSPACE ---
  router.get('/insurance', requireAuth, async (req, res, next) => {
    try {
      const data = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const [policiesRes, verRes, chRes] = await Promise.all([
          client.query(
            `SELECT ip.*, ip.effective_date::text as effective_date, ip.termination_date::text as termination_date,
                    p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn, p.dob::text as patient_dob
             FROM insurance_policies ip
             JOIN patients p ON p.id = ip.patient_id
             WHERE ip.organization_id = $1
             ORDER BY ip.patient_id, ip.priority`,
            [req.auth!.organizationId],
          ),
          client.query(
            `SELECT ev.*, ip.payer_name, ip.member_id, ip.priority, p.first_name || ' ' || p.last_name as patient_name
             FROM eligibility_verifications ev
             JOIN insurance_policies ip ON ip.id = ev.insurance_policy_id
             JOIN patients p ON p.id = ev.patient_id
             WHERE ev.organization_id = $1
             ORDER BY ev.created_at DESC`,
            [req.auth!.organizationId],
          ),
          client.query(
            `SELECT * FROM integration_configs WHERE organization_id = $1 AND integration_type = 'CLEARINGHOUSE_X12' LIMIT 1`,
            [req.auth!.organizationId],
          ),
        ]);
        return {
          policies: policiesRes.rows,
          verifications: verRes.rows,
          clearinghouseConfig: chRes.rows[0] ?? null,
        };
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/insurance/policies', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        patient_id: z.string().uuid(),
        priority: z.enum(['PRIMARY', 'SECONDARY']),
        payer_name: z.string().min(2).max(120),
        payer_id: z.string().min(2).max(40),
        member_id: z.string().min(2).max(60),
        group_number: z.string().max(60).default(''),
        plan_name: z.string().min(2).max(120),
        effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        provenance: z.enum(['EXTRACTED_FROM_DOCUMENT', 'MANUALLY_ENTERED']).default('MANUALLY_ENTERED'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid insurance policy data' });
        return;
      }

      const policy = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const ins = await client.query(
          `INSERT INTO insurance_policies (organization_id, patient_id, priority, payer_name, payer_id, member_id, group_number, plan_name, effective_date, provenance, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
           RETURNING *`,
          [
            req.auth!.organizationId,
            parsed.data.patient_id,
            parsed.data.priority,
            parsed.data.payer_name.trim(),
            parsed.data.payer_id.trim(),
            parsed.data.member_id.trim(),
            parsed.data.group_number.trim(),
            parsed.data.plan_name.trim(),
            parsed.data.effective_date,
            parsed.data.provenance,
          ],
        );
        return ins.rows[0];
      });

      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'INSURANCE_POLICY_RECORDED',
        resourceType: 'insurance_policy',
        resourceId: policy.id,
        details: `Recorded ${parsed.data.priority} coverage (${parsed.data.payer_name}, provenance: ${parsed.data.provenance}).`,
        ipAddress: req.ip,
      });

      res.status(201).json({ policy });
    } catch (err) {
      next(err);
    }
  });

  router.post('/insurance/verify', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        insurance_policy_id: z.string().uuid(),
        service_type_code: z.string().default('30'),
        date_of_service: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Valid insurance_policy_id and date_of_service are required.' });
        return;
      }

      const orgId = req.auth!.organizationId;
      const policy = await withOrgTransaction(orgId, async (client) => {
        const resPol = await client.query(
          `SELECT ip.*, p.first_name, p.last_name, p.dob::text as dob, o.npi as org_npi, o.name as org_name
           FROM insurance_policies ip
           JOIN patients p ON p.id = ip.patient_id
           JOIN organizations o ON o.id = ip.organization_id
           WHERE ip.id = $1 AND ip.organization_id = $2`,
          [parsed.data.insurance_policy_id, orgId],
        );
        return resPol.rows[0] as Record<string, unknown> | undefined;
      });

      if (!policy) {
        res.status(404).json({ error: 'Insurance policy not found.' });
        return;
      }

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

      const clearinghouseUrl = process.env.CLEARINGHOUSE_API_URL?.trim();
      const clearinghouseClientId = process.env.CLEARINGHOUSE_CLIENT_ID?.trim();
      const clearinghouseSecret = process.env.CLEARINGHOUSE_CLIENT_SECRET?.trim();

      if (!clearinghouseUrl || !clearinghouseClientId || !clearinghouseSecret) {
        const verId = await withOrgTransaction(orgId, async (client) => {
          const ins = await client.query(
            `INSERT INTO eligibility_verifications (
               organization_id, patient_id, insurance_policy_id, verification_source,
               clearinghouse_transaction_id, x12_270_payload, x12_271_status, prior_auth_required,
               referral_required, network_status, limitations_notes
             ) VALUES ($1, $2, $3, $4, NULL, $5, 'NOT_VERIFIED_REQUIRES_CLEARINGHOUSE', FALSE, FALSE, 'UNVERIFIED', $6)
             RETURNING id`,
            [
              orgId,
              String(policy.patient_id),
              String(policy.id),
              String(policy.provenance || 'MANUALLY_ENTERED'),
              x12_270,
              'Verification unavailable: CLEARINGHOUSE_API_URL, CLEARINGHOUSE_CLIENT_ID, and CLEARINGHOUSE_CLIENT_SECRET are not configured.',
            ],
          );
          return ins.rows[0].id as string;
        });

        await writeAuditLog({
          organizationId: orgId,
          userId: req.auth!.userId,
          userEmail: req.auth!.email,
          action: 'ELIGIBILITY_270_GENERATED_UNVERIFIED',
          resourceType: 'eligibility_verification',
          resourceId: verId,
          details: 'Generated X12 270 payload; clearinghouse credentials not configured.',
          ipAddress: req.ip,
        });

        res.status(202).json({
          status: 'NOT_VERIFIED_REQUIRES_CLEARINGHOUSE',
          message:
            'Verification unavailable — X12 270 inquiry built, but live clearinghouse credentials (CLEARINGHOUSE_API_URL, CLEARINGHOUSE_CLIENT_ID, CLEARINGHOUSE_CLIENT_SECRET) are not configured.',
          x12_270_payload: x12_270,
        });
        return;
      }

      const urlValidation = validateExternalInferenceUrl(clearinghouseUrl);
      if (!urlValidation.valid) {
        res.status(400).json({ error: `Clearinghouse URL rejected: ${urlValidation.reason}` });
        return;
      }

      const resp = await fetch(clearinghouseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': clearinghouseClientId,
          Authorization: `Bearer ${clearinghouseSecret}`,
        },
        body: JSON.stringify({
          x12_270,
          payer_id: policy.payer_id,
          member_id: policy.member_id,
          date_of_service: parsed.data.date_of_service,
        }),
        signal: AbortSignal.timeout(15000),
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
        referral_required?: boolean;
        network_status?: 'IN_NETWORK' | 'OUT_OF_NETWORK';
        notes?: string;
      };

      const verId = await withOrgTransaction(orgId, async (client) => {
        const ins = await client.query(
          `INSERT INTO eligibility_verifications (
             organization_id, patient_id, insurance_policy_id, verification_source,
             clearinghouse_transaction_id, x12_270_payload, x12_271_status, copay_amount,
             deductible_remaining, coinsurance_percent, prior_auth_required, referral_required,
             network_status, limitations_notes, verified_at
           ) VALUES ($1, $2, $3, 'VERIFIED_CLEARINGHOUSE', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
           RETURNING id`,
          [
            orgId,
            String(policy.patient_id),
            String(policy.id),
            data.transaction_id ?? null,
            x12_270,
            data.active ? 'VERIFIED_ACTIVE' : 'VERIFIED_INACTIVE',
            data.copay ?? null,
            data.deductible_remaining ?? null,
            data.coinsurance_percent ?? null,
            Boolean(data.prior_auth_required),
            Boolean(data.referral_required),
            data.network_status ?? 'UNVERIFIED',
            data.notes ?? 'Verified via authorized clearinghouse endpoint.',
          ],
        );
        return ins.rows[0].id as string;
      });

      res.json({ status: data.active ? 'VERIFIED_ACTIVE' : 'VERIFIED_INACTIVE', verificationId: verId });
    } catch (err) {
      next(err);
    }
  });

  // --- CENTRALIZED DENIAL PREVENTION, REVENUE INTEGRITY, AUDITS & CLAIMS ---
  router.get('/denial-prevention', requireAuth, async (req, res, next) => {
    try {
      const category = typeof req.query.category === 'string' && req.query.category !== 'ALL' ? req.query.category : null;
      const severity = typeof req.query.severity === 'string' && req.query.severity !== 'ALL' ? req.query.severity : null;
      const reviewStatus = typeof req.query.status === 'string' && req.query.status !== 'ALL' ? req.query.status : null;

      const data = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const where: string[] = ['dr.organization_id = $1'];
        const params: unknown[] = [req.auth!.organizationId];
        if (category) {
          where.push(`dr.risk_category = $${params.length + 1}`);
          params.push(category);
        }
        if (severity) {
          where.push(`dr.severity = $${params.length + 1}`);
          params.push(severity);
        }
        if (reviewStatus) {
          where.push(`dr.review_status = $${params.length + 1}`);
          params.push(reviewStatus);
        }

        const [risksRes, usersRes] = await Promise.all([
          client.query(
            `SELECT dr.*, e.encounter_number, e.date_of_service::text as date_of_service, p.first_name || ' ' || p.last_name as patient_name
             FROM denial_risks dr
             JOIN encounters e ON e.id = dr.encounter_id
             JOIN patients p ON p.id = e.patient_id
             WHERE ${where.join(' AND ')}
             ORDER BY CASE dr.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, dr.created_at DESC`,
            params,
          ),
          client.query(`SELECT id, full_name, email FROM users WHERE organization_id = $1 AND is_active = TRUE ORDER BY full_name`, [
            req.auth!.organizationId,
          ]),
        ]);
        return { risks: risksRes.rows, reviewers: usersRes.rows };
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/denial-prevention/:id', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        review_status: z.enum(['OPEN', 'MITIGATED', 'DISMISSED']).optional(),
        reviewer_user_id: z.string().uuid().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid denial risk update.' });
        return;
      }

      await withOrgTransaction(req.auth!.organizationId, async (client) => {
        let reviewerEmail: string | null = null;
        if (parsed.data.reviewer_user_id) {
          const uRes = await client.query(`SELECT email FROM users WHERE id = $1 AND organization_id = $2`, [
            parsed.data.reviewer_user_id,
            req.auth!.organizationId,
          ]);
          reviewerEmail = uRes.rows[0]?.email ?? null;
        }

        await client.query(
          `UPDATE denial_risks
           SET review_status = COALESCE($1, review_status),
               reviewer_user_id = CASE WHEN $2::boolean THEN $3 ELSE reviewer_user_id END,
               reviewer_email = CASE WHEN $2::boolean THEN $4 ELSE reviewer_email END,
               resolved_at = CASE WHEN $1 IN ('MITIGATED', 'DISMISSED') THEN NOW() ELSE resolved_at END
           WHERE id = $5 AND organization_id = $6`,
          [
            parsed.data.review_status ?? null,
            parsed.data.reviewer_user_id !== undefined,
            parsed.data.reviewer_user_id ?? null,
            reviewerEmail,
            String(req.params.id),
            req.auth!.organizationId,
          ],
        );
      });

      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'DENIAL_RISK_UPDATED',
        resourceType: 'denial_risk',
        resourceId: String(req.params.id),
        details: `Updated denial risk (status=${parsed.data.review_status ?? 'unchanged'}, reviewer=${parsed.data.reviewer_user_id ?? 'unchanged'}).`,
        ipAddress: req.ip,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/revenue-integrity', requireAuth, async (req, res, next) => {
    try {
      const findings = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const resRows = await client.query(
          `SELECT rif.*, e.encounter_number, e.date_of_service::text as date_of_service, p.first_name || ' ' || p.last_name as patient_name
           FROM revenue_integrity_findings rif
           JOIN encounters e ON e.id = rif.encounter_id
           JOIN patients p ON p.id = e.patient_id
           WHERE rif.organization_id = $1
           ORDER BY CASE rif.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, rif.created_at DESC`,
          [req.auth!.organizationId],
        );
        return resRows.rows;
      });
      res.json({ findings });
    } catch (err) {
      next(err);
    }
  });

  router.get('/audit-center', requireAuth, async (req, res, next) => {
    try {
      const data = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const [apprRes, sumRes] = await Promise.all([
          client.query(
            `SELECT ca.*, e.encounter_number, e.date_of_service::text as date_of_service, p.first_name || ' ' || p.last_name as patient_name
             FROM coding_approvals ca
             JOIN encounters e ON e.id = ca.encounter_id
             JOIN patients p ON p.id = e.patient_id
             WHERE ca.organization_id = $1
             ORDER BY ca.created_at DESC`,
            [req.auth!.organizationId],
          ),
          client.query(
            `SELECT
               COUNT(*)::int as total_decisions,
               COUNT(*) FILTER (WHERE action = 'APPROVED')::int as approved_as_recommended,
               COUNT(*) FILTER (WHERE action = 'MODIFIED')::int as modified_by_coder,
               COUNT(*) FILTER (WHERE action = 'REJECTED')::int as rejected_by_coder,
               COUNT(*) FILTER (WHERE action = 'ESCALATED')::int as escalated
             FROM coding_approvals WHERE organization_id = $1`,
            [req.auth!.organizationId],
          ),
        ]);
        return { approvals: apprRes.rows, summary: sumRes.rows[0] };
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/claims', requireAuth, async (req, res, next) => {
    try {
      const claims = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const rows = await client.query(
          `SELECT c.*, e.encounter_number, e.date_of_service::text as date_of_service, e.coding_status,
                  p.first_name || ' ' || p.last_name as patient_name, p.mrn as patient_mrn
           FROM claims c
           JOIN encounters e ON e.id = c.encounter_id
           JOIN patients p ON p.id = c.patient_id
           WHERE c.organization_id = $1
           ORDER BY c.created_at DESC`,
          [req.auth!.organizationId],
        );
        return rows.rows;
      });
      res.json({ claims });
    } catch (err) {
      next(err);
    }
  });

  router.post('/claims', requireAuth, requireRole('admin', 'coding_director', 'rcm_analyst', 'medical_coder'), async (req, res, next) => {
    try {
      const schema = z.object({
        encounter_id: z.string().uuid(),
        claim_type: z.enum(['837P', '837I']).default('837P'),
        payer_name: z.string().min(2).max(120),
        total_charge_amount: z.number().min(0),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid claim payload' });
        return;
      }

      const claim = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const encRes = await client.query(
          `SELECT id, patient_id FROM encounters WHERE id = $1 AND organization_id = $2`,
          [parsed.data.encounter_id, req.auth!.organizationId],
        );
        const enc = encRes.rows[0];
        if (!enc) throw Object.assign(new Error('Encounter not found.'), { statusCode: 404 });

        const claimNum = `CLM-${new Date().getUTCFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const ins = await client.query(
          `INSERT INTO claims (organization_id, encounter_id, patient_id, claim_number, claim_type, payer_name, total_charge_amount, readiness_status, blocking_reasons)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'BLOCKED', '["Pending readiness evaluation"]'::jsonb)
           RETURNING *`,
          [
            req.auth!.organizationId,
            enc.id,
            enc.patient_id,
            claimNum,
            parsed.data.claim_type,
            parsed.data.payer_name.trim(),
            parsed.data.total_charge_amount,
          ],
        );
        return ins.rows[0];
      });

      res.status(201).json({ claim });
    } catch (err) {
      next(err);
    }
  });

  router.post('/claims/:id/evaluate-readiness', requireAuth, async (req, res, next) => {
    try {
      const orgId = req.auth!.organizationId;
      const claimId = String(req.params.id);

      const evaluation = await withOrgTransaction(orgId, async (client) => {
        const claimRes = await client.query(`SELECT * FROM claims WHERE id = $1 AND organization_id = $2`, [claimId, orgId]);
        const claim = claimRes.rows[0] as { id: string; encounter_id: string; patient_id: string } | undefined;
        if (!claim) {
          throw Object.assign(new Error('Claim not found.'), { statusCode: 404 });
        }

        await recomputeEncounterValidationPg(client, orgId, claim.encounter_id);

        const [recsRes, catalog, ncciRules, valRes, drRes, eligRes] = await Promise.all([
          client.query(`SELECT * FROM coding_recommendations WHERE encounter_id = $1 AND organization_id = $2`, [
            claim.encounter_id,
            orgId,
          ]),
          loadReferenceCatalogPg(client),
          loadNcciRulesPg(client),
          client.query(`SELECT COUNT(*)::int as c FROM coding_validations WHERE encounter_id = $1 AND organization_id = $2 AND severity = 'ERROR'`, [
            claim.encounter_id,
            orgId,
          ]),
          client.query(
            `SELECT COUNT(*)::int as c FROM denial_risks WHERE encounter_id = $1 AND organization_id = $2 AND review_status = 'OPEN' AND severity IN ('CRITICAL', 'HIGH')`,
            [claim.encounter_id, orgId],
          ),
          client.query(
            `SELECT x12_271_status FROM eligibility_verifications WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [claim.patient_id, orgId],
          ),
        ]);

        const recs = recsRes.rows as CodingRecommendation[];
        const blocking: string[] = [];

        if (recs.length === 0) {
          blocking.push('No coding recommendations assigned to this encounter');
        }
        const pendingCodes = recs.filter((r) => r.approval_status === 'PENDING').length;
        if (pendingCodes > 0) blocking.push(`${pendingCodes} coding recommendation(s) pending certified coder approval`);

        const missingDatasets = checkReferenceDatasetAvailability({
          recommendations: recs,
          catalog,
          ncciRules,
        });
        for (const md of missingDatasets) {
          blocking.push(md.message);
        }

        const validationErrors = Number(valRes.rows[0]?.c || 0);
        if (validationErrors > 0) blocking.push(`${validationErrors} deterministic coding validation error(s)`);

        const criticalRisks = Number(drRes.rows[0]?.c || 0);
        if (criticalRisks > 0) blocking.push(`${criticalRisks} open high/critical denial risk(s)`);

        const eligStatus = eligRes.rows[0]?.x12_271_status as string | undefined;
        if (!eligStatus || eligStatus !== 'VERIFIED_ACTIVE') {
          blocking.push('Active clearinghouse insurance eligibility verification (X12 271) is unavailable or inactive');
        }

        const status = blocking.length === 0 ? 'READY_FOR_SUBMISSION' : 'BLOCKED';
        await client.query(
          `UPDATE claims SET readiness_status = $1, blocking_reasons = $2::jsonb WHERE id = $3 AND organization_id = $4`,
          [status, JSON.stringify(blocking), claimId, orgId],
        );

        return { readiness_status: status, blocking_reasons: blocking };
      });

      res.json(evaluation);
    } catch (err) {
      next(err);
    }
  });

  // --- TEAM MANAGEMENT ---
  router.get('/team', requireAuth, async (req, res, next) => {
    try {
      const data = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const [usersRes, rolesRes] = await Promise.all([
          client.query(
            `SELECT id, organization_id, email, full_name, role, credentials, mfa_enabled, is_active, created_at
             FROM users WHERE organization_id = $1 ORDER BY created_at ASC`,
            [req.auth!.organizationId],
          ),
          client.query('SELECT * FROM roles_permissions'),
        ]);
        return { users: usersRes.rows, roles: rolesRes.rows };
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/team', requireAuth, requireRole('admin', 'coding_director'), async (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        full_name: z.string().min(2).max(120),
        role: z.enum(['admin', 'coding_director', 'medical_coder', 'auditor', 'physician', 'rcm_analyst']),
        credentials: z.string().max(40).default(''),
        temporary_password: z.string().min(12),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid team member input' });
        return;
      }

      const email = parsed.data.email.trim().toLowerCase();
      const pool = getPgPool();
      const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
      if (exists.rows.length > 0) {
        res.status(409).json({ error: 'Email already registered.' });
        return;
      }

      const newUserId = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const ins = await client.query(
          `INSERT INTO users (organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, TRUE)
           RETURNING id`,
          [
            req.auth!.organizationId,
            email,
            hashPassword(parsed.data.temporary_password),
            parsed.data.full_name.trim(),
            parsed.data.role,
            parsed.data.credentials.trim(),
          ],
        );
        return ins.rows[0].id as string;
      });

      await writeAuditLog({
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        userEmail: req.auth!.email,
        action: 'TEAM_MEMBER_ADDED',
        resourceType: 'user',
        resourceId: newUserId,
        details: `Added ${email} with role ${parsed.data.role}.`,
        ipAddress: req.ip,
      });

      res.status(201).json({ id: newUserId });
    } catch (err) {
      next(err);
    }
  });

  // --- AI MODEL SETTINGS & REAL HEALTH PROBES ---
  router.get('/ai-models', requireAuth, async (req, res, next) => {
    try {
      const models = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const rows = await client.query(
          `SELECT id, organization_id, display_name, provider_type, model_name, api_url, timeout_ms, max_tokens,
                  is_active, approved_for_phi, baa_status, last_health_status, last_health_message, last_health_checked_at,
                  latency_ms, error_count, last_error
           FROM ai_model_configs WHERE organization_id = $1 ORDER BY display_name ASC`,
          [req.auth!.organizationId],
        );
        return rows.rows.map((m) => {
          const pType = String(m.provider_type);
          const hasEnvCreds =
            pType === 'gemini'
              ? Boolean(process.env.GEMINI_API_KEY?.trim())
              : pType === 'lingsante'
                ? Boolean(process.env.LINGSANTE_API_KEY?.trim())
                : pType === 'huggingface'
                  ? Boolean(process.env.HUGGINGFACE_API_TOKEN?.trim())
                  : Boolean(process.env.OPENAI_COMPATIBLE_API_KEY?.trim());
          return { ...m, has_credentials: hasEnvCreds };
        });
      });
      res.json({ models });
    } catch (err) {
      next(err);
    }
  });

  router.put('/ai-models/:id', requireAuth, requireRole('admin', 'coding_director'), async (req, res, next) => {
    try {
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

      if (parsed.data.api_url) {
        const urlCheck = validateExternalInferenceUrl(parsed.data.api_url);
        if (!urlCheck.valid) {
          res.status(400).json({ error: urlCheck.reason });
          return;
        }
      }

      const orgId = req.auth!.organizationId;
      const modelId = String(req.params.id);

      await withOrgTransaction(orgId, async (client) => {
        if (parsed.data.is_active) {
          await client.query(`UPDATE ai_model_configs SET is_active = FALSE WHERE organization_id = $1`, [orgId]);
        }
        await client.query(
          `UPDATE ai_model_configs
           SET model_name = $1, api_url = $2, timeout_ms = $3, max_tokens = $4, is_active = $5, approved_for_phi = $6, baa_status = $7
           WHERE id = $8 AND organization_id = $9`,
          [
            parsed.data.model_name.trim(),
            parsed.data.api_url.trim(),
            parsed.data.timeout_ms,
            parsed.data.max_tokens,
            parsed.data.is_active,
            parsed.data.approved_for_phi,
            parsed.data.baa_status,
            modelId,
            orgId,
          ],
        );
      });

      await writeAuditLog({
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
    } catch (err) {
      next(err);
    }
  });

  router.post('/ai-models/:id/health', requireAuth, async (req, res, next) => {
    try {
      const orgId = req.auth!.organizationId;
      const modelId = String(req.params.id);

      const model = await withOrgTransaction(orgId, async (client) => {
        const row = await client.query(`SELECT * FROM ai_model_configs WHERE id = $1 AND organization_id = $2`, [
          modelId,
          orgId,
        ]);
        return row.rows[0] as AIModelConfig | undefined;
      });

      if (!model) {
        res.status(404).json({ error: 'AI model config not found.' });
        return;
      }

      const probe = await checkAiProviderHealth(model);

      await withOrgTransaction(orgId, async (client) => {
        await client.query(
          `UPDATE ai_model_configs
           SET last_health_status = $1, last_health_message = $2, latency_ms = $3, last_health_checked_at = NOW(),
               last_error = CASE WHEN $1 = 'HEALTHY' THEN NULL ELSE $2 END
           WHERE id = $4 AND organization_id = $5`,
          [probe.status, probe.message, probe.latencyMs, modelId, orgId],
        );
      });

      res.json({
        last_health_status: probe.status,
        last_health_message: probe.message,
        latency_ms: probe.latencyMs,
        last_health_checked_at: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // --- EHR / EMR & CLEARINGHOUSE INTEGRATIONS ---
  router.get('/integrations', requireAuth, async (req, res, next) => {
    try {
      const integrations = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const rows = await client.query(
          `SELECT * FROM integration_configs WHERE organization_id = $1 ORDER BY vendor_name ASC`,
          [req.auth!.organizationId],
        );
        return rows.rows;
      });
      res.json({ integrations });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/integrations/:id/test-connection',
    requireAuth,
    requireRole('admin', 'coding_director'),
    async (req, res, next) => {
      try {
        const orgId = req.auth!.organizationId;
        const intId = String(req.params.id);
        const schema = z.object({ endpoint_url: z.string().max(400).optional() });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid integration endpoint URL.' });
          return;
        }

        const row = await withOrgTransaction(orgId, async (client) => {
          const r = await client.query(`SELECT * FROM integration_configs WHERE id = $1 AND organization_id = $2`, [
            intId,
            orgId,
          ]);
          return r.rows[0] as Record<string, unknown> | undefined;
        });

        if (!row) {
          res.status(404).json({ error: 'Integration not found.' });
          return;
        }

        const urlToTest = (parsed.data.endpoint_url ?? String(row.endpoint_url ?? '')).trim();
        if (!urlToTest) {
          await withOrgTransaction(orgId, async (client) => {
            await client.query(
              `UPDATE integration_configs
               SET connection_status = 'CONFIGURATION_REQUIRED',
                   last_error = 'Endpoint URL and OAuth/mTLS credentials are required before testing connectivity.'
               WHERE id = $1 AND organization_id = $2`,
              [intId, orgId],
            );
          });
          res.status(400).json({
            connection_status: 'CONFIGURATION_REQUIRED',
            error: 'Connection required: provide an authorized HTTPS FHIR/X12 endpoint URL.',
          });
          return;
        }

        const urlCheck = validateExternalInferenceUrl(urlToTest);
        if (!urlCheck.valid) {
          await withOrgTransaction(orgId, async (client) => {
            await client.query(
              `UPDATE integration_configs SET endpoint_url = $1, connection_status = 'ERROR', last_error = $2 WHERE id = $3 AND organization_id = $4`,
              [urlToTest, urlCheck.reason ?? 'Invalid URL', intId, orgId],
            );
          });
          res.status(400).json({ connection_status: 'ERROR', error: urlCheck.reason });
          return;
        }

        try {
          const resp = await fetch(urlToTest, { method: 'GET', signal: AbortSignal.timeout(5000) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const now = new Date().toISOString();
          await withOrgTransaction(orgId, async (client) => {
            await client.query(
              `UPDATE integration_configs SET endpoint_url = $1, connection_status = 'VERIFIED_CONNECTED', last_sync_at = NOW(), last_error = NULL WHERE id = $2 AND organization_id = $3`,
              [urlToTest, intId, orgId],
            );
          });
          res.json({ connection_status: 'VERIFIED_CONNECTED', last_sync_at: now });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Connectivity check failed';
          await withOrgTransaction(orgId, async (client) => {
            await client.query(
              `UPDATE integration_configs SET endpoint_url = $1, connection_status = 'ERROR', last_error = $2 WHERE id = $3 AND organization_id = $4`,
              [urlToTest, msg, intId, orgId],
            );
          });
          res.status(502).json({ connection_status: 'ERROR', error: msg });
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // --- SECURITY OVERVIEW & AUDIT LOGS ---
  router.get('/security/overview', requireAuth, async (req, res, next) => {
    try {
      const orgId = req.auth!.organizationId;
      const data = await withOrgTransaction(orgId, async (client) => {
        const [orgRes, uRes, mfaRes, injRes, audRes, sessRes] = await Promise.all([
          client.query('SELECT * FROM organizations WHERE id = $1', [orgId]),
          client.query('SELECT COUNT(*)::int as c FROM users WHERE organization_id = $1', [orgId]),
          client.query('SELECT COUNT(*)::int as c FROM users WHERE organization_id = $1 AND mfa_enabled = TRUE', [orgId]),
          client.query('SELECT COUNT(*)::int as c FROM medical_records WHERE organization_id = $1 AND prompt_injection_flagged = TRUE', [orgId]),
          client.query('SELECT COUNT(*)::int as c FROM audit_logs WHERE organization_id = $1', [orgId]),
          client.query('SELECT COUNT(*)::int as c FROM user_sessions WHERE organization_id = $1 AND revoked_at IS NULL AND expires_at > NOW()', [orgId]),
        ]);
        return {
          organization: orgRes.rows[0],
          controls: {
            totalUsers: Number(uRes.rows[0]?.c || 0),
            mfaUsers: Number(mfaRes.rows[0]?.c || 0),
            injectionFlaggedDocuments: Number(injRes.rows[0]?.c || 0),
            totalAuditEvents: Number(audRes.rows[0]?.c || 0),
            activeSessions: Number(sessRes.rows[0]?.c || 0),
            passwordHashing: 'scrypt (per-user 16-byte salt) + Supabase Auth',
            sessionMechanism: 'Short-lived DB-tracked session tokens with immediate revocation + Supabase JWT',
            organizationIsolation: 'PostgreSQL Row-Level Security (RLS) + Private Supabase Storage bucket',
            complianceNote:
              'Technical safeguards align with HIPAA Security Rule controls. Production ePHI processing requires executed BAAs with cloud, database, and AI model providers.',
          },
        };
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/audit-logs', requireAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '').trim().toLowerCase();
      const { page, pageSize, offset } = parsePagination(req, 50);

      const result = await withOrgTransaction(req.auth!.organizationId, async (client) => {
        const where = q
          ? `organization_id = $1 AND (LOWER(action) LIKE $2 OR LOWER(user_email) LIKE $2 OR LOWER(details) LIKE $2)`
          : `organization_id = $1`;
        const params = q ? [req.auth!.organizationId, `%${q}%`] : [req.auth!.organizationId];

        const [countRes, rowsRes] = await Promise.all([
          client.query(`SELECT COUNT(*)::int as total FROM audit_logs WHERE ${where}`, params),
          client.query(
            `SELECT id, organization_id, user_id, user_email, action, resource_type, resource_id, details, ip_address::text as ip_address, created_at
             FROM audit_logs WHERE ${where}
             ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, pageSize, offset],
          ),
        ]);

        return {
          logs: rowsRes.rows,
          total: Number(countRes.rows[0]?.total || 0),
          page,
          pageSize,
        };
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // --- GLOBAL SEARCH ---
  router.get('/search', requireAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '').trim().toLowerCase();
      if (!q) {
        res.json({ patients: [], encounters: [], codes: [] });
        return;
      }

      const orgId = req.auth!.organizationId;
      const results = await withOrgTransaction(orgId, async (client) => {
        const [patRes, encRes, catalog] = await Promise.all([
          client.query(
            `SELECT id, mrn, first_name || ' ' || last_name as name, dob::text as dob
             FROM patients WHERE organization_id = $1 AND (LOWER(first_name || ' ' || last_name) LIKE $2 OR LOWER(mrn) LIKE $2)
             LIMIT 5`,
            [orgId, `%${q}%`],
          ),
          client.query(
            `SELECT id, encounter_number, date_of_service::text as date_of_service, chief_complaint, coding_status
             FROM encounters WHERE organization_id = $1 AND (LOWER(encounter_number) LIKE $2 OR LOWER(chief_complaint) LIKE $2)
             LIMIT 5`,
            [orgId, `%${q}%`],
          ),
          loadReferenceCatalogPg(client),
        ]);

        const codes = catalog
          .filter((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
          .slice(0, 8)
          .map((c) => ({ code: c.code, code_system: c.code_system, description: c.description }));

        return {
          patients: patRes.rows,
          encounters: encRes.rows,
          codes,
        };
      });

      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  // Centralized error handler (never leaks stack traces, tokens, or PHI)
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ConfigurationRequiredError) {
      res.status(err.statusCode).json({
        code: err.code,
        status: 'Not configured',
        error: err.message,
        missingVariables: err.missingKeys,
      });
      return;
    }

    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err && typeof (err as { statusCode: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;

    const message = err instanceof Error ? err.message : 'Unexpected server error';
    res.status(statusCode).json({ error: message });
  });

  return router;
}
