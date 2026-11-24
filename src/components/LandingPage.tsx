import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Database,
  FileCheck2,
  FileText,
  Layers,
  Lock,
  Menu,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  INTEGRATION_CATALOG,
  MEDIIFY_ECOSYSTEM_MODULES,
  SOLUTION_VERTICALS,
} from '../lib/marketingAndModules';
import { ClinicalCodeFlowViz } from './ClinicalCodeFlowViz';
import { LeadCaptureForm } from './MarketingSubPages';
import { MediifyLogo } from './MediifyLogo';
import { ThreeClinicalHeroCanvas } from './ThreeClinicalHeroCanvas';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onNavigateMarketing: (path: string) => void;
}

const HEALTHCARE_CHALLENGES = [
  {
    code: '01 / CHART FRAGMENTATION',
    title: 'Complex Unstructured Clinical Notes',
    detail:
      'Operative notes, radiology reads, and progress summaries often blend confirmed diagnoses with ruled-out conditions, prior history, and ambiguous laterality.',
  },
  {
    code: '02 / EDIT EXPOSURE',
    title: 'Payer Policy & NCCI Edit Drift',
    detail:
      'Missing modifier -25 or -59 qualifiers, MUE unit overages, and mismatched ICD-10-CM medical necessity codes trigger preventable claim rejections.',
  },
  {
    code: '03 / COVERAGE BLIND SPOTS',
    title: 'Unverified Eligibility & Prior Auth Gaps',
    detail:
      'Treating OCR-extracted insurance card numbers as active eligibility causes downstream denials when real clearinghouse X12 270/271 status is never checked.',
  },
  {
    code: '04 / AUDIT LIABILITY',
    title: 'Opaque AI Without Chart Evidence',
    detail:
      'Black-box coding suggestions without verbatim page citations or human coder approval history cannot withstand payer audits or compliance review.',
  },
];

const WORKFLOW_PIPELINE = [
  {
    step: 'Step 01',
    title: 'Ingest & Screen Records',
    detail:
      'PDFs, scanned images, and clinical notes undergo magic-byte, active-PDF, and prompt-injection checks before entering encrypted tenant buckets.',
  },
  {
    step: 'Step 02',
    title: 'Extract & Cite Evidence',
    detail:
      'Server-side adapters (Gemini, LingSante-3.1-air-VL, Hugging Face, VPC) tag confirmed vs. negated findings with exact chart page numbers.',
  },
  {
    step: 'Step 03',
    title: 'Validate Deterministically',
    detail:
      'An independent rules engine inspects imported ICD-10, CPT, HCPCS, NCCI PTP pairs, MUE caps, laterality, and CMS LCD/NCD criteria.',
  },
  {
    step: 'Step 04',
    title: 'Human Sign-Off & Audit',
    detail:
      'Certified coders review side-by-side AI vs. coder diffs, mitigate denial risks, and log immutable approvals before claim readiness.',
  },
];

const CODING_SYSTEMS = [
  {
    system: 'ICD-10-CM & ICD-10-PCS',
    focus: 'Diagnosis Specificity, Laterality & Inpatient Procedures',
    detail: 'Verifies billable leaf codes, anatomical site alignment, encounter DOS active windows, and suspected-condition guardrails.',
  },
  {
    system: 'CPT® & E/M Evaluation',
    focus: 'Procedural Coding & Global Surgery Rules',
    detail: 'Supports licensed AMA CPT imports with NCCI Column 1/Column 2 bundling checks and same-day Modifier -25 evaluation.',
  },
  {
    system: 'HCPCS Level II & Modifiers',
    focus: 'Supplies, Injectables & Anatomical Modifiers',
    detail: 'Validates -LT/-RT/-50/-25/-59 modifier compatibility alongside CMS Medically Unlikely Edit (MUE) unit caps.',
  },
];

const HERO_DOCK_SLUGS = ['code', 'verify', 'shield', 'eligibility', 'insights'];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onNavigateMarketing }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeEcosystemFilter, setActiveEcosystemFilter] = useState<'all' | 'coding' | 'rcm' | 'platform'>('all');
  const [leadFormTab, setLeadFormTab] = useState<'demo_request' | 'contact_inquiry'>('demo_request');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [newsletterBusy, setNewsletterBusy] = useState(false);

  const heroDockModules = HERO_DOCK_SLUGS.map((slug) =>
    MEDIIFY_ECOSYSTEM_MODULES.find((m) => m.slug === slug),
  ).filter((m): m is NonNullable<typeof m> => Boolean(m));

  const filteredModules = MEDIIFY_ECOSYSTEM_MODULES.filter((mod) => {
    if (activeEcosystemFilter === 'all') return true;
    if (activeEcosystemFilter === 'coding') return ['code', 'assist', 'automate', 'clinical'].includes(mod.slug);
    if (activeEcosystemFilter === 'rcm') return ['verify', 'shield', 'eligibility', 'audit'].includes(mod.slug);
    return ['connect', 'insights'].includes(mod.slug);
  });

  async function handleNewsletterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setNewsletterBusy(true);
    setNewsletterStatus(null);
    try {
      const resp = await apiRequest<{ message: string }>('/public/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email: newsletterEmail.trim(), organization_type: 'general' }),
      });
      setNewsletterStatus({ ok: true, text: resp.message });
      setNewsletterEmail('');
    } catch (err) {
      if (err instanceof ApiError && err.missingVariables?.length) {
        setNewsletterStatus({
          ok: false,
          text: `${err.message} Configuration required: ${err.missingVariables.join(', ')}`,
        });
      } else {
        setNewsletterStatus({
          ok: false,
          text: err instanceof Error ? err.message : 'Unable to subscribe right now.',
        });
      }
    } finally {
      setNewsletterBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#06152B]">
      {/* SECTION 0: Floating / Sticky Enterprise Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#06152B] border-b border-white/15 shadow-md">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <a href="#top" className="shrink-0">
            <MediifyLogo variant="light" subtitle="HEALTHCARE INTELLIGENCE PLATFORM" />
          </a>

          <nav aria-label="Primary Navigation" className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-200">
            <a
              href="#ecosystem"
              className="inline-flex items-center gap-1 hover:text-[#22D3EE] transition-colors whitespace-nowrap shrink-0"
            >
              Platform
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </a>
            <a
              href="#solutions"
              className="inline-flex items-center gap-1 hover:text-[#22D3EE] transition-colors whitespace-nowrap shrink-0"
            >
              Solutions
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </a>
            <button
              type="button"
              onClick={() => onNavigateMarketing('/integrations-hub')}
              className="hover:text-[#22D3EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Integrations
            </button>
            <a
              href="#walkthrough"
              className="hover:text-[#22D3EE] transition-colors whitespace-nowrap shrink-0"
            >
              Resources
            </a>
            <button
              type="button"
              onClick={() => onNavigateMarketing('/security-governance')}
              className="hover:text-[#22D3EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Security
            </button>
          </nav>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="px-4 py-2 text-xs font-semibold text-white border border-white/25 hover:bg-white/10 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
            <a
              href="#demo-contact"
              className="px-4 py-2 text-xs font-semibold text-[#06152B] bg-[#22D3EE] hover:bg-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Request a Demo
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="lg:hidden p-2 rounded-md border border-white/20 text-white cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#06152B] border-t border-white/10 px-6 py-4 space-y-3 text-sm text-slate-200">
            <a href="#ecosystem" onClick={() => setMobileMenuOpen(false)} className="block py-1 hover:text-[#22D3EE]">
              Platform Ecosystem (10 Modules)
            </a>
            <a href="#solutions" onClick={() => setMobileMenuOpen(false)} className="block py-1 hover:text-[#22D3EE]">
              Healthcare Solutions
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateMarketing('/integrations-hub');
              }}
              className="block py-1 hover:text-[#22D3EE] cursor-pointer"
            >
              Integrations Hub
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateMarketing('/security-governance');
              }}
              className="block py-1 hover:text-[#22D3EE] cursor-pointer"
            >
              Security &amp; Governance
            </button>
            <div className="pt-3 border-t border-white/10 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('login');
                }}
                className="flex-1 py-2 text-xs font-semibold text-white border border-white/25 rounded-md cursor-pointer"
              >
                Sign In
              </button>
              <a
                href="#demo-contact"
                onClick={() => setMobileMenuOpen(false)}
                className="flex-1 py-2 text-center text-xs font-semibold text-[#06152B] bg-[#22D3EE] rounded-md"
              >
                Request a Demo
              </a>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        {/* SECTION 1: Immersive Midnight Navy Hero + Interactive 3D Stage + Module Quick Dock */}
        <section className="relative overflow-hidden bg-[#06152B] text-white clinical-grid-bg border-b border-white/10">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 72% 35%, rgba(34, 211, 238, 0.16), transparent 52%), radial-gradient(circle at 18% 82%, rgba(13, 148, 136, 0.2), transparent 48%)',
            }}
          />

          <div className="relative max-w-[1360px] mx-auto px-6 pt-12 pb-10 lg:pt-16 lg:pb-12">
            <div className="grid lg:grid-cols-12 gap-8 items-center">
              {/* Left Narrative Column */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="lg:col-span-6 space-y-6"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#22D3EE]/35 bg-[#0A2142] text-xs font-mono text-[#22D3EE]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>AI-Powered Healthcare Intelligence</span>
                </div>

                <h1 className="font-display text-[clamp(2.35rem,4.3vw,3.85rem)] font-extrabold leading-[1.06] tracking-tight text-white text-balance">
                  From Clinical Complexity to{' '}
                  <span className="text-[#22D3EE]">Coding Clarity.</span>
                </h1>

                <p className="text-base sm:text-lg leading-relaxed text-slate-300 max-w-xl">
                  Transform healthcare documentation into evidence-supported medical coding, actionable compliance
                  insights, and intelligent revenue cycle decisions.
                </p>

                <div className="flex flex-wrap items-center gap-3.5 pt-1">
                  <a
                    href="#demo-contact"
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-[#06152B] bg-gradient-to-r from-[#22D3EE] to-[#38BDF8] hover:brightness-105 rounded-md transition-all whitespace-nowrap shrink-0"
                  >
                    Request a Demo
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  <a
                    href="#ecosystem"
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-white/5 hover:bg-white/10 border border-white/25 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    Explore the Platform
                  </a>
                </div>

                {/* 4 Hero Capability Markers */}
                <div className="pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-200">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-[#22D3EE] shrink-0" />
                    <span className="leading-tight font-medium">Accurate Medical Coding</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#0D9488] shrink-0" />
                    <span className="leading-tight font-medium">Compliance &amp; Validation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#22D3EE] shrink-0" />
                    <span className="leading-tight font-medium">Insurance Verification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#0D9488] shrink-0" />
                    <span className="leading-tight font-medium">Denial Prevention</span>
                  </div>
                </div>
              </motion.div>

              {/* Right 3D Stage + Animated Document -> MEDIIFY AI -> Validated Coding Pipeline */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.08 }}
                className="lg:col-span-6"
              >
                <div className="relative h-[430px] rounded-2xl border border-white/15 bg-[#041022] overflow-hidden flex flex-col justify-between p-5">
                  {/* Interactive Three.js 3D Helix & Lattice Canvas */}
                  <div className="absolute inset-0">
                    <ThreeClinicalHeroCanvas />
                  </div>

                  {/* Top Stage Label (no backdrop-blur over WebGL canvas) */}
                  <div className="relative z-10 flex items-center justify-between text-xs font-mono">
                    <span className="px-2.5 py-1 rounded bg-[#06152B]/90 border border-[#22D3EE]/30 text-[#22D3EE]">
                      Interactive 3D Clinical Lattice
                    </span>
                    <span className="px-2.5 py-1 rounded bg-[#06152B]/90 border border-white/15 text-slate-300">
                      Illustrative Pipeline View
                    </span>
                  </div>

                  {/* Foreground 3-Node Pipeline Overlay positioned in lower-mid frame so 3D helix shines above & behind */}
                  <div className="relative z-10 mt-auto mb-3 grid grid-cols-3 gap-2.5 items-center">
                    <div className="rounded-xl bg-[#071B37]/85 border border-white/20 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <FileText className="w-4 h-4 text-[#22D3EE]" />
                        <span className="font-mono text-[10px] text-slate-300">INPUT</span>
                      </div>
                      <p className="text-xs font-bold text-white leading-snug">Clinical Documentation</p>
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded bg-white/20" />
                        <div className="h-1.5 w-4/5 rounded bg-[#22D3EE]/45" />
                        <div className="h-1.5 w-3/4 rounded bg-white/15" />
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#0B2752]/88 border border-[#22D3EE]/60 p-3 text-center space-y-2 shadow-lg">
                      <div className="mx-auto w-9 h-9 rounded-lg bg-[#2563EB]/30 border border-[#22D3EE]/50 flex items-center justify-center">
                        <Cpu className="w-5 h-5 text-[#22D3EE]" />
                      </div>
                      <p className="font-display text-xs font-extrabold tracking-wide text-white">MEDIIFY AI</p>
                      <p className="font-mono text-[10px] text-[#22D3EE]">Modular Inference + Rules</p>
                    </div>

                    <div className="rounded-xl bg-[#071B37]/85 border border-[#0D9488]/50 p-3 space-y-1.5">
                      <p className="text-xs font-bold text-white">Validated Coding</p>
                      <ul className="space-y-1 font-mono text-[10px] text-slate-200">
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-[#22D3EE] shrink-0" />
                          <span>ICD-10-CM</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-[#22D3EE] shrink-0" />
                          <span>CPT®</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-[#22D3EE] shrink-0" />
                          <span>HCPCS</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-[#0D9488] shrink-0" />
                          <span>Modifiers</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Bottom Stage Note */}
                  <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-300 bg-[#06152B]/90 border border-white/15 rounded-lg px-3 py-2">
                    <span>Move pointer to inspect 3D clinical graph</span>
                    <span className="font-mono text-[#22D3EE]">Human Sign-Off Required</span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Bottom 5-Module Dock */}
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {heroDockModules.map((mod) => (
                <button
                  key={mod.slug}
                  type="button"
                  onClick={() => onNavigateMarketing(`/products/${mod.slug}`)}
                  className="text-left p-4 rounded-xl bg-[#0B1E3B]/90 hover:bg-[#10294F] border border-white/15 hover:border-[#22D3EE]/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-display text-sm font-bold text-white group-hover:text-[#22D3EE] transition-colors">
                      {mod.name}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#22D3EE] transition-colors shrink-0" />
                  </div>
                  <p className="text-xs text-slate-300 leading-snug">{mod.shortTag}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 2: Healthcare Operational Challenges */}
        <section className="max-w-[1360px] mx-auto px-6 py-16">
          <div className="max-w-2xl mb-9">
            <p className="font-mono text-xs font-semibold text-[#0D9488] mb-2">01 · Healthcare Operational Challenges</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#06152B] text-balance">
              Why legacy coding workflows leak revenue and create compliance exposure
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {HEALTHCARE_CHALLENGES.map((item) => (
              <div key={item.code} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-2.5">
                <p className="font-mono text-[11px] font-semibold text-[#2563EB]">{item.code}</p>
                <h3 className="font-display text-base font-bold text-[#06152B]">{item.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 3: Interactive MEDIIFY Platform Ecosystem (All 10 Modules) */}
        <section id="ecosystem" className="bg-white border-y border-[#E2E8F0] py-18 clinical-grid-light">
          <div className="max-w-[1360px] mx-auto px-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
              <div className="max-w-2xl">
                <p className="font-mono text-xs font-semibold text-[#2563EB] mb-2">
                  02 · The MEDIIFY Product Ecosystem
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#06152B] text-balance">
                  Ten integrated intelligence modules spanning coding, verification, and revenue integrity
                </h2>
                <p className="mt-2.5 text-sm text-[#64748B]">
                  Inspect any module below to review its server-side architecture, guardrails, and workspace controls.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 bg-[#F8FAFC] p-1 border border-[#E2E8F0] rounded-lg">
                {(
                  [
                    ['all', 'All 10 Modules'],
                    ['coding', 'Clinical & Coding'],
                    ['rcm', 'Validation & RCM'],
                    ['platform', 'Connect & Insights'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveEcosystemFilter(key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeEcosystemFilter === key
                        ? 'bg-[#06152B] text-white'
                        : 'text-[#64748B] hover:text-[#06152B]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredModules.map((mod) => {
                const isDisabled = mod.status === 'DISABLED_PENDING_VALIDATION';
                return (
                  <button
                    key={mod.slug}
                    type="button"
                    onClick={() => onNavigateMarketing(`/products/${mod.slug}`)}
                    className={`text-left rounded-xl border p-6 flex flex-col justify-between transition-all cursor-pointer group ${
                      isDisabled
                        ? 'bg-amber-50/40 border-amber-200 hover:border-amber-400'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#2563EB] hover:bg-white'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-base font-bold text-[#06152B] group-hover:text-[#2563EB] transition-colors">
                          {mod.name}
                        </span>
                        <span
                          className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                            isDisabled
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-white text-[#0D9488] border-[#E2E8F0]'
                          }`}
                        >
                          {isDisabled ? 'Disabled · Pending Validation' : mod.shortTag}
                        </span>
                      </div>
                      <p className="text-sm text-[#64748B] leading-relaxed">{mod.summary}</p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs font-semibold text-[#06152B]">
                      <span>{mod.statusNote}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#2563EB] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 4: Animated Clinical-Document-to-Code Workflow */}
        <section className="max-w-[1360px] mx-auto px-6 py-16">
          <div className="bg-[#06152B] text-white rounded-2xl p-7 sm:p-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-6 mb-7 border-b border-white/15">
              <div>
                <p className="font-mono text-xs text-[#22D3EE] mb-1">03 · End-to-End Pipeline</p>
                <h2 className="font-display text-xl sm:text-2xl font-bold">
                  From Unstructured Chart Upload to Audit-Ready Claim Readiness
                </h2>
              </div>
              <span className="font-mono text-xs text-teal-300 border border-[#0D9488]/50 bg-[#0D9488]/15 px-3 py-1 rounded self-start">
                Human-in-the-Loop Enforced
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {WORKFLOW_PIPELINE.map((item) => (
                <div key={item.step} className="space-y-2 border-l-2 border-[#22D3EE]/50 pl-4">
                  <p className="font-mono text-xs font-semibold text-[#22D3EE]">{item.step}</p>
                  <h3 className="font-display text-base font-bold text-white">{item.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 5: Medical Coding Intelligence Capabilities */}
        <section className="max-w-[1360px] mx-auto px-6 pb-16">
          <div className="max-w-2xl mb-8">
            <p className="font-mono text-xs font-semibold text-[#0D9488] mb-2">04 · Medical Coding Intelligence</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#06152B]">
              Catalog-grounded ICD-10-CM/PCS, CPT, HCPCS &amp; Modifier verification
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {CODING_SYSTEMS.map((cs) => (
              <div key={cs.system} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-2.5">
                <p className="font-mono text-xs font-bold text-[#2563EB]">{cs.system}</p>
                <h3 className="font-display text-base font-bold text-[#06152B]">{cs.focus}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{cs.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 6 & SECTION 7: Insurance Verification + Denial Prevention & Revenue Integrity */}
        <section className="bg-white border-y border-[#E2E8F0] py-16">
          <div className="max-w-[1360px] mx-auto px-6 grid lg:grid-cols-2 gap-7">
            {/* Section 6: Insurance & Medical Necessity Verification */}
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-7 space-y-4">
              <p className="font-mono text-xs font-semibold text-[#2563EB]">
                05 · Insurance &amp; Medical Necessity Verification
              </p>
              <h2 className="font-display text-xl font-bold text-[#06152B]">
                Strict Provenance Isolation Between OCR Cards and Clearinghouse X12 271
              </h2>
              <p className="text-sm text-[#64748B] leading-relaxed">
                MEDIIFY Eligibility never fabricates payer responses. Scanned insurance card extractions remain labeled{' '}
                <code className="font-mono text-xs bg-white px-1.5 py-0.5 border border-[#E2E8F0] rounded">
                  EXTRACTED_FROM_DOCUMENT
                </code>{' '}
                until an authorized server-side clearinghouse transaction records active coverage, copay, deductible, and
                prior authorization requirements.
              </p>
              <button
                type="button"
                onClick={() => onNavigateMarketing('/products/eligibility')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
              >
                Explore MEDIIFY Eligibility
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Section 7: Denial Prevention & Revenue Integrity */}
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-7 space-y-4">
              <p className="font-mono text-xs font-semibold text-[#0D9488]">
                06 · Denial Prevention &amp; Revenue Integrity
              </p>
              <h2 className="font-display text-xl font-bold text-[#06152B]">
                Pre-Submission Risk Audits Protecting Both Compliance and Capture
              </h2>
              <p className="text-sm text-[#64748B] leading-relaxed">
                MEDIIFY Shield screens every coded encounter across 12 deterministic denial categories—from NCCI bundling
                conflicts to timely filing windows—while Revenue Integrity flags both undocumented overcoding exposure and
                missed documented services.
              </p>
              <button
                type="button"
                onClick={() => onNavigateMarketing('/products/shield')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D9488] hover:underline cursor-pointer"
              >
                Explore MEDIIFY Shield &amp; Audit
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 8: Specialty-Specific Healthcare Solutions */}
        <section id="solutions" className="max-w-[1360px] mx-auto px-6 py-16">
          <div className="max-w-2xl mb-9">
            <p className="font-mono text-xs font-semibold text-[#2563EB] mb-2">
              07 · Healthcare Organization Solutions
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#06152B]">
              Configured for acute care systems, practices, ASCs, RCM teams, and independent coders
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SOLUTION_VERTICALS.map((sol) => (
              <button
                key={sol.slug}
                type="button"
                onClick={() => onNavigateMarketing(`/solutions/${sol.slug}`)}
                className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB] rounded-xl p-6 flex flex-col justify-between transition-colors cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#0D9488] font-semibold">{sol.audience}</span>
                    <Building2 className="w-4 h-4 text-[#64748B] group-hover:text-[#2563EB] shrink-0" />
                  </div>
                  <h3 className="font-display text-base font-bold text-[#06152B]">{sol.name}</h3>
                  <p className="text-sm text-[#64748B] leading-relaxed">{sol.summary}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs font-semibold text-[#2563EB]">
                  <span>View Vertical Workflows</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* SECTION 9 & SECTION 10: EHR Integrations & Security Governance */}
        <section className="bg-white border-y border-[#E2E8F0] py-16">
          <div className="max-w-[1360px] mx-auto px-6 grid lg:grid-cols-12 gap-7">
            {/* Section 9: EHR & EMR Integration Capabilities */}
            <div className="lg:col-span-6 rounded-xl border border-[#E2E8F0] p-7 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs font-semibold text-[#2563EB]">08 · EHR, Payer &amp; AI Integrations</p>
                <Layers className="w-4 h-4 text-[#2563EB]" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#06152B]">
                Server-Side FHIR R4, Clearinghouse X12 &amp; Modular Medical LLMs
              </h2>
              <p className="text-sm text-[#64748B] leading-relaxed">
                Connect Google Gemini, <code className="font-mono text-xs">inclusionAI/LingSante-3.1-air-VL</code>,
                Hugging Face endpoints, FHIR R4 EHRs, and clearinghouses behind SSRF-validated server adapters.
              </p>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {INTEGRATION_CATALOG.map((cat) => (
                  <div key={cat.category} className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="font-semibold text-[#06152B]">{cat.category}</p>
                    <p className="text-[#64748B] mt-0.5 truncate">{cat.systems[0]}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onNavigateMarketing('/integrations-hub')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
              >
                Open Integrations Hub
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Section 10: Security & Data Governance */}
            <div className="lg:col-span-6 rounded-xl border border-[#E2E8F0] p-7 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs font-semibold text-[#0D9488]">09 · Security &amp; Data Governance</p>
                <Lock className="w-4 h-4 text-[#0D9488]" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#06152B]">
                Row-Level Tenant Isolation, TOTP MFA &amp; BAA-Gated Production PHI
              </h2>
              <ul className="space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <Database className="w-4 h-4 text-[#06152B] shrink-0 mt-0.5" />
                  <span>Supabase PostgreSQL Row-Level Security scopes every query to active organization ID.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                  <span>RFC 6238 TOTP MFA, recovery codes, revocable sessions, and immutable actor audit logs.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <FileCheck2 className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                  <span>Zero synthetic fallback data in production; mandatory vendor BAA attestation before ePHI.</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={() => onNavigateMarketing('/security-governance')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D9488] hover:underline cursor-pointer"
              >
                Review Security Architecture
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 11: Interactive Product Walkthrough */}
        <section id="walkthrough" className="max-w-[1360px] mx-auto px-6 py-16">
          <div className="max-w-2xl mb-8">
            <p className="font-mono text-xs font-semibold text-[#0D9488] mb-2">
              10 · Interactive Product Walkthrough
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#06152B] text-balance">
              Inspect evidence highlighting, NCCI rules, and eligibility provenance in action
            </h2>
          </div>

          <ClinicalCodeFlowViz />
        </section>

        {/* SECTION 12: Functional Request a Demo, Contact & Newsletter */}
        <section id="demo-contact" className="bg-white border-t border-[#E2E8F0] py-16">
          <div className="max-w-[1360px] mx-auto px-6 grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-6">
              <div>
                <p className="font-mono text-xs font-semibold text-[#2563EB] mb-2">
                  11 · Connect With MEDIIFY
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#06152B]">
                  Schedule an Architecture Demo or Launch Your Workspace
                </h2>
                <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
                  Every demo request and contact inquiry persists directly to PostgreSQL with optional team webhook
                  dispatch—no dead forms or simulated submissions.
                </p>
              </div>

              {/* Quick Workspace Launch */}
              <div className="p-5 rounded-xl bg-[#06152B] text-white space-y-3">
                <p className="font-display text-base font-bold">Provision an Independent Workspace Now</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Register a Hospital, Clinic, ASC, RCM Company, or Independent Coder tenant with zero sample charts.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register')}
                    className="px-4 py-2 text-xs font-semibold text-[#06152B] bg-[#22D3EE] hover:bg-cyan-300 rounded-md cursor-pointer"
                  >
                    Create Organization
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('login')}
                    className="px-4 py-2 text-xs font-semibold text-white border border-white/25 hover:bg-white/10 rounded-md cursor-pointer"
                  >
                    Sign In
                  </button>
                </div>
              </div>

              {/* Regulatory Briefing Newsletter */}
              <form
                onSubmit={handleNewsletterSubmit}
                className="p-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3"
              >
                <p className="font-display text-sm font-bold text-[#06152B]">
                  CMS Coding &amp; Revenue Integrity Briefings
                </p>
                <p className="text-xs text-[#64748B]">
                  Receive updates on ICD-10/NCCI dataset releases and MEDIIFY engineering releases.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    aria-label="Work email for regulatory briefings"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="work.email@organization.org"
                    className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-md"
                  />
                  <button
                    type="submit"
                    disabled={newsletterBusy}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[#06152B] hover:bg-[#0E284D] rounded-md cursor-pointer shrink-0 disabled:opacity-60"
                  >
                    {newsletterBusy ? 'Saving...' : 'Subscribe'}
                  </button>
                </div>
                {newsletterStatus && (
                  <p
                    className={`text-xs flex items-start gap-1.5 ${
                      newsletterStatus.ok ? 'text-[#0D9488]' : 'text-amber-800'
                    }`}
                  >
                    {newsletterStatus.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    )}
                    <span>{newsletterStatus.text}</span>
                  </p>
                )}
              </form>
            </div>

            <div className="lg:col-span-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2 p-1 bg-white border border-[#E2E8F0] rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setLeadFormTab('demo_request')}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    leadFormTab === 'demo_request' ? 'bg-[#06152B] text-white' : 'text-[#64748B]'
                  }`}
                >
                  Request a Demo
                </button>
                <button
                  type="button"
                  onClick={() => setLeadFormTab('contact_inquiry')}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    leadFormTab === 'contact_inquiry' ? 'bg-[#06152B] text-white' : 'text-[#64748B]'
                  }`}
                >
                  Contact Team
                </button>
              </div>

              <LeadCaptureForm leadType={leadFormTab} sourcePath="/" compact />
            </div>
          </div>
        </section>
      </main>

      {/* SECTION 13: Professional Enterprise Footer */}
      <footer className="bg-[#06152B] text-slate-300 border-t border-white/10 py-12">
        <div className="max-w-[1360px] mx-auto px-6 grid md:grid-cols-12 gap-8 text-xs">
          <div className="md:col-span-4 space-y-3">
            <MediifyLogo variant="light" subtitle="FROM CLINICAL COMPLEXITY TO CODING CLARITY" />
            <p className="text-slate-400 leading-relaxed max-w-sm">
              AI-powered medical coding, clinical documentation intelligence, deterministic compliance validation, and
              revenue cycle protection.
            </p>
            <p className="text-[11px] text-slate-400">
              AMA CPT commercial license required for proprietary CPT descriptors · Execute vendor BAAs prior to
              processing live ePHI.
            </p>
          </div>

          <div className="md:col-span-3 space-y-2">
            <p className="font-display font-bold text-white uppercase tracking-wider text-[11px]">Platform Modules</p>
            <ul className="space-y-1.5">
              {MEDIIFY_ECOSYSTEM_MODULES.slice(0, 5).map((m) => (
                <li key={m.slug}>
                  <button
                    type="button"
                    onClick={() => onNavigateMarketing(`/products/${m.slug}`)}
                    className="hover:text-[#22D3EE] cursor-pointer"
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3 space-y-2">
            <p className="font-display font-bold text-white uppercase tracking-wider text-[11px]">
              Intelligence &amp; Governance
            </p>
            <ul className="space-y-1.5">
              {MEDIIFY_ECOSYSTEM_MODULES.slice(5).map((m) => (
                <li key={m.slug}>
                  <button
                    type="button"
                    onClick={() => onNavigateMarketing(`/products/${m.slug}`)}
                    className="hover:text-[#22D3EE] cursor-pointer"
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2 space-y-2">
            <p className="font-display font-bold text-white uppercase tracking-wider text-[11px]">Company</p>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/integrations-hub')}
                  className="hover:text-[#22D3EE] cursor-pointer"
                >
                  Integrations Hub
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/security-governance')}
                  className="hover:text-[#22D3EE] cursor-pointer"
                >
                  Security &amp; Governance
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/request-demo')}
                  className="hover:text-[#22D3EE] cursor-pointer"
                >
                  Request a Demo
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/contact')}
                  className="hover:text-[#22D3EE] cursor-pointer"
                >
                  Contact Team
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="hover:text-[#22D3EE] cursor-pointer"
                >
                  Workspace Sign In
                </button>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
};
