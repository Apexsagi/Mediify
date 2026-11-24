import type { PoolClient } from 'pg';
import {
  evaluateDenialRisks,
  evaluateRevenueIntegrity,
  runDeterministicCodingValidation,
} from '../../src/lib/codingValidator';
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
} from '../../src/lib/types';
import { runClinicalExtractionAndCoding } from '../ai/providerRegistry';
import { withOrgTransaction } from '../supabase';
import { writeAuditLog } from '../auth';

export async function loadReferenceCatalogPg(client: PoolClient): Promise<ReferenceCode[]> {
  const icdRes = await client.query(`
    SELECT code, code_system, description, category, effective_date::text, expiration_date::text,
           requires_laterality, valid_laterality, age_min, age_max, sex_restriction,
           NULL::int as mue_limit, NULL::int as global_days, FALSE as prior_auth_typical,
           is_billable, guideline_reference, NULL::text as license_notice, source_dataset
    FROM icd_codes
  `);
  const cptRes = await client.query(`
    SELECT code, 'CPT'::text as code_system, description, category, effective_date::text, expiration_date::text,
           requires_laterality, valid_laterality, NULL::int as age_min, NULL::int as age_max, NULL::text as sex_restriction,
           mue_limit, global_days, prior_auth_typical, TRUE as is_billable, guideline_reference, license_notice, source_dataset
    FROM cpt_codes
  `);
  const hcpcsRes = await client.query(`
    SELECT code, 'HCPCS'::text as code_system, description, category, effective_date::text, expiration_date::text,
           requires_laterality, valid_laterality, NULL::int as age_min, NULL::int as age_max, NULL::text as sex_restriction,
           mue_limit, NULL::int as global_days, prior_auth_typical, TRUE as is_billable, guideline_reference, NULL::text as license_notice, source_dataset
    FROM hcpcs_codes
  `);
  const modRes = await client.query(`
    SELECT code, 'MODIFIER'::text as code_system, description, category, effective_date::text, expiration_date::text,
           FALSE as requires_laterality, NULL::text as valid_laterality, NULL::int as age_min, NULL::int as age_max, NULL::text as sex_restriction,
           NULL::int as mue_limit, NULL::int as global_days, FALSE as prior_auth_typical, TRUE as is_billable, policy_reference as guideline_reference, NULL::text as license_notice, source_dataset
    FROM modifiers
  `);

  return [...icdRes.rows, ...cptRes.rows, ...hcpcsRes.rows, ...modRes.rows] as ReferenceCode[];
}

export async function loadNcciRulesPg(client: PoolClient): Promise<NcciEditRule[]> {
  const res = await client.query(
    `SELECT id, column1_code, column2_code, modifier_indicator, rationale, effective_date::text, expiration_date::text FROM ncci_edit_rules`,
  );
  return res.rows as NcciEditRule[];
}

export async function loadPayerPoliciesPg(client: PoolClient): Promise<PayerPolicyRule[]> {
  const res = await client.query(
    `SELECT id, policy_code, policy_type, payer_name, title, procedure_codes, covered_icd10_codes, documentation_requirements, timely_filing_days, prior_auth_required, effective_date::text FROM payer_policies`,
  );
  return res.rows as PayerPolicyRule[];
}

export async function recomputeEncounterValidationPg(
  client: PoolClient,
  organizationId: string,
  encounterId: string,
) {
  const encRes = await client.query(
    `SELECT *, date_of_service::text as date_of_service FROM encounters WHERE id = $1 AND organization_id = $2`,
    [encounterId, organizationId],
  );
  const encounter = encRes.rows[0] as Encounter | undefined;
  if (!encounter) return null;

  const patRes = await client.query(
    `SELECT *, dob::text as dob FROM patients WHERE id = $1 AND organization_id = $2`,
    [encounter.patient_id, organizationId],
  );
  const patient = patRes.rows[0] as Patient | undefined;
  if (!patient) return null;

  const recRes = await client.query(
    `SELECT * FROM coding_recommendations WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at ASC`,
    [encounterId, organizationId],
  );
  const recommendations = recRes.rows as CodingRecommendation[];

  const entRes = await client.query(
    `SELECT * FROM extracted_clinical_entities WHERE encounter_id = $1 AND organization_id = $2`,
    [encounterId, organizationId],
  );
  const entities = entRes.rows as ExtractedEntity[];

  const eligRes = await client.query(
    `SELECT * FROM eligibility_verifications WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [patient.id, organizationId],
  );
  const latestEligibility = (eligRes.rows[0] as EligibilityVerification | undefined) ?? null;

  const [catalog, ncciRules, payerPolicies] = await Promise.all([
    loadReferenceCatalogPg(client),
    loadNcciRulesPg(client),
    loadPayerPoliciesPg(client),
  ]);

  const validations = runDeterministicCodingValidation({
    encounter,
    patient,
    recommendations,
    entities,
    catalog,
    ncciRules,
    payerPolicies,
    latestEligibility,
  });

  const denialRisks = evaluateDenialRisks({
    encounter,
    recommendations,
    validations,
    payerPolicies,
    catalog,
    latestEligibility,
  });

  const integrityFindings = evaluateRevenueIntegrity({
    encounter,
    entities,
    recommendations,
    validations,
  });

  await client.query(`DELETE FROM coding_validations WHERE encounter_id = $1 AND organization_id = $2`, [
    encounterId,
    organizationId,
  ]);
  for (const v of validations) {
    await client.query(
      `INSERT INTO coding_validations (organization_id, encounter_id, rule_category, severity, code_involved, message, policy_reference, remediation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [organizationId, encounterId, v.rule_category, v.severity, v.code_involved, v.message, v.policy_reference, v.remediation],
    );
  }

  await client.query(`DELETE FROM denial_risks WHERE encounter_id = $1 AND organization_id = $2 AND review_status = 'OPEN'`, [
    encounterId,
    organizationId,
  ]);
  for (const r of denialRisks) {
    await client.query(
      `INSERT INTO denial_risks (organization_id, encounter_id, risk_category, severity, supporting_evidence, applicable_policy, source_reference, recommended_action, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        organizationId,
        encounterId,
        r.risk_category,
        r.severity,
        r.supporting_evidence,
        r.applicable_policy,
        r.source_reference ?? '',
        r.recommended_action,
        r.review_status,
      ],
    );
  }

  await client.query(`DELETE FROM revenue_integrity_findings WHERE encounter_id = $1 AND organization_id = $2 AND status = 'OPEN'`, [
    encounterId,
    organizationId,
  ]);
  for (const f of integrityFindings) {
    await client.query(
      `INSERT INTO revenue_integrity_findings (organization_id, encounter_id, finding_type, code_involved, summary, clinical_evidence, compliance_note, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [organizationId, encounterId, f.finding_type, f.code_involved, f.summary, f.clinical_evidence, f.compliance_note, f.priority, f.status],
    );
  }

  for (const rec of recommendations) {
    const codeErrors = validations.filter((v) => v.severity === 'ERROR' && v.code_involved.includes(rec.code));
    const codeWarnings = validations.filter((v) => v.severity === 'WARNING' && v.code_involved.includes(rec.code));
    const missingDs = validations.some((v) => v.rule_category === 'MISSING_REFERENCE_DATASET');
    const nextStatus = missingDs
      ? 'UNABLE_TO_VALIDATE'
      : codeErrors.length > 0
        ? 'FAILED'
        : codeWarnings.length > 0
          ? 'WARNING'
          : 'PASSED';
    await client.query(
      `UPDATE coding_recommendations SET validation_status = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [nextStatus, rec.id, organizationId],
    );
  }

  return { validations, denialRisks, integrityFindings };
}

export async function runAiExtractionJob(params: {
  organizationId: string;
  encounterId: string;
  modelConfigId?: string | null;
  userId: string;
  userEmail: string;
  ipAddress?: string;
}) {
  const { organizationId, encounterId, modelConfigId, userId, userEmail, ipAddress } = params;

  // Create job row in QUEUED -> CLINICAL_EXTRACTION
  const jobMeta = await withOrgTransaction(organizationId, async (client) => {
    const encRes = await client.query(
      `SELECT *, date_of_service::text as date_of_service FROM encounters WHERE id = $1 AND organization_id = $2`,
      [encounterId, organizationId],
    );
    const encounter = encRes.rows[0] as Encounter | undefined;
    if (!encounter) throw new Error('Encounter not found.');

    const orgRes = await client.query(`SELECT synthetic_mode FROM organizations WHERE id = $1`, [organizationId]);
    const orgIsSynthetic = Boolean(orgRes.rows[0]?.synthetic_mode);

    const recRes = await client.query(
      `SELECT id, file_name, raw_text FROM medical_records WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [encounterId, organizationId],
    );
    const record = recRes.rows[0] as { id: string; file_name: string; raw_text: string } | undefined;
    if (!record) throw new Error('No clinical document attached to this encounter.');

    const modelRes = modelConfigId
      ? await client.query(`SELECT * FROM ai_model_configs WHERE id = $1 AND organization_id = $2`, [
          modelConfigId,
          organizationId,
        ])
      : await client.query(`SELECT * FROM ai_model_configs WHERE organization_id = $1 AND is_active = TRUE LIMIT 1`, [
          organizationId,
        ]);
    const modelConfig = modelRes.rows[0] as AIModelConfig | undefined;
    if (!modelConfig) throw new Error('No active AI model configuration found. Configure one in AI Models.');

    const catalog = await loadReferenceCatalogPg(client);

    const jobInsert = await client.query(
      `INSERT INTO ai_processing_jobs (organization_id, encounter_id, medical_record_id, model_config_id, job_type, status, attempts, created_by, started_at)
       VALUES ($1, $2, $3, $4, 'CLINICAL_EXTRACTION_CODING', 'CLINICAL_EXTRACTION', 1, $5, NOW())
       RETURNING id`,
      [organizationId, encounterId, record.id, modelConfig.id, userId],
    );

    return {
      jobId: jobInsert.rows[0].id as string,
      encounter,
      orgIsSynthetic,
      record,
      modelConfig,
      catalog,
    };
  });

  try {
    const result = await runClinicalExtractionAndCoding({
      modelConfig: jobMeta.modelConfig,
      documentName: jobMeta.record.file_name,
      rawText: jobMeta.record.raw_text,
      encounterType: jobMeta.encounter.encounter_type,
      dateOfService: jobMeta.encounter.date_of_service,
      catalog: jobMeta.catalog,
      orgIsSynthetic: jobMeta.orgIsSynthetic,
    });

    await withOrgTransaction(organizationId, async (client) => {
      await client.query(
        `UPDATE ai_processing_jobs SET status = 'RULE_VALIDATION', latency_ms = $1 WHERE id = $2`,
        [result.latencyMs, jobMeta.jobId],
      );

      await client.query(`DELETE FROM extracted_clinical_entities WHERE encounter_id = $1 AND organization_id = $2`, [
        encounterId,
        organizationId,
      ]);

      for (const e of result.extractedEntities) {
        await client.query(
          `INSERT INTO extracted_clinical_entities (organization_id, encounter_id, medical_record_id, entity_type, entity_text, normalized_concept, certainty, laterality, anatomical_site, page_number, evidence_snippet)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            organizationId,
            encounterId,
            jobMeta.record.id,
            e.entity_type,
            e.entity_text,
            e.normalized_concept,
            e.certainty,
            e.laterality,
            e.anatomical_site,
            e.page_number,
            e.evidence_snippet,
          ],
        );
      }

      await client.query(
        `DELETE FROM coding_recommendations WHERE encounter_id = $1 AND organization_id = $2 AND approval_status = 'PENDING'`,
        [encounterId, organizationId],
      );

      for (const r of result.verifiedRecommendations) {
        const aiSnapshot = {
          code: r.code,
          modifiers: r.modifiers ?? '',
          units: r.units ?? 1,
          diagnosis_pointers: r.diagnosis_pointers ?? '',
          coding_rationale: r.coding_rationale,
        };
        const insertedRec = await client.query(
          `INSERT INTO coding_recommendations (
             organization_id, encounter_id, code, code_system, description, diagnosis_role,
             diagnosis_pointers, units, modifiers, supporting_evidence, source_document, page_reference,
             coding_rationale, guideline_citation, documentation_completeness, validation_status,
             compliance_risk, requires_human_review, approval_status, ai_provider, ai_draft_payload
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'NEEDS_REVIEW', $16, TRUE, 'PENDING', $17, $18::jsonb)
           RETURNING id`,
          [
            organizationId,
            encounterId,
            r.code,
            r.code_system,
            r.catalogDescription,
            r.diagnosis_role ?? 'SECONDARY',
            r.diagnosis_pointers ?? '',
            r.units ?? 1,
            r.modifiers ?? '',
            r.supporting_evidence,
            jobMeta.record.file_name,
            r.page_reference ?? 1,
            r.coding_rationale,
            r.guideline_citation,
            r.documentation_completeness ?? 'COMPLETE',
            r.uncertainty_note ?? 'Pending deterministic rules & human coder sign-off',
            `${result.providerUsed}:${result.modelUsed}`,
            JSON.stringify(aiSnapshot),
          ],
        );

        await client.query(
          `INSERT INTO coding_recommendation_versions (organization_id, encounter_id, recommendation_id, version_number, snapshot, change_reason, changed_by, changed_by_email)
           VALUES ($1, $2, $3, 1, $4::jsonb, 'Initial AI extraction recommendation', $5, $6)`,
          [organizationId, encounterId, insertedRec.rows[0].id, JSON.stringify(aiSnapshot), userId, userEmail],
        );
      }

      await client.query(`UPDATE encounters SET coding_status = 'NEEDS_CODING_REVIEW' WHERE id = $1 AND organization_id = $2`, [
        encounterId,
        organizationId,
      ]);

      await recomputeEncounterValidationPg(client, organizationId, encounterId);

      await client.query(
        `UPDATE ai_model_configs SET latency_ms = $1, last_health_status = 'HEALTHY', last_health_checked_at = NOW(), last_error = NULL WHERE id = $2`,
        [result.latencyMs, jobMeta.modelConfig.id],
      );

      await client.query(
        `UPDATE ai_processing_jobs SET status = 'COMPLETED', latency_ms = $1, result_summary = $2::jsonb, completed_at = NOW() WHERE id = $3`,
        [
          result.latencyMs,
          JSON.stringify({
            providerUsed: result.providerUsed,
            modelUsed: result.modelUsed,
            verifiedCount: result.verifiedRecommendations.length,
            rejectedCount: result.rejectedRecommendations.length,
            entityCount: result.extractedEntities.length,
          }),
          jobMeta.jobId,
        ],
      );
    });

    await writeAuditLog({
      organizationId,
      userId,
      userEmail,
      action: 'AI_CLINICAL_CODING_RUN',
      resourceType: 'encounter',
      resourceId: encounterId,
      details: `Model ${result.modelUsed} (${result.latencyMs}ms): ${result.extractedEntities.length} entities, ${result.verifiedRecommendations.length} verified recommendations, ${result.rejectedRecommendations.length} blocked.`,
      ipAddress,
    });

    return {
      jobId: jobMeta.jobId,
      ...result,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'AI clinical coding failed.';
    await withOrgTransaction(organizationId, async (client) => {
      await client.query(
        `UPDATE ai_processing_jobs SET status = 'FAILED', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [errMsg.slice(0, 500), jobMeta.jobId],
      );
      await client.query(
        `UPDATE ai_model_configs SET error_count = error_count + 1, last_error = $1 WHERE id = $2`,
        [errMsg.slice(0, 300), jobMeta.modelConfig.id],
      );
      await client.query(
        `INSERT INTO notifications (organization_id, recipient_user_id, category, severity, title, message, resource_type, resource_id)
         VALUES ($1, $2, 'AI_PROCESSING', 'CRITICAL', 'AI Clinical Extraction Failed', $3, 'encounter', $4)`,
        [organizationId, userId, errMsg.slice(0, 300), encounterId],
      );
    }).catch(() => undefined);

    throw err;
  }
}
