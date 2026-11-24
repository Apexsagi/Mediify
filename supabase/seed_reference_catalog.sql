-- Authoritative Public-Domain Medical Coding Reference Seed (CMS ICD-10-CM, ICD-10-PCS, HCPCS Level II, NCCI, LCD/NCD)
-- NOTE: Proprietary AMA CPT codes & official AMA descriptors are intentionally NOT bundled in open-source SQL.
-- Import licensed AMA CPT datasets through the MEDIIFY Reference Dataset Import workflow after attesting your AMA license.

BEGIN;

INSERT INTO icd_codes (code, code_system, description, category, effective_date, expiration_date, requires_laterality, valid_laterality, age_min, age_max, sex_restriction, is_billable, guideline_reference, source_dataset)
VALUES
  ('M17.11', 'ICD-10-CM', 'Unilateral primary osteoarthritis, right knee', 'Musculoskeletal', '2015-10-01', NULL, TRUE, 'RIGHT', NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 13 Section I.B.13', 'CMS_PUBLIC_DOMAIN'),
  ('M17.12', 'ICD-10-CM', 'Unilateral primary osteoarthritis, left knee', 'Musculoskeletal', '2015-10-01', NULL, TRUE, 'LEFT', NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 13 Section I.B.13', 'CMS_PUBLIC_DOMAIN'),
  ('M17.9', 'ICD-10-CM', 'Osteoarthritis of knee, unspecified', 'Musculoskeletal', '2015-10-01', NULL, TRUE, 'UNSPECIFIED', NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 13 (Requires specificity if laterality known)', 'CMS_PUBLIC_DOMAIN'),
  ('E11.22', 'ICD-10-CM', 'Type 2 diabetes mellitus with diabetic chronic kidney disease', 'Endocrine', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 4 Section I.C.4.a', 'CMS_PUBLIC_DOMAIN'),
  ('N18.31', 'ICD-10-CM', 'Chronic kidney disease, stage 3a', 'Genitourinary', '2020-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 14 CKD Staging', 'CMS_PUBLIC_DOMAIN'),
  ('I12.9', 'ICD-10-CM', 'Hypertensive chronic kidney disease with stage 1 through stage 4 chronic kidney disease', 'Circulatory', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 9 Presumed Causal Relationship', 'CMS_PUBLIC_DOMAIN'),
  ('I10', 'ICD-10-CM', 'Essential (primary) hypertension', 'Circulatory', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 9 Hypertension', 'CMS_PUBLIC_DOMAIN'),
  ('J18.9', 'ICD-10-CM', 'Pneumonia, unspecified organism', 'Respiratory', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 10', 'CMS_PUBLIC_DOMAIN'),
  ('J20.9', 'ICD-10-CM', 'Acute bronchitis, unspecified', 'Respiratory', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 10', 'CMS_PUBLIC_DOMAIN'),
  ('R07.9', 'ICD-10-CM', 'Chest pain, unspecified', 'Symptoms & Signs', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 18 Section IV.H', 'CMS_PUBLIC_DOMAIN'),
  ('I21.4', 'ICD-10-CM', 'Non-ST elevation (NSTEMI) myocardial infarction', 'Circulatory', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 9 Acute MI', 'CMS_PUBLIC_DOMAIN'),
  ('Z79.4', 'ICD-10-CM', 'Long term (current) use of insulin', 'Factors Influencing Health', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 4 Insulin Requirement', 'CMS_PUBLIC_DOMAIN'),
  ('E11', 'ICD-10-CM', 'Type 2 diabetes mellitus (Category Header - Non-billable)', 'Endocrine', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, FALSE, 'ICD-10-CM Category Header', 'CMS_PUBLIC_DOMAIN'),
  ('N39.0', 'ICD-10-CM', 'Urinary tract infection, site not specified', 'Genitourinary', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-CM Ch. 14', 'CMS_PUBLIC_DOMAIN'),
  ('O80', 'ICD-10-CM', 'Encounter for full-term uncomplicated delivery', 'Pregnancy/Obstetrics', '2015-10-01', NULL, FALSE, NULL, 12, 55, 'F', TRUE, 'ICD-10-CM Ch. 15 Sex/Age Edit', 'CMS_PUBLIC_DOMAIN'),
  ('0SRD0J9', 'ICD-10-PCS', 'Replacement of Left Knee Joint with Synthetic Substitute, Cemented, Open Approach', 'Medical and Surgical', '2015-10-01', NULL, TRUE, 'LEFT', NULL, NULL, NULL, TRUE, 'ICD-10-PCS B3.1a', 'CMS_PUBLIC_DOMAIN'),
  ('02703DZ', 'ICD-10-PCS', 'Dilation of Coronary Artery, One Artery with Intraluminal Device, Percutaneous Approach', 'Medical and Surgical', '2015-10-01', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, 'ICD-10-PCS B3.2', 'CMS_PUBLIC_DOMAIN')
ON CONFLICT (code) DO NOTHING;

INSERT INTO hcpcs_codes (code, description, category, effective_date, expiration_date, mue_limit, prior_auth_typical, guideline_reference, source_dataset)
VALUES
  ('J1030', 'Injection, methylprednisolone acetate, 40 mg', 'Drugs Administered Other Than Oral', '2015-01-01', NULL, 4, FALSE, 'CMS ASP Drug Billing (1 unit = 40mg)', 'CMS_HCPCS'),
  ('J7325', 'Hyaluronan or derivative, Synvisc or Synvisc-One, for intra-articular injection, 1 mg', 'Drugs / Viscosupplementation', '2015-01-01', NULL, 48, TRUE, 'CMS LCD Viscosupplementation Prior Auth', 'CMS_HCPCS'),
  ('G0439', 'Annual wellness visit, includes a personalized prevention plan of service, subsequent visit', 'Preventive Services', '2015-01-01', NULL, 1, FALSE, 'Medicare Preventive Services Manual', 'CMS_HCPCS')
ON CONFLICT (code) DO NOTHING;

INSERT INTO modifiers (code, description, category, policy_reference, effective_date, source_dataset)
VALUES
  ('25', 'Significant, separately identifiable Evaluation and Management service by the same physician on the same day of procedure', 'E/M Modifier', 'CMS / CPT Modifier 25 Policy', '2015-01-01', 'CMS_MODIFIER'),
  ('59', 'Distinct procedural service (different session, procedure, anatomical site, or separate injury)', 'NCCI Bypass Modifier', 'CMS NCCI Modifier 59 / X{EPSU} Policy', '2015-01-01', 'CMS_MODIFIER'),
  ('LT', 'Left side (used to identify procedures performed on the left side of the body)', 'Anatomical Laterality', 'HCPCS Level II Anatomical Modifiers', '2015-01-01', 'CMS_MODIFIER'),
  ('RT', 'Right side (used to identify procedures performed on the right side of the body)', 'Anatomical Laterality', 'HCPCS Level II Anatomical Modifiers', '2015-01-01', 'CMS_MODIFIER'),
  ('50', 'Bilateral procedure', 'Anatomical Laterality', 'CMS Bilateral Surgery Indicator Rules', '2015-01-01', 'CMS_MODIFIER'),
  ('57', 'Decision for surgery (E/M service resulting in initial decision to perform major 90-day surgery)', 'Global Surgery Modifier', 'CMS Global Surgery Package Policy', '2015-01-01', 'CMS_MODIFIER'),
  ('XE', 'Separate encounter, a service that is distinct because it occurred during a separate encounter', 'CMS X{EPSU} Subset', 'CMS NCCI Specific Modifiers', '2015-01-01', 'CMS_MODIFIER'),
  ('XS', 'Separate structure, a service that is distinct because it was performed on a separate organ/structure', 'CMS X{EPSU} Subset', 'CMS NCCI Specific Modifiers', '2015-01-01', 'CMS_MODIFIER')
ON CONFLICT (code) DO NOTHING;

INSERT INTO ncci_edit_rules (column1_code, column2_code, modifier_indicator, rationale, effective_date, source_dataset)
VALUES
  ('20610', '76942', '1', 'Arthrocentesis with ultrasound guidance bundles separate needle placement ultrasound unless distinct anatomic site.', '2024-01-01', 'CMS_NCCI'),
  ('20611', '76942', '0', 'Ultrasound guidance is inherently included in CPT 20611; 76942 cannot be unbundled (Indicator 0).', '2024-01-01', 'CMS_NCCI'),
  ('93000', '93010', '0', 'Complete 12-lead ECG includes interpretation and report; 93010 cannot be billed on the same ECG.', '2024-01-01', 'CMS_NCCI'),
  ('27447', '20610', '1', 'Joint injection of the operative knee is bundled into total knee arthroplasty unless contralateral knee with XS/59.', '2024-01-01', 'CMS_NCCI')
ON CONFLICT (column1_code, column2_code, effective_date) DO NOTHING;

INSERT INTO payer_policies (policy_code, policy_type, payer_name, title, procedure_codes, covered_icd10_codes, documentation_requirements, timely_filing_days, prior_auth_required, effective_date, source_dataset)
VALUES
  ('L35038', 'LCD', 'Medicare Part B / NGS', 'Intra-Articular Knee Injections & Viscosupplementation', ARRAY['20610', '20611', 'J7325'], ARRAY['M17.11', 'M17.12'], 'Must document specific laterality, radiographic OA severity, and failure of >= 3 months conservative therapy for viscosupplementation.', 365, FALSE, '2024-01-01', 'CMS_MCD'),
  ('NCD 190.21', 'NCD', 'CMS Medicare National', 'Glycated Hemoglobin / Comprehensive Metabolic Panel Monitoring', ARRAY['80053'], ARRAY['E11.22', 'N18.31', 'I12.9', 'I10', 'I21.4'], 'Medical necessity requires documented metabolic, renal, hepatic, or hypertensive condition.', 365, FALSE, '2024-01-01', 'CMS_MCD')
ON CONFLICT DO NOTHING;

INSERT INTO coding_guidelines (code_system, section, title, summary, effective_year)
VALUES
  ('ICD-10-CM', 'I.B.13', 'Laterality Specificity', 'When a code exists for left, right, or bilateral sites, assign the specific laterality code whenever documented in the medical record.', 2026),
  ('ICD-10-CM', 'IV.H', 'Uncertain Diagnoses (Outpatient)', 'Do not code diagnoses documented as probable, suspected, questionable, rule out, or working diagnosis in outpatient encounters. Code documented signs/symptoms.', 2026),
  ('ICD-10-CM', 'I.C.9.a.2', 'Hypertension with Chronic Kidney Disease', 'ICD-10-CM presumes a causal relationship between hypertension and CKD (I12.-); additionally assign N18.- for CKD stage.', 2026),
  ('CPT', 'Modifier 25', 'Significant, Separately Identifiable E/M Service', 'Use Modifier 25 only when clinical documentation demonstrates a separately identifiable E/M beyond usual pre/post-procedure care on the same DOS.', 2026)
ON CONFLICT DO NOTHING;

COMMIT;
