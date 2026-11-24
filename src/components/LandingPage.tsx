import React from 'react';
import { ArrowRight, CheckCircle2, FileCheck2, Lock, ShieldCheck } from 'lucide-react';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onLaunchSandbox: () => void;
  sandboxLoading: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onLaunchSandbox,
  sandboxLoading,
}) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-[#071D49] whitespace-nowrap shrink-0"
          >
            MEDIIFY
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#capabilities" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              Capabilities
            </a>
            <a href="#workspace" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              Coding Engine
            </a>
            <a href="#architecture" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              AI Architecture
            </a>
            <a href="#compliance" className="hover:text-[#071D49] transition-colors whitespace-nowrap shrink-0">
              Compliance
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#071D49] hover:bg-[#0D2B66] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main id="top">
        <section className="max-w-[1360px] mx-auto px-6 py-16 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div>
                <p className="text-xs font-semibold tracking-wide text-[#0D9488] mb-3">
                  US Healthcare Medical Coding &amp; Revenue Cycle Intelligence
                </p>
                <h1 className="font-display text-[clamp(2.25rem,4vw,3.4rem)] font-bold leading-[1.1] tracking-tight text-[#071D49] text-balance">
                  Clinical Intelligence. Coding Precision. Revenue Integrity.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-slate-600 max-w-xl">
                  MEDIIFY pairs evidence-linked clinical extraction with a deterministic NCCI, MUE,
                  and LCD/NCD validation engine—helping certified coders, physicians, and RCM teams
                  prevent claim denials before submission without compromising compliance.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onLaunchSandbox}
                  disabled={sandboxLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {sandboxLoading ? 'Loading Sandbox...' : 'Explore Synthetic Sandbox'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#071D49] bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Register Organization
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Sandbox uses clearly labeled synthetic clinical charts only. Production ePHI requires executed BAAs and configured endpoints.
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[320px] rounded-lg overflow-hidden border border-slate-200 bg-slate-900">
                <img
                  src="/src/assets/images/hero_clinical_intelligence_1795498095708.jpg"
                  alt="Health informatics specialists reviewing medical coding documentation in a clinical operations center"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section id="capabilities" className="bg-white border-y border-slate-200 py-16">
          <div className="max-w-[1360px] mx-auto px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="font-display text-2xl font-bold text-[#071D49]">
                Built around verifiable clinical evidence and deterministic payer rules
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Every code recommendation traces back to verbatim chart documentation and passes independent rule validation prior to human approval.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 rounded-lg border border-slate-200 bg-[#F8FAFC]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">01. Document Intelligence</p>
                <h3 className="font-display text-base font-semibold text-[#071D49]">
                  Structured Clinical Extraction
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Process EHR exports, operative notes, radiology reports, PDFs, and scanned charts while distinguishing confirmed, suspected, historical, and negated findings.
                </p>
              </div>

              <div className="p-6 rounded-lg border border-slate-200 bg-[#F8FAFC]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">02. Coding Validation</p>
                <h3 className="font-display text-base font-semibold text-[#071D49]">
                  Deterministic Rules Engine
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Evaluates NCCI procedure-to-procedure edits, MUE unit caps, LCD/NCD medical necessity, laterality, global surgery rules, and DOS effective dates.
                </p>
              </div>

              <div className="p-6 rounded-lg border border-slate-200 bg-[#F8FAFC]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">03. Denial Prevention</p>
                <h3 className="font-display text-base font-semibold text-[#071D49]">
                  Pre-Submission Claim Audits
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Surfaces missing modifiers, prior authorization gaps, unverified insurance coverage, and timely filing exposure with concrete corrective actions.
                </p>
              </div>

              <div className="p-6 rounded-lg border border-slate-200 bg-[#F8FAFC]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">04. Revenue Integrity</p>
                <h3 className="font-display text-base font-semibold text-[#071D49]">
                  Compliant Accuracy First
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Detects documented billable services omitted from claims alongside overcoding and unbundling risks—requiring certified coder sign-off on every change.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Three-Panel Workspace & Modular AI Architecture */}
        <section id="workspace" className="max-w-[1360px] mx-auto px-6 py-16">
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div id="architecture" className="lg:col-span-6 p-7 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2563EB] mb-2">
                <FileCheck2 className="w-4 h-4" />
                <span>Provider-Independent AI Architecture</span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#071D49]">
                Modular Inference &amp; Hallucination Guardrails
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                MEDIIFY abstracts clinical inference behind a server-side adapter layer supporting Google Gemini, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">inclusionAI/LingSante-3.1-air-VL</code>, Hugging Face medical endpoints, and VPC-hosted OpenAI-compatible models.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>All AI credentials remain strictly server-side; zero browser model execution.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>Clinical records are wrapped as untrusted data with prompt-injection screening.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>Every recommended ICD-10, CPT, or HCPCS code is verified against the DOS-active catalog.</span>
                </li>
              </ul>
            </div>

            <div id="compliance" className="lg:col-span-6 p-7 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488] mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Healthcare Security &amp; Auditability</span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#071D49]">
                Designed Around HIPAA Technical Safeguards
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Built with organization-level tenant isolation, role-based access control, scrypt credential hashing, TOTP multi-factor authentication, and immutable audit logging across every PHI interaction.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#071D49] shrink-0 mt-0.5" />
                  <span>Mandatory human coder approval before any claim reaches submission readiness.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#071D49] shrink-0 mt-0.5" />
                  <span>Explicit provenance separation between document-extracted and clearinghouse-verified benefits.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#071D49] shrink-0 mt-0.5" />
                  <span>Includes PostgreSQL + pgvector Supabase migrations with Row-Level Security policies.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="max-w-[1360px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-[#071D49]">MEDIIFY</span>
            <span aria-hidden="true">·</span>
            <span>Clinical Intelligence. Coding Precision. Revenue Integrity.</span>
          </div>
          <div>
            <span>HIPAA-aligned technical safeguards · AMA CPT licensing required for commercial CPT deployment</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
