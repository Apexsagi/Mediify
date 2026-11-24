import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, Plus, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { DenialRiskCategory, Encounter, Patient } from '../lib/types';

interface RcmViewProps {
  onOpenEncounter: (encounterId: string) => void;
}

const DENIAL_CATEGORIES: DenialRiskCategory[] = [
  'MISSING_INVALID_MODIFIER',
  'MISSING_PRIOR_AUTHORIZATION',
  'MEDICAL_NECESSITY_FAILURE',
  'NCCI_BUNDLING_CONFLICT',
  'INACTIVE_TERMINATED_INSURANCE',
  'UNVERIFIED_ELIGIBILITY',
  'INCOMPLETE_CLINICAL_DOCUMENTATION',
  'LACK_OF_DIAGNOSIS_SPECIFICITY',
  'DUPLICATE_BILLING',
  'TIMELY_FILING_RISK',
  'MUE_UNIT_EXCEEDED',
  'OUT_OF_NETWORK_RISK',
  'MISSING_REFERENCE_DATASET',
];

export const InsuranceVerificationView: React.FC = () => {
  const [policies, setPolicies] = useState<Array<Record<string, unknown>>>([]);
  const [verifications, setVerifications] = useState<Array<Record<string, unknown>>>([]);
  const [clearinghouse, setClearinghouse] = useState<Record<string, unknown> | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dos, setDos] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const [x12Preview, setX12Preview] = useState('');
  const [error, setError] = useState('');

  // Add Policy modal
  const [showAdd, setShowAdd] = useState(false);
  const [patId, setPatId] = useState('');
  const [priority, setPriority] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  const [payerName, setPayerName] = useState('');
  const [payerId, setPayerId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [groupNumber, setGroupNumber] = useState('');
  const [planName, setPlanName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [provenance, setProvenance] = useState<'MANUALLY_ENTERED' | 'EXTRACTED_FROM_DOCUMENT'>('MANUALLY_ENTERED');

  async function loadData() {
    try {
      const [insRes, patRes] = await Promise.all([
        apiRequest<{
          policies: Array<Record<string, unknown>>;
          verifications: Array<Record<string, unknown>>;
          clearinghouseConfig: Record<string, unknown> | null;
        }>('/insurance'),
        apiRequest<{ patients: Patient[] }>('/patients?pageSize=100'),
      ]);
      setPolicies(insRes.policies);
      setVerifications(insRes.verifications);
      setClearinghouse(insRes.clearinghouseConfig);
      setPatients(patRes.patients);
      if (!patId && patRes.patients[0]) setPatId(patRes.patients[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insurance records');
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleAddPolicy(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/insurance/policies', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: patId,
          priority,
          payer_name: payerName,
          payer_id: payerId,
          member_id: memberId,
          group_number: groupNumber,
          plan_name: planName,
          effective_date: effectiveDate,
          provenance,
        }),
      });
      setShowAdd(false);
      setPayerName('');
      setPayerId('');
      setMemberId('');
      setGroupNumber('');
      setPlanName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add insurance policy');
    }
  }

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
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-sm font-bold text-[#0B1830]">
              Insurance Eligibility &amp; X12 270/271 Verification Workspace
            </h2>
            <p className="text-xs text-[#64748B] mt-1">
              Strictly separates EXTRACTED_FROM_DOCUMENT, MANUALLY_ENTERED, and VERIFIED_CLEARINGHOUSE coverage provenance. Supports Primary &amp; Secondary Coordination of Benefits (COB).
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div>
              <span className="text-[#64748B]">Clearinghouse: </span>
              <span className="font-semibold text-[#D97706]">
                {clearinghouse
                  ? String(clearinghouse.connection_status) === 'CONFIGURATION_REQUIRED'
                    ? 'Not configured'
                    : String(clearinghouse.connection_status).replace(/_/g, ' ')
                  : 'Not configured'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Policy
            </button>
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
            className="px-3 py-1.5 font-mono border border-[#E2E8F0] rounded-md"
          />
        </div>

        {error && <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}
        {message && (
          <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
            {message}
          </div>
        )}
        {x12Preview && (
          <div className="mt-3 p-3 rounded bg-[#0B1830] text-slate-100 text-[11px] font-mono overflow-x-auto">
            <p className="text-teal-400 mb-1">Generated X12 270 Inquiry Payload (Pending Clearinghouse Endpoint):</p>
            <pre>{x12Preview}</pre>
          </div>
        )}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
          <h3 className="font-display text-sm font-semibold text-[#0B1830]">Patient Primary &amp; Secondary Policies</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
              <th className="py-2.5 px-4 font-semibold">Patient</th>
              <th className="py-2.5 px-4 font-semibold">COB Priority</th>
              <th className="py-2.5 px-4 font-semibold">Payer &amp; Plan</th>
              <th className="py-2.5 px-4 font-semibold">Member ID</th>
              <th className="py-2.5 px-4 font-semibold">Effective</th>
              <th className="py-2.5 px-4 font-semibold">Provenance</th>
              <th className="py-2.5 px-4 font-semibold text-right">X12 270/271</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {policies.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#64748B]">
                  No insurance policies recorded yet.
                </td>
              </tr>
            ) : (
              policies.map((p) => (
                <tr key={String(p.id)}>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{String(p.patient_name)}</div>
                    <div className="font-mono text-[#64748B]">{String(p.patient_mrn)}</div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#0B1830]">{String(p.priority)}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{String(p.payer_name)}</div>
                    <div className="text-[#64748B]">{String(p.plan_name)}</div>
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
          <h3 className="font-display text-sm font-semibold text-[#0B1830]">Eligibility Verification Log</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
              <th className="py-2.5 px-4 font-semibold">Patient</th>
              <th className="py-2.5 px-4 font-semibold">Payer</th>
              <th className="py-2.5 px-4 font-semibold">271 Status</th>
              <th className="py-2.5 px-4 font-semibold">Network</th>
              <th className="py-2.5 px-4 font-semibold">Details / Limitations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {verifications.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#64748B]">
                  No eligibility verification checks executed yet.
                </td>
              </tr>
            ) : (
              verifications.map((v) => (
                <tr key={String(v.id)}>
                  <td className="py-3 px-4 font-medium text-slate-900">{String(v.patient_name)}</td>
                  <td className="py-3 px-4 text-slate-700">{String(v.payer_name)}</td>
                  <td className="py-3 px-4 font-semibold text-[#D97706]">
                    {String(v.x12_271_status).replace(/_/g, ' ')}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{String(v.network_status)}</td>
                  <td className="py-3 px-4 text-[#64748B] max-w-lg">{String(v.limitations_notes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddPolicy} className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-display text-base font-bold text-[#0B1830]">Record Patient Insurance Policy</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pol-pat" className="block font-medium text-slate-700 mb-1">Patient</label>
                <select id="pol-pat" required value={patId} onChange={(e) => setPatId(e.target.value)} className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md bg-white">
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.mrn})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pol-prio" className="block font-medium text-slate-700 mb-1">COB Priority</label>
                <select id="pol-prio" value={priority} onChange={(e) => setPriority(e.target.value as 'PRIMARY' | 'SECONDARY')} className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md bg-white">
                  <option value="PRIMARY">PRIMARY</option>
                  <option value="SECONDARY">SECONDARY</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pol-payer" className="block font-medium text-slate-700 mb-1">Payer Name</label>
                <input id="pol-payer" required value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Blue Cross Blue Shield" className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
              </div>
              <div>
                <label htmlFor="pol-pid" className="block font-medium text-slate-700 mb-1">Payer ID (EDI)</label>
                <input id="pol-pid" required value={payerId} onChange={(e) => setPayerId(e.target.value)} placeholder="00700" className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pol-mem" className="block font-medium text-slate-700 mb-1">Member ID</label>
                <input id="pol-mem" required value={memberId} onChange={(e) => setMemberId(e.target.value)} className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
              </div>
              <div>
                <label htmlFor="pol-grp" className="block font-medium text-slate-700 mb-1">Group Number</label>
                <input id="pol-grp" value={groupNumber} onChange={(e) => setGroupNumber(e.target.value)} className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pol-plan" className="block font-medium text-slate-700 mb-1">Plan Name</label>
                <input id="pol-plan" required value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="PPO Gold" className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
              </div>
              <div>
                <label htmlFor="pol-eff" className="block font-medium text-slate-700 mb-1">Effective Date</label>
                <input id="pol-eff" type="date" required value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div>
              <label htmlFor="pol-prov" className="block font-medium text-slate-700 mb-1">Coverage Data Provenance</label>
              <select id="pol-prov" value={provenance} onChange={(e) => setProvenance(e.target.value as 'MANUALLY_ENTERED' | 'EXTRACTED_FROM_DOCUMENT')} className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md bg-white">
                <option value="MANUALLY_ENTERED">MANUALLY ENTERED (Unverified)</option>
                <option value="EXTRACTED_FROM_DOCUMENT">EXTRACTED FROM DOCUMENT (Unverified)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-[#E2E8F0] rounded-md cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer">Save Policy</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const DenialPreventionView: React.FC<RcmViewProps> = ({ onOpenEncounter }) => {
  const [risks, setRisks] = useState<Array<Record<string, unknown>>>([]);
  const [reviewers, setReviewers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const loadRisks = useCallback(async () => {
    const params = new URLSearchParams();
    if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
    if (severityFilter !== 'ALL') params.set('severity', severityFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    const res = await apiRequest<{
      risks: Array<Record<string, unknown>>;
      reviewers: Array<{ id: string; full_name: string; email: string }>;
    }>(`/denial-prevention?${params.toString()}`);
    setRisks(res.risks);
    setReviewers(res.reviewers ?? []);
  }, [categoryFilter, severityFilter, statusFilter]);

  useEffect(() => {
    void loadRisks();
  }, [loadRisks]);

  async function updateRisk(id: string, payload: { review_status?: 'MITIGATED' | 'DISMISSED' | 'OPEN'; reviewer_user_id?: string | null }) {
    await apiRequest(`/denial-prevention/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    await loadRisks();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#64748B]">
          Centralized pre-submission denial detection across all 12 RCM risk categories with reviewer assignment.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="Filter by denial category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
          >
            <option value="ALL">All 12+ Risk Categories</option>
            {DENIAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>

          <select
            aria-label="Filter by review status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="MITIGATED">MITIGATED</option>
            <option value="DISMISSED">DISMISSED</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {risks.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 text-xs text-[#64748B] text-center">
            No denial risks match the current filters.
          </div>
        ) : (
          risks.map((r) => (
            <div key={String(r.id)} className="bg-white border border-[#E2E8F0] rounded-lg p-4 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
                  <span className="font-bold text-[#0B1830]">{String(r.risk_category).replace(/_/g, ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-700">{String(r.encounter_number)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#64748B]">{String(r.patient_name)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-semibold ${
                      r.severity === 'CRITICAL' || r.severity === 'HIGH' ? 'text-[#DC2626]' : 'text-[#D97706]'
                    }`}
                  >
                    {String(r.severity)}
                  </span>
                  <span className="font-medium text-[#64748B]">{String(r.review_status)}</span>
                </div>
              </div>
              <p className="text-slate-800">{String(r.supporting_evidence)}</p>
              <p className="text-[#64748B]">
                <strong>Policy:</strong> {String(r.applicable_policy)} · <strong>Action:</strong>{' '}
                {String(r.recommended_action)}
              </p>
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void updateRisk(String(r.id), { review_status: 'MITIGATED' })}
                    className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#16A34A] rounded cursor-pointer"
                  >
                    Mark Mitigated
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateRisk(String(r.id), { review_status: 'DISMISSED' })}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <select
                    aria-label={`Assign reviewer for ${String(r.risk_category)}`}
                    value={String(r.reviewer_user_id ?? '')}
                    onChange={(e) => void updateRisk(String(r.id), { reviewer_user_id: e.target.value || null })}
                    className="px-2 py-1 text-[11px] border border-[#E2E8F0] rounded bg-white"
                  >
                    <option value="">Assign Reviewer...</option>
                    {reviewers.map((rev) => (
                      <option key={rev.id} value={rev.id}>{rev.full_name}</option>
                    ))}
                  </select>
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
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 text-xs text-slate-700">
        <strong>Compliance Principle:</strong> MEDIIFY prioritizes compliant coding accuracy over claim value maximization—surfacing both documented missed services and potential overcoding/unbundling exposure.
      </div>

      <div className="space-y-3">
        {findings.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 text-xs text-[#64748B] text-center">
            No open revenue integrity discrepancies found.
          </div>
        ) : (
          findings.map((f) => (
            <div key={String(f.id)} className="bg-white border border-[#E2E8F0] rounded-lg p-4 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#0B1830]">{String(f.code_involved)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#2563EB]">
                    {String(f.finding_type).replace(/_/g, ' ')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#64748B]">
                    {String(f.encounter_number)} ({String(f.patient_name)})
                  </span>
                </div>
                <span className="font-semibold text-[#D97706]">{String(f.priority)} PRIORITY</span>
              </div>
              <p className="text-slate-900 font-medium">{String(f.summary)}</p>
              <p className="text-[#64748B]">
                <strong>Chart Evidence:</strong> &ldquo;{String(f.clinical_evidence)}&rdquo;
              </p>
              <p className="text-[#64748B]">
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
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Total Coder Decisions</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0B1830] tabular-nums">
            {summary?.total_decisions ?? 0}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Approved Unchanged</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#16A34A] tabular-nums">
            {summary?.approved_as_recommended ?? 0}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Modified by Coder</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#D97706] tabular-nums">
            {summary?.modified_by_coder ?? 0}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Rejected / Escalated</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#DC2626] tabular-nums">
            {(summary?.rejected_by_coder ?? 0) + (summary?.escalated ?? 0)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
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
                <td colSpan={7} className="py-6 text-center text-[#64748B]">
                  No coder approval decisions logged yet.
                </td>
              </tr>
            ) : (
              approvals.map((a) => (
                <tr key={String(a.id)}>
                  <td className="py-3 px-4 font-mono text-[#64748B]">{String(a.created_at).slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-3 px-4 font-mono font-medium text-[#0B1830]">{String(a.encounter_number)}</td>
                  <td className="py-3 px-4 font-semibold">{String(a.action)}</td>
                  <td className="py-3 px-4 font-mono">
                    {String(a.previous_code)} {a.new_code && a.new_code !== a.previous_code ? `-> ${String(a.new_code)}` : ''}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{String(a.actor_email)}</td>
                  <td className="py-3 px-4 text-[#64748B] max-w-xs truncate">{String(a.notes || '—')}</td>
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
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [encId, setEncId] = useState('');
  const [claimType, setClaimType] = useState<'837P' | '837I'>('837P');
  const [payerName, setPayerName] = useState('');
  const [chargeAmt, setChargeAmt] = useState(0);

  async function loadClaims() {
    const [clRes, encRes] = await Promise.all([
      apiRequest<{ claims: Array<Record<string, unknown>> }>('/claims'),
      apiRequest<{ encounters: Encounter[] }>('/encounters?pageSize=100'),
    ]);
    setClaims(clRes.claims);
    setEncounters(encRes.encounters);
    if (!encId && encRes.encounters[0]) setEncId(encRes.encounters[0].id);
  }

  useEffect(() => {
    void loadClaims();
  }, []);

  async function handleCreateClaim(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest('/claims', {
      method: 'POST',
      body: JSON.stringify({
        encounter_id: encId,
        claim_type: claimType,
        payer_name: payerName,
        total_charge_amount: chargeAmt,
      }),
    });
    setShowCreate(false);
    setPayerName('');
    setChargeAmt(0);
    await loadClaims();
  }

  async function evaluateClaim(id: string) {
    await apiRequest(`/claims/${id}/evaluate-readiness`, { method: 'POST' });
    await loadClaims();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
        <span>
          Claims are gated by imported reference datasets, deterministic coding validation, open denial risks, clearinghouse verification, and mandatory human coder sign-off.
        </span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Stage New Claim
        </button>
      </div>

      <div className="space-y-3">
        {claims.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center text-xs text-[#64748B]">
            No claims staged yet. Stage a claim from a coded encounter to run pre-submission readiness checks.
          </div>
        ) : (
          claims.map((c) => {
            const rawBlockers = c.blocking_reasons ?? c.blocking_reasons_json ?? [];
            const blockers = Array.isArray(rawBlockers)
              ? rawBlockers.map(String)
              : (JSON.parse(String(rawBlockers || '[]')) as string[]);
            const ready = c.readiness_status === 'READY_FOR_SUBMISSION';
            return (
              <div key={String(c.id)} className="bg-white border border-[#E2E8F0] rounded-lg p-5 text-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm font-bold text-[#0B1830]">{String(c.claim_number)}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="font-medium text-slate-800">{String(c.patient_name)}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="text-[#64748B]">{String(c.claim_type)} · {String(c.payer_name)}</span>
                  </div>
                  <div className="flex items-center gap-3 tabular-nums">
                    <span className="font-mono font-semibold text-[#0B1830]">
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
                    className="px-3 py-1.5 font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded cursor-pointer"
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
          })
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateClaim} className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-display text-base font-bold text-[#0B1830]">Stage Claim for Pre-Submission Gate</h3>
            <div>
              <label htmlFor="clm-enc" className="block font-medium text-slate-700 mb-1">Encounter</label>
              <select id="clm-enc" required value={encId} onChange={(e) => setEncId(e.target.value)} className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md bg-white">
                {encounters.map((enc) => (
                  <option key={enc.id} value={enc.id}>{enc.encounter_number} · {enc.patient_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="clm-type" className="block font-medium text-slate-700 mb-1">Format</label>
                <select id="clm-type" value={claimType} onChange={(e) => setClaimType(e.target.value as '837P' | '837I')} className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md bg-white">
                  <option value="837P">837P Professional</option>
                  <option value="837I">837I Institutional</option>
                </select>
              </div>
              <div>
                <label htmlFor="clm-amt" className="block font-medium text-slate-700 mb-1">Total Charge ($)</label>
                <input id="clm-amt" type="number" min={0} step="0.01" required value={chargeAmt} onChange={(e) => setChargeAmt(Number(e.target.value))} className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div>
              <label htmlFor="clm-payer" className="block font-medium text-slate-700 mb-1">Target Payer</label>
              <input id="clm-payer" required value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Medicare Part B" className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[#E2E8F0] rounded-md cursor-pointer">Cancel</button>
              <button type="submit" disabled={!encId} className="px-4 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer disabled:opacity-50">Create Claim</button>
            </div>
          </form>
        </div>
      )}
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
        <p className="text-xs text-[#64748B]">
          Database-derived operational, coding quality, and reimbursement performance reporting.
        </p>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1830] rounded-md cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV Report
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <p className="text-xs text-[#64748B]">Total Billed Charges</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0B1830]">
            {Number(reimb.total_billed ?? 0) > 0 ? `$${Number(reimb.total_billed).toLocaleString()}` : 'Unavailable'}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <p className="text-xs text-[#64748B]">Recorded Remitted Payments</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#16A34A]">
            {(reimb.paid_claims_count ?? 0) > 0 ? `$${Number(reimb.total_paid ?? 0).toLocaleString()}` : 'Unavailable'}
          </p>
          <p className="text-xs text-[#64748B] mt-1">{reimb.paid_claims_count ?? 0} claim(s) with payment data</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <p className="text-xs text-[#64748B]">Reviewed Coding Accuracy</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#2563EB]">
            {kpis.codingAccuracyPct !== null && kpis.codingAccuracyPct !== undefined
              ? `${kpis.codingAccuracyPct}%`
              : 'Insufficient data'}
          </p>
          <p className="text-xs text-[#64748B] mt-1">{kpis.totalReviewedRecs ?? 0} human-reviewed codes</p>
        </div>
      </div>
    </div>
  );
};
