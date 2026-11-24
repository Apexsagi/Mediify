import React, { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
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
}

interface DashboardViewProps {
  onOpenEncounter: (encounterId: string) => void;
  onNavigate: (page: AppPageId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenEncounter, onNavigate }) => {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadMetrics() {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<DashboardMetrics>('/dashboard/metrics');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMetrics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-lg animate-pulse" />
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
          className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#071D49] rounded-md cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const { kpis, denialBreakdown, reimbursementStats, recentEncounters, coderProductivity } = data;
  const maxDenialCount = Math.max(1, ...denialBreakdown.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">
            Real-time metrics computed directly from organization database records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadMetrics()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => onNavigate('records')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer whitespace-nowrap"
          >
            Upload Clinical Record
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Records Processed</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#071D49] tabular-nums">
            {kpis.totalRecords}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {kpis.completedEncounters} completed · {kpis.pendingReviews} pending review
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Reviewed Coding Accuracy</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#071D49] tabular-nums">
            {kpis.codingAccuracyPct !== null ? `${kpis.codingAccuracyPct}%` : 'No reviews yet'}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Based on {kpis.totalReviewedRecs} human-reviewed codes
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Open Denial Risks</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#DC2626] tabular-nums">
            {kpis.openDenialRisks}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {kpis.docDeficiencies} documentation deficiencies
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Claim Readiness</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#0D9488] tabular-nums">
            {kpis.claimReadyCount} Ready
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {kpis.claimBlockedCount} blocked · ${reimbursementStats.total_billed.toLocaleString()} billed
          </p>
        </div>
      </div>

      {/* Middle Analytics Row */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#071D49]">
                Open Pre-Submission Denial Risks by Category
              </h2>
              <p className="text-xs text-slate-500">
                Identified deterministically via NCCI, MUE, LCD/NCD, and eligibility controls
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
            <p className="text-xs text-slate-500 py-8 text-center">
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
                        {item.category.replace(/_/g, ' ')} · <span className="text-slate-500">{item.severity}</span>
                      </span>
                      <span className="font-mono font-semibold text-[#071D49] tabular-nums">{item.count}</span>
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

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#071D49]">
                Coder Productivity &amp; Audit Outcomes
              </h2>
              <p className="text-xs text-slate-500">
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
            <p className="text-xs text-slate-500 py-8 text-center">
              No coder sign-off actions logged yet. Review an encounter in the Coding Workspace.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
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

          <div className="mt-5 pt-4 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between tabular-nums">
            <span>Recorded Paid Claims ({reimbursementStats.paid_claims_count})</span>
            <span className="font-mono font-semibold text-[#071D49]">
              ${reimbursementStats.total_paid.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Encounter Coding Queue */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#071D49]">
              Active Clinical Encounters &amp; Coding Queue
            </h2>
            <p className="text-xs text-slate-500">Select an encounter to inspect clinical evidence and approve codes</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 text-left">
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
              {recentEncounters.map((enc) => (
                <tr key={enc.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-medium text-[#071D49]">{enc.encounter_number}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{enc.patient_name}</div>
                    <div className="text-slate-500 font-mono">{enc.patient_mrn}</div>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
