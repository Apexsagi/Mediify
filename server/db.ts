import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_DIR = path.resolve(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const DB_PATH = path.resolve(DATA_DIR, 'mediify.db');
export const UPLOADS_ROOT = UPLOAD_DIR;

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    npi TEXT NOT NULL,
    tax_id TEXT NOT NULL,
    specialty TEXT NOT NULL,
    retention_days INTEGER NOT NULL DEFAULT 2555,
    baa_attested INTEGER NOT NULL DEFAULT 0,
    synthetic_mode INTEGER NOT NULL DEFAULT 1,
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS roles_permissions (
    role TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    permissions_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    credentials TEXT NOT NULL DEFAULT '',
    mfa_enabled INTEGER NOT NULL DEFAULT 0,
    mfa_secret TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    mrn TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dob TEXT NOT NULL,
    sex TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    is_synthetic INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    npi TEXT NOT NULL,
    full_name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    credential TEXT NOT NULL,
    network_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS encounters (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    encounter_number TEXT NOT NULL,
    date_of_service TEXT NOT NULL,
    encounter_type TEXT NOT NULL,
    place_of_service TEXT NOT NULL DEFAULT '11',
    chief_complaint TEXT NOT NULL,
    coding_status TEXT NOT NULL DEFAULT 'NEEDS_CODING_REVIEW',
    is_synthetic INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS medical_records (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL DEFAULT '',
    page_count INTEGER NOT NULL DEFAULT 1,
    ocr_status TEXT NOT NULL DEFAULT 'COMPLETED',
    raw_text TEXT NOT NULL,
    prompt_injection_flagged INTEGER NOT NULL DEFAULT 0,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS extracted_clinical_entities (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    medical_record_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_text TEXT NOT NULL,
    normalized_concept TEXT NOT NULL,
    certainty TEXT NOT NULL,
    laterality TEXT NOT NULL DEFAULT 'NONE',
    anatomical_site TEXT NOT NULL DEFAULT '',
    page_number INTEGER NOT NULL DEFAULT 1,
    evidence_snippet TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
    FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS insurance_policies (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    priority TEXT NOT NULL,
    payer_name TEXT NOT NULL,
    payer_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    group_number TEXT NOT NULL DEFAULT '',
    plan_name TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    termination_date TEXT,
    provenance TEXT NOT NULL DEFAULT 'EXTRACTED_FROM_DOCUMENT',
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS eligibility_verifications (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    insurance_policy_id TEXT NOT NULL,
    verification_source TEXT NOT NULL,
    clearinghouse_transaction_id TEXT,
    x12_270_payload TEXT,
    x12_271_status TEXT NOT NULL,
    copay_amount REAL,
    deductible_remaining REAL,
    coinsurance_percent REAL,
    prior_auth_required INTEGER NOT NULL DEFAULT 0,
    referral_required INTEGER NOT NULL DEFAULT 0,
    network_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    limitations_notes TEXT NOT NULL DEFAULT '',
    verified_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (insurance_policy_id) REFERENCES insurance_policies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reference_codes (
    code TEXT NOT NULL,
    code_system TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    expiration_date TEXT,
    requires_laterality INTEGER NOT NULL DEFAULT 0,
    valid_laterality TEXT,
    age_min INTEGER,
    age_max INTEGER,
    sex_restriction TEXT,
    mue_limit INTEGER,
    global_days INTEGER,
    prior_auth_typical INTEGER NOT NULL DEFAULT 0,
    is_billable INTEGER NOT NULL DEFAULT 1,
    guideline_reference TEXT NOT NULL,
    license_notice TEXT,
    PRIMARY KEY (code, code_system)
  );

  CREATE TABLE IF NOT EXISTS ncci_edit_rules (
    id TEXT PRIMARY KEY,
    column1_code TEXT NOT NULL,
    column2_code TEXT NOT NULL,
    modifier_indicator TEXT NOT NULL,
    rationale TEXT NOT NULL,
    effective_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coding_guidelines (
    id TEXT PRIMARY KEY,
    code_system TEXT NOT NULL,
    section TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    effective_year INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payer_policies (
    id TEXT PRIMARY KEY,
    policy_code TEXT NOT NULL,
    policy_type TEXT NOT NULL,
    payer_name TEXT NOT NULL,
    title TEXT NOT NULL,
    procedure_codes_json TEXT NOT NULL,
    covered_icd10_codes_json TEXT NOT NULL,
    documentation_requirements TEXT NOT NULL,
    timely_filing_days INTEGER NOT NULL DEFAULT 90,
    prior_auth_required INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS coding_recommendations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    code TEXT NOT NULL,
    code_system TEXT NOT NULL,
    description TEXT NOT NULL,
    diagnosis_role TEXT NOT NULL,
    diagnosis_pointers TEXT NOT NULL DEFAULT '',
    units INTEGER NOT NULL DEFAULT 1,
    modifiers TEXT NOT NULL DEFAULT '',
    supporting_evidence TEXT NOT NULL,
    source_document TEXT NOT NULL,
    page_reference INTEGER NOT NULL DEFAULT 1,
    coding_rationale TEXT NOT NULL,
    guideline_citation TEXT NOT NULL,
    documentation_completeness TEXT NOT NULL DEFAULT 'COMPLETE',
    validation_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    compliance_risk TEXT NOT NULL DEFAULT '',
    requires_human_review INTEGER NOT NULL DEFAULT 1,
    approval_status TEXT NOT NULL DEFAULT 'PENDING',
    approved_by TEXT,
    approved_at TEXT,
    ai_provider TEXT NOT NULL DEFAULT 'gemini',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS coding_validations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    rule_category TEXT NOT NULL,
    severity TEXT NOT NULL,
    code_involved TEXT NOT NULL,
    message TEXT NOT NULL,
    policy_reference TEXT NOT NULL,
    remediation TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS denial_risks (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    risk_category TEXT NOT NULL,
    severity TEXT NOT NULL,
    supporting_evidence TEXT NOT NULL,
    applicable_policy TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS revenue_integrity_findings (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    finding_type TEXT NOT NULL,
    code_involved TEXT NOT NULL,
    summary TEXT NOT NULL,
    clinical_evidence TEXT NOT NULL,
    compliance_note TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    claim_number TEXT NOT NULL,
    claim_type TEXT NOT NULL DEFAULT '837P',
    payer_name TEXT NOT NULL,
    total_charge_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL,
    readiness_status TEXT NOT NULL DEFAULT 'BLOCKED',
    blocking_reasons_json TEXT NOT NULL DEFAULT '[]',
    submitted_at TEXT,
    submitted_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS coding_approvals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    recommendation_id TEXT NOT NULL,
    action TEXT NOT NULL,
    previous_code TEXT,
    new_code TEXT,
    notes TEXT NOT NULL DEFAULT '',
    actor_user_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    details TEXT NOT NULL,
    ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_model_configs (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    model_name TEXT NOT NULL,
    api_url TEXT NOT NULL DEFAULT '',
    api_key_encrypted TEXT NOT NULL DEFAULT '',
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    is_active INTEGER NOT NULL DEFAULT 0,
    approved_for_phi INTEGER NOT NULL DEFAULT 0,
    baa_status TEXT NOT NULL DEFAULT 'REQUIRES_BAA',
    last_health_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    last_health_message TEXT NOT NULL DEFAULT '',
    last_health_checked_at TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS integration_configs (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    integration_type TEXT NOT NULL,
    endpoint_url TEXT NOT NULL DEFAULT '',
    auth_method TEXT NOT NULL DEFAULT 'OAuth 2.0 SMART on FHIR',
    connection_status TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
    permissions_scope TEXT NOT NULL DEFAULT '',
    last_sync_at TEXT,
    last_error TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(organization_id);
  CREATE INDEX IF NOT EXISTS idx_encounters_org ON encounters(organization_id);
  CREATE INDEX IF NOT EXISTS idx_recs_enc ON coding_recommendations(encounter_id);
  CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_logs(organization_id, created_at DESC);
`);

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function seedReferenceAndSyntheticData(): void {
  const roleCount = db.prepare('SELECT COUNT(*) as c FROM roles_permissions').get()?.c as number;
  if (roleCount === 0) {
    const insertRole = db.prepare(
      'INSERT INTO roles_permissions (role, display_name, permissions_json) VALUES (?, ?, ?)',
    );
    const roles: Array<[string, string, string[]]> = [
      ['admin', 'Organization Administrator', ['*']],
      ['coding_director', 'Director of Coding & RCM', ['coding:read', 'coding:approve', 'audit:read', 'audit:signoff', 'claims:release', 'reports:read', 'team:manage']],
      ['medical_coder', 'Certified Medical Coder (CPC/CCS)', ['coding:read', 'coding:approve', 'records:upload', 'insurance:read']],
      ['auditor', 'Compliance & Coding Auditor', ['coding:read', 'audit:read', 'audit:signoff', 'audit_logs:read']],
      ['physician', 'Attending Physician / CDI', ['records:read', 'coding:read', 'queries:respond']],
      ['rcm_analyst', 'Revenue Cycle & Denial Analyst', ['claims:read', 'denials:manage', 'insurance:verify', 'reports:read']],
    ];
    for (const [role, name, perms] of roles) {
      insertRole.run(role, name, JSON.stringify(perms));
    }
  }

  const refCount = db.prepare('SELECT COUNT(*) as c FROM reference_codes').get()?.c as number;
  if (refCount === 0) {
    const insertCode = db.prepare(`
      INSERT INTO reference_codes (
        code, code_system, description, category, effective_date, expiration_date,
        requires_laterality, valid_laterality, age_min, age_max, sex_restriction,
        mue_limit, global_days, prior_auth_typical, is_billable, guideline_reference, license_notice
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const codes: Array<Array<string | number | null>> = [
      // ICD-10-CM (CMS Public Domain)
      ['M17.11', 'ICD-10-CM', 'Unilateral primary osteoarthritis, right knee', 'Musculoskeletal', '2015-10-01', null, 1, 'RIGHT', null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 13 Section I.B.13', null],
      ['M17.12', 'ICD-10-CM', 'Unilateral primary osteoarthritis, left knee', 'Musculoskeletal', '2015-10-01', null, 1, 'LEFT', null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 13 Section I.B.13', null],
      ['M17.9', 'ICD-10-CM', 'Osteoarthritis of knee, unspecified', 'Musculoskeletal', '2015-10-01', null, 1, 'UNSPECIFIED', null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 13 (Requires specificity if laterality known)', null],
      ['E11.22', 'ICD-10-CM', 'Type 2 diabetes mellitus with diabetic chronic kidney disease', 'Endocrine', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 4 Section I.C.4.a (Use additional code for CKD stage)', null],
      ['N18.31', 'ICD-10-CM', 'Chronic kidney disease, stage 3a', 'Genitourinary', '2020-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 14 CKD Staging', null],
      ['I12.9', 'ICD-10-CM', 'Hypertensive chronic kidney disease with stage 1 through stage 4 chronic kidney disease', 'Circulatory', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 9 Presumed Causal Relationship', null],
      ['I10', 'ICD-10-CM', 'Essential (primary) hypertension', 'Circulatory', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 9 Hypertension', null],
      ['J18.9', 'ICD-10-CM', 'Pneumonia, unspecified organism', 'Respiratory', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 10', null],
      ['J20.9', 'ICD-10-CM', 'Acute bronchitis, unspecified', 'Respiratory', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 10', null],
      ['R07.9', 'ICD-10-CM', 'Chest pain, unspecified', 'Symptoms & Signs', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 18 Section IV.H', null],
      ['I21.4', 'ICD-10-CM', 'Non-ST elevation (NSTEMI) myocardial infarction', 'Circulatory', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 9 Acute MI', null],
      ['Z79.4', 'ICD-10-CM', 'Long term (current) use of insulin', 'Factors Influencing Health', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 4 Insulin Requirement', null],
      ['E11', 'ICD-10-CM', 'Type 2 diabetes mellitus (Category Header - Non-billable)', 'Endocrine', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 0, 'ICD-10-CM Category Header', null],
      ['N39.0', 'ICD-10-CM', 'Urinary tract infection, site not specified', 'Genitourinary', '2015-10-01', null, 0, null, null, null, null, null, null, 0, 1, 'ICD-10-CM Ch. 14', null],
      ['O80', 'ICD-10-CM', 'Encounter for full-term uncomplicated delivery', 'Pregnancy/Obstetrics', '2015-10-01', null, 0, null, 12, 55, 'F', null, null, 0, 1, 'ICD-10-CM Ch. 15 Sex/Age Edit', null],

      // ICD-10-PCS (CMS Public Domain)
      ['0SRD0J9', 'ICD-10-PCS', 'Replacement of Left Knee Joint with Synthetic Substitute, Cemented, Open Approach', 'Medical and Surgical', '2015-10-01', null, 1, 'LEFT', null, null, null, null, null, 1, 1, 'ICD-10-PCS B3.1a', null],
      ['02703DZ', 'ICD-10-PCS', 'Dilation of Coronary Artery, One Artery with Intraluminal Device, Percutaneous Approach', 'Medical and Surgical', '2015-10-01', null, 0, null, null, null, null, null, null, 1, 1, 'ICD-10-PCS B3.2', null],

      // CPT (Descriptive Reference Entries noting AMA CPT Licensing Requirement)
      ['99213', 'CPT', 'Office or other outpatient visit for established patient, low MDM (20-29 min)', 'Evaluation & Management', '2021-01-01', null, 0, null, null, null, null, 1, null, 0, 1, 'AMA CPT E/M Guidelines 2021+', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['99214', 'CPT', 'Office or other outpatient visit for established patient, moderate MDM (30-39 min)', 'Evaluation & Management', '2021-01-01', null, 0, null, null, null, null, 1, null, 0, 1, 'AMA CPT E/M Guidelines 2021+', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['99215', 'CPT', 'Office or other outpatient visit for established patient, high MDM (40-54 min)', 'Evaluation & Management', '2021-01-01', null, 0, null, null, null, null, 1, null, 0, 1, 'AMA CPT E/M Guidelines 2021+', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['99223', 'CPT', 'Initial hospital inpatient or observation care, high MDM', 'Evaluation & Management', '2023-01-01', null, 0, null, null, null, null, 1, null, 0, 1, 'AMA CPT Inpatient E/M 2023+', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['20610', 'CPT', 'Arthrocentesis, aspiration and/or injection, major joint or bursa (without ultrasound)', 'Surgery - Musculoskeletal', '2015-01-01', null, 1, 'LT,RT,50', null, null, null, 2, 0, 0, 1, 'CPT Musculoskeletal / CMS Global Surgery 0-Day', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['20611', 'CPT', 'Arthrocentesis, aspiration and/or injection, major joint or bursa; with ultrasound guidance', 'Surgery - Musculoskeletal', '2015-01-01', null, 1, 'LT,RT,50', null, null, null, 2, 0, 0, 1, 'CPT Musculoskeletal (Includes US guidance)', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['76942', 'CPT', 'Ultrasonic guidance for needle placement, imaging supervision and interpretation', 'Radiology', '2015-01-01', null, 0, null, null, null, null, 2, null, 0, 1, 'CMS NCCI Radiology Bundling', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['71046', 'CPT', 'Radiologic examination, chest; 2 views', 'Radiology', '2018-01-01', null, 0, null, null, null, null, 2, null, 0, 1, 'CPT Diagnostic Radiology', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['93000', 'CPT', 'Electrocardiogram, routine ECG with at least 12 leads; with interpretation and report', 'Medicine - Cardiovascular', '2015-01-01', null, 0, null, null, null, null, 2, null, 0, 1, 'CPT Cardiovascular', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['93010', 'CPT', 'Electrocardiogram, routine ECG with at least 12 leads; interpretation and report only', 'Medicine - Cardiovascular', '2015-01-01', null, 0, null, null, null, null, 2, null, 0, 1, 'CPT Cardiovascular (Professional Component)', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['27447', 'CPT', 'Arthroplasty, knee, condyle and plateau; medial and lateral compartments (Total Knee)', 'Surgery - Musculoskeletal', '2015-01-01', null, 1, 'LT,RT,50', null, null, null, 1, 90, 1, 1, 'CMS 90-Day Major Global Surgery Package', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],
      ['80053', 'CPT', 'Comprehensive metabolic panel', 'Pathology & Lab', '2015-01-01', null, 0, null, null, null, null, 2, null, 0, 1, 'CMS Lab NCD/NCCI Panel Rules', 'CPT codes/descriptions require an active AMA CPT license for commercial production deployment.'],

      // HCPCS Level II (CMS Public Domain)
      ['J1030', 'HCPCS', 'Injection, methylprednisolone acetate, 40 mg', 'Drugs Administered Other Than Oral', '2015-01-01', null, 0, null, null, null, null, 4, null, 0, 1, 'CMS ASP Drug Billing (1 unit = 40mg)', null],
      ['J7325', 'HCPCS', 'Hyaluronan or derivative, Synvisc or Synvisc-One, for intra-articular injection, 1 mg', 'Drugs / Viscosupplementation', '2015-01-01', null, 0, null, null, null, null, 48, null, 1, 1, 'CMS LCD Viscosupplementation Prior Auth', null],
      ['G0439', 'HCPCS', 'Annual wellness visit, includes a personalized prevention plan of service, subsequent visit', 'Preventive Services', '2015-01-01', null, 0, null, 65, null, null, 1, null, 0, 1, 'Medicare Preventive Services Manual', null],

      // Modifiers
      ['25', 'MODIFIER', 'Significant, separately identifiable Evaluation and Management service by the same physician on the same day of procedure', 'E/M Modifier', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'AMA CPT / CMS Modifier 25 Policy', null],
      ['59', 'MODIFIER', 'Distinct procedural service (different session, procedure, anatomical site, or separate injury)', 'NCCI Bypass Modifier', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'CMS NCCI Modifier 59 / X{EPSU} Policy', null],
      ['LT', 'MODIFIER', 'Left side (used to identify procedures performed on the left side of the body)', 'Anatomical Laterality', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'HCPCS Level II Anatomical Modifiers', null],
      ['RT', 'MODIFIER', 'Right side (used to identify procedures performed on the right side of the body)', 'Anatomical Laterality', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'HCPCS Level II Anatomical Modifiers', null],
      ['50', 'MODIFIER', 'Bilateral procedure', 'Anatomical Laterality', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'CMS Bilateral Surgery Indicator Rules', null],
      ['57', 'MODIFIER', 'Decision for surgery (E/M service resulting in initial decision to perform major 90-day surgery)', 'Global Surgery Modifier', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'CMS Global Surgery Package Policy', null],
      ['XE', 'MODIFIER', 'Separate encounter, a service that is distinct because it occurred during a separate encounter', 'CMS X{EPSU} Subset', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'CMS NCCI Specific Modifiers', null],
      ['XS', 'MODIFIER', 'Separate structure, a service that is distinct because it was performed on a separate organ/structure', 'CMS X{EPSU} Subset', '2015-01-01', null, 0, null, null, null, null, null, null, 0, 1, 'CMS NCCI Specific Modifiers', null],
    ];

    for (const c of codes) {
      insertCode.run(...c);
    }
  }

  const ncciCount = db.prepare('SELECT COUNT(*) as c FROM ncci_edit_rules').get()?.c as number;
  if (ncciCount === 0) {
    const insertNcci = db.prepare(
      'INSERT INTO ncci_edit_rules (id, column1_code, column2_code, modifier_indicator, rationale, effective_date) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertNcci.run(
      'ncci-20610-76942',
      '20610',
      '76942',
      '1',
      'CPT 20611 covers arthrocentesis with ultrasound guidance; billing 20610 + 76942 separately is bundled unless performed at a distinct anatomic site.',
      '2024-01-01',
    );
    insertNcci.run(
      'ncci-20611-76942',
      '20611',
      '76942',
      '0',
      'Ultrasound guidance is inherently included in CPT 20611; 76942 cannot be unbundled under any circumstances (Indicator 0).',
      '2024-01-01',
    );
    insertNcci.run(
      'ncci-93000-93010',
      '93000',
      '93010',
      '0',
      '93000 includes both technical and professional interpretation components; 93010 cannot be billed on the same ECG.',
      '2024-01-01',
    );
    insertNcci.run(
      'ncci-27447-20610',
      '27447',
      '20610',
      '1',
      'Joint aspiration/injection of the operative knee is bundled into total knee arthroplasty (27447) unless contralateral knee with XS/59.',
      '2024-01-01',
    );
  }

  const policyCount = db.prepare('SELECT COUNT(*) as c FROM payer_policies').get()?.c as number;
  if (policyCount === 0) {
    const insertPolicy = db.prepare(`
      INSERT INTO payer_policies (
        id, policy_code, policy_type, payer_name, title,
        procedure_codes_json, covered_icd10_codes_json, documentation_requirements,
        timely_filing_days, prior_auth_required
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPolicy.run(
      'pol-lcd-l35038',
      'L35038',
      'LCD',
      'Medicare Part B / NGS',
      'Intra-Articular Knee Injections & Viscosupplementation',
      JSON.stringify(['20610', '20611', 'J7325']),
      JSON.stringify(['M17.11', 'M17.12']),
      'Must document specific laterality, radiographic OA severity, and failure of >= 3 months conservative therapy for viscosupplementation.',
      365,
      0,
    );
    insertPolicy.run(
      'pol-ncd-190',
      'NCD 190.21',
      'NCD',
      'CMS Medicare National',
      'Glycated Hemoglobin / Comprehensive Metabolic Panel Monitoring',
      JSON.stringify(['80053']),
      JSON.stringify(['E11.22', 'N18.31', 'I12.9', 'I10', 'I21.4']),
      'Medical necessity requires documented metabolic, renal, hepatic, or hypertensive condition.',
      365,
      0,
    );
    insertPolicy.run(
      'pol-comm-tka',
      'COMM-ORTHO-2026',
      'PAYER_POLICY',
      'BlueCross Commercial PPO',
      'Total Knee Arthroplasty Inpatient/Outpatient Pre-Certification',
      JSON.stringify(['27447']),
      JSON.stringify(['M17.11', 'M17.12']),
      'Requires prior authorization number, weight-bearing AP/lateral X-rays, and documented functional impairment.',
      90,
      1,
    );
  }

  const guidelineCount = db.prepare('SELECT COUNT(*) as c FROM coding_guidelines').get()?.c as number;
  if (guidelineCount === 0) {
    const insertGuide = db.prepare(
      'INSERT INTO coding_guidelines (id, code_system, section, title, summary, effective_year) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertGuide.run('g-1', 'ICD-10-CM', 'I.B.13', 'Laterality Specificity', 'When a code exists for left, right, or bilateral sites, assign the specific laterality code whenever documented in the medical record.', 2026);
    insertGuide.run('g-2', 'ICD-10-CM', 'IV.H', 'Uncertain Diagnoses (Outpatient)', 'Do not code diagnoses documented as probable, suspected, questionable, rule out, or working diagnosis in outpatient encounters. Code documented signs/symptoms.', 2026);
    insertGuide.run('g-3', 'ICD-10-CM', 'I.C.9.a.2', 'Hypertension with Chronic Kidney Disease', 'ICD-10-CM presumes a causal relationship between hypertension and CKD (I12.-); additionally assign N18.- for CKD stage.', 2026);
    insertGuide.run('g-4', 'CPT', 'Modifier 25', 'Significant, Separately Identifiable E/M Service', 'Use Modifier 25 only when clinical documentation demonstrates a separately identifiable E/M beyond usual pre/post-procedure care on the same DOS.', 2026);
  }

  // Seed a clearly labeled Synthetic Sandbox Organization & Dataset if no organizations exist
  const orgCount = db.prepare('SELECT COUNT(*) as c FROM organizations').get()?.c as number;
  if (orgCount === 0) {
    const orgId = 'org-synthetic-sandbox';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO organizations (id, name, npi, tax_id, specialty, retention_days, baa_attested, synthetic_mode, onboarding_completed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orgId,
      'Meridian Regional Health (Synthetic Sandbox)',
      '1982736450',
      '00-0000000',
      'Multi-Specialty Health System & Ambulatory Surgery',
      2555,
      0,
      1,
      1,
      now,
    );

    // Sandbox Demo User (password is only for clearly-labeled synthetic sandbox evaluation)
    const demoUserId = 'usr-demo-director';
    db.prepare(`
      INSERT INTO users (id, organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      demoUserId,
      orgId,
      'director@meridian-synthetic.example',
      hashPasswordScrypt('MediifySandbox!2026'),
      'Dr. Claire Mercer, MD, CCS',
      'coding_director',
      'MD, CCS, CPC',
      0,
      1,
      now,
    );

    db.prepare(`
      INSERT INTO users (id, organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'usr-demo-coder',
      orgId,
      'coder@meridian-synthetic.example',
      hashPasswordScrypt('MediifySandbox!2026'),
      'Marcus Chen, RHIA, CPC',
      'medical_coder',
      'RHIA, CPC',
      1,
      1,
      now,
    );

    db.prepare(`
      INSERT INTO users (id, organization_id, email, password_hash, full_name, role, credentials, mfa_enabled, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'usr-demo-auditor',
      orgId,
      'auditor@meridian-synthetic.example',
      hashPasswordScrypt('MediifySandbox!2026'),
      'Priya Nair, CHPC, CPMA',
      'auditor',
      'CHPC, CPMA',
      1,
      1,
      now,
    );

    // Providers
    db.prepare(`
      INSERT INTO providers (id, organization_id, npi, full_name, specialty, credential, network_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('prov-1', orgId, '1234567893', 'Dr. Samuel Okafor, MD', 'Orthopedic Surgery', 'MD, FAAOS', 'IN_NETWORK');
    db.prepare(`
      INSERT INTO providers (id, organization_id, npi, full_name, specialty, credential, network_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('prov-2', orgId, '1568492014', 'Dr. Hannah Alvarez, MD', 'Internal Medicine / Nephrology', 'MD, FACP', 'IN_NETWORK');
    db.prepare(`
      INSERT INTO providers (id, organization_id, npi, full_name, specialty, credential, network_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('prov-3', orgId, '1849201735', 'Dr. David Sterling, MD', 'Cardiovascular Medicine', 'MD, FACC', 'IN_NETWORK');

    // Synthetic Patients
    const patients: Array<[string, string, string, string, string, 'M' | 'F', string, string]> = [
      ['pat-syn-1', 'SYN-MRN-4012', 'Eleanor', 'Vance', '1959-04-18', 'F', 'Boston', 'MA'],
      ['pat-syn-2', 'SYN-MRN-4089', 'Arthur', 'Pendelton', '1954-11-02', 'M', 'Worcester', 'MA'],
      ['pat-syn-3', 'SYN-MRN-4120', 'Miriam', 'Solis', '1968-07-29', 'F', 'Cambridge', 'MA'],
      ['pat-syn-4', 'SYN-MRN-4195', 'Kenneth', 'Brooks', '1972-02-14', 'M', 'Providence', 'RI'],
    ];
    for (const [id, mrn, fn, ln, dob, sex, city, state] of patients) {
      db.prepare(`
        INSERT INTO patients (id, organization_id, mrn, first_name, last_name, dob, sex, city, state, is_synthetic, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(id, orgId, mrn, fn, ln, dob, sex, city, state, now);
    }

    // Synthetic Insurance Policies (clearly marked provenance)
    db.prepare(`
      INSERT INTO insurance_policies (id, organization_id, patient_id, priority, payer_name, payer_id, member_id, group_number, plan_name, effective_date, termination_date, provenance, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ins-1', orgId, 'pat-syn-1', 'PRIMARY', 'Medicare Part B (Synthetic)', 'CMS-00811', 'SYN-MED-99210A', 'PART-B', 'Original Medicare Part B', '2024-01-01', null, 'EXTRACTED_FROM_DOCUMENT', 1);
    db.prepare(`
      INSERT INTO insurance_policies (id, organization_id, patient_id, priority, payer_name, payer_id, member_id, group_number, plan_name, effective_date, termination_date, provenance, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ins-2', orgId, 'pat-syn-2', 'PRIMARY', 'BlueCross PPO (Synthetic)', 'BCBS-00102', 'SYN-BCB-448102', 'GRP-88412', 'BlueOptions PPO Gold', '2025-01-01', null, 'EXTRACTED_FROM_DOCUMENT', 1);
    db.prepare(`
      INSERT INTO insurance_policies (id, organization_id, patient_id, priority, payer_name, payer_id, member_id, group_number, plan_name, effective_date, termination_date, provenance, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ins-3', orgId, 'pat-syn-3', 'PRIMARY', 'Aetna Choice POS (Synthetic)', 'AET-60054', 'SYN-AET-772104', 'GRP-19201', 'Aetna Choice POS II', '2025-06-01', null, 'EXTRACTED_FROM_DOCUMENT', 1);

    // Eligibility records explicitly marked NOT_VERIFIED_REQUIRES_CLEARINGHOUSE (never faking live verification!)
    db.prepare(`
      INSERT INTO eligibility_verifications (id, organization_id, patient_id, insurance_policy_id, verification_source, clearinghouse_transaction_id, x12_270_payload, x12_271_status, copay_amount, deductible_remaining, coinsurance_percent, prior_auth_required, referral_required, network_status, limitations_notes, verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'elig-1',
      orgId,
      'pat-syn-1',
      'ins-1',
      'EXTRACTED_FROM_DOCUMENT',
      null,
      null,
      'NOT_VERIFIED_REQUIRES_CLEARINGHOUSE',
      null,
      null,
      20,
      0,
      0,
      'UNVERIFIED',
      'Extracted from synthetic intake face sheet. Live X12 270/271 clearinghouse verification requires configured payer/clearinghouse credentials.',
      null,
      now,
    );

    // Synthetic Encounters & Clinical Documents
    const enc1Text = `SYNTHETIC CLINICAL ENCOUNTER NOTE (TESTING ONLY - NOT REAL PHI)
Patient: Eleanor Vance | MRN: SYN-MRN-4012 | DOB: 1959-04-18 | Sex: Female
Date of Service: 2026-11-12 | Place of Service: 11 (Office)
Attending Provider: Dr. Samuel Okafor, MD (NPI: 1234567893)
Primary Insurance (Face Sheet): Medicare Part B (Synthetic) | Member ID: SYN-MED-99210A

CHIEF COMPLAINT:
Worsening right knee pain, stiffness, and recurrent joint effusion over 6 months.

HISTORY OF PRESENT ILLNESS:
67-year-old female presents for orthopedic evaluation of chronic right knee pain aggravated by stairs and prolonged standing. She completed 16 weeks of physical therapy and oral NSAIDs with inadequate relief. Denies fever, chills, or acute trauma. Left knee is asymptomatic.

PHYSICAL EXAMINATION:
Right knee: Moderate suprapatellar effusion, medial joint line tenderness, crepitus with flexion to 110 degrees. Negative Lachman and drawer signs. Neurovascularly intact distally.
Left knee: Normal alignment, full painless range of motion.

IMAGING REVIEWED:
Weight-bearing AP and lateral radiographs of the right knee demonstrate severe medial compartment joint space narrowing, subchondral sclerosis, and osteophyte formation consistent with unilateral primary osteoarthritis of the right knee.

ASSESSMENT & PLAN:
1. Unilateral primary osteoarthritis, right knee (confirmed). Discussed intra-articular corticosteroid injection vs surgical options; patient elected corticosteroid injection today.
2. Separate moderate-complexity E/M visit (34 minutes total time spent reviewing outside radiographs, assessing medical comorbidities, and counseling on treatment options).
3. Procedure Performed: Right knee arthrocentesis and corticosteroid injection (40 mg methylprednisolone acetate) under sterile prep WITHOUT ultrasound guidance. Note: bedside ultrasound machine was present in room but NOT used for guidance.
4. Follow-up in 6 weeks.`;

    const enc2Text = `SYNTHETIC INTERNAL MEDICINE PROGRESS NOTE (TESTING ONLY - NOT REAL PHI)
Patient: Arthur Pendelton | MRN: SYN-MRN-4089 | DOB: 1954-11-02 | Sex: Male
Date of Service: 2026-11-14 | Place of Service: 11 (Office)
Attending Provider: Dr. Hannah Alvarez, MD (NPI: 1568492014)
Primary Insurance (Face Sheet): BlueCross PPO (Synthetic) | Member ID: SYN-BCB-448102

CHIEF COMPLAINT:
Quarterly management of type 2 diabetes mellitus, hypertension, and chronic kidney disease.

HISTORY OF PRESENT ILLNESS:
72-year-old male with longstanding type 2 diabetes mellitus (on daily basal insulin glargine), essential hypertension, and CKD stage 3a (eGFR 52 mL/min/1.73m2). Reports occasional mild dyspnea on exertion; denies chest pain or edema.

DIAGNOSTIC RESULTS:
Comprehensive Metabolic Panel (CMP) ordered and reviewed today: Creatinine 1.48 mg/dL, eGFR 52 (stable stage 3a), K+ 4.4 mEq/L.
12-Lead Electrocardiogram (ECG) performed in clinic with separate written interpretation and report signed by Dr. Alvarez: Normal sinus rhythm, rate 72 bpm, no acute ST-T wave changes.

ASSESSMENT & PLAN:
1. Type 2 diabetes mellitus with diabetic chronic kidney disease (confirmed). Continue long-term insulin therapy.
2. Hypertensive chronic kidney disease with CKD stage 3a (confirmed). Continue lisinopril 20 mg daily.
3. Suspected mild obstructive sleep apnea (rule out OSA; sleep study ordered). [NOTE: Outpatient suspected condition - do not code as confirmed].`;

    const enc3Text = `SYNTHETIC CARDIOLOGY CONSULTATION & HOSPITAL NOTE (TESTING ONLY - NOT REAL PHI)
Patient: Miriam Solis | MRN: SYN-MRN-4120 | DOB: 1968-07-29 | Sex: Female
Date of Service: 2026-11-16 | Place of Service: 21 (Inpatient Hospital)
Attending Provider: Dr. David Sterling, MD (NPI: 1849201735)
Primary Insurance (Face Sheet): Aetna Choice POS (Synthetic) | Member ID: SYN-AET-772104

CHIEF COMPLAINT:
Acute substernal chest pressure and elevated troponin I.

CLINICAL COURSE:
58-year-old female admitted via ED for acute NSTEMI (Type 1, peak troponin I 2.8 ng/mL). Underwent diagnostic coronary angiography and percutaneous transluminal coronary angioplasty with single drug-eluting stent placement to the proximal LAD. Also has comorbid essential hypertension.
Comprehensive metabolic panel and serial 12-lead ECGs with formal interpretation documented.`;

    db.prepare(`
      INSERT INTO encounters (id, organization_id, patient_id, provider_id, encounter_number, date_of_service, encounter_type, place_of_service, chief_complaint, coding_status, is_synthetic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run('enc-syn-1', orgId, 'pat-syn-1', 'prov-1', 'ENC-2026-8841', '2026-11-12', 'Outpatient', '11', 'Right knee osteoarthritis & corticosteroid injection', 'NEEDS_CODING_REVIEW', now);

    db.prepare(`
      INSERT INTO encounters (id, organization_id, patient_id, provider_id, encounter_number, date_of_service, encounter_type, place_of_service, chief_complaint, coding_status, is_synthetic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run('enc-syn-2', orgId, 'pat-syn-2', 'prov-2', 'ENC-2026-8854', '2026-11-14', 'Outpatient', '11', 'Diabetic CKD stage 3a, HTN & in-clinic ECG', 'NEEDS_CODING_REVIEW', now);

    db.prepare(`
      INSERT INTO encounters (id, organization_id, patient_id, provider_id, encounter_number, date_of_service, encounter_type, place_of_service, chief_complaint, coding_status, is_synthetic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run('enc-syn-3', orgId, 'pat-syn-3', 'prov-3', 'ENC-2026-8862', '2026-11-16', 'Inpatient', '21', 'Acute NSTEMI & PCI single coronary stent', 'APPROVED', now);

    // Medical Records
    db.prepare(`
      INSERT INTO medical_records (id, organization_id, patient_id, encounter_id, document_type, file_name, mime_type, page_count, ocr_status, raw_text, prompt_injection_flagged, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rec-syn-1', orgId, 'pat-syn-1', 'enc-syn-1', 'Orthopedic Encounter Note', 'SYN_Vance_Ortho_20261112.txt', 'text/plain', 2, 'COMPLETED', enc1Text, 0, demoUserId, now);

    db.prepare(`
      INSERT INTO medical_records (id, organization_id, patient_id, encounter_id, document_type, file_name, mime_type, page_count, ocr_status, raw_text, prompt_injection_flagged, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rec-syn-2', orgId, 'pat-syn-2', 'enc-syn-2', 'Internal Medicine Progress Note', 'SYN_Pendelton_IM_20261114.txt', 'text/plain', 2, 'COMPLETED', enc2Text, 0, demoUserId, now);

    db.prepare(`
      INSERT INTO medical_records (id, organization_id, patient_id, encounter_id, document_type, file_name, mime_type, page_count, ocr_status, raw_text, prompt_injection_flagged, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rec-syn-3', orgId, 'pat-syn-3', 'enc-syn-3', 'Inpatient Cardiology Consult & Cath Report', 'SYN_Solis_Cardio_20261116.txt', 'text/plain', 3, 'COMPLETED', enc3Text, 0, demoUserId, now);

    // Extracted Entities for Encounter 1
    const insertEntity = db.prepare(`
      INSERT INTO extracted_clinical_entities (id, organization_id, encounter_id, medical_record_id, entity_type, entity_text, normalized_concept, certainty, laterality, anatomical_site, page_number, evidence_snippet, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertEntity.run('ent-1', orgId, 'enc-syn-1', 'rec-syn-1', 'diagnosis', 'unilateral primary osteoarthritis of the right knee', 'Primary osteoarthritis, right knee', 'confirmed', 'RIGHT', 'Right Knee', 1, 'osteophyte formation consistent with unilateral primary osteoarthritis of the right knee.', now);
    insertEntity.run('ent-2', orgId, 'enc-syn-1', 'rec-syn-1', 'procedure', 'Right knee arthrocentesis and corticosteroid injection', 'Arthrocentesis major joint', 'confirmed', 'RIGHT', 'Right Knee', 2, 'Right knee arthrocentesis and corticosteroid injection (40 mg methylprednisolone acetate) under sterile prep WITHOUT ultrasound guidance.', now);
    insertEntity.run('ent-3', orgId, 'enc-syn-1', 'rec-syn-1', 'medication', '40 mg methylprednisolone acetate', 'Methylprednisolone acetate 40mg', 'confirmed', 'NONE', 'Right Knee', 2, '40 mg methylprednisolone acetate', now);
    insertEntity.run('ent-4', orgId, 'enc-syn-1', 'rec-syn-1', 'procedure', 'ultrasound guidance', 'Ultrasound guidance needle placement', 'negated', 'NONE', 'Right Knee', 2, 'bedside ultrasound machine was present in room but NOT used for guidance.', now);

    // Extracted Entities for Encounter 2
    insertEntity.run('ent-5', orgId, 'enc-syn-2', 'rec-syn-2', 'diagnosis', 'Type 2 diabetes mellitus with diabetic chronic kidney disease', 'T2DM with diabetic CKD', 'confirmed', 'NONE', 'Systemic / Renal', 1, 'Type 2 diabetes mellitus with diabetic chronic kidney disease (confirmed).', now);
    insertEntity.run('ent-6', orgId, 'enc-syn-2', 'rec-syn-2', 'diagnosis', 'CKD stage 3a', 'Chronic kidney disease stage 3a', 'confirmed', 'NONE', 'Kidney', 1, 'CKD stage 3a (eGFR 52 mL/min/1.73m2).', now);
    insertEntity.run('ent-7', orgId, 'enc-syn-2', 'rec-syn-2', 'diagnosis', 'Hypertensive chronic kidney disease', 'Hypertensive CKD', 'confirmed', 'NONE', 'Renal / Vascular', 2, 'Hypertensive chronic kidney disease with CKD stage 3a (confirmed).', now);
    insertEntity.run('ent-8', orgId, 'enc-syn-2', 'rec-syn-2', 'diagnosis', 'Suspected mild obstructive sleep apnea', 'Obstructive sleep apnea', 'suspected', 'NONE', 'Airway', 2, 'Suspected mild obstructive sleep apnea (rule out OSA; sleep study ordered).', now);
    insertEntity.run('ent-9', orgId, 'enc-syn-2', 'rec-syn-2', 'procedure', '12-Lead Electrocardiogram (ECG) with written interpretation', '12-lead ECG interpretation', 'confirmed', 'NONE', 'Heart', 1, '12-Lead Electrocardiogram (ECG) performed in clinic with separate written interpretation and report signed by Dr. Alvarez', now);

    // Coding Recommendations for Encounter 1 (includes an intentional NCCI/missing mod 25 issue for review!)
    const insertRec = db.prepare(`
      INSERT INTO coding_recommendations (
        id, organization_id, encounter_id, code, code_system, description, diagnosis_role,
        diagnosis_pointers, units, modifiers, supporting_evidence, source_document, page_reference,
        coding_rationale, guideline_citation, documentation_completeness, validation_status,
        compliance_risk, requires_human_review, approval_status, approved_by, approved_at, ai_provider, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertRec.run('crec-1', orgId, 'enc-syn-1', 'M17.11', 'ICD-10-CM', 'Unilateral primary osteoarthritis, right knee', 'PRIMARY', '', 1, '', 'unilateral primary osteoarthritis of the right knee.', 'SYN_Vance_Ortho_20261112.txt', 1, 'Radiographs and orthopedic exam confirm unilateral primary OA of the right knee.', 'ICD-10-CM Ch. 13 Section I.B.13', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-2', orgId, 'enc-syn-1', '99214', 'CPT', 'Office or other outpatient visit for established patient, moderate MDM (30-39 min)', 'PROCEDURE', 'A', 1, '', '34 minutes total time spent reviewing outside radiographs, assessing medical comorbidities, and counseling on treatment options.', 'SYN_Vance_Ortho_20261112.txt', 2, 'Moderate MDM and 34 minutes total time documented alongside procedure; requires Modifier 25 review.', 'AMA CPT E/M Guidelines 2021+ / Modifier 25', 'COMPLETE', 'FAILED', 'Missing Modifier 25 alongside same-day minor procedure 20610', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-3', orgId, 'enc-syn-1', '20610', 'CPT', 'Arthrocentesis, aspiration and/or injection, major joint or bursa (without ultrasound)', 'PROCEDURE', 'A', 1, 'RT', 'Right knee arthrocentesis and corticosteroid injection (40 mg methylprednisolone acetate) under sterile prep WITHOUT ultrasound guidance.', 'SYN_Vance_Ortho_20261112.txt', 2, 'Major joint injection performed without ultrasound guidance; RT laterality applies.', 'CPT Musculoskeletal / LCD L35038', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-4', orgId, 'enc-syn-1', 'J1030', 'HCPCS', 'Injection, methylprednisolone acetate, 40 mg', 'PROCEDURE', 'A', 1, '', '40 mg methylprednisolone acetate', 'SYN_Vance_Ortho_20261112.txt', 2, '1 unit equals 40 mg methylprednisolone acetate administered.', 'CMS ASP Drug Billing', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);

    // Encounter 2 recommendations (note: ECG 93000 intentionally omitted to showcase Revenue Integrity missed documented billable detection!)
    insertRec.run('crec-5', orgId, 'enc-syn-2', 'E11.22', 'ICD-10-CM', 'Type 2 diabetes mellitus with diabetic chronic kidney disease', 'PRIMARY', '', 1, '', 'Type 2 diabetes mellitus with diabetic chronic kidney disease (confirmed).', 'SYN_Pendelton_IM_20261114.txt', 2, 'Documented diabetic CKD.', 'ICD-10-CM Ch. 4 Section I.C.4.a', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-6', orgId, 'enc-syn-2', 'N18.31', 'ICD-10-CM', 'Chronic kidney disease, stage 3a', 'SECONDARY', '', 1, '', 'CKD stage 3a (eGFR 52 mL/min/1.73m2).', 'SYN_Pendelton_IM_20261114.txt', 1, 'Additional code required to specify CKD stage 3a.', 'ICD-10-CM Ch. 14 CKD Staging', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-7', orgId, 'enc-syn-2', 'I12.9', 'ICD-10-CM', 'Hypertensive chronic kidney disease with stage 1 through stage 4 chronic kidney disease', 'SECONDARY', '', 1, '', 'Hypertensive chronic kidney disease with CKD stage 3a (confirmed).', 'SYN_Pendelton_IM_20261114.txt', 2, 'Causal hypertension + CKD link documented.', 'ICD-10-CM Ch. 9 Presumed Causal Relationship', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-8', orgId, 'enc-syn-2', 'Z79.4', 'ICD-10-CM', 'Long term (current) use of insulin', 'SECONDARY', '', 1, '', 'on daily basal insulin glargine', 'SYN_Pendelton_IM_20261114.txt', 1, 'Routine daily insulin use documented.', 'ICD-10-CM Ch. 4 Insulin Requirement', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-9', orgId, 'enc-syn-2', '99214', 'CPT', 'Office or other outpatient visit for established patient, moderate MDM (30-39 min)', 'PROCEDURE', 'A,B,C', 1, '', 'Quarterly management of type 2 diabetes mellitus, hypertension, and chronic kidney disease; CMP ordered and reviewed.', 'SYN_Pendelton_IM_20261114.txt', 1, 'Three stable/worsening chronic illnesses with prescription drug management and lab interpretation.', 'AMA CPT E/M Guidelines 2021+', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);
    insertRec.run('crec-10', orgId, 'enc-syn-2', '80053', 'CPT', 'Comprehensive metabolic panel', 'PROCEDURE', 'A,B,C', 1, '', 'Comprehensive Metabolic Panel (CMP) ordered and reviewed today', 'SYN_Pendelton_IM_20261114.txt', 1, 'CMP ordered to monitor CKD stage 3a and potassium.', 'NCD 190.21', 'COMPLETE', 'PASSED', 'Low risk', 1, 'PENDING', null, null, 'gemini-4-hydrogen', now);

    // Encounter 3 approved codes
    insertRec.run('crec-11', orgId, 'enc-syn-3', 'I21.4', 'ICD-10-CM', 'Non-ST elevation (NSTEMI) myocardial infarction', 'PRIMARY', '', 1, '', 'admitted via ED for acute NSTEMI (Type 1, peak troponin I 2.8 ng/mL).', 'SYN_Solis_Cardio_20261116.txt', 1, 'Confirmed acute Type 1 NSTEMI.', 'ICD-10-CM Ch. 9 Acute MI', 'COMPLETE', 'PASSED', 'Low risk', 1, 'APPROVED', demoUserId, now, 'gemini-4-hydrogen', now);
    insertRec.run('crec-12', orgId, 'enc-syn-3', 'I10', 'ICD-10-CM', 'Essential (primary) hypertension', 'SECONDARY', '', 1, '', 'Also has comorbid essential hypertension.', 'SYN_Solis_Cardio_20261116.txt', 1, 'Documented comorbid HTN.', 'ICD-10-CM Ch. 9', 'COMPLETE', 'PASSED', 'Low risk', 1, 'APPROVED', demoUserId, now, 'gemini-4-hydrogen', now);
    insertRec.run('crec-13', orgId, 'enc-syn-3', '02703DZ', 'ICD-10-PCS', 'Dilation of Coronary Artery, One Artery with Intraluminal Device, Percutaneous Approach', 'PROCEDURE', '', 1, '', 'percutaneous transluminal coronary angioplasty with single drug-eluting stent placement to the proximal LAD.', 'SYN_Solis_Cardio_20261116.txt', 2, 'Inpatient PCI with DES on 1 coronary artery.', 'ICD-10-PCS B3.2', 'COMPLETE', 'PASSED', 'Low risk', 1, 'APPROVED', demoUserId, now, 'gemini-4-hydrogen', now);
    insertRec.run('crec-14', orgId, 'enc-syn-3', '99223', 'CPT', 'Initial hospital inpatient or observation care, high MDM', 'PROCEDURE', 'A', 1, '', 'Acute NSTEMI inpatient admission.', 'SYN_Solis_Cardio_20261116.txt', 1, 'High risk acute myocardial infarction inpatient management.', 'AMA CPT Inpatient E/M 2023+', 'COMPLETE', 'PASSED', 'Low risk', 1, 'APPROVED', demoUserId, now, 'gemini-4-hydrogen', now);

    // Claims
    db.prepare(`
      INSERT INTO claims (id, organization_id, encounter_id, patient_id, claim_number, claim_type, payer_name, total_charge_amount, paid_amount, readiness_status, blocking_reasons_json, submitted_at, submitted_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'clm-syn-1',
      orgId,
      'enc-syn-1',
      'pat-syn-1',
      'CLM-SYN-2026-8841',
      '837P',
      'Medicare Part B (Synthetic)',
      485.0,
      null,
      'BLOCKED',
      JSON.stringify(['Global Surgery Modifier 25 missing on 99214', 'Pending coder approval', 'Eligibility not verified via clearinghouse']),
      null,
      null,
      now,
    );
    db.prepare(`
      INSERT INTO claims (id, organization_id, encounter_id, patient_id, claim_number, claim_type, payer_name, total_charge_amount, paid_amount, readiness_status, blocking_reasons_json, submitted_at, submitted_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'clm-syn-3',
      orgId,
      'enc-syn-3',
      'pat-syn-3',
      'CLM-SYN-2026-8862',
      '837I',
      'Aetna Choice POS (Synthetic)',
      18420.0,
      15210.0,
      'READY_FOR_SUBMISSION',
      JSON.stringify([]),
      null,
      null,
      now,
    );

    // AI Model Configurations (modular provider-independent registry)
    const insertAi = db.prepare(`
      INSERT INTO ai_model_configs (
        id, organization_id, display_name, provider_type, model_name, api_url,
        api_key_encrypted, timeout_ms, max_tokens, is_active, approved_for_phi,
        baa_status, last_health_status, last_health_message, last_health_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAi.run(
      'ai-gemini-default',
      orgId,
      'Google Gemini Clinical Extraction (Development)',
      'gemini',
      'gemini-4-hydrogen',
      'https://generativelanguage.googleapis.com',
      '',
      35000,
      8192,
      1,
      0,
      'NOT_APPLICABLE_SYNTHETIC',
      process.env.GEMINI_API_KEY ? 'HEALTHY' : 'UNCONFIGURED',
      process.env.GEMINI_API_KEY ? 'Server-side GEMINI_API_KEY detected in environment.' : 'Set GEMINI_API_KEY in server environment secrets.',
      now,
    );
    insertAi.run(
      'ai-lingsante-primary',
      orgId,
      'LingSante-3.1-air-VL (Primary Medical VLM)',
      'lingsante',
      'inclusionAI/LingSante-3.1-air-VL',
      process.env.LINGSANTE_API_URL || '',
      '',
      45000,
      8192,
      0,
      0,
      'REQUIRES_BAA',
      process.env.LINGSANTE_API_URL && process.env.LINGSANTE_API_KEY ? 'HEALTHY' : 'UNCONFIGURED',
      'Configure authenticated backend LINGSANTE_API_URL and LINGSANTE_API_KEY to route inference to LingSante-3.1-air-VL.',
      null,
    );
    insertAi.run(
      'ai-hf-medical',
      orgId,
      'Hugging Face Medical Inference Endpoint',
      'huggingface',
      'aaditya/Llama3-OpenBioLLM-70B',
      '',
      '',
      45000,
      4096,
      0,
      0,
      'REQUIRES_BAA',
      'UNCONFIGURED',
      'Requires dedicated HIPAA-eligible Hugging Face Inference Endpoint URL and server-side token.',
      null,
    );
    insertAi.run(
      'ai-custom-openai',
      orgId,
      'Private VPC OpenAI-Compatible Medical LLM',
      'openai_compatible',
      'med-coding-finetune-v1',
      process.env.OPENAI_COMPATIBLE_API_URL || '',
      '',
      30000,
      4096,
      0,
      1,
      'BAA_EXECUTED',
      'UNCONFIGURED',
      'Point to self-hosted vLLM/TGI inside private HIPAA VPC.',
      null,
    );

    // Integration Configurations (NEVER shown as connected until verified!)
    const insertInt = db.prepare(`
      INSERT INTO integration_configs (
        id, organization_id, vendor_name, integration_type, endpoint_url,
        auth_method, connection_status, permissions_scope, last_sync_at, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertInt.run('int-epic', orgId, 'Epic Systems (SMART on FHIR R4)', 'EHR_FHIR_R4', '', 'OAuth 2.0 Backend Services (JWT)', 'CONFIGURATION_REQUIRED', 'Patient.read, Encounter.read, DocumentReference.read, Condition.read', null, 'Client ID and private JWKS key not configured.');
    insertInt.run('int-cerner', orgId, 'Oracle Health / Cerner Millennium FHIR', 'EHR_FHIR_R4', '', 'OAuth 2.0 SMART Backend', 'CONFIGURATION_REQUIRED', 'system/Patient.read, system/DocumentReference.read', null, 'Tenant FHIR endpoint URL and client credentials required.');
    insertInt.run('int-allscripts', orgId, 'Allscripts / Altera TouchWorks', 'CUSTOM_REST', '', 'Unity API Token + App Secret', 'DISCONNECTED', 'GetPatient, GetClinicalSummary', null, null);
    insertInt.run('int-athena', orgId, 'athenahealth Clinicals & Collector', 'CUSTOM_REST', '', 'OAuth 2.0 Client Credentials', 'CONFIGURATION_REQUIRED', 'patients:read, encounters:read, claims:write', null, 'Practice ID and OAuth credentials required.');
    insertInt.run('int-nextech', orgId, 'Nextech Select / IntelleChartPRO', 'EHR_FHIR_R4', '', 'FHIR R4 OAuth 2.0', 'DISCONNECTED', 'Patient.read, Encounter.read', null, null);
    insertInt.run('int-clearinghouse', orgId, 'EDI Clearinghouse (X12 270/271 & 837)', 'CLEARINGHOUSE_X12', process.env.CLEARINGHOUSE_API_URL || '', 'mTLS + OAuth 2.0', 'CONFIGURATION_REQUIRED', 'x12_270_eligibility, x12_271_response, x12_837_claim_status', null, 'Clearinghouse API credentials (CLEARINGHOUSE_CLIENT_ID / SECRET) not configured.');

    // Initial Audit Log entries
    db.prepare(`
      INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, resource_type, resource_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('aud-1', orgId, demoUserId, 'director@meridian-synthetic.example', 'SANDBOX_INITIALIZED', 'organization', orgId, 'Initialized clearly labeled synthetic development sandbox dataset.', '127.0.0.1', now);
    db.prepare(`
      INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, resource_type, resource_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('aud-2', orgId, demoUserId, 'director@meridian-synthetic.example', 'CODING_APPROVED', 'encounter', 'enc-syn-3', 'Approved 4 coding recommendations for synthetic encounter ENC-2026-8862.', '127.0.0.1', now);
  }
}

seedReferenceAndSyntheticData();
