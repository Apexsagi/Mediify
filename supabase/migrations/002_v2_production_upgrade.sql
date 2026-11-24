-- MEDIIFY V2 Production Upgrade Migration
-- Adds missing operational tables, security session/MFA tables, coding workspace versioning & annotations,
-- reference dataset import tracking, AI background jobs/telemetry, full RLS policies, private storage policies,
-- and production search/pagination indexes.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Harden defaults & extend existing tables safely
ALTER TABLE organizations
  ALTER COLUMN synthetic_mode SET DEFAULT FALSE;

ALTER TABLE patients
  ALTER COLUMN is_synthetic SET DEFAULT FALSE;

ALTER TABLE encounters
  ALTER COLUMN is_synthetic SET DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS specialty TEXT NOT NULL DEFAULT 'General Medicine',
  ADD COLUMN IF NOT EXISTS assigned_coder_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ocr_error TEXT;

ALTER TABLE coding_recommendations
  ADD COLUMN IF NOT EXISTS ai_draft_payload JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE denial_risks
  ADD COLUMN IF NOT EXISTS source_reference TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_email TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE ai_model_configs
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE coding_approvals
  ADD COLUMN IF NOT EXISTS actor_email TEXT NOT NULL DEFAULT '';

-- 2. Reference code master enhancements & NCCI / Revenue Integrity / Dataset Import tracking
ALTER TABLE icd_codes
  ADD COLUMN IF NOT EXISTS valid_laterality TEXT,
  ADD COLUMN IF NOT EXISTS guideline_reference TEXT NOT NULL DEFAULT 'ICD-10-CM/PCS Official Guidelines',
  ADD COLUMN IF NOT EXISTS source_dataset TEXT NOT NULL DEFAULT 'CMS';

ALTER TABLE cpt_codes
  ADD COLUMN IF NOT EXISTS requires_laterality BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS valid_laterality TEXT,
  ADD COLUMN IF NOT EXISTS guideline_reference TEXT NOT NULL DEFAULT 'AMA CPT Guidelines',
  ADD COLUMN IF NOT EXISTS source_dataset TEXT NOT NULL DEFAULT 'AMA_LICENSED';

ALTER TABLE hcpcs_codes
  ADD COLUMN IF NOT EXISTS requires_laterality BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS valid_laterality TEXT,
  ADD COLUMN IF NOT EXISTS guideline_reference TEXT NOT NULL DEFAULT 'CMS HCPCS Level II',
  ADD COLUMN IF NOT EXISTS source_dataset TEXT NOT NULL DEFAULT 'CMS';

ALTER TABLE modifiers
  ADD COLUMN IF NOT EXISTS effective_date DATE NOT NULL DEFAULT '2015-01-01',
  ADD COLUMN IF NOT EXISTS expiration_date DATE,
  ADD COLUMN IF NOT EXISTS source_dataset TEXT NOT NULL DEFAULT 'CMS_AMA';

ALTER TABLE payer_policies
  ADD COLUMN IF NOT EXISTS effective_date DATE NOT NULL DEFAULT '2024-01-01',
  ADD COLUMN IF NOT EXISTS expiration_date DATE,
  ADD COLUMN IF NOT EXISTS source_dataset TEXT NOT NULL DEFAULT 'CMS_MCD';

CREATE TABLE IF NOT EXISTS ncci_edit_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  column1_code TEXT NOT NULL,
  column2_code TEXT NOT NULL,
  modifier_indicator CHAR(1) NOT NULL CHECK (modifier_indicator IN ('0', '1', '9')),
  rationale TEXT NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  source_dataset TEXT NOT NULL DEFAULT 'CMS_NCCI',
  UNIQUE (column1_code, column2_code, effective_date)
);

CREATE TABLE IF NOT EXISTS revenue_integrity_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL,
  code_involved TEXT NOT NULL,
  summary TEXT NOT NULL,
  clinical_evidence TEXT NOT NULL,
  compliance_note TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reference_dataset_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  dataset_type TEXT NOT NULL CHECK (dataset_type IN ('ICD-10-CM', 'ICD-10-PCS', 'CPT', 'HCPCS', 'MODIFIER', 'NCCI_PTP', 'LCD_NCD')),
  version_label TEXT NOT NULL,
  source_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  records_imported INTEGER NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL,
  ama_license_attested BOOLEAN NOT NULL DEFAULT FALSE,
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  imported_by_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Security Sessions & MFA Recovery Codes
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_jti TEXT NOT NULL UNIQUE,
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Coding Workspace Annotations, Version History, AI Background Jobs & Notifications
CREATE TABLE IF NOT EXISTS coding_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  anchor_snippet TEXT NOT NULL DEFAULT '',
  annotation_type TEXT NOT NULL CHECK (annotation_type IN ('EVIDENCE_NOTE', 'DEFICIENCY_ALERT', 'PHYSICIAN_QUERY', 'AUDITOR_FLAG')),
  content TEXT NOT NULL,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  author_email TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coding_recommendation_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES coding_recommendations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_reason TEXT NOT NULL DEFAULT '',
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_processing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  model_config_id UUID REFERENCES ai_model_configs(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('OCR_AND_CLASSIFY', 'CLINICAL_EXTRACTION_CODING')),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'OCR_PROCESSING', 'CLINICAL_EXTRACTION', 'RULE_VALIDATION', 'COMPLETED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  error_message TEXT,
  result_summary JSONB,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Complete RLS helper & policies on ALL tenant-scoped tables
CREATE OR REPLACE FUNCTION current_mediify_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_organization_id', TRUE), '')::uuid,
    (SELECT organization_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
  );
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_integrity_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_recommendation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_dataset_imports ENABLE ROW LEVEL SECURITY;

-- Drop and recreate unified policies so every tenant table checks organization_id = current_mediify_org_id()
DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'providers',
    'patients',
    'encounters',
    'medical_records',
    'extracted_clinical_entities',
    'insurance_policies',
    'eligibility_verifications',
    'coding_recommendations',
    'coding_validations',
    'denial_risks',
    'revenue_integrity_findings',
    'claims',
    'coding_approvals',
    'audit_logs',
    'ai_model_configs',
    'integration_configs',
    'user_sessions',
    'coding_annotations',
    'coding_recommendation_versions',
    'ai_processing_jobs',
    'notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_%I ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY org_isolation_%I ON %I FOR ALL USING (organization_id = current_mediify_org_id()) WITH CHECK (organization_id = current_mediify_org_id())',
      tbl,
      tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS org_isolation_organizations ON organizations;
CREATE POLICY org_isolation_organizations ON organizations
  FOR ALL USING (id = current_mediify_org_id())
  WITH CHECK (id = current_mediify_org_id());

DROP POLICY IF EXISTS org_isolation_users ON users;
CREATE POLICY org_isolation_users ON users
  FOR ALL USING (organization_id = current_mediify_org_id())
  WITH CHECK (organization_id = current_mediify_org_id());

DROP POLICY IF EXISTS org_isolation_dataset_imports ON reference_dataset_imports;
CREATE POLICY org_isolation_dataset_imports ON reference_dataset_imports
  FOR SELECT USING (organization_id IS NULL OR organization_id = current_mediify_org_id());

DROP POLICY IF EXISTS user_isolation_recovery_codes ON mfa_recovery_codes;
CREATE POLICY user_isolation_recovery_codes ON mfa_recovery_codes
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE organization_id = current_mediify_org_id()));

-- 6. Private Medical Document Storage Bucket & RLS Policies (Supabase Storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-records',
  'medical-records',
  FALSE,
  26214400,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/json', 'text/csv']
)
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = 26214400;

DROP POLICY IF EXISTS org_private_medical_records_select ON storage.objects;
CREATE POLICY org_private_medical_records_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = current_mediify_org_id()::text
  );

DROP POLICY IF EXISTS org_private_medical_records_insert ON storage.objects;
CREATE POLICY org_private_medical_records_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = current_mediify_org_id()::text
  );

-- 7. Production Indexes for Pagination, Search & Dashboard Filters
CREATE INDEX IF NOT EXISTS idx_patients_org_created ON patients (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_mrn_trgm ON patients USING gin (mrn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm ON patients USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_encounters_org_dos ON encounters (organization_id, date_of_service DESC);
CREATE INDEX IF NOT EXISTS idx_encounters_org_status ON encounters (organization_id, coding_status);
CREATE INDEX IF NOT EXISTS idx_encounters_assigned_coder ON encounters (organization_id, assigned_coder_id);

CREATE INDEX IF NOT EXISTS idx_records_org_enc ON medical_records (organization_id, encounter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recs_org_enc ON coding_recommendations (organization_id, encounter_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_denials_org_status ON denial_risks (organization_id, review_status, severity);
CREATE INDEX IF NOT EXISTS idx_claims_org_readiness ON claims (organization_id, readiness_status);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_jti ON user_sessions (token_jti) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_jobs_org_status ON ai_processing_jobs (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_unread ON notifications (organization_id, is_read, created_at DESC);

-- 8. Seed authoritative RBAC role definitions (idempotent)
INSERT INTO roles_permissions (role, display_name, permissions) VALUES
  ('admin', 'Organization Administrator', '["*"]'::jsonb),
  ('coding_director', 'Director of Coding & RCM', '["coding:read", "coding:approve", "audit:read", "audit:signoff", "claims:release", "reports:read", "team:manage", "datasets:import"]'::jsonb),
  ('medical_coder', 'Certified Medical Coder (CPC/CCS)', '["coding:read", "coding:approve", "records:upload", "insurance:read", "denials:manage"]'::jsonb),
  ('auditor', 'Compliance & Coding Auditor', '["coding:read", "audit:read", "audit:signoff", "audit_logs:read", "qa:manage"]'::jsonb),
  ('physician', 'Attending Physician / CDI', '["records:read", "coding:read", "queries:respond"]'::jsonb),
  ('rcm_analyst', 'Revenue Cycle & Denial Analyst', '["claims:read", "denials:manage", "insurance:verify", "reports:read"]'::jsonb)
ON CONFLICT (role) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  permissions = EXCLUDED.permissions;
