import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgeAtDate,
  evaluateDenialRisks,
  runDeterministicCodingValidation,
} from './codingValidator';
import type {
  CodingRecommendation,
  Encounter,
  NcciEditRule,
  Patient,
  PayerPolicyRule,
  ReferenceCode,
} from './types';

const basePatient: Patient = {
  id: 'pat-1',
  organization_id: 'org-1',
  mrn: 'SYN-1001',
  first_name: 'Elena',
  last_name: 'Vance',
  dob: '1964-05-12',
  sex: 'F',
  city: 'Boston',
  state: 'MA',
  is_synthetic: 1,
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
  is_synthetic: 1,
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
    id: 'rec-' + Math.random(),
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

test('deterministic validator catches NCCI bundling, missing modifier 25, and MUE overage', () => {
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
  assert.ok(denialRisks.some((d) => d.risk_category === 'UNVERIFIED_INSURANCE'));
  assert.ok(denialRisks.some((d) => d.risk_category === 'NCCI_PTP' && d.severity === 'CRITICAL'));
});

test('deterministic validator passes clean coded encounter with modifier 25 and RT', () => {
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
});
