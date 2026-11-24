import type {
  CodingRecommendation,
  CodingValidationResult,
  DenialRiskCategory,
  DenialRiskItem,
  EligibilityVerification,
  Encounter,
  ExtractedEntity,
  NcciEditRule,
  Patient,
  PayerPolicyRule,
  ReferenceCode,
  RevenueIntegrityFinding,
} from './types';

export interface DeterministicValidationInput {
  encounter: Encounter;
  patient: Patient;
  recommendations: CodingRecommendation[];
  entities: ExtractedEntity[];
  catalog: ReferenceCode[];
  ncciRules: NcciEditRule[];
  payerPolicies: PayerPolicyRule[];
  latestEligibility?: EligibilityVerification | null;
  referenceDate?: string;
}

export function calculateAgeAtDate(dob: string, dos: string): number | null {
  const birth = new Date(dob);
  const service = new Date(dos);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(service.getTime())) return null;
  let age = service.getUTCFullYear() - birth.getUTCFullYear();
  const m = service.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && service.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

function parseModifiers(modStr: string | undefined | null): string[] {
  if (!modStr) return [];
  return modStr
    .split(/[\s,;]+/)
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean);
}

export function checkReferenceDatasetAvailability(params: {
  recommendations: CodingRecommendation[];
  catalog: ReferenceCode[];
  ncciRules: NcciEditRule[];
}): CodingValidationResult[] {
  const missing: CodingValidationResult[] = [];
  const systemsNeeded = new Set(params.recommendations.map((r) => r.code_system));
  const encounterId = params.recommendations[0]?.encounter_id ?? 'check';

  const hasIcd = params.catalog.some((c) => c.code_system === 'ICD-10-CM' || c.code_system === 'ICD-10-PCS');
  const hasCpt = params.catalog.some((c) => c.code_system === 'CPT');
  const hasHcpcs = params.catalog.some((c) => c.code_system === 'HCPCS');

  if ((systemsNeeded.has('ICD-10-CM') || systemsNeeded.has('ICD-10-PCS')) && !hasIcd) {
    missing.push({
      encounter_id: encounterId,
      rule_category: 'MISSING_REFERENCE_DATASET',
      severity: 'ERROR',
      code_involved: 'ICD-10',
      message: 'Unable to validate ICD-10 diagnoses/procedures: authoritative ICD-10-CM/PCS dataset has not been imported.',
      policy_reference: 'MEDIIFY Authoritative Reference Data Requirement',
      remediation: 'Import CMS ICD-10-CM/PCS reference files via Coding Intelligence -> Dataset Import.',
    });
  }

  if (systemsNeeded.has('CPT') && !hasCpt) {
    missing.push({
      encounter_id: encounterId,
      rule_category: 'MISSING_REFERENCE_DATASET',
      severity: 'ERROR',
      code_involved: 'CPT',
      message: 'Unable to validate CPT procedures: licensed AMA CPT reference dataset is not imported.',
      policy_reference: 'AMA CPT Licensing & Reference Verification Policy',
      remediation: 'Attest commercial AMA CPT license and import authorized CPT dataset before releasing claims.',
    });
  }

  if (systemsNeeded.has('HCPCS') && !hasHcpcs) {
    missing.push({
      encounter_id: encounterId,
      rule_category: 'MISSING_REFERENCE_DATASET',
      severity: 'ERROR',
      code_involved: 'HCPCS',
      message: 'Unable to validate HCPCS Level II codes: authoritative CMS HCPCS dataset is not imported.',
      policy_reference: 'CMS HCPCS Level II Dataset Requirement',
      remediation: 'Import CMS HCPCS Level II dataset via Coding Intelligence -> Dataset Import.',
    });
  }

  if (params.recommendations.filter((r) => r.code_system === 'CPT' || r.code_system === 'HCPCS').length > 1 && params.ncciRules.length === 0) {
    missing.push({
      encounter_id: encounterId,
      rule_category: 'MISSING_REFERENCE_DATASET',
      severity: 'ERROR',
      code_involved: 'NCCI_PTP',
      message: 'Unable to evaluate NCCI Procedure-to-Procedure bundling: CMS NCCI PTP edit table is empty.',
      policy_reference: 'CMS NCCI PTP Edit Enforcement Policy',
      remediation: 'Import CMS NCCI PTP edits before releasing multi-procedure encounters.',
    });
  }

  return missing;
}

/**
 * Independent, deterministic coding rules engine.
 * Evaluates authoritative dataset presence, NCCI PTP edits, MUE unit limits,
 * LCD/NCD medical necessity, laterality, duplicate procedures, age/sex restrictions,
 * global surgery rules, modifier compatibility, and DOS effective dates.
 */
export function runDeterministicCodingValidation(
  input: DeterministicValidationInput,
): CodingValidationResult[] {
  const results: CodingValidationResult[] = [];
  const { encounter, patient, recommendations, entities, catalog, ncciRules, payerPolicies } = input;
  const activeRecs = recommendations.filter((r) => r.approval_status !== 'REJECTED');
  const dos = encounter.date_of_service;
  const ageAtDos = calculateAgeAtDate(patient.dob, dos);

  // 0. Mandatory Authoritative Dataset Check (blocks validation instead of faking PASS)
  const missingDatasets = checkReferenceDatasetAvailability({
    recommendations: activeRecs,
    catalog,
    ncciRules,
  });
  if (missingDatasets.length > 0) {
    results.push(...missingDatasets);
  }

  const catalogByCode = new Map<string, ReferenceCode>();
  for (const c of catalog) {
    catalogByCode.set(`${c.code_system}:${c.code.toUpperCase()}`, c);
    if (!catalogByCode.has(c.code.toUpperCase())) {
      catalogByCode.set(c.code.toUpperCase(), c);
    }
  }

  const diagnosisCodes = activeRecs.filter((r) => r.code_system === 'ICD-10-CM');
  const procedureRecs = activeRecs.filter(
    (r) => r.code_system === 'CPT' || r.code_system === 'HCPCS' || r.code_system === 'ICD-10-PCS',
  );

  // 1. Catalog verification, effective/expiration dates, MUE, age/gender, laterality
  for (const rec of activeRecs) {
    const ref =
      catalogByCode.get(`${rec.code_system}:${rec.code.toUpperCase()}`) ??
      catalogByCode.get(rec.code.toUpperCase());

    if (!ref) {
      results.push({
        encounter_id: encounter.id,
        rule_category: 'CATALOG_VERIFICATION',
        severity: 'ERROR',
        code_involved: rec.code,
        message: `Code ${rec.code} (${rec.code_system}) is not present in the authoritative reference database.`,
        policy_reference: 'MEDIIFY Authoritative Code Master',
        remediation: 'Import the authoritative dataset containing this code or select a verified code from the explorer.',
      });
      continue;
    }

    if (dos < ref.effective_date || (ref.expiration_date && dos > ref.expiration_date)) {
      results.push({
        encounter_id: encounter.id,
        rule_category: 'CODE_EFFECTIVE_DATE',
        severity: 'ERROR',
        code_involved: rec.code,
        message: `Code ${rec.code} is not active for Date of Service ${dos} (valid ${ref.effective_date} to ${ref.expiration_date ?? 'present'}).`,
        policy_reference: ref.guideline_reference,
        remediation: 'Select the code version active on the Date of Service.',
      });
    }

    if (ref.mue_limit !== null && rec.units > ref.mue_limit) {
      results.push({
        encounter_id: encounter.id,
        rule_category: 'MUE',
        severity: 'ERROR',
        code_involved: rec.code,
        message: `Billed units (${rec.units}) exceed CMS Medically Unlikely Edit (MUE) limit of ${ref.mue_limit} per DOS for ${rec.code}.`,
        policy_reference: 'CMS NCCI MUE Table',
        remediation: `Reduce units to <= ${ref.mue_limit} or verify anatomical distinctness if modifier applies.`,
      });
    }

    if (ageAtDos !== null) {
      if (ref.age_min !== null && ageAtDos < ref.age_min) {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'AGE_GENDER_RESTRICTION',
          severity: 'ERROR',
          code_involved: rec.code,
          message: `Patient age at DOS (${ageAtDos}) is below minimum age (${ref.age_min}) for ${rec.code}.`,
          policy_reference: ref.guideline_reference,
          remediation: 'Review patient DOB and age-appropriate code selection.',
        });
      }
      if (ref.age_max !== null && ageAtDos > ref.age_max) {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'AGE_GENDER_RESTRICTION',
          severity: 'ERROR',
          code_involved: rec.code,
          message: `Patient age at DOS (${ageAtDos}) exceeds maximum age (${ref.age_max}) for ${rec.code}.`,
          policy_reference: ref.guideline_reference,
          remediation: 'Select adult/age-appropriate alternative code.',
        });
      }
    }

    if (ref.sex_restriction && patient.sex !== 'U' && patient.sex !== ref.sex_restriction) {
      results.push({
        encounter_id: encounter.id,
        rule_category: 'AGE_GENDER_RESTRICTION',
        severity: 'ERROR',
        code_involved: rec.code,
        message: `Code ${rec.code} is restricted to sex '${ref.sex_restriction}', conflicting with patient sex '${patient.sex}'.`,
        policy_reference: ref.guideline_reference,
        remediation: 'Verify patient demographic sex or correct sex-specific code.',
      });
    }

    const mods = parseModifiers(rec.modifiers);
    const requiresLat = ref.requires_laterality === 1 || ref.requires_laterality === true;
    if (requiresLat) {
      const hasLateralityMod = mods.some((m) => m === 'LT' || m === 'RT' || m === '50');
      const codeUpper = rec.code.toUpperCase();
      const descLower = ref.description.toLowerCase();
      const isIcdLateralitySpecific =
        rec.code_system === 'ICD-10-CM' &&
        (descLower.includes('right') || descLower.includes('left') || descLower.includes('bilateral'));

      if (rec.code_system === 'ICD-10-CM' && descLower.includes('unspecified') && !isIcdLateralitySpecific) {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'LATERALITY',
          severity: 'WARNING',
          code_involved: codeUpper,
          message: `ICD-10-CM code ${codeUpper} lacks laterality specificity.`,
          policy_reference: 'ICD-10-CM Official Guidelines Section I.B.13',
          remediation: 'Query provider or extract documented laterality (Left/Right/Bilateral) for maximum specificity.',
        });
      }

      if ((rec.code_system === 'CPT' || rec.code_system === 'HCPCS') && !hasLateralityMod) {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'LATERALITY',
          severity: 'WARNING',
          code_involved: codeUpper,
          message: `Procedure ${codeUpper} typically requires an anatomical laterality modifier (LT, RT, or 50).`,
          policy_reference: 'CPT / CMS Anatomical Modifier Guidelines',
          remediation: 'Append LT, RT, or 50 matching operative/clinical laterality.',
        });
      }

      const matchingEntity = entities.find(
        (e) =>
          (e.laterality === 'LEFT' || e.laterality === 'RIGHT' || e.laterality === 'BILATERAL') &&
          (rec.supporting_evidence.toLowerCase().includes(e.entity_text.toLowerCase()) ||
            e.entity_text.toLowerCase().includes(rec.supporting_evidence.toLowerCase().slice(0, 12))),
      );
      if (matchingEntity) {
        if (
          (matchingEntity.laterality === 'LEFT' && (mods.includes('RT') || descLower.includes('right'))) ||
          (matchingEntity.laterality === 'RIGHT' && (mods.includes('LT') || descLower.includes('left')))
        ) {
          results.push({
            encounter_id: encounter.id,
            rule_category: 'LATERALITY',
            severity: 'ERROR',
            code_involved: codeUpper,
            message: `Laterality conflict: clinical documentation indicates ${matchingEntity.laterality}, but code/modifier reflects the opposite side.`,
            policy_reference: 'ICD-10-CM / CPT Laterality Integrity Rule',
            remediation: 'Align code and modifier with documented anatomical side.',
          });
        }
      }
    }
  }

  // 2. Duplicate Procedure Detection
  const seenProcs = new Map<string, CodingRecommendation>();
  for (const proc of procedureRecs) {
    const codeKey = proc.code.toUpperCase();
    const mods = parseModifiers(proc.modifiers);
    const existing = seenProcs.get(codeKey);
    if (existing) {
      const hasDistinctMod = mods.some((m) => ['59', '76', '77', 'XE', 'XS', 'XP', 'XU', 'LT', 'RT'].includes(m));
      results.push({
        encounter_id: encounter.id,
        rule_category: 'DUPLICATE_PROCEDURE',
        severity: hasDistinctMod ? 'WARNING' : 'ERROR',
        code_involved: codeKey,
        message: hasDistinctMod
          ? `Procedure ${codeKey} appears multiple times with repeat/distinct modifier (${mods.join(', ')}); ensure separate session/site documentation.`
          : `Duplicate procedure ${codeKey} billed on the same DOS without a distinct-service or repeat-procedure modifier.`,
        policy_reference: 'CMS Duplicate Claim Edit',
        remediation: 'Consolidate into units (if MUE permits) or append appropriate repeat/distinct modifier (76, 77, 59, XE, XS).',
      });
    } else {
      seenProcs.set(codeKey, proc);
    }
  }

  // 3. NCCI Procedure-to-Procedure (PTP) Edits
  for (let i = 0; i < procedureRecs.length; i += 1) {
    for (let j = i + 1; j < procedureRecs.length; j += 1) {
      const a = procedureRecs[i];
      const b = procedureRecs[j];
      const rule = ncciRules.find(
        (r) =>
          (r.column1_code === a.code && r.column2_code === b.code) ||
          (r.column1_code === b.code && r.column2_code === a.code),
      );
      if (rule) {
        const col2Rec = rule.column2_code === a.code ? a : b;
        const col2Mods = parseModifiers(col2Rec.modifiers);
        const hasBypassModifier = col2Mods.some((m) => ['59', 'XE', 'XS', 'XP', 'XU', '25'].includes(m));

        if (rule.modifier_indicator === '0') {
          results.push({
            encounter_id: encounter.id,
            rule_category: 'NCCI_PTP',
            severity: 'ERROR',
            code_involved: `${rule.column1_code} + ${rule.column2_code}`,
            message: `NCCI PTP edit (Indicator 0): ${rule.column2_code} is mutually exclusive/bundled into ${rule.column1_code} and CANNOT be unbundled with any modifier.`,
            policy_reference: `CMS NCCI PTP Edit (${rule.column1_code}/${rule.column2_code})`,
            remediation: `Remove ${rule.column2_code}; ${rule.rationale}`,
          });
        } else if (!hasBypassModifier) {
          results.push({
            encounter_id: encounter.id,
            rule_category: 'NCCI_PTP',
            severity: 'ERROR',
            code_involved: `${rule.column1_code} + ${rule.column2_code}`,
            message: `NCCI PTP edit (Indicator 1): ${rule.column2_code} is bundled into ${rule.column1_code} unless distinct service documentation supports modifier 59/XE/XS/25.`,
            policy_reference: `CMS NCCI PTP Edit (${rule.column1_code}/${rule.column2_code})`,
            remediation: `Verify distinct anatomical site/encounter; if supported, append modifier 59/XE/XS or 25 (for E/M). Otherwise remove ${rule.column2_code}.`,
          });
        } else {
          results.push({
            encounter_id: encounter.id,
            rule_category: 'NCCI_PTP',
            severity: 'PASS',
            code_involved: `${rule.column1_code} + ${rule.column2_code}`,
            message: `NCCI PTP pair (${rule.column1_code}/${rule.column2_code}) includes modifier ${col2Mods.join(', ')}; clinical documentation must corroborate distinctness.`,
            policy_reference: `CMS NCCI PTP Edit (${rule.column1_code}/${rule.column2_code})`,
            remediation: 'Confirm distinctness in coder review.',
          });
        }
      }
    }
  }

  // 4. Global Surgery & Modifier 25/57 Check
  const emCodes = procedureRecs.filter((p) => /^992(0[2-5]|1[1-5]|8[1-5])$/.test(p.code));
  const surgicalCodes = procedureRecs.filter((p) => {
    const ref = catalogByCode.get(`CPT:${p.code}`) ?? catalogByCode.get(p.code);
    return ref?.global_days !== null && ref?.global_days !== undefined && ref.global_days >= 0 && !/^992/.test(p.code);
  });

  if (emCodes.length > 0 && surgicalCodes.length > 0) {
    for (const em of emCodes) {
      const mods = parseModifiers(em.modifiers);
      const hasMajorGlobal = surgicalCodes.some((s) => {
        const ref = catalogByCode.get(`CPT:${s.code}`) ?? catalogByCode.get(s.code);
        return (ref?.global_days ?? 0) >= 90;
      });
      const requiredMod = hasMajorGlobal ? '57' : '25';
      if (!mods.includes('25') && !mods.includes('57') && !mods.includes('24')) {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'GLOBAL_SURGERY',
          severity: 'ERROR',
          code_involved: em.code,
          message: `E/M code ${em.code} billed on same DOS as surgical/procedural code (${surgicalCodes.map((s) => s.code).join(', ')}) without modifier ${requiredMod}.`,
          policy_reference: 'CMS Global Surgery Package Policy',
          remediation: `Append modifier ${requiredMod} only if documentation proves a significant, separately identifiable E/M service (or decision for major surgery).`,
        });
      }
    }
  }

  // 5. LCD / NCD Medical Necessity Check
  const dxCodeSet = new Set(diagnosisCodes.map((d) => d.code.toUpperCase()));
  for (const proc of procedureRecs) {
    const matchingPolicies = payerPolicies.filter((pol) => pol.procedure_codes.includes(proc.code.toUpperCase()));
    for (const policy of matchingPolicies) {
      const hasCoveredDx = policy.covered_icd10_codes.some((dx) => dxCodeSet.has(dx.toUpperCase()));
      if (!hasCoveredDx) {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'LCD_NCD_MEDICAL_NECESSITY',
          severity: 'ERROR',
          code_involved: proc.code,
          message: `Procedure ${proc.code} lacks a covered diagnosis code required by ${policy.policy_type} ${policy.policy_code} (${policy.title}).`,
          policy_reference: `${policy.policy_type} ${policy.policy_code}`,
          remediation: `Link a medically necessary diagnosis from policy (${policy.covered_icd10_codes.slice(0, 5).join(', ')}) if clinically documented, or obtain ABN.`,
        });
      } else {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'LCD_NCD_MEDICAL_NECESSITY',
          severity: 'PASS',
          code_involved: proc.code,
          message: `Procedure ${proc.code} meets diagnosis coverage criteria for ${policy.policy_type} ${policy.policy_code}.`,
          policy_reference: `${policy.policy_type} ${policy.policy_code}`,
          remediation: 'No action required.',
        });
      }
    }

    if ((proc.code_system === 'CPT' || proc.code_system === 'HCPCS') && diagnosisCodes.length > 0 && !proc.diagnosis_pointers?.trim()) {
      results.push({
        encounter_id: encounter.id,
        rule_category: 'MODIFIER_COMPATIBILITY',
        severity: 'WARNING',
        code_involved: proc.code,
        message: `Procedure ${proc.code} has no diagnosis pointer assigned.`,
        policy_reference: 'CMS-1500 / X12 837P Box 24E',
        remediation: 'Assign diagnosis pointer(s) linking procedure to supporting ICD-10-CM diagnosis.',
      });
    }
  }

  // 6. Outpatient Uncertain/Suspected Diagnosis Guideline Check
  if (encounter.encounter_type === 'Outpatient' || encounter.encounter_type === 'Emergency') {
    for (const dx of diagnosisCodes) {
      const suspectedEntity = entities.find(
        (e) =>
          e.certainty === 'suspected' &&
          (dx.supporting_evidence.toLowerCase().includes(e.entity_text.toLowerCase()) ||
            dx.description.toLowerCase().includes(e.normalized_concept.toLowerCase())),
      );
      if (suspectedEntity) {
        results.push({
          encounter_id: encounter.id,
          rule_category: 'MODIFIER_COMPATIBILITY',
          severity: 'ERROR',
          code_involved: dx.code,
          message: `Outpatient encounter cannot code suspected/probable/rule-out diagnosis ("${suspectedEntity.entity_text}") as confirmed.`,
          policy_reference: 'ICD-10-CM Official Guidelines Section IV.H (Uncertain Diagnosis)',
          remediation: 'Code the documented signs/symptoms instead until confirmed.',
        });
      }
    }
  }

  if (results.length === 0 && activeRecs.length > 0) {
    results.push({
      encounter_id: encounter.id,
      rule_category: 'CATALOG_VERIFICATION',
      severity: 'PASS',
      code_involved: activeRecs.map((r) => r.code).join(', '),
      message: 'All active coding recommendations passed deterministic catalog, NCCI, MUE, laterality, and policy checks.',
      policy_reference: 'MEDIIFY Deterministic Rules Engine',
      remediation: 'Ready for final certified coder sign-off.',
    });
  }

  return results;
}

function mapValidationToDenialCategory(ruleCat: CodingValidationResult['rule_category']): DenialRiskCategory {
  switch (ruleCat) {
    case 'NCCI_PTP':
      return 'NCCI_BUNDLING_CONFLICT';
    case 'MUE':
      return 'MUE_UNIT_EXCEEDED';
    case 'LCD_NCD_MEDICAL_NECESSITY':
      return 'MEDICAL_NECESSITY_FAILURE';
    case 'DUPLICATE_PROCEDURE':
      return 'DUPLICATE_BILLING';
    case 'LATERALITY':
      return 'LACK_OF_DIAGNOSIS_SPECIFICITY';
    case 'MISSING_REFERENCE_DATASET':
      return 'MISSING_REFERENCE_DATASET';
    default:
      return 'MISSING_INVALID_MODIFIER';
  }
}

/**
 * Centralized Deterministic Denial Prevention Engine.
 * Covers all 12 V2 denial categories + missing reference datasets.
 * Never fabricates denial probability percentages or simulated financial estimates.
 */
export function evaluateDenialRisks(input: {
  encounter: Encounter;
  recommendations: CodingRecommendation[];
  validations: CodingValidationResult[];
  payerPolicies: PayerPolicyRule[];
  catalog: ReferenceCode[];
  latestEligibility?: EligibilityVerification | null;
  referenceDate?: string;
}): DenialRiskItem[] {
  const risks: DenialRiskItem[] = [];
  const { encounter, recommendations, validations, payerPolicies, catalog, latestEligibility, referenceDate } = input;
  const activeRecs = recommendations.filter((r) => r.approval_status !== 'REJECTED');

  // 1. Validation failures mapped into standardized denial categories
  for (const val of validations) {
    if (val.severity === 'ERROR' || val.severity === 'WARNING') {
      const category = mapValidationToDenialCategory(val.rule_category);
      risks.push({
        encounter_id: encounter.id,
        risk_category: category,
        severity:
          val.severity === 'ERROR'
            ? val.rule_category === 'NCCI_PTP' ||
              val.rule_category === 'LCD_NCD_MEDICAL_NECESSITY' ||
              val.rule_category === 'MISSING_REFERENCE_DATASET'
              ? 'CRITICAL'
              : 'HIGH'
            : 'MEDIUM',
        supporting_evidence: val.message,
        applicable_policy: val.policy_reference,
        source_reference: val.code_involved,
        recommended_action: val.remediation,
        review_status: 'OPEN',
      });
    }
  }

  // 2. Insurance Eligibility, Inactive Coverage, and Out-of-Network Risk
  if (!latestEligibility) {
    risks.push({
      encounter_id: encounter.id,
      risk_category: 'UNVERIFIED_ELIGIBILITY',
      severity: 'HIGH',
      supporting_evidence: 'No eligibility verification record exists for this patient/encounter.',
      applicable_policy: 'Payer Eligibility & X12 270/271 Pre-Bill Requirement',
      source_reference: encounter.encounter_number,
      recommended_action: 'Run authorized clearinghouse/FHIR eligibility verification prior to claim submission.',
      review_status: 'OPEN',
    });
  } else {
    if (latestEligibility.x12_271_status === 'VERIFIED_INACTIVE') {
      risks.push({
        encounter_id: encounter.id,
        risk_category: 'INACTIVE_TERMINATED_INSURANCE',
        severity: 'CRITICAL',
        supporting_evidence: 'Clearinghouse 271 response reports inactive/terminated coverage on Date of Service.',
        applicable_policy: 'Payer Coverage Effective Date Requirement',
        source_reference: latestEligibility.clearinghouse_transaction_id ?? latestEligibility.id,
        recommended_action: 'Verify alternate/secondary payer coverage or update patient guarantor billing.',
        review_status: 'OPEN',
      });
    } else if (
      latestEligibility.x12_271_status === 'NOT_VERIFIED_REQUIRES_CLEARINGHOUSE' ||
      latestEligibility.x12_271_status === 'ERROR'
    ) {
      risks.push({
        encounter_id: encounter.id,
        risk_category: 'UNVERIFIED_ELIGIBILITY',
        severity: 'MEDIUM',
        supporting_evidence: `Eligibility not verified via clearinghouse (source: ${latestEligibility.verification_source}).`,
        applicable_policy: 'Clearinghouse Verification Control',
        source_reference: latestEligibility.id,
        recommended_action: 'Connect authorized X12 270/271 or FHIR Coverage connector to verify active benefits.',
        review_status: 'OPEN',
      });
    }

    if (latestEligibility.network_status === 'OUT_OF_NETWORK') {
      risks.push({
        encounter_id: encounter.id,
        risk_category: 'OUT_OF_NETWORK_RISK',
        severity: 'HIGH',
        supporting_evidence: 'Eligibility verification indicates Out-of-Network provider/benefit status.',
        applicable_policy: 'Payer Network & Out-of-Network Authorization Policy',
        source_reference: latestEligibility.id,
        recommended_action: 'Confirm out-of-network benefits, single-case agreement, or member responsibility disclosure.',
        review_status: 'OPEN',
      });
    }
  }

  // 3. Missing Prior Authorization
  for (const rec of activeRecs) {
    const ref = catalog.find((c) => c.code === rec.code && c.code_system === rec.code_system);
    const matchingPolicy = payerPolicies.find(
      (p) => p.procedure_codes.includes(rec.code) && (p.prior_auth_required === 1 || p.prior_auth_required === true),
    );
    const priorAuthFlag = ref?.prior_auth_typical === 1 || ref?.prior_auth_typical === true;
    const eligNeedsAuth = latestEligibility?.prior_auth_required === 1 || latestEligibility?.prior_auth_required === true;
    if ((priorAuthFlag || matchingPolicy) && !eligNeedsAuth) {
      risks.push({
        encounter_id: encounter.id,
        risk_category: 'MISSING_PRIOR_AUTHORIZATION',
        severity: 'HIGH',
        supporting_evidence: `Procedure ${rec.code} typically requires payer prior authorization; no authorization number is documented.`,
        applicable_policy: matchingPolicy ? `${matchingPolicy.policy_type} ${matchingPolicy.policy_code}` : 'Payer Prior Authorization Policy',
        source_reference: `${rec.source_document} p.${rec.page_reference}`,
        recommended_action: 'Attach approved prior authorization number or verify payer exemption before claim release.',
        review_status: 'OPEN',
      });
    }
  }

  // 4. Incomplete Clinical Documentation & Diagnosis Specificity
  for (const rec of activeRecs) {
    if (rec.documentation_completeness !== 'COMPLETE') {
      risks.push({
        encounter_id: encounter.id,
        risk_category:
          rec.documentation_completeness === 'MISSING_SPECIFICITY'
            ? 'LACK_OF_DIAGNOSIS_SPECIFICITY'
            : 'INCOMPLETE_CLINICAL_DOCUMENTATION',
        severity: 'MEDIUM',
        supporting_evidence: `Code ${rec.code} flagged as '${rec.documentation_completeness}': ${rec.compliance_risk || 'Requires additional clinical specificity.'}`,
        applicable_policy: 'CMS Documentation Integrity Standards',
        source_reference: `${rec.source_document} p.${rec.page_reference}`,
        recommended_action: 'Initiate physician query or review source chart pages before final sign-off.',
        review_status: 'OPEN',
      });
    }
  }

  // 5. Timely Filing Risk (90-day standard commercial threshold)
  const evalDate = referenceDate ? new Date(referenceDate) : new Date();
  const dosDate = new Date(encounter.date_of_service);
  if (!Number.isNaN(evalDate.getTime()) && !Number.isNaN(dosDate.getTime())) {
    const daysElapsed = Math.floor((evalDate.getTime() - dosDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysElapsed > 75) {
      risks.push({
        encounter_id: encounter.id,
        risk_category: 'TIMELY_FILING_RISK',
        severity: daysElapsed > 90 ? 'CRITICAL' : 'HIGH',
        supporting_evidence: `${daysElapsed} days have elapsed since Date of Service (${encounter.date_of_service}).`,
        applicable_policy: 'Payer Timely Filing Limit (90-Day Commercial / 12-Month Medicare)',
        source_reference: encounter.encounter_number,
        recommended_action: 'Expedite coding review and claim submission immediately to prevent timely-filing denial.',
        review_status: 'OPEN',
      });
    }
  }

  return risks;
}

export function evaluateRevenueIntegrity(input: {
  encounter: Encounter;
  entities: ExtractedEntity[];
  recommendations: CodingRecommendation[];
  validations: CodingValidationResult[];
}): RevenueIntegrityFinding[] {
  const findings: RevenueIntegrityFinding[] = [];
  const { encounter, entities, recommendations, validations } = input;
  const activeCodes = new Set(
    recommendations.filter((r) => r.approval_status !== 'REJECTED').map((r) => r.code.toUpperCase()),
  );

  const documentedProcedures = entities.filter(
    (e) => e.entity_type === 'procedure' && e.certainty === 'confirmed',
  );
  for (const proc of documentedProcedures) {
    const concept = proc.normalized_concept.toLowerCase();
    const text = proc.entity_text.toLowerCase();
    const isEcg = concept.includes('electrocardiogram') || text.includes('ekg') || text.includes('ecg');
    if (isEcg && !activeCodes.has('93000') && !activeCodes.has('93010')) {
      findings.push({
        encounter_id: encounter.id,
        finding_type: 'MISSED_BILLABLE_DOCUMENTED',
        code_involved: '93000 / 93010',
        summary: 'Documented 12-lead ECG interpretation without corresponding CPT 93000/93010 on coding worksheet.',
        clinical_evidence: proc.evidence_snippet,
        compliance_note: 'Billable only if separate written interpretation & report is signed by the provider (not merely reviewing a bedside strip).',
        priority: 'HIGH',
        status: 'OPEN',
      });
    }
  }

  for (const val of validations) {
    if (val.severity === 'ERROR' && (val.rule_category === 'NCCI_PTP' || val.rule_category === 'GLOBAL_SURGERY')) {
      findings.push({
        encounter_id: encounter.id,
        finding_type: 'OVERCODING_RISK',
        code_involved: val.code_involved,
        summary: `Potential improper unbundling or global package overlap detected (${val.rule_category}).`,
        clinical_evidence: val.message,
        compliance_note: 'Compliant reimbursement requires removing bundled codes unless distinct-service documentation strictly supports an allowed modifier.',
        priority: 'HIGH',
        status: 'OPEN',
      });
    }
  }

  const unspecifiedDx = recommendations.filter(
    (r) =>
      r.code_system === 'ICD-10-CM' &&
      r.approval_status !== 'REJECTED' &&
      r.description.toLowerCase().includes('unspecified'),
  );
  for (const dx of unspecifiedDx) {
    findings.push({
      encounter_id: encounter.id,
      finding_type: 'DOCUMENTATION_GAP',
      code_involved: dx.code,
      summary: `Unspecified diagnosis ${dx.code} (${dx.description}) may under-represent clinical complexity or risk adjustment.`,
      clinical_evidence: dx.supporting_evidence,
      compliance_note: 'Query physician only if clinical specificity (type, acuity, laterality, stage) is present in chart or requires clarification.',
      priority: 'MEDIUM',
      status: 'OPEN',
    });
  }

  return findings;
}
