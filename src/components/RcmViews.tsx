import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface RcmViewProps {
  onOpenEncounter: (encounterId: string) => void;
}

export const InsuranceVerificationView: React.FC = () => {
  const [policies, setPolicies] = useState<Array<Record<string, unknown>>>([]);
  const [verifications, setVerifications] = useState<Array<Record<string, unknown>>>([]);
  const [clearinghouse, setClearinghouse] = useState<Record<string, unknown> | null>(null);
  const [dos, setDos] = useState('2026-11-23');
  const [message, setMessage] = useState('');
  const [x12Preview, setX12Preview] = useState('');
  const [error, setError] = useState('');

  async function loadData() {
    try {
      const res = await apiRequest<{
        policies: Array<Record<string, unknown>>;
        verifications: Array<Record<string, unknown>>;
        clearinghouseConfig: Record<string, unknown> | null;
      }>('/insurance');
      setPolicies(res.policies);
      setVerifications(res.verifications);
      setClearinghouse(res.clearinghouseConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insurance records');
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function runVerification(policyId: string) {
    setError('');
    setMessage('');
    setX12Preview('');
    try {
      const res = await apiRequest<{ status: string; message?: string; x12_270_payload?: string }>('/insurance/verify', {
        method: 'POST',
        body: JSON.stringify({
          insurance_policy_id: policyId,
          service_type_code: '30',
          date_of_service: dos,
        }),
      });
      setMessage(res.message ?? `Verification status: ${res.status}`);
      if (res.x12_270_payload) setX12Preview(res.x12_270_payload);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification request failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-sm font-bold text-[#071D49]">
              Insurance Eligibility &amp; X12 270/271 Verification Workspace
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Distinguishes document-extracted coverage from live clearinghouse-verified X12 271 or FHIR Coverage responses. Never fabricates live verification.
            </p>
          </div>
          <div className="text-xs">
            <span className="text-slate-500">Clearinghouse Connector: </span>
            <span className="font-semibold text-[#D97706]">
              {clearinghouse ? String(clearinghouse.connection_status).replace(/_/g, ' ') : 'NOT CONFIGURED'}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 text-xs">
          <label htmlFor="ins-dos" className="font-medium text-slate-700">
            Verification Date of Service:
          </label>
          <input
            id="ins-dos"
            type="date"
            value={dos}
            onChange={(e) => setDos(e.target.value)}
            className="px-3 py-1.5 font-mono border border-slate-300 rounded-md"
          />
        </div>

        {error && <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}
        {message && (
          <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
            {message}
          </div>
        )}
        {x12Preview && (
          <div className="mt-3 p-3 rounded bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto">
            <p className="text-teal-400 mb-1">Generated X12 270 Inquiry Payload (Pending Clearinghouse Endpoint):</p>
            <pre>{x12Preview}</pre>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-[#071D49]">Patient Insurance Policies</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
              <th className="py-2.5 px-4 font-semibold">Patient</th>
              <th className="py-2.5 px-4 font-semibold">Priority</th>
              <th className="py-2.5 px-4 font-semibold">Payer &amp; Plan</th>
              <th className="py-2.5 px-4 font-semibold">Member ID</th>
              <th className="py-2.5 px-4 font-semibold">Effective</th>
              <th className="py-2.5 px-4 font-semibold">Provenance</th>
              <th className="py-2.5 px-4 font-semibold text-right">X12 270/271</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {policies.map((p) => (
              <tr key={String(p.id)}>
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900">{String(p.patient_name)}</div>
                  <div className="font-mono text-slate-500">{String(p.patient_mrn)}</div>
                </td>
                <td className="py-3 px-4 font-semibold text-[#071D49]">{String(p.priority)}</td>
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900">{String(p.payer_name)}</div>
                  <div className="text-slate-500">{String(p.plan_name)}</div>
                </td>
                <td className="py-3 px-4 font-mono">{String(p.member_id)}</td>
                <td className="py-3 px-4 font-mono">{String(p.effective_date)}</td>
                <td className="py-3 px-4">
                  <span
                    className={`font-semibold ${
                      p.provenance === 'VERIFIED_CLEARINGHOUSE' ? 'text-[#16A34A]' : 'text-[#D97706]'
                    }`}
                  >
                    {String(p.provenance).replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => void runVerification(String(p.id))}
                    className="px-3 py-1.5 text-xs font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 rounded cursor-pointer whitespace-nowrap"
                  >
                    Run 270 Inquiry
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-[#071D49]">Eligibility Verification Log</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
              <th className="py-2.5 px-4 font-semibold">Patient</th>
              <th className="py-2.5 px-4 font-semibold">Payer</th>
              <th className="py-2.5 px-4 font-semibold">271 Status</th>
              <th className="py-2.5 px-4 font-semibold">Network</th>
              <th className="py-2.5 px-4 font-semibold">Details / Limitations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {verifications.map((v) => (
              <tr key={String(v.id)}>
                <td className="py-3 px-4 font-medium text-slate-900">{String(v.patient_name)}</td>
                <td className="py-3 px-4 text-slate-700">{String(v.payer_name)}</td>
                <td className="py-3 px-4 font-semibold text-[#D97706]">
                  {String(v.x12_271_status).replace(/_/g, ' ')}
                </td>
                <td className="py-3 px-4 text-slate-700">{String(v.network_status)}</td>
                <td className="py-3 px-4 text-slate-600 max-w-lg">{String(v.limitations_notes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const DenialPreventionView: React.FC<RcmViewProps> = ({ onOpenEncounter }) => {
  const [risks, setRisks] = useState<Array<Record<string, unknown>>>([]);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  async function loadRisks() {
    const res = await apiRequest<{ risks: Array<Record<string, unknown>> }>('/denial-prevention');
    setRisks(res.risks);
  }

  useEffect(() => {
    void loadRisks();
  }, []);

  async function updateStatus(id: string, status: 'MITIGATED' | 'DISMISSED' | 'OPEN') {
    await apiRequest(`/denial-prevention/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ review_status: status }),
    });
    await loadRisks();
  }

  const filtered = severityFilter === 'ALL' ? risks : risks.filter((r) => r.severity === severityFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">
          Deterministic pre-submission denial detection with policy references and corrective actions.
        </p>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'].map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                severityFilter === sev ? 'bg-white text-[#071D49] shadow-sm' : 'text-slate-600'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-xs text-slate-500 text-center">
            No denial risks match the current filter.
          </div>
        ) : (
          filtered.map((r) => (
            <div key={String(r.id)} className="bg-white border border-slate-200 rounded-lg p-4 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
                  <span className="font-bold text-[#071D49]">{String(r.risk_category).replace(/_/g, ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-700">{String(r.encounter_number)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-600">{String(r.patient_name)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-semibold ${
                      r.severity === 'CRITICAL' || r.severity === 'HIGH' ? 'text-[#DC2626]' : 'text-[#D97706]'
                    }`}
                  >
                    {String(r.severity)}
                  </span>
                  <span className="font-medium text-slate-500">{String(r.review_status)}</span>
                </div>
              </div>
              <p className="text-slate-800">{String(r.supporting_evidence)}</p>
              <p className="text-slate-600">
                <strong>Policy:</strong> {String(r.applicable_policy)} · <strong>Action:</strong>{' '}
                {String(r.recommended_action)}
              </p>
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void updateStatus(String(r.id), 'MITIGATED')}
                    className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#16A34A] rounded cursor-pointer"
                  >
                    Mark Mitigated
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateStatus(String(r.id), 'DISMISSED')}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenEncounter(String(r.encounter_id))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Resolve in Coding Workspace
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const RevenueIntegrityView: React.FC<RcmViewProps> = ({ onOpenEncounter }) => {
  const [findings, setFindings] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void apiRequest<{ findings: Array<Record<string, unknown>> }>('/revenue-integrity').then((res) =>
      setFindings(res.findings),
    );
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-700">
        <strong>Compliance Principle:</strong> MEDIIFY prioritizes compliant coding accuracy over claim value maximization—surfacing both documented missed services and potential overcoding/unbundling exposure.
      </div>

      <div className="space-y-3">
        {findings.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-xs text-slate-500 text-center">
            No open revenue integrity discrepancies found.
          </div>
        ) : (
          findings.map((f) => (
            <div key={String(f.id)} className="bg-white border border-slate-200 rounded-lg p-4 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#071D49]">{String(f.code_involved)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#2563EB]">
                    {String(f.finding_type).replace(/_/g, ' ')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-600">
                    {String(f.encounter_number)} ({String(f.patient_name)})
                  </span>
                </div>
                <span className="font-semibold text-[#D97706]">{String(f.priority)} PRIORITY</span>
              </div>
              <p className="text-slate-900 font-medium">{String(f.summary)}</p>
              <p className="text-slate-600">
                <strong>Chart Evidence:</strong> &ldquo;{String(f.clinical_evidence)}&rdquo;
              </p>
              <p className="text-slate-600">
                <strong>Compliance Guidance:</strong> {String(f.compliance_note)}
              </p>
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => onOpenEncounter(String(f.encounter_id))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Inspect Encounter
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const CodingAuditView: React.FC<RcmViewProps> = ({ onOpenEncounter }) => {
  const [approvals, setApprovals] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    void apiRequest<{ approvals: Array<Record<string, unknown>>; summary: Record<string, number> }>('/audit-center').then(
      (res) => {
        setApprovals(res.approvals);
        setSummary(res.summary);
      },
    );
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Total Coder Decisions</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#071D49] tabular-nums">
            {summary?.total_decisions ?? 0}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Approved Unchanged</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#16A34A] tabular-nums">
            {summary?.approved_as_recommended ?? 0}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Modified by Coder</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#D97706] tabular-nums">
            {summary?.modified_by_coder ?? 0}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Rejected / Escalated</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#DC2626] tabular-nums">
            {(summary?.rejected_by_coder ?? 0) + (summary?.escalated ?? 0)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
              <th className="py-2.5 px-4 font-semibold">Timestamp</th>
              <th className="py-2.5 px-4 font-semibold">Encounter</th>
              <th className="py-2.5 px-4 font-semibold">Action</th>
              <th className="py-2.5 px-4 font-semibold">Code Change</th>
              <th className="py-2.5 px-4 font-semibold">Reviewer</th>
              <th className="py-2.5 px-4 font-semibold">Notes</th>
              <th className="py-2.5 px-4 font-semibold text-right">Workspace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {approvals.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  No coder approval decisions logged yet.
                </td>
              </tr>
            ) : (
              approvals.map((a) => (
                <tr key={String(a.id)}>
                  <td className="py-3 px-4 font-mono text-slate-600">{String(a.created_at).slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-3 px-4 font-mono font-medium text-[#071D49]">{String(a.encounter_number)}</td>
                  <td className="py-3 px-4 font-semibold">{String(a.action)}</td>
                  <td className="py-3 px-4 font-mono">
                    {String(a.previous_code)} {a.new_code && a.new_code !== a.previous_code ? `-> ${String(a.new_code)}` : ''}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{String(a.actor_email)}</td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{String(a.notes || '—')}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenEncounter(String(a.encounter_id))}
                      className="text-[#2563EB] font-semibold hover:underline cursor-pointer"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ClaimReadinessView: React.FC<RcmViewProps> = ({ onOpenEncounter }) => {
  const [claims, setClaims] = useState<Array<Record<string, unknown>>>([]);

  async function loadClaims() {
    const res = await apiRequest<{ claims: Array<Record<string, unknown>> }>('/claims');
    setClaims(res.claims);
  }

  useEffect(() => {
    void loadClaims();
  }, []);

  async function evaluateClaim(id: string) {
    await apiRequest(`/claims/${id}/evaluate-readiness`, { method: 'POST' });
    await loadClaims();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-700">
        Claims are gated by deterministic coding validation, open denial risks, and mandatory human coder sign-off. MEDIIFY never auto-submits claims based solely on AI output.
      </div>

      <div className="space-y-3">
        {claims.map((c) => {
          const blockers = JSON.parse(String(c.blocking_reasons_json || '[]')) as string[];
          const ready = c.readiness_status === 'READY_FOR_SUBMISSION';
          return (
            <div key={String(c.id)} className="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-bold text-[#071D49]">{String(c.claim_number)}</span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="font-medium text-slate-800">{String(c.patient_name)}</span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="text-slate-600">{String(c.claim_type)} · {String(c.payer_name)}</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="font-mono font-semibold text-[#071D49]">
                    ${Number(c.total_charge_amount).toLocaleString()}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      ready ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {ready && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {String(c.readiness_status).replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {blockers.length > 0 && (
                <div className="p-3 rounded bg-red-50/70 border border-red-200 space-y-1">
                  <p className="font-semibold text-[#DC2626]">Blocking Pre-Bill Conditions:</p>
                  <ul className="list-disc pl-4 text-slate-700 space-y-0.5">
                    {blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => void evaluateClaim(String(c.id))}
                  className="px-3 py-1.5 font-semibold text-[#071D49] bg-white border border-slate-300 hover:bg-slate-50 rounded cursor-pointer"
                >
                  Re-Evaluate Claim Readiness
                </button>
                <button
                  type="button"
                  onClick={() => onOpenEncounter(String(c.encounter_id))}
                  className="inline-flex items-center gap-1 font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Open Encounter Workspace
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ReportsAnalyticsView: React.FC = () => {
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void apiRequest<Record<string, unknown>>('/dashboard/metrics').then(setMetrics);
  }, []);

  function exportCsv() {
    if (!metrics) return;
    const rows = (metrics.recentEncounters as Array<Record<string, unknown>>) || [];
    const header = 'Encounter,Patient,MRN,DOS,Type,Status,PendingCodes,OpenRisks\n';
    const body = rows
      .map((r) =>
        [
          r.encounter_number,
          `"${String(r.patient_name)}"`,
          r.patient_mrn,
          r.date_of_service,
          r.encounter_type,
          r.coding_status,
          r.pending_codes,
          r.open_risks,
        ].join(','),
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediify-rcm-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const kpis = (metrics?.kpis as Record<string, number | null>) || {};
  const reimb = (metrics?.reimbursementStats as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Database-derived operational, coding quality, and reimbursement performance reporting.
        </p>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#071D49] rounded-md cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV Report
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Total Billed Charges</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#071D49]">
            ${Number(reimb.total_billed ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Recorded Remitted Payments</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#16A34A]">
            ${Number(reimb.total_paid ?? 0).toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">{reimb.paid_claims_count ?? 0} claim(s) with payment data</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Reviewed Coding Accuracy</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#2563EB]">
            {kpis.codingAccuracyPct !== null && kpis.codingAccuracyPct !== undefined ? `${kpis.codingAccuracyPct}%` : 'Pending Reviews'}
          </p>
          <p className="text-xs text-slate-500 mt-1">{kpis.totalReviewedRecs ?? 0} human-reviewed codes</p>
        </div>
      </div>
    </div>
  );
};
