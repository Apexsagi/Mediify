import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  FileCheck2,
  Layers,
  Lock,
  Mail,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  INTEGRATION_CATALOG,
  MEDIIFY_ECOSYSTEM_MODULES,
  ORGANIZATION_TYPES,
  SOLUTION_VERTICALS,
  findProductModule,
  findSolutionVertical,
  type OrganizationTypeId,
} from '../lib/marketingAndModules';
import { MediifyLogo } from './MediifyLogo';

export type PublicMarketingRoute =
  | { kind: 'landing' }
  | { kind: 'product'; slug: string }
  | { kind: 'solution'; slug: string }
  | { kind: 'integrations-hub' }
  | { kind: 'security-governance' }
  | { kind: 'request-demo' }
  | { kind: 'contact' };

interface LeadCaptureFormProps {
  leadType: 'demo_request' | 'contact_inquiry';
  sourcePath: string;
  compact?: boolean;
}

export const LeadCaptureForm: React.FC<LeadCaptureFormProps> = ({ leadType, sourcePath, compact = false }) => {
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationType, setOrganizationType] = useState<OrganizationTypeId>('clinic');
  const [phone, setPhone] = useState('');
  const [monthlyEncounters, setMonthlyEncounters] = useState('');
  const [ehrSystem, setEhrSystem] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [missingEnvVars, setMissingEnvVars] = useState<string[]>([]);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    id: string;
    message: string;
    notificationStatus: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMissingEnvVars([]);
    setSubmitting(true);
    try {
      const resp = await apiRequest<{
        id: string;
        message: string;
        notificationStatus: string;
      }>('/public/leads', {
        method: 'POST',
        body: JSON.stringify({
          lead_type: leadType,
          full_name: fullName,
          work_email: workEmail,
          organization_name: organizationName,
          organization_type: organizationType,
          phone,
          monthly_encounters: monthlyEncounters,
          ehr_system: ehrSystem,
          message,
          source_path: sourcePath,
        }),
      });
      setSubmittedReceipt(resp);
      setFullName('');
      setWorkEmail('');
      setOrganizationName('');
      setPhone('');
      setMonthlyEncounters('');
      setEhrSystem('');
      setMessage('');
    } catch (err) {
      if (err instanceof ApiError && err.missingVariables?.length) {
        setMissingEnvVars(err.missingVariables);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to submit inquiry.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      {submittedReceipt && (
        <div className="p-4 rounded-lg bg-teal-50 border border-teal-200 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-[#0D9488]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{submittedReceipt.message}</span>
          </div>
          <p className="font-mono text-[#06152B]">
            Reference ID: {submittedReceipt.id} · Dispatch: {submittedReceipt.notificationStatus}
          </p>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5">
          <div className="flex items-start gap-2 font-semibold text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          {missingEnvVars.length > 0 && (
            <p className="font-mono text-[11px] text-amber-900">
              Configuration required: {missingEnvVars.join(', ')}
            </p>
          )}
        </div>
      )}

      <div className={compact ? 'grid sm:grid-cols-2 gap-3.5' : 'grid md:grid-cols-2 gap-4'}>
        <div>
          <label htmlFor={`lead-name-${leadType}`} className="block text-xs font-semibold text-[#06152B] mb-1">
            Full Name *
          </label>
          <input
            id={`lead-name-${leadType}`}
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dr. Jordan Patel, RHIA"
            className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
        <div>
          <label htmlFor={`lead-email-${leadType}`} className="block text-xs font-semibold text-[#06152B] mb-1">
            Work Email *
          </label>
          <input
            id={`lead-email-${leadType}`}
            type="email"
            required
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
            placeholder="director@healthsystem.org"
            className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
      </div>

      <div className={compact ? 'grid sm:grid-cols-2 gap-3.5' : 'grid md:grid-cols-2 gap-4'}>
        <div>
          <label htmlFor={`lead-org-${leadType}`} className="block text-xs font-semibold text-[#06152B] mb-1">
            Organization Name
          </label>
          <input
            id={`lead-org-${leadType}`}
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="Regional Health Partners"
            className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
        <div>
          <label htmlFor={`lead-orgtype-${leadType}`} className="block text-xs font-semibold text-[#06152B] mb-1">
            Organization Type
          </label>
          <select
            id={`lead-orgtype-${leadType}`}
            value={organizationType}
            onChange={(e) => setOrganizationType(e.target.value as OrganizationTypeId)}
            className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            {ORGANIZATION_TYPES.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {leadType === 'demo_request' && (
        <div className="grid sm:grid-cols-3 gap-3.5">
          <div>
            <label htmlFor="demo-phone" className="block text-xs font-semibold text-[#06152B] mb-1">
              Phone (Optional)
            </label>
            <input
              id="demo-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 010-2000"
              className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
          </div>
          <div>
            <label htmlFor="demo-vol" className="block text-xs font-semibold text-[#06152B] mb-1">
              Monthly Encounter Volume
            </label>
            <select
              id="demo-vol"
              value={monthlyEncounters}
              onChange={(e) => setMonthlyEncounters(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <option value="">Select range</option>
              <option value="Under 1,000">Under 1,000</option>
              <option value="1,000 - 10,000">1,000 – 10,000</option>
              <option value="10,000 - 50,000">10,000 – 50,000</option>
              <option value="50,000+">50,000+</option>
            </select>
          </div>
          <div>
            <label htmlFor="demo-ehr" className="block text-xs font-semibold text-[#06152B] mb-1">
              Primary EHR / PM System
            </label>
            <input
              id="demo-ehr"
              type="text"
              value={ehrSystem}
              onChange={(e) => setEhrSystem(e.target.value)}
              placeholder="Epic, Athena, Cerner..."
              className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor={`lead-msg-${leadType}`} className="block text-xs font-semibold text-[#06152B] mb-1">
          {leadType === 'demo_request' ? 'Coding & RCM Workflow Priorities' : 'How Can Our Team Help?'}
        </label>
        <textarea
          id={`lead-msg-${leadType}`}
          rows={compact ? 3 : 4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            leadType === 'demo_request'
              ? 'Share specialties, AI provider preferences (Gemini / LingSante), or clearinghouse integration goals...'
              : 'Questions about security architecture, BAA readiness, datasets, or deployment...'
          }
          className="w-full px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer disabled:opacity-60"
      >
        <Send className="w-4 h-4" />
        {submitting
          ? 'Submitting...'
          : leadType === 'demo_request'
            ? 'Request Enterprise Walkthrough'
            : 'Send Inquiry'}
      </button>
    </form>
  );
};

interface MarketingSubPagesProps {
  route: Exclude<PublicMarketingRoute, { kind: 'landing' }>;
  onNavigateMarketing: (path: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const MarketingSubPages: React.FC<MarketingSubPagesProps> = ({
  route,
  onNavigateMarketing,
  onOpenAuth,
}) => {
  const product = route.kind === 'product' ? findProductModule(route.slug) ?? MEDIIFY_ECOSYSTEM_MODULES[0] : null;
  const solution = route.kind === 'solution' ? findSolutionVertical(route.slug) ?? SOLUTION_VERTICALS[0] : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#06152B] flex flex-col">
      {/* Shared Top Bar */}
      <header className="sticky top-0 z-40 bg-[#06152B] text-white border-b border-white/10">
        <div className="max-w-[1320px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => onNavigateMarketing('/')}
            className="cursor-pointer shrink-0 text-left"
          >
            <MediifyLogo variant="light" compact />
          </button>

          <nav aria-label="Subpage Navigation" className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <button type="button" onClick={() => onNavigateMarketing('/')} className="hover:text-white cursor-pointer">
              Overview
            </button>
            <button
              type="button"
              onClick={() => onNavigateMarketing('/products/code')}
              className={`hover:text-white cursor-pointer ${route.kind === 'product' ? 'text-[#22D3EE] font-semibold' : ''}`}
            >
              Platform Modules
            </button>
            <button
              type="button"
              onClick={() => onNavigateMarketing('/solutions/hospitals')}
              className={`hover:text-white cursor-pointer ${route.kind === 'solution' ? 'text-[#22D3EE] font-semibold' : ''}`}
            >
              Solutions
            </button>
            <button
              type="button"
              onClick={() => onNavigateMarketing('/integrations-hub')}
              className={`hover:text-white cursor-pointer ${route.kind === 'integrations-hub' ? 'text-[#22D3EE] font-semibold' : ''}`}
            >
              Integrations
            </button>
            <button
              type="button"
              onClick={() => onNavigateMarketing('/security-governance')}
              className={`hover:text-white cursor-pointer ${route.kind === 'security-governance' ? 'text-[#22D3EE] font-semibold' : ''}`}
            >
              Security
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white border border-white/20 hover:bg-white/10 rounded-md cursor-pointer whitespace-nowrap"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onNavigateMarketing('/request-demo')}
              className="px-4 py-1.5 text-xs sm:text-sm font-semibold text-[#06152B] bg-[#22D3EE] hover:bg-cyan-300 rounded-md cursor-pointer whitespace-nowrap"
            >
              Request a Demo
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* PRODUCT MODULE ROUTE */}
        {route.kind === 'product' && product && (
          <div>
            <section className="bg-[#06152B] text-white py-14 border-b border-white/10 clinical-grid-bg">
              <div className="max-w-[1320px] mx-auto px-6">
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/')}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#22D3EE] hover:underline mb-6 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to MEDIIFY Platform
                </button>

                <div className="grid lg:grid-cols-12 gap-8 items-start">
                  <div className="lg:col-span-8 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs uppercase tracking-wider text-[#22D3EE]">
                        {product.shortTag}
                      </span>
                      <span
                        className={`font-mono text-xs px-2.5 py-0.5 rounded border ${
                          product.status === 'DISABLED_PENDING_VALIDATION'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                            : 'bg-[#0D9488]/20 text-teal-200 border-[#0D9488]/40'
                        }`}
                      >
                        {product.statusNote}
                      </span>
                    </div>
                    <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">{product.name}</h1>
                    <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-3xl">
                      {product.description}
                    </p>
                  </div>
                  <div className="lg:col-span-4 bg-white/5 border border-white/15 rounded-xl p-5 space-y-3">
                    <p className="font-mono text-xs text-[#22D3EE]">Explore Module in Workspace</p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Every organization workspace enforces PostgreSQL RLS isolation, zero mock clinical records, and
                      explicit human coder review.
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenAuth('register')}
                        className="w-full py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
                      >
                        Provision Organization Workspace
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateMarketing('/request-demo')}
                        className="w-full py-2.5 text-xs font-semibold text-white border border-white/25 hover:bg-white/10 rounded-md cursor-pointer"
                      >
                        Schedule Architecture Walkthrough
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {product.status === 'DISABLED_PENDING_VALIDATION' && (
              <div className="max-w-[1320px] mx-auto px-6 pt-8">
                <div className="p-5 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-950 space-y-1">
                    <p className="font-bold">
                      Governance Notice: {product.name} Is Explicitly Disabled in Current Production Builds
                    </p>
                    <p className="text-xs leading-relaxed">
                      Autonomous straight-through claim submission remains disabled across all tenants until independent
                      prospective clinical validation, external compliance review, and explicit organization governance
                      authorization are completed. All coding recommendations currently flow through MEDIIFY Assist
                      human coder review.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <section className="max-w-[1320px] mx-auto px-6 py-12 grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-[#06152B]">Operational Capabilities</h2>
                  <ul className="space-y-3 text-sm text-slate-700">
                    {product.capabilities.map((cap) => (
                      <li key={cap} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-[#06152B]">Architectural &amp; Compliance Guardrails</h2>
                  <ul className="space-y-3 text-sm text-slate-700">
                    {product.guardrails.map((g) => (
                      <li key={g} className="flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold text-[#06152B]">All 10 MEDIIFY Ecosystem Modules</h2>
                <div className="divide-y divide-slate-100">
                  {MEDIIFY_ECOSYSTEM_MODULES.map((mod) => (
                    <button
                      key={mod.slug}
                      type="button"
                      onClick={() => onNavigateMarketing(`/products/${mod.slug}`)}
                      className={`w-full text-left py-2.5 px-2.5 rounded-md flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                        mod.slug === product.slug ? 'bg-[#06152B] text-white' : 'hover:bg-slate-50 text-[#06152B]'
                      }`}
                    >
                      <span className="font-semibold">{mod.name}</span>
                      <span
                        className={`font-mono text-[10px] ${
                          mod.slug === product.slug
                            ? 'text-[#22D3EE]'
                            : mod.status === 'DISABLED_PENDING_VALIDATION'
                              ? 'text-amber-700'
                              : 'text-[#64748B]'
                        }`}
                      >
                        {mod.status === 'DISABLED_PENDING_VALIDATION' ? 'Disabled (Pending)' : mod.shortTag}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* SOLUTION VERTICAL ROUTE */}
        {route.kind === 'solution' && solution && (
          <div>
            <section className="bg-[#06152B] text-white py-14 border-b border-white/10 clinical-grid-bg">
              <div className="max-w-[1320px] mx-auto px-6 space-y-4">
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/')}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#22D3EE] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to MEDIIFY Platform
                </button>
                <p className="font-mono text-xs text-[#22D3EE]">{solution.audience}</p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold max-w-3xl">{solution.name}</h1>
                <p className="text-lg text-slate-200 max-w-2xl">{solution.headline}</p>
              </div>
            </section>

            <section className="max-w-[1320px] mx-auto px-6 py-12 grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-[#06152B]">Operational Overview</h2>
                  <p className="text-sm text-[#64748B] leading-relaxed">{solution.summary}</p>
                  <h3 className="font-display text-sm font-bold text-[#06152B] pt-2">Supported Workflows</h3>
                  <ul className="space-y-2.5 text-sm text-slate-700">
                    {solution.workflows.map((wf) => (
                      <li key={wf} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                        <span>{wf}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                  <h2 className="font-display text-base font-bold text-[#06152B]">Recommended Platform Stack</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {solution.recommendedModules.map((modName) => {
                      const matched = MEDIIFY_ECOSYSTEM_MODULES.find((m) => m.name === modName);
                      return (
                        <button
                          key={modName}
                          type="button"
                          onClick={() => matched && onNavigateMarketing(`/products/${matched.slug}`)}
                          className="p-3.5 text-left rounded-lg border border-[#E2E8F0] hover:border-[#2563EB] bg-[#F8FAFC] cursor-pointer"
                        >
                          <p className="text-sm font-bold text-[#06152B]">{modName}</p>
                          {matched && <p className="text-xs text-[#64748B] mt-1">{matched.shortTag}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                  <h2 className="font-display text-base font-bold text-[#06152B]">Explore Other Healthcare Sectors</h2>
                  <div className="space-y-2">
                    {SOLUTION_VERTICALS.map((v) => (
                      <button
                        key={v.slug}
                        type="button"
                        onClick={() => onNavigateMarketing(`/solutions/${v.slug}`)}
                        className={`w-full text-left px-3 py-2.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          v.slug === solution.slug
                            ? 'bg-[#06152B] text-white'
                            : 'border border-[#E2E8F0] hover:bg-slate-50 text-[#06152B]'
                        }`}
                      >
                        <span>{v.name}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                  <h2 className="font-display text-base font-bold text-[#06152B]">Start with Your Organization Type</h2>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    Provision an empty, RLS-isolated workspace configured for {solution.name.toLowerCase()}.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register')}
                    className="w-full py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
                  >
                    Create Organization Workspace
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* INTEGRATIONS HUB ROUTE */}
        {route.kind === 'integrations-hub' && (
          <div>
            <section className="bg-[#06152B] text-white py-14 border-b border-white/10 clinical-grid-bg">
              <div className="max-w-[1320px] mx-auto px-6 space-y-3">
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/')}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#22D3EE] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to MEDIIFY Platform
                </button>
                <p className="font-mono text-xs text-[#22D3EE]">MEDIIFY Connect · Server-Side Integration Hub</p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold">
                  EHR, Clearinghouse, AI Model &amp; Dataset Integrations
                </h1>
                <p className="text-base text-slate-300 max-w-3xl">
                  All external connections run strictly server-side with SSRF URL guards, credential isolation, and live
                  connectivity checks. Unconfigured connectors transparently report &ldquo;Configuration required&rdquo;.
                </p>
              </div>
            </section>

            <section className="max-w-[1320px] mx-auto px-6 py-12 grid md:grid-cols-2 gap-6">
              {INTEGRATION_CATALOG.map((cat) => (
                <div key={cat.category} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-lg font-bold text-[#06152B]">{cat.category}</h2>
                    <Layers className="w-5 h-5 text-[#2563EB]" />
                  </div>
                  <p className="text-xs font-mono text-[#0D9488]">{cat.protocol}</p>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {cat.systems.map((sys) => (
                      <li key={sys} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0" />
                        <span>{sys}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="pt-3 border-t border-[#E2E8F0] text-xs text-[#64748B]">{cat.stateNote}</p>
                </div>
              ))}
            </section>
          </div>
        )}

        {/* SECURITY & GOVERNANCE ROUTE */}
        {route.kind === 'security-governance' && (
          <div>
            <section className="bg-[#06152B] text-white py-14 border-b border-white/10 clinical-grid-bg">
              <div className="max-w-[1320px] mx-auto px-6 space-y-3">
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/')}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#22D3EE] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to MEDIIFY Platform
                </button>
                <p className="font-mono text-xs text-[#22D3EE]">Technical Safeguards &amp; Data Governance</p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold">
                  Security Architecture Built for Healthcare Organizations
                </h1>
                <p className="text-base text-slate-300 max-w-3xl">
                  MEDIIFY documents verified architectural controls honestly—never claiming unverified external audit
                  certifications while enforcing tenant isolation, RBAC, MFA, and human-in-the-loop coding governance.
                </p>
              </div>
            </section>

            <section className="max-w-[1320px] mx-auto px-6 py-12 grid md:grid-cols-3 gap-6">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                <Database className="w-5 h-5 text-[#2563EB]" />
                <h2 className="font-display text-base font-bold text-[#06152B]">PostgreSQL RLS &amp; Private Storage</h2>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  Every tenant transaction binds <code className="font-mono text-xs">app.current_organization_id</code>{' '}
                  before queries execute. Uploaded medical PDFs and images reside in private storage buckets scoped by
                  organization ID.
                </p>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                <Lock className="w-5 h-5 text-[#0D9488]" />
                <h2 className="font-display text-base font-bold text-[#06152B]">RBAC, TOTP MFA &amp; Audit Logs</h2>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  Supports six operational roles, RFC 6238 TOTP MFA with single-use recovery codes, revocable active
                  sessions, and immutable actor-logged security and coding events.
                </p>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                <Cpu className="w-5 h-5 text-[#2563EB]" />
                <h2 className="font-display text-base font-bold text-[#06152B]">BAA Gating &amp; PHI Controls</h2>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  Organizations attest to executed vendor Business Associate Agreements prior to live ePHI routing. AI
                  providers not approved for ePHI remain restricted to de-identified or synthetic test workflows.
                </p>
              </div>
            </section>

            <section className="max-w-[1320px] mx-auto px-6 pb-14">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <FileCheck2 className="w-5 h-5 text-[#0D9488] shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold text-[#06152B]">Request Technical Architecture &amp; BAA Review</p>
                    <p className="text-xs text-[#64748B]">
                      Discuss deployment topology, Supabase VPC hosting, or LingSante private endpoint connectivity.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/contact')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#06152B] hover:bg-[#0D254A] rounded-md cursor-pointer shrink-0"
                >
                  Contact Security Team
                </button>
              </div>
            </section>
          </div>
        )}

        {/* REQUEST DEMO & CONTACT ROUTES */}
        {(route.kind === 'request-demo' || route.kind === 'contact') && (
          <div>
            <section className="bg-[#06152B] text-white py-12 border-b border-white/10 clinical-grid-bg">
              <div className="max-w-[1320px] mx-auto px-6 space-y-3">
                <button
                  type="button"
                  onClick={() => onNavigateMarketing('/')}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#22D3EE] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to MEDIIFY Platform
                </button>
                <h1 className="font-display text-3xl sm:text-4xl font-bold">
                  {route.kind === 'request-demo'
                    ? 'Request an Enterprise MEDIIFY Walkthrough'
                    : 'Contact the MEDIIFY Clinical & Engineering Team'}
                </h1>
                <p className="text-base text-slate-300 max-w-2xl">
                  {route.kind === 'request-demo'
                    ? 'Review how MEDIIFY connects clinical chart extraction, authoritative ICD-10/CPT catalogs, NCCI/MUE edits, and clearinghouse eligibility inside one tenant-isolated platform.'
                    : 'Reach out regarding EHR integrations, LingSante or Gemini model deployments, AMA/CMS dataset onboarding, or BAA requirements.'}
                </p>
              </div>
            </section>

            <section className="max-w-[1320px] mx-auto px-6 py-12 grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-7">
                <LeadCaptureForm
                  leadType={route.kind === 'request-demo' ? 'demo_request' : 'contact_inquiry'}
                  sourcePath={route.kind === 'request-demo' ? '/request-demo' : '/contact'}
                />
              </div>
              <div className="lg:col-span-5 space-y-5">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#06152B]">
                    <Building2 className="w-4 h-4 text-[#2563EB]" />
                    <span>Self-Service Organization Onboarding</span>
                  </div>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    Ready to inspect the workspace directly? Provision an isolated hospital, clinic, ASC, RCM company,
                    or independent coder organization account in minutes.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register')}
                    className="w-full py-2.5 text-xs font-semibold text-white bg-[#06152B] hover:bg-[#0D254A] rounded-md cursor-pointer"
                  >
                    Create Organization Workspace
                  </button>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-2.5 text-xs text-[#64748B]">
                  <div className="flex items-center gap-2 font-semibold text-[#06152B]">
                    <Mail className="w-4 h-4 text-[#0D9488]" />
                    <span>Submission Persistence Notice</span>
                  </div>
                  <p className="leading-relaxed">
                    Submitted inquiries are saved directly to PostgreSQL <code className="font-mono">marketing_leads</code>{' '}
                    and optionally forwarded to an authenticated webhook if{' '}
                    <code className="font-mono">LEAD_NOTIFICATION_WEBHOOK_URL</code> is configured.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
