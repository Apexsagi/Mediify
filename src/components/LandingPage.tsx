import React from 'react';
import { ArrowRight, CheckCircle2, FileCheck2, Lock, ShieldCheck } from 'lucide-react';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  return (
    <div className="min-h-screen bg-[#F1F5F9] text-[#0F172A]">
      {/* Strict 3-Zone Top Bar */}
      <header className="border-b border-[#E2E8F0] bg-white sticky top-0 z-30">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-[#0B1830] whitespace-nowrap shrink-0"
          >
            MEDIIFY
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#64748B]">
            <a href="#capabilities" className="hover:text-[#0B1830] transition-colors whitespace-nowrap shrink-0">
              Capabilities
            </a>
            <a href="#workspace" className="hover:text-[#0B1830] transition-colors whitespace-nowrap shrink-0">
              Coding Engine
            </a>
            <a href="#architecture" className="hover:text-[#0B1830] transition-colors whitespace-nowrap shrink-0">
              AI Architecture
            </a>
            <a href="#compliance" className="hover:text-[#0B1830] transition-colors whitespace-nowrap shrink-0">
              Compliance
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Create Organization
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                <h1 className="font-display text-[clamp(2.25rem,4vw,3.4rem)] font-bold leading-[1.1] tracking-tight text-[#0B1830] text-balance">
                  Clinical Intelligence. Coding Precision. Revenue Integrity.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-[#64748B] max-w-xl">
                  MEDIIFY pairs evidence-linked clinical extraction with a deterministic NCCI, MUE,
                  and LCD/NCD validation engine—helping certified coders, physicians, and RCM teams
                  prevent claim denials before submission with strict tenant isolation.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-[#E2E8F0] flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Create Organization Workspace
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Sign In to Existing Tenant
                </button>
              </div>
              <p className="mt-3 text-xs text-[#64748B]">
                Every new organization starts with a clean, isolated PostgreSQL workspace protected by Row-Level Security. Production ePHI requires configured Supabase credentials and executed BAAs.
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[320px] rounded-lg overflow-hidden border border-[#E2E8F0] bg-[#0B1830]">
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
        <section id="capabilities" className="bg-white border-y border-[#E2E8F0] py-16">
          <div className="max-w-[1360px] mx-auto px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="font-display text-2xl font-bold text-[#0B1830]">
                Built around verifiable clinical evidence and deterministic payer rules
              </h2>
              <p className="mt-2 text-sm text-[#64748B]">
                Every code recommendation traces back to verbatim chart documentation and passes independent rule validation prior to human approval.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">01. Document Intelligence</p>
                <h3 className="font-display text-base font-semibold text-[#0B1830]">
                  Structured Clinical Extraction
                </h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                  Process EHR exports, operative notes, radiology reports, PDFs, and scanned charts stored in private encrypted storage while separating confirmed, suspected, historical, and negated findings.
                </p>
              </div>

              <div className="p-6 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">02. Coding Validation</p>
                <h3 className="font-display text-base font-semibold text-[#0B1830]">
                  Authoritative Dataset Engine
                </h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                  Validates NCCI procedure-to-procedure edits, MUE unit caps, LCD/NCD medical necessity, laterality, and DOS effective dates—blocking claim readiness when reference datasets are missing.
                </p>
              </div>

              <div className="p-6 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">03. Denial Prevention</p>
                <h3 className="font-display text-base font-semibold text-[#0B1830]">
                  Pre-Submission Claim Audits
                </h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                  Tracks 12 specialized denial risk categories including missing modifiers, prior authorization gaps, unverified coverage, bundling conflicts, and timely filing exposure with reviewer assignment.
                </p>
              </div>

              <div className="p-6 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]">
                <p className="text-xs font-mono text-[#0D9488] mb-2">04. Revenue Integrity</p>
                <h3 className="font-display text-base font-semibold text-[#0B1830]">
                  Compliant Accuracy First
                </h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                  Detects documented billable services omitted from claims alongside overcoding and unbundling risks—requiring certified coder sign-off and versioned audit trails on every edit.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Three-Panel Workspace & Modular AI Architecture */}
        <section id="workspace" className="max-w-[1360px] mx-auto px-6 py-16">
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div id="architecture" className="lg:col-span-6 p-7 rounded-lg border border-[#E2E8F0] bg-white">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2563EB] mb-2">
                <FileCheck2 className="w-4 h-4" />
                <span>Provider-Independent AI Architecture</span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#0B1830]">
                Modular Inference &amp; Hallucination Guardrails
              </h2>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                MEDIIFY abstracts clinical inference behind a server-side adapter layer supporting Google Gemini,{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">inclusionAI/LingSante-3.1-air-VL</code>,
                Hugging Face medical endpoints, and VPC-hosted OpenAI-compatible models.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>All AI credentials remain strictly server-side; zero browser model execution or silent provider fallback.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>Clinical records undergo magic-byte validation, PDF active-content scanning, and prompt-injection screening.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>Every recommended ICD-10, CPT, or HCPCS code is verified against imported DOS-active catalogs.</span>
                </li>
              </ul>
            </div>

            <div id="compliance" className="lg:col-span-6 p-7 rounded-lg border border-[#E2E8F0] bg-white">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488] mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Healthcare Security &amp; Auditability</span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#0B1830]">
                Designed Around HIPAA Technical Safeguards
              </h2>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                Built with PostgreSQL Row-Level Security tenant isolation, role-based access control, RFC 6238 TOTP MFA with recovery codes, revocable short-lived sessions, and immutable audit logging.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#0B1830] shrink-0 mt-0.5" />
                  <span>Mandatory human coder approval before any claim reaches submission readiness.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#0B1830] shrink-0 mt-0.5" />
                  <span>Explicit provenance separation between document-extracted, manually entered, and clearinghouse-verified benefits.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#0B1830] shrink-0 mt-0.5" />
                  <span>PostgreSQL + pgvector Supabase schema with Row-Level Security and private storage bucket policies.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white py-8">
        <div className="max-w-[1360px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-[#0B1830]">MEDIIFY</span>
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
