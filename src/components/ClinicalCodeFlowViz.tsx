import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, ShieldCheck, Stethoscope } from 'lucide-react';

type ScenarioId = 'extraction' | 'validation' | 'denials';

interface DemoScenario {
  id: ScenarioId;
  tabLabel: string;
  title: string;
  subtitle: string;
  sourceDocTitle: string;
  sourceExcerpt: Array<{ text: string; highlight?: boolean; tag?: string }>;
  pipelineStage: string;
  outputs: Array<{
    code: string;
    system: string;
    title: string;
    evidence: string;
    status: string;
    tone: 'teal' | 'blue' | 'amber';
  }>;
  ruleChecks: Array<{ label: string; detail: string; outcome: string }>;
}

const ILLUSTRATIVE_SCENARIOS: DemoScenario[] = [
  {
    id: 'extraction',
    tabLabel: '01. Document Intelligence',
    title: 'Clinical Document to Structured Medical Codes',
    subtitle:
      'Separates confirmed diagnoses, anatomical laterality, and performed procedures from suspected or negated chart statements.',
    sourceDocTitle: 'Illustrative Operative Note · Page 2 of 4',
    sourceExcerpt: [
      { text: 'Chief Complaint: Persistent right knee effusion following conservative therapy failure. ' },
      { text: 'Procedure Performed: ', highlight: false },
      {
        text: 'Right knee arthrocentesis and corticosteroid injection (1.0 mL triamcinolone)',
        highlight: true,
        tag: 'Confirmed Procedure',
      },
      { text: ' under sterile prep. ' },
      {
        text: 'Primary Diagnosis: Unilateral primary osteoarthritis, right knee.',
        highlight: true,
        tag: 'Confirmed Dx · RIGHT',
      },
      { text: ' No acute fracture or ligamentous instability noted on prior imaging.' },
    ],
    pipelineStage: 'OCR -> Entity Disambiguation -> Evidence Mapping',
    outputs: [
      {
        code: 'M17.11',
        system: 'ICD-10-CM',
        title: 'Unilateral primary osteoarthritis, right knee',
        evidence: 'Page 2 · Exact laterality match: RIGHT',
        status: 'Catalog Active on DOS',
        tone: 'teal',
      },
      {
        code: '20610-RT',
        system: 'CPT + Modifier',
        title: 'Arthrocentesis, aspiration and/or injection, major joint or bursa',
        evidence: 'Page 2 · Laterality RT applied',
        status: 'Requires Coder Sign-Off',
        tone: 'blue',
      },
    ],
    ruleChecks: [
      {
        label: 'Negation & Certainty Filter',
        detail: '"No acute fracture" excluded from billable diagnosis set.',
        outcome: 'Filtered',
      },
      {
        label: 'Anatomical Laterality Alignment',
        detail: 'ICD-10-CM M17.11 (right knee) matches CPT modifier -RT.',
        outcome: 'Aligned',
      },
    ],
  },
  {
    id: 'validation',
    tabLabel: '02. Deterministic Coding Rules',
    title: 'NCCI Bundling, MUE Limits & Modifier Enforcement',
    subtitle:
      'Every AI candidate passes an independent deterministic engine against imported CMS/AMA datasets before coder sign-off.',
    sourceDocTitle: 'Illustrative Outpatient Encounter · Coding Audit',
    sourceExcerpt: [
      { text: 'Evaluation & Management: Established patient visit, moderate complexity MDM (35 min). ' },
      {
        text: 'Separately identifiable E/M evaluation performed prior to planned joint procedure',
        highlight: true,
        tag: 'Modifier -25 Required',
      },
      { text: '. Ultrasound probe used for routine needle localization during major joint injection.' },
    ],
    pipelineStage: 'Catalog Lookup -> NCCI PTP Check -> Global Surgery Check',
    outputs: [
      {
        code: '99214-25',
        system: 'CPT E/M',
        title: 'Office/outpatient visit, established patient, moderate MDM',
        evidence: 'Global Surgery Check · Same-DOS procedure detected',
        status: 'Modifier 25 Applied',
        tone: 'teal',
      },
      {
        code: '76942',
        system: 'NCCI Column 2',
        title: 'Ultrasonic guidance for needle placement',
        evidence: 'Bundled with 20610 (NCCI PTP Indicator 1)',
        status: 'Bundling Conflict Flagged',
        tone: 'amber',
      },
    ],
    ruleChecks: [
      {
        label: 'CMS NCCI PTP Edit Table',
        detail: '76942 bundled into 20610 unless distinct anatomical site documented.',
        outcome: 'Blocked',
      },
      {
        label: 'MUE Unit Limit Check',
        detail: '1 unit billed; within CMS Medically Unlikely Edit limit (2 units).',
        outcome: 'Within Limit',
      },
    ],
  },
  {
    id: 'denials',
    tabLabel: '03. Insurance & Denial Prevention',
    title: 'Eligibility Provenance & Pre-Submission Claim Gating',
    subtitle:
      'Separates document-extracted subscriber IDs from live clearinghouse 271 responses and catches denial triggers early.',
    sourceDocTitle: 'Illustrative Pre-Bill Readiness Check',
    sourceExcerpt: [
      { text: 'Policy record extracted from scanned card PDF (provenance: EXTRACTED_FROM_DOCUMENT). ' },
      {
        text: 'Clearinghouse X12 270/271 transaction has not yet been executed',
        highlight: true,
        tag: 'UNVERIFIED_ELIGIBILITY',
      },
      { text: ' prior to claim assembly.' },
    ],
    pipelineStage: 'Coverage Provenance -> LCD/NCD Check -> Claim Gate',
    outputs: [
      {
        code: 'L35038',
        system: 'CMS LCD Check',
        title: 'Major Joint Injections Medical Necessity',
        evidence: 'ICD-10 M17.11 matches covered diagnosis list',
        status: 'Policy Satisfied',
        tone: 'teal',
      },
      {
        code: 'GATE-01',
        system: 'Claim Readiness',
        title: 'Pre-Submission Clearinghouse Verification Required',
        evidence: 'No verified X12 271 response attached to encounter',
        status: 'Claim Release Held',
        tone: 'amber',
      },
    ],
    ruleChecks: [
      {
        label: 'Provenance Isolation',
        detail: 'OCR-extracted card text never masquerades as clearinghouse-verified coverage.',
        outcome: 'Enforced',
      },
      {
        label: 'Human Coder Sign-Off',
        detail: 'Claim assembly remains locked until certified coder approval & review clear.',
        outcome: 'Required',
      },
    ],
  },
];

export const ClinicalCodeFlowViz: React.FC = () => {
  const [activeId, setActiveId] = useState<ScenarioId>('extraction');
  const scenario = ILLUSTRATIVE_SCENARIOS.find((s) => s.id === activeId) ?? ILLUSTRATIVE_SCENARIOS[0];

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      {/* Header & Interactive Tabs */}
      <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-[#0D9488] font-medium">
            Illustrative Architecture Walkthrough · Non-PHI Example
          </p>
          <h3 className="font-display text-lg font-bold text-[#06152B] mt-0.5">{scenario.title}</h3>
        </div>

        <div role="tablist" aria-label="Interactive platform workflow demonstration" className="flex flex-wrap gap-1.5 bg-white p-1 border border-[#E2E8F0] rounded-lg">
          {ILLUSTRATIVE_SCENARIOS.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveId(item.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#06152B] text-white'
                    : 'text-[#64748B] hover:text-[#06152B] hover:bg-slate-50'
                }`}
              >
                {item.tabLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Animated 3-Stage Pipeline Canvas */}
      <AnimatePresence mode="wait">
        <motion.div
          key={scenario.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="p-6"
        >
          <p className="text-sm text-[#64748B] mb-6 max-w-3xl">{scenario.subtitle}</p>

          <div className="grid lg:grid-cols-12 gap-5 items-stretch">
            {/* Stage 1: Clinical Source Note */}
            <div className="lg:col-span-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#E2E8F0]">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#071D49]">
                    <FileText className="w-4 h-4 text-[#2563EB]" />
                    {scenario.sourceDocTitle}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-700">
                  {scenario.sourceExcerpt.map((seg, idx) =>
                    seg.highlight ? (
                      <span
                        key={idx}
                        className="bg-[#22D3EE]/20 text-[#071D49] font-medium px-1.5 py-0.5 rounded mx-0.5 border border-[#22D3EE]/40"
                      >
                        {seg.text}
                        {seg.tag && (
                          <span className="ml-1.5 font-mono text-[11px] text-[#0D9488] font-semibold">
                            [{seg.tag}]
                          </span>
                        )}
                      </span>
                    ) : (
                      <span key={idx}>{seg.text}</span>
                    ),
                  )}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
                <span className="font-mono">{scenario.pipelineStage}</span>
                <ArrowRight className="w-4 h-4 text-[#2563EB] shrink-0 hidden lg:block" />
              </div>
            </div>

            {/* Stage 2 & 3: Verified Code Candidates + Deterministic Rule Outcomes */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {scenario.outputs.map((out) => (
                  <div
                    key={out.code}
                    className="p-4 rounded-lg border border-[#E2E8F0] bg-white flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-base font-bold text-[#071D49]">{out.code}</span>
                        <span className="font-mono text-[11px] text-[#64748B]">{out.system}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 leading-snug">{out.title}</p>
                      <p className="text-xs text-[#64748B] mt-2">{out.evidence}</p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-[#E2E8F0] flex items-center gap-1.5 text-xs font-semibold">
                      {out.tone === 'amber' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      ) : out.tone === 'blue' ? (
                        <Stethoscope className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                      )}
                      <span
                        className={
                          out.tone === 'amber'
                            ? 'text-amber-700'
                            : out.tone === 'blue'
                              ? 'text-[#2563EB]'
                              : 'text-[#0D9488]'
                        }
                      >
                        {out.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Deterministic Validation Strip */}
              <div className="bg-[#071D49] text-white rounded-lg p-4 grid sm:grid-cols-2 gap-4">
                {scenario.ruleChecks.map((chk) => (
                  <div key={chk.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#22D3EE]">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        {chk.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-300">{chk.outcome}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{chk.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
