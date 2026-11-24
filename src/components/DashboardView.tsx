import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Cpu, Filter, Link2, RefreshCw, Upload, Users } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AppPageId } from './AppShell';

interface DashboardMetrics {
  kpis: {
    totalRecords: number;
    totalEncounters: number;
    completedEncounters: number;
    pendingReviews: number;
    codingAccuracyPct: number | null;
    totalReviewedRecs: number;
    docDeficiencies: number;
    openDenialRisks: number;
    claimReadyCount: number;
    claimBlockedCount: number;
  };
  denialBreakdown: Array<{ category: string; severity: string; count: number }>;
  reimbursementStats: {
    total_billed: number;
    total_paid: number;
    paid_claims_count: number;
  };
  recentEncounters: Array<{
    id: string;
    encounter_number: string;
    date_of_service: string;
    encounter_type: string;
    specialty?: string;
    chief_complaint: string;
    coding_status: string;
    patient_name: string;
    patient_mrn: string;
    provider_name: string;
    open_risks: number;
    pending_codes: number;
  }>;
  coderProductivity: Array<{
    actor_email: string;
    actions_count: number;
    approved_count: number;
    modified_count: number;
    rejected_count: number;
  }>;
  aiHealthSummary?: {
    total_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    active_jobs: number;
    avg_latency_ms: number | null;
  };
  integrationHealth?: Array<{
    vendor_name: string;
    integration_type: string;
    connection_status: string;
    last_sync_at: string | null;
  }>;
  filterOptions?: {
    specialties: string[];
    payers: string[];
    providers: Array<{ id: string; full_name: string }>;
    reviewers: Array<{ id: string; full_name: string; email: string }>;
  };
}

interface DashboardViewProps {
  onOpenEncounter: (encounterId: string) => void;
  onNavigate: (page: AppPageId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenEncounter, onNavigate }) => {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dashboard operational filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [payer, setPayer] = useState('');
  const [providerId, setProviderId] = useState('');
  const [reviewerId, setReviewerId] = useState('');

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (specialty) params.set('specialty', specialty);
      if (payer) params.set('payer', payer);
      if (providerId) params.set('providerId', providerId);
      if (reviewerId) params.set('reviewerId', reviewerId);
      const qs = params.toString();
      const res = await apiRequest<DashboardMetrics>(`/dashboard/metrics${qs ? `?${qs}` : ''}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, specialty, payer, providerId, reviewerId]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setSpecialty('');
    setPayer('');
    setProviderId('');
    setReviewerId('');
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-[#E2E8F0] rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-[#E2E8F0] rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-6">
        <p className="text-sm text-[#DC2626] font-medium">{error || 'No dashboard metrics available.'}</p>
        <button
          type="button"
          onClick={() => void loadMetrics()}
          className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#0B1830] rounded-md cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const {
    kpis,
    denialBreakdown,
    reimbursementStats,
    recentEncounters,
    coderProductivity,
    aiHealthSummary,
    integrationHealth,
    filterOptions,
  } = data;
  const maxDenialCount = Math.max(1, ...denialBreakdown.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Executive Operational Banner (Zero Mock Metrics) */}
      <div className="rounded-xl bg-gradient-to-r from-[#06152B] via-[#0B2752] to-[#0D9488]/90 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#06152B]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#22D3EE]">MEDIIFY</p>
          <h2 className="font-display text-lg sm:text-xl font-bold mt-0.5">
            Clinical Coding &amp; Revenue Integrity Workspace
          </h2>
          <p className="text-xs text-slate-200 mt-1 max-w-2xl">
            Operational counts and reviewed accuracy below reflect live PostgreSQL organization records only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('coding-workspace')}
          className="px-4 py-2 text-xs font-semibold text-[#06152B] bg-[#22D3EE] hover:bg-cyan-300 rounded-md cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          Open Coding Workspace
        </button>
      </div>

      {/* Header & Filter Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <Filter className="w-3.5 h-3.5 text-[#0B1830]" />
            <span>Live PostgreSQL telemetry computed strictly from organization records</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="px-2.5 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#0B1830] cursor-pointer"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={() => void loadMetrics()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => onNavigate('records')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Clinical Record
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div>
            <label htmlFor="dash-from" className="block text-[11px] font-medium text-[#64748B] mb-1">
              DOS From
            </label>
            <input
              id="dash-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-1.5 font-mono border border-[#E2E8F0] rounded-md bg-white"
            />
          </div>
          <div>
            <label htmlFor="dash-to" className="block text-[11px] font-medium text-[#64748B] mb-1">
              DOS To
            </label>
            <input
              id="dash-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-1.5 font-mono border border-[#E2E8F0] rounded-md bg-white"
            />
          </div>
          <div>
            <label htmlFor="dash-spec" className="block text-[11px] font-medium text-[#64748B] mb-1">
              Specialty
            </label>
            <select
              id="dash-spec"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
            >
              <option value="">All Specialties</option>
              {(filterOptions?.specialties ?? []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-payer" className="block text-[11px] font-medium text-[#64748B] mb-1">
              Payer
            </label>
            <select
              id="dash-payer"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
            >
              <option value="">All Payers</option>
              {(filterOptions?.payers ?? []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-prov" className="block text-[11px] font-medium text-[#64748B] mb-1">
              Provider
            </label>
            <select
              id="dash-prov"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
            >
              <option value="">All Providers</option>
              {(filterOptions?.providers ?? []).map((pr) => (
                <option key={pr.id} value={pr.id}>{pr.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-rev" className="block text-[11px] font-medium text-[#64748B] mb-1">
              Coder / Reviewer
            </label>
            <select
              id="dash-rev"
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
            >
              <option value="">All Staff</option>
              {(filterOptions?.reviewers ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Empty Workspace Onboarding Callout for Fresh Tenants */}
      {kpis.totalEncounters === 0 && (
        <div className="bg-white border border-[#2563EB]/30 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-bold text-[#0B1830]">
              Your Organization Workspace Is Ready
            </h2>
            <p className="text-xs text-[#64748B] max-w-2xl">
              No synthetic or demo clinical charts are pre-loaded. Begin by registering a patient, importing authoritative reference code datasets, verifying AI model connectivity, or uploading your first clinical record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('patients')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              Register Patient
            </button>
            <button
              type="button"
              onClick={() => onNavigate('icd10')}
              className="px-3 py-2 text-xs font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md cursor-pointer"
            >
              Import Code Datasets
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ai-models')}
              className="px-3 py-2 text-xs font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md cursor-pointer"
            >
              Verify AI Endpoints
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#64748B]">Records Processed</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#0B1830] tabular-nums">
            {kpis.totalRecords}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {kpis.completedEncounters} completed · {kpis.pendingReviews} pending review
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#64748B]">Reviewed Coding Accuracy</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#0B1830] tabular-nums">
            {kpis.codingAccuracyPct !== null ? `${kpis.codingAccuracyPct}%` : 'Insufficient data'}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            Based on {kpis.totalReviewedRecs} human-reviewed codes
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#64748B]">Open Denial Risks</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#DC2626] tabular-nums">
            {kpis.openDenialRisks}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {kpis.docDeficiencies} documentation deficiencies
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#64748B]">Claim Readiness</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#0D9488] tabular-nums">
            {kpis.claimReadyCount} Ready
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {kpis.claimBlockedCount} blocked · ${reimbursementStats.total_billed.toLocaleString()} billed
          </p>
        </div>
      </div>

      {/* AI Job Status & Integration Health Cards */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#0B1830]" />
              <h2 className="font-display text-sm font-semibold text-[#0B1830]">AI Processing Job Queue</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ai-models')}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              Configure Models
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
            <div className="p-2.5 rounded bg-[#F1F5F9]">
              <p className="text-[#64748B]">Completed</p>
              <p className="font-mono font-bold text-[#16A34A] text-base">{aiHealthSummary?.completed_jobs ?? 0}</p>
            </div>
            <div className="p-2.5 rounded bg-[#F1F5F9]">
              <p className="text-[#64748B]">In Progress</p>
              <p className="font-mono font-bold text-[#2563EB] text-base">{aiHealthSummary?.active_jobs ?? 0}</p>
            </div>
            <div className="p-2.5 rounded bg-[#F1F5F9]">
              <p className="text-[#64748B]">Failed</p>
              <p className="font-mono font-bold text-[#DC2626] text-base">{aiHealthSummary?.failed_jobs ?? 0}</p>
            </div>
            <div className="p-2.5 rounded bg-[#F1F5F9]">
              <p className="text-[#64748B]">Avg Latency</p>
              <p className="font-mono font-bold text-[#0B1830] text-base">
                {aiHealthSummary?.avg_latency_ms ? `${aiHealthSummary.avg_latency_ms}ms` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#0B1830]" />
              <h2 className="font-display text-sm font-semibold text-[#0B1830]">EHR &amp; Clearinghouse Health</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('integrations')}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              Manage Integrations
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
            {(integrationHealth ?? []).map((intg) => (
              <div key={intg.vendor_name} className="p-2.5 rounded border border-[#E2E8F0] flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800 truncate">{intg.vendor_name}</span>
                <span
                  className={`font-semibold shrink-0 ${
                    intg.connection_status === 'VERIFIED_CONNECTED'
                      ? 'text-[#16A34A]'
                      : intg.connection_status === 'ERROR'
                        ? 'text-[#DC2626]'
                        : 'text-[#D97706]'
                  }`}
                >
                  {intg.connection_status === 'CONFIGURATION_REQUIRED'
                    ? 'Not configured'
                    : intg.connection_status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Middle Analytics Row */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#0B1830]">
                Open Pre-Submission Denial Risks by Category
              </h2>
              <p className="text-xs text-[#64748B]">
                Identified deterministically across NCCI, MUE, LCD/NCD, modifiers, and eligibility controls
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('denials')}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer whitespace-nowrap"
            >
              Open Denial Center
            </button>
          </div>

          {denialBreakdown.length === 0 ? (
            <p className="text-xs text-[#64748B] py-8 text-center">
              No open denial risks detected across active encounters.
            </p>
          ) : (
            <div className="space-y-3">
              {denialBreakdown.map((item) => {
                const widthPct = Math.max(8, Math.round((item.count / maxDenialCount) * 100));
                const barColor =
                  item.severity === 'CRITICAL'
                    ? 'bg-[#DC2626]'
                    : item.severity === 'HIGH'
                      ? 'bg-[#D97706]'
                      : 'bg-[#2563EB]';
                return (
                  <div key={`${item.category}-${item.severity}`} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">
                        {item.category.replace(/_/g, ' ')} · <span className="text-[#64748B]">{item.severity}</span>
                      </span>
                      <span className="font-mono font-semibold text-[#0B1830] tabular-nums">{item.count}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                      <div className={`h-full ${barColor}`} style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#0B1830]">
                Coder Productivity &amp; Audit Outcomes
              </h2>
              <p className="text-xs text-[#64748B]">
                Recorded human approvals, modifications, and rejections
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('audits')}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer whitespace-nowrap"
            >
              Audit Center
            </button>
          </div>

          {coderProductivity.length === 0 ? (
            <p className="text-xs text-[#64748B] py-8 text-center">
              No coder sign-off actions logged yet. Review an encounter in the Coding Workspace.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B] text-left">
                    <th className="py-2 font-medium">Reviewer</th>
                    <th className="py-2 font-medium text-right">Approved</th>
                    <th className="py-2 font-medium text-right">Modified</th>
                    <th className="py-2 font-medium text-right">Rejected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {coderProductivity.map((row) => (
                    <tr key={row.actor_email}>
                      <td className="py-2.5 text-slate-800 truncate max-w-[160px]">{row.actor_email}</td>
                      <td className="py-2.5 text-right font-mono text-[#16A34A]">{row.approved_count}</td>
                      <td className="py-2.5 text-right font-mono text-[#D97706]">{row.modified_count}</td>
                      <td className="py-2.5 text-right font-mono text-[#DC2626]">{row.rejected_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-[#E2E8F0] text-xs text-[#64748B] flex items-center justify-between tabular-nums">
            <span>Recorded Paid Claims ({reimbursementStats.paid_claims_count})</span>
            <span className="font-mono font-semibold text-[#0B1830]">
              {reimbursementStats.paid_claims_count > 0
                ? `$${reimbursementStats.total_paid.toLocaleString()}`
                : 'No remittance posted'}
            </span>
          </div>
        </div>
      </div>

      {/* Encounter Coding Queue */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#0B1830]">
              Active Clinical Encounters &amp; Coding Queue
            </h2>
            <p className="text-xs text-[#64748B]">Select an encounter to inspect clinical evidence and approve codes</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50/70 text-[#64748B] text-left">
                <th className="py-2.5 px-4 font-semibold">Encounter</th>
                <th className="py-2.5 px-4 font-semibold">Patient</th>
                <th className="py-2.5 px-4 font-semibold">DOS</th>
                <th className="py-2.5 px-4 font-semibold">Type</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Pending Codes</th>
                <th className="py-2.5 px-4 font-semibold text-right">Open Risks</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {recentEncounters.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#64748B]">
                    No encounters match your current filters.
                  </td>
                </tr>
              ) : (
                recentEncounters.map((enc) => (
                  <tr key={enc.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-medium text-[#0B1830]">{enc.encounter_number}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{enc.patient_name}</div>
                      <div className="text-[#64748B] font-mono">{enc.patient_mrn}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">{enc.date_of_service}</td>
                    <td className="py-3 px-4 text-slate-700">{enc.encounter_type}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${
                          enc.coding_status === 'APPROVED' || enc.coding_status === 'CLAIM_READY'
                            ? 'text-[#16A34A]'
                            : enc.coding_status === 'ESCALATED'
                              ? 'text-[#DC2626]'
                              : 'text-[#D97706]'
                        }`}
                      >
                        {enc.coding_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{enc.pending_codes}</td>
                    <td className="py-3 px-4 text-right font-mono text-[#DC2626]">{enc.open_risks}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenEncounter(enc.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-blue-50 rounded cursor-pointer whitespace-nowrap"
                      >
                        Open Workspace
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
