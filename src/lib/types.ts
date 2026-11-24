export type UserRole =
  | 'admin'
  | 'coding_director'
  | 'medical_coder'
  | 'auditor'
  | 'physician'
  | 'rcm_analyst';

export type CertaintyStatus =
  | 'confirmed'
  | 'suspected'
  | 'historical'
  | 'negated'
  | 'incomplete';

export type CodeSystem = 'ICD-10-CM' | 'ICD-10-PCS' | 'CPT' | 'HCPCS' | 'MODIFIER';

export type ValidationStatus = 'PASSED' | 'WARNING' | 'FAILED' | 'NEEDS_REVIEW' | 'UNABLE_TO_VALIDATE';

export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ApprovalAction = 'PENDING' | 'APPROVED' | 'MODIFIED' | 'REJECTED' | 'ESCALATED';

export type InsuranceProvenance =
  | 'VERIFIED_CLEARINGHOUSE'
  | 'EXTRACTED_FROM_DOCUMENT'
  | 'MANUALLY_ENTERED';

export type AIProviderType =
  | 'gemini'
  | 'lingsante'
  | 'huggingface'
  | 'openai_compatible';

export type DenialRiskCategory =
  | 'MISSING_INVALID_MODIFIER'
  | 'MISSING_PRIOR_AUTHORIZATION'
  | 'MEDICAL_NECESSITY_FAILURE'
  | 'NCCI_BUNDLING_CONFLICT'
  | 'INACTIVE_TERMINATED_INSURANCE'
  | 'UNVERIFIED_ELIGIBILITY'
  | 'INCOMPLETE_CLINICAL_DOCUMENTATION'
  | 'LACK_OF_DIAGNOSIS_SPECIFICITY'
  | 'DUPLICATE_BILLING'
  | 'TIMELY_FILING_RISK'
  | 'MUE_UNIT_EXCEEDED'
  | 'OUT_OF_NETWORK_RISK'
  | 'MISSING_REFERENCE_DATASET';

export interface Organization {
  id: string;
  name: string;
  npi: string;
  tax_id: string;
  specialty: string;
  retention_days: number;
  baa_attested: number | boolean;
  synthetic_mode: number | boolean;
  onboarding_completed: number | boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  credentials: string;
  mfa_enabled: number | boolean;
  is_active: number | boolean;
  created_at: string;
}

export interface Patient {
  id: string;
  organization_id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  dob: string;
  sex: 'M' | 'F' | 'U';
  city: string;
  state: string;
  is_synthetic: number | boolean;
  created_at: string;
}

export interface Provider {
  id: string;
  organization_id: string;
  npi: string;
  full_name: string;
  specialty: string;
  credential: string;
  network_status: 'IN_NETWORK' | 'OUT_OF_NETWORK' | 'UNVERIFIED';
}

export interface Encounter {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string;
  encounter_number: string;
  date_of_service: string;
  encounter_type: 'Outpatient' | 'Inpatient' | 'Emergency' | 'Operative' | 'Telehealth';
  place_of_service: string;
  specialty?: string;
  chief_complaint: string;
  coding_status: 'PENDING_EXTRACTION' | 'NEEDS_CODING_REVIEW' | 'APPROVED' | 'ESCALATED' | 'CLAIM_READY';
  assigned_coder_id?: string | null;
  assigned_reviewer_id?: string | null;
  draft_notes?: string;
  draft_updated_at?: string | null;
  is_synthetic: number | boolean;
  created_at: string;
  patient_name?: string;
  patient_mrn?: string;
  patient_dob?: string;
  patient_sex?: 'M' | 'F' | 'U';
  provider_name?: string;
  provider_npi?: string;
}

export interface MedicalRecord {
  id: string;
  organization_id: string;
  patient_id: string;
  encounter_id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  storage_bucket_path?: string;
  file_size_bytes?: number;
  file_sha256?: string;
  page_count: number;
  ocr_status: 'PENDING' | 'COMPLETED' | 'FAILED';
  ocr_error?: string | null;
  raw_text: string;
  prompt_injection_flagged: number | boolean;
  uploaded_by: string | null;
  created_at: string;
}

export interface ExtractedEntity {
  id: string;
  organization_id: string;
  encounter_id: string;
  medical_record_id: string;
  entity_type: 'diagnosis' | 'procedure' | 'symptom' | 'anatomy' | 'medication' | 'insurance' | 'provider';
  entity_text: string;
  normalized_concept: string;
  certainty: CertaintyStatus;
  laterality: 'LEFT' | 'RIGHT' | 'BILATERAL' | 'NONE' | 'UNSPECIFIED';
  anatomical_site: string;
  page_number: number;
  evidence_snippet: string;
  created_at: string;
}

export interface InsurancePolicy {
  id: string;
  organization_id: string;
  patient_id: string;
  priority: 'PRIMARY' | 'SECONDARY';
  payer_name: string;
  payer_id: string;
  member_id: string;
  group_number: string;
  plan_name: string;
  effective_date: string;
  termination_date: string | null;
  provenance: InsuranceProvenance;
  is_active: number | boolean;
}

export interface EligibilityVerification {
  id: string;
  organization_id: string;
  patient_id: string;
  insurance_policy_id: string;
  verification_source: InsuranceProvenance;
  clearinghouse_transaction_id: string | null;
  x12_270_payload: string | null;
  x12_271_status: 'VERIFIED_ACTIVE' | 'VERIFIED_INACTIVE' | 'NOT_VERIFIED_REQUIRES_CLEARINGHOUSE' | 'ERROR';
  copay_amount: number | null;
  deductible_remaining: number | null;
  coinsurance_percent: number | null;
  prior_auth_required: number | boolean;
  referral_required: number | boolean;
  network_status: 'IN_NETWORK' | 'OUT_OF_NETWORK' | 'UNVERIFIED';
  limitations_notes: string;
  verified_at: string | null;
  created_at: string;
}

export interface ReferenceCode {
  code: string;
  code_system: CodeSystem;
  description: string;
  category: string;
  effective_date: string;
  expiration_date: string | null;
  requires_laterality: number | boolean;
  valid_laterality: string | null;
  age_min: number | null;
  age_max: number | null;
  sex_restriction: 'M' | 'F' | null;
  mue_limit: number | null;
  global_days: number | null;
  prior_auth_typical: number | boolean;
  is_billable: number | boolean;
  guideline_reference: string;
  license_notice: string | null;
  source_dataset?: string;
}

export interface NcciEditRule {
  id: string;
  column1_code: string;
  column2_code: string;
  modifier_indicator: '0' | '1' | '9';
  rationale: string;
  effective_date: string;
  expiration_date?: string | null;
}

export interface PayerPolicyRule {
  id: string;
  policy_code: string;
  policy_type: 'LCD' | 'NCD' | 'PAYER_POLICY';
  payer_name: string;
  title: string;
  procedure_codes: string[];
  covered_icd10_codes: string[];
  documentation_requirements: string;
  timely_filing_days: number;
  prior_auth_required: number | boolean;
  effective_date?: string;
  expiration_date?: string | null;
}

export interface CodingRecommendation {
  id: string;
  organization_id: string;
  encounter_id: string;
  code: string;
  code_system: CodeSystem;
  description: string;
  diagnosis_role: 'PRIMARY' | 'SECONDARY' | 'PROCEDURE' | 'MODIFIER';
  diagnosis_pointers: string;
  units: number;
  modifiers: string;
  supporting_evidence: string;
  source_document: string;
  page_reference: number;
  coding_rationale: string;
  guideline_citation: string;
  documentation_completeness: 'COMPLETE' | 'PARTIAL' | 'MISSING_SPECIFICITY';
  validation_status: ValidationStatus;
  compliance_risk: string;
  requires_human_review: number | boolean;
  approval_status: ApprovalAction;
  approved_by: string | null;
  approved_at: string | null;
  ai_provider: string;
  ai_draft_payload?: {
    code: string;
    modifiers: string;
    units: number;
    diagnosis_pointers: string;
    coding_rationale: string;
  } | null;
  created_at: string;
  updated_at?: string;
}

export interface CodingValidationResult {
  id?: string;
  encounter_id: string;
  rule_category:
    | 'NCCI_PTP'
    | 'MUE'
    | 'LCD_NCD_MEDICAL_NECESSITY'
    | 'MODIFIER_COMPATIBILITY'
    | 'LATERALITY'
    | 'DUPLICATE_PROCEDURE'
    | 'AGE_GENDER_RESTRICTION'
    | 'GLOBAL_SURGERY'
    | 'CODE_EFFECTIVE_DATE'
    | 'CATALOG_VERIFICATION'
    | 'MISSING_REFERENCE_DATASET';
  severity: 'ERROR' | 'WARNING' | 'PASS';
  code_involved: string;
  message: string;
  policy_reference: string;
  remediation: string;
}

export interface DenialRiskItem {
  id?: string;
  encounter_id: string;
  risk_category: DenialRiskCategory | string;
  severity: RiskSeverity;
  supporting_evidence: string;
  applicable_policy: string;
  source_reference?: string;
  recommended_action: string;
  review_status: 'OPEN' | 'MITIGATED' | 'DISMISSED';
  reviewer_user_id?: string | null;
  reviewer_email?: string | null;
  resolved_at?: string | null;
}

export interface RevenueIntegrityFinding {
  id?: string;
  encounter_id: string;
  finding_type: 'MISSED_BILLABLE_DOCUMENTED' | 'UNDERCODING' | 'OVERCODING_RISK' | 'DOCUMENTATION_GAP' | 'DUPLICATE_CHARGE';
  code_involved: string;
  summary: string;
  clinical_evidence: string;
  compliance_note: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'ADDRESSED' | 'NOT_APPLICABLE';
}

export interface AIModelConfig {
  id: string;
  organization_id: string;
  display_name: string;
  provider_type: AIProviderType;
  model_name: string;
  api_url: string;
  has_credentials: number | boolean;
  timeout_ms: number;
  max_tokens: number;
  is_active: number | boolean;
  approved_for_phi: number | boolean;
  baa_status: 'NOT_APPLICABLE_SYNTHETIC' | 'BAA_EXECUTED' | 'REQUIRES_BAA';
  last_health_status: 'HEALTHY' | 'UNCONFIGURED' | 'UNREACHABLE' | 'UNKNOWN';
  last_health_message: string;
  last_health_checked_at: string | null;
  latency_ms?: number | null;
  error_count?: number;
  last_error?: string | null;
}

export interface IntegrationConfig {
  id: string;
  organization_id: string;
  vendor_name: string;
  integration_type: 'EHR_FHIR_R4' | 'CLEARINGHOUSE_X12' | 'OCR_SERVICE' | 'CUSTOM_REST';
  endpoint_url: string;
  auth_method: string;
  connection_status: 'DISCONNECTED' | 'CONFIGURATION_REQUIRED' | 'VERIFIED_CONNECTED' | 'ERROR';
  permissions_scope: string;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface ReferenceDatasetImportRecord {
  id: string;
  dataset_type: 'ICD-10-CM' | 'ICD-10-PCS' | 'CPT' | 'HCPCS' | 'MODIFIER' | 'NCCI_PTP' | 'LCD_NCD';
  version_label: string;
  source_name: string;
  file_name: string;
  records_imported: number;
  effective_date: string;
  ama_license_attested: boolean;
  imported_by_email: string;
  status: string;
  notes: string;
  created_at: string;
}

export interface CodingAnnotation {
  id: string;
  organization_id: string;
  encounter_id: string;
  medical_record_id: string | null;
  page_number: number;
  anchor_snippet: string;
  annotation_type: 'EVIDENCE_NOTE' | 'DEFICIENCY_ALERT' | 'PHYSICIAN_QUERY' | 'AUDITOR_FLAG';
  content: string;
  author_user_id: string;
  author_email: string;
  resolved: boolean;
  created_at: string;
}

export interface CodingRecommendationVersion {
  id: string;
  recommendation_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_reason: string;
  changed_by_email: string;
  created_at: string;
}

export interface AIProcessingJob {
  id: string;
  encounter_id: string;
  medical_record_id: string | null;
  job_type: 'OCR_AND_CLASSIFY' | 'CLINICAL_EXTRACTION_CODING';
  status: 'QUEUED' | 'OCR_PROCESSING' | 'CLINICAL_EXTRACTION' | 'RULE_VALIDATION' | 'COMPLETED' | 'FAILED';
  attempts: number;
  latency_ms: number | null;
  error_message: string | null;
  result_summary: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface WorkspaceNotification {
  id: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  resource_type: string | null;
  resource_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
