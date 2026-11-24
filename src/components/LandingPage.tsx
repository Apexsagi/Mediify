import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  FileCheck2,
  Lock,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { ClinicalCodeFlowViz } from './ClinicalCodeFlowViz';
import { MolecularNeuralCanvas } from './MolecularNeuralCanvas';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

const CAPABILITIES = [
  {
    index: '01. Clinical Document Intelligence',
    title: 'Multi-Format Chart Parsing & Certainty Classification',
    body: 'Ingest EHR exports, operative notes, radiology reports, and scanned PDFs into private encrypted storage while separating confirmed diagnoses from suspected, historical, and negated statements.',
  },
  {
    index: '02. Authoritative Coding Engine',
    title: 'ICD-10-CM/PCS, CPT, HCPCS & Modifier Validation',
    body: 'Validates NCCI procedure-to-procedure edits, MUE unit caps, LCD/NCD medical necessity, laterality, and DOS effective dates—blocking claim readiness whenever authoritative datasets are absent.',
  },
  {
    index: '03. Insurance & Denial Prevention',
    title: 'Provenance-Isolated Eligibility & 12-Category Risk Audits',
    body: 'Separates document-extracted policy data from live clearinghouse X12 270/271 responses and routes missing modifiers, prior authorization gaps, and timely-filing risks to assigned reviewers.',
  },
  {
    index: '04. Revenue Integrity & QA',
    title: 'Versioned Coder Sign-Off & Immutable Audit Trails',
    body: 'Identifies missed billable procedures alongside potential overcoding or unbundling exposure, preserving complete version history and user audit logs across every organization tenant.',
  },
];

const WORKFLOW_STEPS = [
  {
    step: 'Step 01',
    title: 'Ingest & Scan Records',
    detail: 'Magic-byte, active-PDF, and prompt-injection checks run server-side before documents enter private tenant storage.',
  },
  {
    step: 'Step 02',
    title: 'Extract & Disambiguate',
    detail: 'Modular AI inference extracts demographics, anatomical sites, laterality, and verbatim page citations.',
  },
  {
    step: 'Step 03',
    title: 'Validate Deterministically',
    detail: 'Independent rules engine checks imported CMS/AMA catalogs, NCCI PTP pairs, MUE caps, and payer policies.',
  },
  {
    step: 'Step 04',
    title: 'Human Coder Sign-Off',
    detail: 'Certified coders inspect side-by-side AI vs coder diffs, resolve annotations, and unlock claim readiness.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Strict 3-Zone Top Bar */}
      <header className="border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1320px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#071D49] whitespace-nowrap shrink-0"
          >
            <svg width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <rect width="64" height="64" rx="14" fill="#071D49" />
              <path
                d="M32 10L50 18.5V33.5C50 43.8 42.3 51.9 32 55C21.7 51.9 14 43.8 14 33.5V18.5L32 10Z"
                fill="#0D2C66"
                stroke="#22D3EE"
                strokeWidth="2.4"
              />
              <path
                d="M23 33.5H27.5L30.2 26.5L34.3 39.5L37.2 31.5H41"
                stroke="#22D3EE"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>MEDIIFY</span>
          </a>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-7 text-sm font-medium text-[#64748B]">
            <a href="#platform" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              Platform
            </a>
            <a href="#capabilities" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              Capabilities
            </a>
            <a href="#architecture" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              AI Architecture
            </a>
            <a href="#security" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              Security
            </a>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Midnight Navy Biotech & Clinical Intelligence Hero */}
        <section className="relative overflow-hidden bg-[#071D49] text-white clinical-grid-bg">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 75% 32%, rgba(34, 211, 238, 0.16), transparent 48%), radial-gradient(circle at 18% 85%, rgba(13, 148, 136, 0.2), transparent 50%)',
            }}
          />

          <div className="relative max-w-[1320px] mx-auto px-6 py-16 lg:py-22">
            <div className="grid lg:grid-cols-12 gap-10 items-stretch">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="lg:col-span-6 flex flex-col justify-between py-2"
              >
                <div>
                  <p className="text-xs font-mono tracking-wide text-[#22D3EE] mb-4">
                    Clinical Intelligence · Coding Precision · Revenue Integrity
                  </p>
                  <h1 className="font-display text-[clamp(2.25rem,4.1vw,3.65rem)] font-bold leading-[1.08] tracking-tight text-white text-balance">
                    Turning Clinical Data Into Coding Intelligence.
                  </h1>
                  <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-300 max-w-xl">
                    AI-powered medical coding, clinical validation, insurance intelligence, and denial
                    prevention for the next generation of healthcare operations.
                  </p>
                </div>

                <div className="mt-9 pt-7 border-t border-white/15">
                  <div className="flex flex-wrap items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => onOpenAuth('register')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <a
                      href="#platform"
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/20 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      Explore Platform
                    </a>
                    <button
                      type="button"
                      onClick={() => onOpenAuth('login')}
                      className="md:hidden inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-200 hover:text-white cursor-pointer"
                    >
                      Sign In
                    </button>
                  </div>
                  <p className="mt-4 text-xs text-slate-300/90 leading-relaxed max-w-xl">
                    Every organization provisions an empty, Row-Level Security isolated PostgreSQL workspace.
                    Production ePHI requires executed vendor BAAs and configured Supabase &amp; licensed coding datasets.
                  </p>
                </div>
              </motion.div>

              {/* Interactive 3D Molecular Neural Stage + Animated Document-to-Code Trace */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.08 }}
                className="lg:col-span-6 flex flex-col"
              >
                <div className="relative flex-1 min-h-[380px] rounded-xl border border-white/15 bg-[#051434] overflow-hidden flex flex-col justify-between p-5">
                  <div className="absolute inset-0">
                    <MolecularNeuralCanvas />
                  </div>

                  {/* Top calibration header */}
                  <div className="relative z-10 flex items-center justify-between gap-4 text-xs font-mono text-slate-300 border-b border-white/10 pb-3">
                    <span className="text-[#22D3EE]">Molecular &amp; Clinical Reasoning Graph</span>
                    <span>Illustrative Signal View</span>
                  </div>

                  {/* Bottom interactive document-to-code telemetry overlay */}
                  <div className="relative z-10 mt-auto grid sm:grid-cols-3 gap-3 pt-4">
                    <div className="bg-[#071D49]/90 backdrop-blur-sm border border-white/15 rounded-lg p-3">
                      <p className="font-mono text-[11px] text-[#22D3EE]">01 / Chart Parse</p>
                      <p className="text-xs font-semibold text-white mt-1">Operative &amp; Progress PDFs</p>
                      <p className="text-[11px] text-slate-300 mt-1">Confirmed vs negated entity tagging</p>
                    </div>
                    <div className="bg-[#071D49]/90 backdrop-blur-sm border border-white/15 rounded-lg p-3">
                      <p className="font-mono text-[11px] text-[#0D9488]">02 / Code Rules</p>
                      <p className="text-xs font-semibold text-white mt-1">NCCI · MUE · LCD/NCD</p>
                      <p className="text-[11px] text-slate-300 mt-1">DOS-active catalog enforcement</p>
                    </div>
                    <div className="bg-[#071D49]/90 backdrop-blur-sm border border-white/15 rounded-lg p-3">
                      <p className="font-mono text-[11px] text-[#22D3EE]">03 / Sign-Off</p>
                      <p className="text-xs font-semibold text-white mt-1">Certified Coder Review</p>
                      <p className="text-[11px] text-slate-300 mt-1">Audit-logged claim readiness</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Interactive Feature Demonstration Section */}
        <section id="platform" className="max-w-[1320px] mx-auto px-6 py-18">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mb-8"
          >
            <p className="text-xs font-mono text-[#0D9488] font-medium mb-2">Interactive Platform Preview</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#071D49] text-balance">
              Verifiable clinical evidence paired with deterministic payer validation
            </h2>
            <p className="mt-2.5 text-sm sm:text-base text-[#64748B]">
              Explore how MEDIIFY bridges unstructured clinical charts, authoritative code catalogs, and
              pre-submission denial controls inside a single auditable workspace.
            </p>
          </motion.div>

          <ClinicalCodeFlowViz />
        </section>

        {/* Capabilities & 4-Step Clinical Workflow */}
        <section id="capabilities" className="bg-white border-y border-[#E2E8F0] py-18 clinical-grid-light">
          <div className="max-w-[1320px] mx-auto px-6">
            <div className="grid lg:grid-cols-12 gap-10 items-start mb-12">
              <div className="lg:col-span-5">
                <p className="text-xs font-mono text-[#2563EB] font-medium mb-2">Core Platform Modules</p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#071D49] text-balance">
                  Engineered for medical coders, CDI teams, and RCM leadership
                </h2>
                <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
                  Every module operates on persistent PostgreSQL tenant storage with real dataset imports
                  and zero fabricated statistics or fallback scores.
                </p>
              </div>

              <div className="lg:col-span-7 grid sm:grid-cols-2 gap-5">
                {CAPABILITIES.map((cap) => (
                  <motion.div
                    key={cap.index}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.25 }}
                    className="p-6 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]"
                  >
                    <p className="text-xs font-mono text-[#0D9488] mb-2">{cap.index}</p>
                    <h3 className="font-display text-base font-bold text-[#071D49]">{cap.title}</h3>
                    <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{cap.body}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* 4-Step End-to-End Workflow Strip */}
            <div className="bg-[#071D49] text-white rounded-xl p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-5 mb-6 border-b border-white/15">
                <h3 className="font-display text-lg font-bold">End-to-End Coding &amp; Revenue Integrity Flow</h3>
                <span className="font-mono text-xs text-[#22D3EE]">Human-in-the-Loop Control</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {WORKFLOW_STEPS.map((item) => (
                  <div key={item.step} className="space-y-2">
                    <p className="font-mono text-xs text-[#22D3EE]">{item.step}</p>
                    <h4 className="font-display text-sm font-bold text-white">{item.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Modular AI Architecture & Security Safeguards */}
        <section id="architecture" className="max-w-[1320px] mx-auto px-6 py-18">
          <div className="grid lg:grid-cols-12 gap-8 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.25 }}
              className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-7 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#2563EB] mb-2">
                  <Cpu className="w-4 h-4" />
                  <span>Provider-Independent AI Architecture</span>
                </div>
                <h2 className="font-display text-xl font-bold text-[#071D49]">
                  Server-Side Medical Inference &amp; Hallucination Guardrails
                </h2>
                <p className="mt-2.5 text-sm text-[#64748B] leading-relaxed">
                  MEDIIFY isolates clinical inference behind authenticated server adapters supporting Google
                  Gemini,{' '}
                  <code className="font-mono text-xs bg-[#F8FAFC] border border-[#E2E8F0] px-1.5 py-0.5 rounded">
                    inclusionAI/LingSante-3.1-air-VL
                  </code>
                  , Hugging Face endpoints, and private VPC OpenAI-compatible models.
                </p>
                <ul className="mt-5 space-y-3 text-sm text-slate-700">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                    <span>Zero browser-side model execution or secret exposure; explicit upstream error reporting.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                    <span>Clinical uploads undergo magic-byte, active-PDF, and prompt-injection screening.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                    <span>Recommended codes are verified against imported DOS-active reference catalogs.</span>
                  </li>
                </ul>
              </div>
            </motion.div>

            <motion.div
              id="security"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-7 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488] mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Security, Governance &amp; Tenant Isolation</span>
                </div>
                <h2 className="font-display text-xl font-bold text-[#071D49]">
                  Built Around Healthcare Technical Safeguards
                </h2>
                <p className="mt-2.5 text-sm text-[#64748B] leading-relaxed">
                  Multi-tenant Supabase PostgreSQL Row-Level Security, role-based access control, RFC 6238
                  TOTP MFA with single-use recovery codes, revocable sessions, and immutable audit logs.
                </p>
                <ul className="mt-5 space-y-3 text-sm text-slate-700">
                  <li className="flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-[#071D49] shrink-0 mt-0.5" />
                    <span>Mandatory human coder approval before any claim reaches submission readiness.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Database className="w-4 h-4 text-[#071D49] shrink-0 mt-0.5" />
                    <span>Private encrypted storage bucket policies scoped strictly to organization IDs.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <FileCheck2 className="w-4 h-4 text-[#071D49] shrink-0 mt-0.5" />
                    <span>Synthetic or de-identified workflows until HIPAA BAAs and clearinghouse keys are active.</span>
                  </li>
                </ul>
              </div>
            </motion.div>
          </div>

          {/* Real Operations Workspace Showcase */}
          <div className="mt-10 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden grid lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-5 p-7 sm:p-9 flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2563EB] mb-2">
                  <Stethoscope className="w-4 h-4" />
                  <span>3-Panel Coding Workspace</span>
                </div>
                <h2 className="font-display text-2xl font-bold text-[#071D49]">
                  Designed for high-throughput coding precision
                </h2>
                <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
                  Inspect original PDF/image records side-by-side with extracted clinical entities,
                  annotations, AI vs coder comparisons, deterministic rule audits, and versioned edit logs.
                </p>
              </div>
              <div className="mt-6 pt-5 border-t border-[#E2E8F0] flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#071D49] hover:bg-[#0C2B68] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  Create Organization Workspace
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="px-4 py-2.5 text-sm font-semibold text-[#071D49] border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  Sign In
                </button>
              </div>
            </div>
            <div className="lg:col-span-7 min-h-[260px] bg-[#071D49]">
              <img
                src="/src/assets/images/hero_clinical_intelligence_1795498095708.jpg"
                alt="Healthcare coding specialists reviewing clinical documentation in a clinical operations center"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white py-10">
        <div className="max-w-[1320px] mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-xs text-[#64748B]">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm text-[#071D49]">MEDIIFY</span>
              <span aria-hidden="true">·</span>
              <span>Turning Clinical Data Into Coding Intelligence.</span>
            </div>
            <p>
              AMA CPT commercial license required for proprietary CPT descriptors · Execute BAAs prior to production ePHI.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-medium text-[#071D49]">
            <a href="#platform" className="hover:underline">
              Platform
            </a>
            <a href="#capabilities" className="hover:underline">
              Capabilities
            </a>
            <a href="#security" className="hover:underline">
              Security
            </a>
            <button type="button" onClick={() => onOpenAuth('login')} className="hover:underline cursor-pointer">
              Sign In
            </button>
            <button type="button" onClick={() => onOpenAuth('register')} className="hover:underline cursor-pointer">
              Get Started
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
