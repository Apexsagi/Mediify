import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgeAtDate,
  checkReferenceDatasetAvailability,
  evaluateDenialRisks,
  evaluateRevenueIntegrity,
  runDeterministicCodingValidation,
} from './codingValidator';
import type {
  CodingRecommendation,
  EligibilityVerification,
  Encounter,
  ExtractedEntity,
  NcciEditRule,
  Patient,
  PayerPolicyRule,
  ReferenceCode,
} from './types';

const basePatient: Patient = {
  id: 'pat-1',
  organization_id: 'org-1',
  mrn: 'MRN-1001',
  first_name: 'Elena',
  last_name: 'Vance',
  dob: '1964-05-12',
  sex: 'F',
  city: 'Boston',
  state: 'MA',
  is_synthetic: false,
  created_at: '2026-10-01T00:00:00Z',
};

const baseEncounter: Encounter = {
  id: 'enc-1',
  organization_id: 'org-1',
  patient_id: 'pat-1',
  provider_id: 'prov-1',
  encounter_number: 'ENC-2026-001',
  date_of_service: '2026-10-15',
  encounter_type: 'Outpatient',
  place_of_service: '11',
  chief_complaint: 'Right knee pain and effusion',
  coding_status: 'NEEDS_CODING_REVIEW',
  is_synthetic: false,
  created_at: '2026-10-15T10:00:00Z',
};

const sampleCatalog: ReferenceCode[] = [
  {
    code: '99214',
    code_system: 'CPT',
    description: 'Established patient office visit, moderate MDM (30-39 min)',
    category: 'E/M',
    effective_date: '2021-01-01',
    expiration_date: null,
    requires_laterality: 0,
    valid_laterality: null,
    age_min: null,
    age_max: null,
    sex_restriction: null,
    mue_limit: 1,
    global_days: null,
    prior_auth_typical: 0,
    is_billable: 1,
    guideline_reference: 'AMA CPT E/M 2021+',
    license_notice: 'CPT copyright AMA',
  },
  {
    code: '20610',
    code_system: 'CPT',
    description: 'Arthrocentesis, aspiration and/or injection, major joint or bursa',
    category: 'Musculoskeletal',
    effective_date: '2015-01-01',
    expiration_date: null,
    requires_laterality: 1,
    valid_laterality: 'LT,RT,50',
    age_min: null,
    age_max: null,
    sex_restriction: null,
    mue_limit: 2,
    global_days: 0,
    prior_auth_typical: 0,
    is_billable: 1,
    guideline_reference: 'CPT Musculoskeletal',
    license_notice: 'CPT copyright AMA',
  },
  {
    code: '76942',
    code_system: 'CPT',
    description: 'Ultrasonic guidance for needle placement, imaging supervision and interpretation',
    category: 'Radiology',
    effective_date: '2015-01-01',
    expiration_date: null,
    requires_laterality: 0,
    valid_laterality: null,
    age_min: null,
    age_max: null,
    sex_restriction: null,
    mue_limit: 2,
    global_days: null,
    prior_auth_typical: 0,
    is_billable: 1,
    guideline_reference: 'CMS NCCI Radiology',
    license_notice: 'CPT copyright AMA',
  },
  {
    code: 'M17.11',
    code_system: 'ICD-10-CM',
    description: 'Unilateral primary osteoarthritis, right knee',
    category: 'Musculoskeletal',
    effective_date: '2015-10-01',
    expiration_date: null,
    requires_laterality: 1,
    valid_laterality: 'RIGHT',
    age_min: null,
    age_max: null,
    sex_restriction: null,
    mue_limit: null,
    global_days: null,
    prior_auth_typical: 0,
    is_billable: 1,
    guideline_reference: 'ICD-10-CM Ch. 13',
    license_notice: null,
  },
];

const ncciRules: NcciEditRule[] = [
  {
    id: 'ncci-1',
    column1_code: '20610',
    column2_code: '76942',
    modifier_indicator: '1',
    rationale: 'Ultrasound guidance is bundled when performed with major joint injection unless distinct anatomic site.',
    effective_date: '2024-01-01',
  },
];

const policies: PayerPolicyRule[] = [
  {
    id: 'pol-1',
    policy_code: 'L35038',
    policy_type: 'LCD',
    payer_name: 'Medicare Part B',
    title: 'Major Joint Injections',
    procedure_codes: ['20610'],
    covered_icd10_codes: ['M17.11', 'M17.12'],
    documentation_requirements: 'Document conservative therapy failure and joint laterality.',
    timely_filing_days: 365,
    prior_auth_required: 0,
  },
];

function makeRec(partial: Partial<CodingRecommendation>): CodingRecommendation {
  return {
    id: 'rec-test',
    organization_id: 'org-1',
    encounter_id: 'enc-1',
    code: '99214',
    code_system: 'CPT',
    description: 'Test',
    diagnosis_role: 'PROCEDURE',
    diagnosis_pointers: 'A',
    units: 1,
    modifiers: '',
    supporting_evidence: 'Clinical note excerpt',
    source_document: 'Progress Note',
    page_reference: 1,
    coding_rationale: 'Rationale',
    guideline_citation: 'Guideline',
    documentation_completeness: 'COMPLETE',
    validation_status: 'NEEDS_REVIEW',
    compliance_risk: '',
    requires_human_review: 1,
    approval_status: 'PENDING',
    approved_by: null,
    approved_at: null,
    ai_provider: 'gemini',
    created_at: '2026-10-15T10:00:00Z',
    ...partial,
  };
}

test('calculateAgeAtDate computes exact age on DOS', () => {
  assert.equal(calculateAgeAtDate('1964-05-12', '2026-10-15'), 62);
  assert.equal(calculateAgeAtDate('1964-12-12', '2026-10-15'), 61);
});

test('checkReferenceDatasetAvailability blocks validation with MISSING_REFERENCE_DATASET when catalogs are empty', () => {
  const recs: CodingRecommendation[] = [
    makeRec({ code: 'M17.11', code_system: 'ICD-10-CM', diagnosis_role: 'PRIMARY' }),
    makeRec({ code: '99214', code_system: 'CPT' }),
    makeRec({ code: '20610', code_system: 'CPT' }),
  ];

  const missing = checkReferenceDatasetAvailability({
    recommendations: recs,
    catalog: [],
    ncciRules: [],
  });

  assert.ok(missing.some((m) => m.rule_category === 'MISSING_REFERENCE_DATASET' && m.code_involved === 'ICD-10'));
  assert.ok(missing.some((m) => m.rule_category === 'MISSING_REFERENCE_DATASET' && m.code_involved === 'CPT'));
  assert.ok(missing.some((m) => m.rule_category === 'MISSING_REFERENCE_DATASET' && m.code_involved === 'NCCI_PTP'));
});

test('deterministic validator catches NCCI bundling, missing modifier 25, MUE overage, and maps V2 denial categories', () => {
  const recs: CodingRecommendation[] = [
    makeRec({ code: 'M17.11', code_system: 'ICD-10-CM', diagnosis_role: 'PRIMARY' }),
    makeRec({ code: '99214', code_system: 'CPT', modifiers: '' }), // missing mod 25 alongside 20610
    makeRec({ code: '20610', code_system: 'CPT', modifiers: 'RT', units: 4 }), // MUE limit 2
    makeRec({ code: '76942', code_system: 'CPT', modifiers: '' }), // bundled with 20610
  ];

  const validations = runDeterministicCodingValidation({
    encounter: baseEncounter,
    patient: basePatient,
    recommendations: recs,
    entities: [],
    catalog: sampleCatalog,
    ncciRules,
    payerPolicies: policies,
  });

  assert.ok(validations.some((v) => v.rule_category === 'MUE' && v.severity === 'ERROR'));
  assert.ok(validations.some((v) => v.rule_category === 'NCCI_PTP' && v.severity === 'ERROR'));
  assert.ok(validations.some((v) => v.rule_category === 'GLOBAL_SURGERY' && v.severity === 'ERROR'));
  assert.ok(validations.some((v) => v.rule_category === 'LCD_NCD_MEDICAL_NECESSITY' && v.severity === 'PASS'));

  const denialRisks = evaluateDenialRisks({
    encounter: baseEncounter,
    recommendations: recs,
    validations,
    payerPolicies: policies,
    catalog: sampleCatalog,
    latestEligibility: null,
    referenceDate: '2026-10-20',
  });
  assert.ok(denialRisks.some((d) => d.risk_category === 'UNVERIFIED_ELIGIBILITY'));
  assert.ok(denialRisks.some((d) => d.risk_category === 'NCCI_BUNDLING_CONFLICT' && d.severity === 'CRITICAL'));
  assert.ok(denialRisks.some((d) => d.risk_category === 'MUE_UNIT_EXCEEDED' && d.severity === 'HIGH'));
});

test('evaluateDenialRisks detects inactive coverage and out-of-network eligibility responses', () => {
  const inactiveEligibility: EligibilityVerification = {
    id: 'elig-1',
    organization_id: 'org-1',
    patient_id: 'pat-1',
    insurance_policy_id: 'pol-ins-1',
    verification_source: 'VERIFIED_CLEARINGHOUSE',
    x12_271_status: 'VERIFIED_INACTIVE',
    clearinghouse_transaction_id: 'X12-9988',
    x12_270_payload: null,
    network_status: 'OUT_OF_NETWORK',
    copay_amount: null,
    deductible_remaining: null,
    coinsurance_percent: null,
    prior_auth_required: true,
    referral_required: false,
    limitations_notes: 'Coverage terminated prior to DOS',
    verified_at: '2026-10-15T11:00:00Z',
    created_at: '2026-10-15T11:00:00Z',
  };

  const denialRisks = evaluateDenialRisks({
    encounter: baseEncounter,
    recommendations: [],
    validations: [],
    payerPolicies: policies,
    catalog: sampleCatalog,
    latestEligibility: inactiveEligibility,
    referenceDate: '2026-10-20',
  });

  assert.ok(denialRisks.some((d) => d.risk_category === 'INACTIVE_TERMINATED_INSURANCE' && d.severity === 'CRITICAL'));
  assert.ok(denialRisks.some((d) => d.risk_category === 'OUT_OF_NETWORK_RISK' && d.severity === 'HIGH'));
});

test('deterministic validator catches laterality conflicts and outpatient suspected diagnoses', () => {
  const entities: ExtractedEntity[] = [
    {
      id: 'ent-1',
      organization_id: 'org-1',
      encounter_id: 'enc-1',
      medical_record_id: 'doc-1',
      entity_type: 'procedure',
      entity_text: 'right knee injection',
      normalized_concept: 'arthrocentesis major joint',
      certainty: 'confirmed',
      laterality: 'RIGHT',
      anatomical_site: 'Right knee',
      evidence_snippet: 'Performed right knee injection under sterile prep',
      page_number: 1,
      created_at: '2026-10-15T10:00:00Z',
    },
    {
      id: 'ent-2',
      organization_id: 'org-1',
      encounter_id: 'enc-1',
      medical_record_id: 'doc-1',
      entity_type: 'diagnosis',
      entity_text: 'suspected osteoarthritis',
      normalized_concept: 'osteoarthritis',
      certainty: 'suspected',
      laterality: 'RIGHT',
      anatomical_site: 'Right knee',
      evidence_snippet: 'Rule out right knee osteoarthritis',
      page_number: 1,
      created_at: '2026-10-15T10:00:00Z',
    },
  ];

  const recs: CodingRecommendation[] = [
    makeRec({
      code: 'M17.11',
      code_system: 'ICD-10-CM',
      description: 'Unilateral primary osteoarthritis, right knee',
      diagnosis_role: 'PRIMARY',
      supporting_evidence: 'Rule out suspected osteoarthritis',
    }),
    makeRec({
      code: '20610',
      code_system: 'CPT',
      modifiers: 'LT', // Conflicts with RIGHT entity
      supporting_evidence: 'Performed right knee injection',
    }),
  ];

  const validations = runDeterministicCodingValidation({
    encounter: baseEncounter,
    patient: basePatient,
    recommendations: recs,
    entities,
    catalog: sampleCatalog,
    ncciRules,
    payerPolicies: policies,
  });

  assert.ok(validations.some((v) => v.rule_category === 'LATERALITY' && v.severity === 'ERROR'));
  assert.ok(validations.some((v) => v.policy_reference.includes('IV.H') && v.severity === 'ERROR'));
});

test('evaluateRevenueIntegrity identifies missed ECG documentation and clean coded encounter passes', () => {
  const recs: CodingRecommendation[] = [
    makeRec({ code: 'M17.11', code_system: 'ICD-10-CM', diagnosis_role: 'PRIMARY' }),
    makeRec({ code: '99214', code_system: 'CPT', modifiers: '25', units: 1 }),
    makeRec({ code: '20610', code_system: 'CPT', modifiers: 'RT', units: 1 }),
  ];

  const validations = runDeterministicCodingValidation({
    encounter: baseEncounter,
    patient: basePatient,
    recommendations: recs,
    entities: [],
    catalog: sampleCatalog,
    ncciRules,
    payerPolicies: policies,
  });

  assert.equal(validations.filter((v) => v.severity === 'ERROR').length, 0);

  const integrityFindings = evaluateRevenueIntegrity({
    encounter: baseEncounter,
    entities: [
      {
        id: 'ent-ecg',
        organization_id: 'org-1',
        encounter_id: 'enc-1',
        medical_record_id: 'doc-1',
        entity_type: 'procedure',
        entity_text: '12-lead ECG',
        normalized_concept: 'electrocardiogram',
        certainty: 'confirmed',
        laterality: 'NONE',
        anatomical_site: 'Cardiac',
        evidence_snippet: '12-lead ECG interpreted by attending physician: normal sinus rhythm.',
        page_number: 2,
        created_at: '2026-10-15T10:00:00Z',
      },
    ],
    recommendations: recs,
    validations,
  });

  assert.ok(integrityFindings.some((f) => f.finding_type === 'MISSED_BILLABLE_DOCUMENTED'));
});
