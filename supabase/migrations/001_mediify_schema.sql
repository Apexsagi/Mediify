-- MEDIIFY Production PostgreSQL + pgvector Schema (Supabase Compatible)
-- Includes organization-level Row-Level Security (RLS), foreign keys, and vector embeddings for RAG coding guidelines.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  npi CHAR(10) NOT NULL,
  tax_id TEXT NOT NULL,
  specialty TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 2555,
  baa_attested BOOLEAN NOT NULL DEFAULT FALSE,
  synthetic_mode BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles_permissions (
  role TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES roles_permissions(role),
  credentials TEXT NOT NULL DEFAULT '',
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  npi CHAR(10) NOT NULL,
  full_name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  credential TEXT NOT NULL,
  network_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mrn TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE NOT NULL,
  sex CHAR(1) NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, mrn)
);

CREATE TABLE encounters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  encounter_number TEXT NOT NULL,
  date_of_service DATE NOT NULL,
  encounter_type TEXT NOT NULL,
  place_of_service TEXT NOT NULL DEFAULT '11',
  chief_complaint TEXT NOT NULL,
  coding_status TEXT NOT NULL DEFAULT 'NEEDS_CODING_REVIEW',
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE medical_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_bucket_path TEXT NOT NULL DEFAULT '',
  page_count INTEGER NOT NULL DEFAULT 1,
  ocr_status TEXT NOT NULL DEFAULT 'COMPLETED',
  raw_text TEXT NOT NULL,
  prompt_injection_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE extracted_clinical_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  medical_record_id UUID NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_text TEXT NOT NULL,
  normalized_concept TEXT NOT NULL,
  certainty TEXT NOT NULL,
  laterality TEXT NOT NULL DEFAULT 'NONE',
  anatomical_site TEXT NOT NULL DEFAULT '',
  page_number INTEGER NOT NULL DEFAULT 1,
  evidence_snippet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE insurance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  priority TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  payer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  group_number TEXT NOT NULL DEFAULT '',
  plan_name TEXT NOT NULL,
  effective_date DATE NOT NULL,
  termination_date DATE,
  provenance TEXT NOT NULL DEFAULT 'EXTRACTED_FROM_DOCUMENT',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE eligibility_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  insurance_policy_id UUID NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  verification_source TEXT NOT NULL,
  clearinghouse_transaction_id TEXT,
  x12_270_payload TEXT,
  x12_271_status TEXT NOT NULL,
  copay_amount NUMERIC(10,2),
  deductible_remaining NUMERIC(10,2),
  coinsurance_percent NUMERIC(5,2),
  prior_auth_required BOOLEAN NOT NULL DEFAULT FALSE,
  referral_required BOOLEAN NOT NULL DEFAULT FALSE,
  network_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  limitations_notes TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE icd_codes (
  code TEXT PRIMARY KEY,
  code_system TEXT NOT NULL CHECK (code_system IN ('ICD-10-CM', 'ICD-10-PCS')),
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  requires_laterality BOOLEAN NOT NULL DEFAULT FALSE,
  sex_restriction CHAR(1),
  age_min INTEGER,
  age_max INTEGER,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  embedding vector(1536)
);

CREATE TABLE cpt_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  mue_limit INTEGER,
  global_days INTEGER,
  prior_auth_typical BOOLEAN NOT NULL DEFAULT FALSE,
  license_notice TEXT NOT NULL DEFAULT 'AMA CPT license required for commercial use',
  embedding vector(1536)
);

CREATE TABLE hcpcs_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  mue_limit INTEGER,
  prior_auth_typical BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE modifiers (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  policy_reference TEXT NOT NULL
);

CREATE TABLE coding_guidelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_system TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  effective_year INTEGER NOT NULL,
  embedding vector(1536)
);

CREATE TABLE payer_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_code TEXT NOT NULL,
  policy_type TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  title TEXT NOT NULL,
  procedure_codes TEXT[] NOT NULL,
  covered_icd10_codes TEXT[] NOT NULL,
  documentation_requirements TEXT NOT NULL,
  timely_filing_days INTEGER NOT NULL DEFAULT 90,
  prior_auth_required BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE coding_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
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
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  ai_provider TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coding_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  rule_category TEXT NOT NULL,
  severity TEXT NOT NULL,
  code_involved TEXT NOT NULL,
  message TEXT NOT NULL,
  policy_reference TEXT NOT NULL,
  remediation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE denial_risks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  risk_category TEXT NOT NULL,
  severity TEXT NOT NULL,
  supporting_evidence TEXT NOT NULL,
  applicable_policy TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  claim_number TEXT NOT NULL,
  claim_type TEXT NOT NULL DEFAULT '837P',
  payer_name TEXT NOT NULL,
  total_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2),
  readiness_status TEXT NOT NULL DEFAULT 'BLOCKED',
  blocking_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coding_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES coding_recommendations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_code TEXT,
  new_code TEXT,
  notes TEXT NOT NULL DEFAULT '',
  actor_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  details TEXT NOT NULL,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_model_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  api_url TEXT NOT NULL DEFAULT '',
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  approved_for_phi BOOLEAN NOT NULL DEFAULT FALSE,
  baa_status TEXT NOT NULL DEFAULT 'REQUIRES_BAA',
  last_health_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_health_message TEXT NOT NULL DEFAULT '',
  last_health_checked_at TIMESTAMPTZ
);

CREATE TABLE integration_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  endpoint_url TEXT NOT NULL DEFAULT '',
  auth_method TEXT NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
  permissions_scope TEXT NOT NULL DEFAULT '',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT
);

-- Enable Row-Level Security for organization-level tenant isolation
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_clinical_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE denial_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_patients ON patients
  USING (organization_id IN (SELECT organization_id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY org_isolation_encounters ON encounters
  USING (organization_id IN (SELECT organization_id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY org_isolation_records ON medical_records
  USING (organization_id IN (SELECT organization_id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY org_isolation_audit ON audit_logs
  USING (organization_id IN (SELECT organization_id FROM users WHERE auth_user_id = auth.uid()));
