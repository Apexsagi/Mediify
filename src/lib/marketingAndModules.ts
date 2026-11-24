import { z } from 'zod';

export type OrganizationTypeId =
  | 'hospital'
  | 'clinic'
  | 'asc'
  | 'rcm_company'
  | 'independent_coder';

export interface OrganizationTypeOption {
  id: OrganizationTypeId;
  label: string;
  shortLabel: string;
  description: string;
  defaultSpecialty: string;
  requiresGroupNpi: boolean;
}

export const ORGANIZATION_TYPES: OrganizationTypeOption[] = [
  {
    id: 'hospital',
    label: 'Hospital & Health System',
    shortLabel: 'Hospital',
    description: 'Inpatient DRG, ICD-10-PCS procedural workflows, outpatient clinic departments, and enterprise audit trails.',
    defaultSpecialty: 'Multi-Facility Acute Care',
    requiresGroupNpi: true,
  },
  {
    id: 'clinic',
    label: 'Physician Group & Multi-Specialty Clinic',
    shortLabel: 'Clinic / Practice',
    description: 'Outpatient E/M evaluation, modifier -25/-59 checks, and payer LCD/NCD medical necessity validation.',
    defaultSpecialty: 'Multi-Specialty Clinic',
    requiresGroupNpi: true,
  },
  {
    id: 'asc',
    label: 'Ambulatory Surgery Center (ASC)',
    shortLabel: 'ASC',
    description: 'Operative report parsing, anatomical laterality checks, NCCI bundling review, and prior authorization gating.',
    defaultSpecialty: 'Ambulatory Surgery',
    requiresGroupNpi: true,
  },
  {
    id: 'rcm_company',
    label: 'Revenue Cycle Management (RCM) Company',
    shortLabel: 'RCM Company',
    description: 'High-throughput multi-team coding queues, coder productivity telemetry, and pre-bill denial screening.',
    defaultSpecialty: 'Enterprise Revenue Cycle',
    requiresGroupNpi: false,
  },
  {
    id: 'independent_coder',
    label: 'Independent Medical Coder / Auditor',
    shortLabel: 'Independent Coder',
    description: 'Solo coding workspace with document evidence highlighting, imported reference code validation, and audit logs.',
    defaultSpecialty: 'Independent Coding Practice',
    requiresGroupNpi: false,
  },
];

export interface ProductModuleSpec {
  slug: string;
  name: string;
  shortTag: string;
  summary: string;
  description: string;
  status: 'ACTIVE' | 'DISABLED_PENDING_VALIDATION';
  statusNote: string;
  workspaceTarget: 'coding-workspace' | 'denials' | 'insurance' | 'audits' | 'integrations' | 'reports' | 'records' | 'ai-models';
  capabilities: string[];
  guardrails: string[];
}

export const MEDIIFY_ECOSYSTEM_MODULES: ProductModuleSpec[] = [
  {
    slug: 'code',
    name: 'MEDIIFY Code',
    shortTag: 'AI-Assisted Medical Coding',
    summary: 'AI-assisted ICD-10-CM, ICD-10-PCS, CPT, HCPCS, modifier, and E/M coding recommendations.',
    description:
      'Extracts structured clinical concepts from operative notes, progress notes, labs, and imaging reports, mapping each candidate code strictly against imported DOS-active reference datasets with verbatim evidence citations.',
    status: 'ACTIVE',
    statusNote: 'Requires human coder review prior to finalization',
    workspaceTarget: 'coding-workspace',
    capabilities: [
      'Server-side modular inference (Google Gemini, LingSante-3.1-air-VL, Hugging Face, VPC endpoints)',
      'Exact page and snippet citation linking inside source PDF and image records',
      'Catalog-grounded guard rejecting unverified or expired diagnosis and procedure codes',
    ],
    guardrails: [
      'Zero browser-side model execution or secret exposure',
      'Blocks fabricated codes when authoritative datasets are not imported',
    ],
  },
  {
    slug: 'assist',
    name: 'MEDIIFY Assist',
    shortTag: 'Human-in-the-Loop Workspace',
    summary: 'Human-in-the-loop coding workspace with documentation evidence and review controls.',
    description:
      'A three-panel clinical workbench uniting patient and insurance provenance, a zoomable multi-page document viewer with snippet highlighting, and side-by-side AI vs. coder recommendation comparisons.',
    status: 'ACTIVE',
    statusNote: 'Interactive coder sign-off & version history',
    workspaceTarget: 'coding-workspace',
    capabilities: [
      'Resizable three-panel layout with in-document search and binary PDF/image streaming',
      'Approve, modify, reject, or escalate decisions with mandatory rationale logging',
      'Autosaved coder working notes, deficiency annotations, and versioned audit trail',
    ],
    guardrails: [
      'Mandatory human coder approval before claim readiness',
      'Complete AI draft vs. final coder diff history persisted in PostgreSQL',
    ],
  },
  {
    slug: 'automate',
    name: 'MEDIIFY Automate',
    shortTag: 'Future Autonomous Coding',
    summary: 'Future autonomous coding capability, disabled until independently validated and authorized for the relevant clinical workflows.',
    description:
      'Reserved architecture for scoped high-confidence straight-through coding once prospective clinical validation, external compliance sign-off, and organization-specific payer governance thresholds are formally approved.',
    status: 'DISABLED_PENDING_VALIDATION',
    statusNote: 'Disabled until independently validated & authorized',
    workspaceTarget: 'ai-models',
    capabilities: [
      'Architecture-ready threshold policy hooks isolated behind explicit organization authorization',
      'Strict fallback to human-in-the-loop MEDIIFY Assist review for all encounters during initial release',
    ],
    guardrails: [
      'Disabled by default across all tenants and clinical specialties',
      'Never bypasses certified coder review in production release',
    ],
  },
  {
    slug: 'verify',
    name: 'MEDIIFY Verify',
    shortTag: 'Coding & Compliance Validation',
    summary: 'Coding compliance, NCCI, MUE, LCD/NCD, medical necessity, and payer-specific validation.',
    description:
      'Independent deterministic rules engine that checks every diagnosis and procedure combination against CMS NCCI PTP edit pairs, MUE unit thresholds, anatomical laterality alignment, and payer coverage policies.',
    status: 'ACTIVE',
    statusNote: 'Deterministic server & client rule parity',
    workspaceTarget: 'coding-workspace',
    capabilities: [
      'CMS NCCI Column 1 / Column 2 PTP edit detection with modifier indicator inspection',
      'Medically Unlikely Edit (MUE) unit limits and DOS effective date verification',
      'CMS LCD/NCD medical necessity evaluation against documented diagnosis codes',
    ],
    guardrails: [
      'Never simulates rule passes when reference datasets are missing',
      'Evaluates code validity strictly against encounter Date of Service',
    ],
  },
  {
    slug: 'shield',
    name: 'MEDIIFY Shield',
    shortTag: 'Denial Prevention Engine',
    summary: 'Pre-submission denial risk identification and corrective recommendations.',
    description:
      'Flags 12 structured pre-bill denial risk categories—including missing modifiers, bundling conflicts, laterality mismatches, inactive eligibility, and documentation gaps—before claims ever leave the organization.',
    status: 'ACTIVE',
    statusNote: '12-category pre-bill risk inspection',
    workspaceTarget: 'denials',
    capabilities: [
      'Automated severity classification (CRITICAL, HIGH, MEDIUM, LOW) with policy citations',
      'Reviewer assignment, remediation tracking, and audit-logged resolution workflows',
      'Pre-submission claim readiness gate preventing release of blocked encounters',
    ],
    guardrails: [
      'Requires explicit resolution of critical risks prior to claim release',
      'Every risk links back to verifiable rule output or chart evidence',
    ],
  },
  {
    slug: 'clinical',
    name: 'MEDIIFY Clinical',
    shortTag: 'CDI & Clinical Entity Intelligence',
    summary: 'Clinical documentation analysis and documentation improvement.',
    description:
      'Parses EHR exports, operative reports, radiology reads, and scanned PDFs while distinguishing confirmed diagnoses from suspected conditions, historical mentions, and negated findings.',
    status: 'ACTIVE',
    statusNote: 'Certainty tagging & prompt-injection screening',
    workspaceTarget: 'records',
    capabilities: [
      'Magic-byte, active-PDF script, and prompt-injection screening prior to AI inference',
      'Confirmed vs. suspected vs. historical vs. negated clinical entity extraction',
      'Physician query generation and deficiency alerts anchored to exact page numbers',
    ],
    guardrails: [
      'Suspected diagnoses in outpatient charts flagged per ICD-10-CM guidelines',
      'Encrypted private storage isolated strictly by organization ID',
    ],
  },
  {
    slug: 'eligibility',
    name: 'MEDIIFY Eligibility',
    shortTag: 'Authorized Coverage Verification',
    summary: 'Authorized insurance eligibility, benefits, coverage, referral, and prior authorization verification.',
    description:
      'Maintains strict provenance isolation between OCR-extracted insurance policy details and real clearinghouse X12 270/271 eligibility responses with recorded timestamps and transaction references.',
    status: 'ACTIVE',
    statusNote: 'Zero simulated verification responses',
    workspaceTarget: 'insurance',
    capabilities: [
      'Displays exact verification provenance, source clearinghouse, and UTC timestamp',
      'Checks active coverage, network status, benefit rules, and prior authorization requirements',
      'Explicitly reports Configuration Required when clearinghouse credentials are absent',
    ],
    guardrails: [
      'Never fabricates active coverage or mock payer 271 transactions',
      'OCR-extracted card text remains labeled EXTRACTED_FROM_DOCUMENT until verified',
    ],
  },
  {
    slug: 'audit',
    name: 'MEDIIFY Audit',
    shortTag: 'QA & Immutable Audit Trails',
    summary: 'Coding quality assurance, compliance review, and evidence-level audit trails.',
    description:
      'Supports compliance directors and coding auditors with sample QA reviews, missed billable vs. overcoding risk separation, version snapshots, and immutable actor-logged security and coding events.',
    status: 'ACTIVE',
    statusNote: 'Versioned history & immutable event logs',
    workspaceTarget: 'audits',
    capabilities: [
      'Dual-sided revenue integrity findings (potential undercoding and compliance exposure)',
      'Searchable, paginated audit trail covering user actions, IPs, and timestamps',
      'Full recommendation modification diffs across coder and auditor reviews',
    ],
    guardrails: [
      'Append-only audit logging across authentication, exports, and coding decisions',
      'Role-based access control separating coder, auditor, physician, and admin scopes',
    ],
  },
  {
    slug: 'connect',
    name: 'MEDIIFY Connect',
    shortTag: 'EHR, Payer & Clearinghouse Hub',
    summary: 'EHR, EMR, practice management, payer, and clearinghouse integration management.',
    description:
      'Manages authenticated server-side connections to FHIR R4 / HL7 clinical repositories, clearinghouse eligibility gateways, and external medical LLM inference endpoints with URL/SSRF validation.',
    status: 'ACTIVE',
    statusNote: 'SSRF-validated endpoint connectivity testing',
    workspaceTarget: 'integrations',
    capabilities: [
      'Endpoint health checks verifying live upstream status and last sync timestamps',
      'CSV/JSON authoritative dataset importer for ICD-10, CPT, HCPCS, Modifiers, NCCI, and LCDs',
      'Strict external URL validation blocking internal metadata or unapproved hosts',
    ],
    guardrails: [
      'Displays Not configured / Connection required until real credentials are entered',
      'Credentials remain encrypted server-side and never reach browser code',
    ],
  },
  {
    slug: 'insights',
    name: 'MEDIIFY Insights',
    shortTag: 'Real Operational Analytics',
    summary: 'Real operational analytics, coding productivity, quality, denial trends, and reimbursement reporting.',
    description:
      'Aggregates live PostgreSQL telemetry across encounters, reviewed coder decisions, open denial categories, AI latency, and posted remittance—showing clear empty or insufficient-data states rather than synthetic estimates.',
    status: 'ACTIVE',
    statusNote: '100% live database telemetry',
    workspaceTarget: 'reports',
    capabilities: [
      'DOS date-range, specialty, payer, provider, and reviewer filtering',
      'Reviewed coding accuracy computed solely from actual coder approvals vs. modifications',
      'CSV export of operational and revenue integrity metrics scoped to organization tenant',
    ],
    guardrails: [
      'Zero fabricated accuracy percentages or placeholder financial charts',
      'Empty organizations start with 0 encounters and clear onboarding actions',
    ],
  },
];

export interface SolutionVerticalSpec {
  slug: string;
  name: string;
  audience: string;
  headline: string;
  summary: string;
  workflows: string[];
  recommendedModules: string[];
}

export const SOLUTION_VERTICALS: SolutionVerticalSpec[] = [
  {
    slug: 'hospitals',
    name: 'Hospitals & Health Systems',
    audience: 'Acute Care, Outpatient Departments & CDI Teams',
    headline: 'Unify inpatient procedural precision with outpatient denial prevention.',
    summary:
      'Coordinate attending physicians, CDI specialists, and certified coders across multi-facility encounters with strict PostgreSQL tenant isolation and audit-ready evidence trails.',
    workflows: [
      'Operative and discharge summary ingestion with ICD-10-CM/PCS validation',
      'Physician query annotations anchored directly to chart pages',
      'Departmental QA audits and role-scoped review queues',
    ],
    recommendedModules: ['MEDIIFY Code', 'MEDIIFY Assist', 'MEDIIFY Verify', 'MEDIIFY Audit'],
  },
  {
    slug: 'physician-groups',
    name: 'Physician Groups & Multi-Specialty Clinics',
    audience: 'Outpatient Practices & Clinical Coders',
    headline: 'Eliminate E/M modifier errors and medical necessity surprises.',
    summary:
      'Ensure same-day procedures, E/M complexity documentation, and payer LCD coverage policies align before claims reach your practice management clearinghouse.',
    workflows: [
      'Automatic global surgery and Modifier -25 / -59 rule checks',
      'Pre-submission LCD/NCD diagnosis compatibility screening',
      'Document-extracted vs. clearinghouse-verified coverage provenance tracking',
    ],
    recommendedModules: ['MEDIIFY Code', 'MEDIIFY Verify', 'MEDIIFY Shield', 'MEDIIFY Eligibility'],
  },
  {
    slug: 'ambulatory-surgery-centers',
    name: 'Ambulatory Surgery Centers (ASCs)',
    audience: 'Surgical Coding & Pre-Authorization Coordinators',
    headline: 'Verify surgical laterality, bundling rules, and prior authorizations early.',
    summary:
      'Protect surgical reimbursement by validating operative note details, bilateral or anatomical modifiers, MUE unit caps, and prior authorization status prior to procedure billing.',
    workflows: [
      'Operative report parsing separating planned vs. performed procedures',
      'Anatomical laterality enforcement across ICD-10-CM and CPT modifiers (-LT, -RT, -50)',
      'CMS NCCI Column 1 / Column 2 PTP bundling conflict resolution',
    ],
    recommendedModules: ['MEDIIFY Clinical', 'MEDIIFY Verify', 'MEDIIFY Shield', 'MEDIIFY Eligibility'],
  },
  {
    slug: 'rcm-companies',
    name: 'Revenue Cycle Management (RCM) Companies',
    audience: 'Third-Party Billing & Coding Operations',
    headline: 'Scale high-integrity coding operations across isolated client workspaces.',
    summary:
      'Provision separate RLS-isolated PostgreSQL workspaces per healthcare organization, monitor real coder throughput, and enforce standardized QA checks across every client account.',
    workflows: [
      'Strict organization-level data & document bucket isolation per client',
      'Coder productivity tracking (approved, modified, rejected, escalated)',
      'Structured denial-risk routing to assigned RCM specialists',
    ],
    recommendedModules: ['MEDIIFY Assist', 'MEDIIFY Shield', 'MEDIIFY Audit', 'MEDIIFY Insights'],
  },
  {
    slug: 'independent-coders',
    name: 'Independent Medical Coders & Auditors',
    audience: 'Certified Coders (CPC, CCS, RHIA) & Consultants',
    headline: 'An evidence-first coding workbench built around reference authority.',
    summary:
      'Review PDF and scanned records side-by-side with imported CMS/AMA catalogs, deterministic edit rules, and exportable audit histories in a single dedicated workspace.',
    workflows: [
      'Upload chart PDFs/images and inspect verbatim extracted snippets',
      'Import licensed CPT and CMS ICD-10/HCPCS/NCCI reference tables directly',
      'Track versioned modifications and compliance findings per encounter',
    ],
    recommendedModules: ['MEDIIFY Assist', 'MEDIIFY Verify', 'MEDIIFY Audit', 'MEDIIFY Connect'],
  },
];

export const INTEGRATION_CATALOG = [
  {
    category: 'EHR & Clinical Systems',
    systems: ['Epic (FHIR R4 / HL7)', 'Oracle Health / Cerner', 'Athenahealth', 'eClinicalWorks', 'NextGen Healthcare'],
    protocol: 'Authenticated Server-Side FHIR R4 / HL7v2 / SFTP Adapters',
    stateNote: 'Configuration required per organization tenant',
  },
  {
    category: 'Clearinghouses & Payer Gateways',
    systems: ['EDI X12 270/271 Eligibility', 'EDI X12 837 Claim Assembly', 'EDI X12 835 Remittance', 'Prior Authorization APIs'],
    protocol: 'Verified Server-Side Clearinghouse Connectors',
    stateNote: 'Never simulated; displays verification source & timestamp',
  },
  {
    category: 'AI & Medical Inference Models',
    systems: ['Google Gemini API', 'inclusionAI/LingSante-3.1-air-VL', 'Hugging Face Inference Endpoints', 'Private VPC OpenAI-Compatible'],
    protocol: 'Provider-Independent Server Adapters with SSRF & Timeout Guards',
    stateNote: 'Zero browser execution; credentials stored strictly server-side',
  },
  {
    category: 'Authoritative Coding Datasets',
    systems: ['CMS ICD-10-CM / ICD-10-PCS', 'CMS HCPCS Level II', 'CMS NCCI PTP & MUE Tables', 'AMA CPT (Licensed Import)'],
    protocol: 'SHA-256 Audited CSV/JSON Dataset Importer with Effective-Date Enforcement',
    stateNote: 'Claim readiness gated until required datasets are imported',
  },
];

export const publicLeadInputSchema = z.object({
  lead_type: z.enum(['demo_request', 'contact_inquiry']),
  full_name: z.string().trim().min(2, 'Full name is required').max(120),
  work_email: z.string().trim().email('Valid work email is required').max(160),
  organization_name: z.string().trim().max(160).optional().default(''),
  organization_type: z
    .enum(['hospital', 'clinic', 'asc', 'rcm_company', 'independent_coder'])
    .optional()
    .default('clinic'),
  phone: z.string().trim().max(40).optional().default(''),
  monthly_encounters: z.string().trim().max(60).optional().default(''),
  ehr_system: z.string().trim().max(100).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
  source_path: z.string().trim().max(160).optional().default('/'),
});

export const newsletterInputSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(160),
  organization_type: z.string().trim().max(60).optional().default('general'),
});

export function validatePublicLeadPayload(input: unknown) {
  return publicLeadInputSchema.safeParse(input);
}

export function validateNewsletterPayload(input: unknown) {
  return newsletterInputSchema.safeParse(input);
}

export function findProductModule(slug: string): ProductModuleSpec | undefined {
  return MEDIIFY_ECOSYSTEM_MODULES.find((m) => m.slug === slug);
}

export function findSolutionVertical(slug: string): SolutionVerticalSpec | undefined {
  return SOLUTION_VERTICALS.find((s) => s.slug === slug);
}
