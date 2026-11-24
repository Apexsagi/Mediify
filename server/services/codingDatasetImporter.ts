import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

export type ReferenceDatasetType =
  | 'ICD-10-CM'
  | 'ICD-10-PCS'
  | 'CPT'
  | 'HCPCS'
  | 'MODIFIER'
  | 'NCCI_PTP'
  | 'LCD_NCD';

export interface ImportDatasetRequest {
  organizationId: string;
  userId: string;
  userEmail: string;
  datasetType: ReferenceDatasetType;
  versionLabel: string;
  sourceName: string;
  fileName: string;
  content: string;
  effectiveDate: string;
  amaLicenseAttested: boolean;
  notes?: string;
}

function parseCsvLines(content: string): Array<Record<string, string>> {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = splitRow(lines[0]).map((h) => h.toLowerCase());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitRow(lines[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = cols[idx] ?? '';
    });
    rows.push(rec);
  }
  return rows;
}

function parseStructuredRows(content: string): Array<Record<string, unknown>> {
  const trimmed = content.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { records?: unknown }).records)) {
      return (parsed as { records: Array<Record<string, unknown>> }).records;
    }
    throw new Error('JSON dataset must be an array of objects or { "records": [...] }.');
  }
  return parseCsvLines(trimmed);
}

export async function importReferenceDatasetTx(
  client: PoolClient,
  req: ImportDatasetRequest,
): Promise<{ importId: string; recordsImported: number }> {
  if (req.datasetType === 'CPT' && !req.amaLicenseAttested) {
    throw new Error(
      'AMA CPT License Attestation Required: Commercial/production CPT descriptors cannot be imported without attesting an active AMA CPT license.',
    );
  }

  const rows = parseStructuredRows(req.content);
  if (rows.length === 0) {
    throw new Error('Uploaded reference dataset contains zero valid records.');
  }

  let count = 0;

  for (const row of rows) {
    if (req.datasetType === 'ICD-10-CM' || req.datasetType === 'ICD-10-PCS') {
      const code = String(row.code ?? '').trim().toUpperCase();
      const description = String(row.description ?? '').trim();
      if (!code || !description) continue;
      await client.query(
        `INSERT INTO icd_codes (code, code_system, description, category, effective_date, expiration_date, requires_laterality, valid_laterality, age_min, age_max, sex_restriction, is_billable, guideline_reference, source_dataset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (code) DO UPDATE SET
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           effective_date = EXCLUDED.effective_date,
           expiration_date = EXCLUDED.expiration_date,
           requires_laterality = EXCLUDED.requires_laterality,
           valid_laterality = EXCLUDED.valid_laterality,
           is_billable = EXCLUDED.is_billable,
           guideline_reference = EXCLUDED.guideline_reference,
           source_dataset = EXCLUDED.source_dataset`,
        [
          code,
          req.datasetType,
          description,
          String(row.category ?? 'General'),
          String(row.effective_date || req.effectiveDate),
          row.expiration_date ? String(row.expiration_date) : null,
          Boolean(row.requires_laterality === true || row.requires_laterality === '1' || row.requires_laterality === 'true'),
          row.valid_laterality ? String(row.valid_laterality) : null,
          row.age_min ? Number(row.age_min) : null,
          row.age_max ? Number(row.age_max) : null,
          row.sex_restriction ? String(row.sex_restriction).slice(0, 1).toUpperCase() : null,
          row.is_billable === undefined ? true : Boolean(row.is_billable === true || row.is_billable === '1' || row.is_billable === 'true'),
          String(row.guideline_reference ?? `${req.datasetType} Official Guidelines`),
          req.sourceName,
        ],
      );
      count += 1;
    } else if (req.datasetType === 'CPT') {
      const code = String(row.code ?? '').trim().toUpperCase();
      const description = String(row.description ?? '').trim();
      if (!code || !description) continue;
      await client.query(
        `INSERT INTO cpt_codes (code, description, category, effective_date, expiration_date, mue_limit, global_days, prior_auth_typical, requires_laterality, valid_laterality, guideline_reference, license_notice, source_dataset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Imported under attested AMA CPT license', $12)
         ON CONFLICT (code) DO UPDATE SET
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           effective_date = EXCLUDED.effective_date,
           expiration_date = EXCLUDED.expiration_date,
           mue_limit = EXCLUDED.mue_limit,
           global_days = EXCLUDED.global_days,
           prior_auth_typical = EXCLUDED.prior_auth_typical,
           source_dataset = EXCLUDED.source_dataset`,
        [
          code,
          description,
          String(row.category ?? 'Procedures'),
          String(row.effective_date || req.effectiveDate),
          row.expiration_date ? String(row.expiration_date) : null,
          row.mue_limit ? Number(row.mue_limit) : null,
          row.global_days !== undefined && row.global_days !== '' ? Number(row.global_days) : null,
          Boolean(row.prior_auth_typical === true || row.prior_auth_typical === '1'),
          Boolean(row.requires_laterality === true || row.requires_laterality === '1'),
          row.valid_laterality ? String(row.valid_laterality) : null,
          String(row.guideline_reference ?? 'AMA CPT Guidelines'),
          req.sourceName,
        ],
      );
      count += 1;
    } else if (req.datasetType === 'HCPCS') {
      const code = String(row.code ?? '').trim().toUpperCase();
      const description = String(row.description ?? '').trim();
      if (!code || !description) continue;
      await client.query(
        `INSERT INTO hcpcs_codes (code, description, category, effective_date, expiration_date, mue_limit, prior_auth_typical, requires_laterality, valid_laterality, guideline_reference, source_dataset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (code) DO UPDATE SET
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           effective_date = EXCLUDED.effective_date,
           expiration_date = EXCLUDED.expiration_date,
           mue_limit = EXCLUDED.mue_limit,
           source_dataset = EXCLUDED.source_dataset`,
        [
          code,
          description,
          String(row.category ?? 'HCPCS Level II'),
          String(row.effective_date || req.effectiveDate),
          row.expiration_date ? String(row.expiration_date) : null,
          row.mue_limit ? Number(row.mue_limit) : null,
          Boolean(row.prior_auth_typical === true || row.prior_auth_typical === '1'),
          Boolean(row.requires_laterality === true || row.requires_laterality === '1'),
          row.valid_laterality ? String(row.valid_laterality) : null,
          String(row.guideline_reference ?? 'CMS HCPCS Level II'),
          req.sourceName,
        ],
      );
      count += 1;
    } else if (req.datasetType === 'MODIFIER') {
      const code = String(row.code ?? '').trim().toUpperCase();
      const description = String(row.description ?? '').trim();
      if (!code || !description) continue;
      await client.query(
        `INSERT INTO modifiers (code, description, category, policy_reference, effective_date, expiration_date, source_dataset)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO UPDATE SET
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           policy_reference = EXCLUDED.policy_reference,
           source_dataset = EXCLUDED.source_dataset`,
        [
          code,
          description,
          String(row.category ?? 'Billing Modifier'),
          String(row.policy_reference ?? 'CMS / CPT Modifier Guidelines'),
          String(row.effective_date || req.effectiveDate),
          row.expiration_date ? String(row.expiration_date) : null,
          req.sourceName,
        ],
      );
      count += 1;
    } else if (req.datasetType === 'NCCI_PTP') {
      const col1 = String(row.column1_code ?? '').trim().toUpperCase();
      const col2 = String(row.column2_code ?? '').trim().toUpperCase();
      const ind = String(row.modifier_indicator ?? '1').trim();
      if (!col1 || !col2 || !['0', '1', '9'].includes(ind)) continue;
      await client.query(
        `INSERT INTO ncci_edit_rules (column1_code, column2_code, modifier_indicator, rationale, effective_date, expiration_date, source_dataset)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (column1_code, column2_code, effective_date) DO UPDATE SET
           modifier_indicator = EXCLUDED.modifier_indicator,
           rationale = EXCLUDED.rationale,
           expiration_date = EXCLUDED.expiration_date,
           source_dataset = EXCLUDED.source_dataset`,
        [
          col1,
          col2,
          ind,
          String(row.rationale ?? 'CMS NCCI Procedure-to-Procedure edit'),
          String(row.effective_date || req.effectiveDate),
          row.expiration_date ? String(row.expiration_date) : null,
          req.sourceName,
        ],
      );
      count += 1;
    } else if (req.datasetType === 'LCD_NCD') {
      const policyCode = String(row.policy_code ?? '').trim();
      const title = String(row.title ?? '').trim();
      if (!policyCode || !title) continue;
      const procCodes = Array.isArray(row.procedure_codes)
        ? row.procedure_codes.map(String)
        : String(row.procedure_codes ?? '')
            .split(/[;|,]+/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
      const dxCodes = Array.isArray(row.covered_icd10_codes)
        ? row.covered_icd10_codes.map(String)
        : String(row.covered_icd10_codes ?? '')
            .split(/[;|,]+/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
      await client.query(
        `INSERT INTO payer_policies (policy_code, policy_type, payer_name, title, procedure_codes, covered_icd10_codes, documentation_requirements, timely_filing_days, prior_auth_required, effective_date, source_dataset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          policyCode,
          String(row.policy_type ?? 'LCD'),
          String(row.payer_name ?? 'CMS Medicare'),
          title,
          procCodes,
          dxCodes,
          String(row.documentation_requirements ?? ''),
          Number(row.timely_filing_days || 365),
          Boolean(row.prior_auth_required === true || row.prior_auth_required === '1'),
          String(row.effective_date || req.effectiveDate),
          req.sourceName,
        ],
      );
      count += 1;
    }
  }

  const sha256 = crypto.createHash('sha256').update(req.content).digest('hex');
  const importRes = await client.query(
    `INSERT INTO reference_dataset_imports (organization_id, dataset_type, version_label, source_name, file_name, file_sha256, records_imported, effective_date, ama_license_attested, imported_by, imported_by_email, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED', $12)
     RETURNING id`,
    [
      req.organizationId,
      req.datasetType,
      req.versionLabel,
      req.sourceName,
      req.fileName,
      sha256,
      count,
      req.effectiveDate,
      req.amaLicenseAttested,
      req.userId,
      req.userEmail,
      req.notes ?? '',
    ],
  );

  return {
    importId: importRes.rows[0].id,
    recordsImported: count,
  };
}
