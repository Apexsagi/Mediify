import React, { useEffect, useState } from 'react';
import { ArrowRight, Bell, Check, CheckSquare, ClipboardList, ListChecks, Upload } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Encounter, WorkspaceNotification } from '../lib/types';
import type { AppPageId } from './AppShell';

interface OperationsViewProps {
  onOpenEncounter: (encounterId: string) => void;
  onNavigate?: (page: AppPageId) => void;
}

export const MyWorklistView: React.FC<OperationsViewProps> = ({ onOpenEncounter, onNavigate }) => {
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [items, setItems] = useState<
    Array<{
      id: string;
      encounter_number: string;
      date_of_service: string;
      encounter_type: string;
      specialty: string;
      chief_complaint: string;
      coding_status: string;
      patient_name: string;
      patient_mrn: string;
      provider_name: string;
      assigned_coder_email: string | null;
      pending_codes: number;
      open_risks: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  async function load(targetScope: 'all' | 'mine') {
    setLoading(true);
    try {
      const res = await apiRequest<{ worklist: typeof items }>(`/worklist?scope=${targetScope}`);
      setItems(res.worklist);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(scope);
  }, [scope]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-[#0B1830]" />
          <p className="text-xs text-[#64748B]">
            Encounters requiring coding extraction, human review, or escalation sign-off.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
              scope === 'all' ? 'bg-white text-[#0B1830] shadow-sm' : 'text-[#64748B]'
            }`}
          >
            All Active Queue
          </button>
          <button
            type="button"
            onClick={() => setScope('mine')}
            className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
              scope === 'mine' ? 'bg-white text-[#0B1830] shadow-sm' : 'text-[#64748B]'
            }`}
          >
            Assigned to Me
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
              <th className="py-2.5 px-4 font-semibold">Encounter</th>
              <th className="py-2.5 px-4 font-semibold">Patient</th>
              <th className="py-2.5 px-4 font-semibold">DOS</th>
              <th className="py-2.5 px-4 font-semibold">Specialty / Type</th>
              <th className="py-2.5 px-4 font-semibold">Status</th>
              <th className="py-2.5 px-4 font-semibold text-right">Pending Codes</th>
              <th className="py-2.5 px-4 font-semibold text-right">Open Risks</th>
              <th className="py-2.5 px-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-[#64748B]">Loading worklist...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center space-y-3">
                  <p className="text-[#64748B]">No pending encounters in this worklist.</p>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('records')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Clinical Record
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              items.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-semibold text-[#0B1830]">{w.encounter_number}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{w.patient_name}</div>
                    <div className="font-mono text-[#64748B]">{w.patient_mrn}</div>
                  </td>
                  <td className="py-3 px-4 font-mono">{w.date_of_service}</td>
                  <td className="py-3 px-4 text-[#64748B]">{w.specialty || w.encounter_type}</td>
                  <td className="py-3 px-4 font-semibold text-[#D97706]">{w.coding_status.replace(/_/g, ' ')}</td>
                  <td className="py-3 px-4 text-right font-mono">{w.pending_codes}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#DC2626]">{w.open_risks}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenEncounter(w.id)}
                      className="inline-flex items-center gap-1 text-[#2563EB] font-semibold hover:underline cursor-pointer"
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
  );
};

export const NotificationsView: React.FC<{ onOpenEncounter: (id: string) => void }> = ({ onOpenEncounter }) => {
  const [items, setItems] = useState<WorkspaceNotification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest<{ notifications: WorkspaceNotification[] }>('/notifications');
      setItems(res.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markRead(id: string) {
    await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-[#64748B]">
        <Bell className="w-4 h-4 text-[#0B1830]" />
        <span>AI extraction alerts, catalog missing-dataset notices, and escalation updates.</span>
      </div>

      {loading ? (
        <div className="h-40 bg-white border border-[#E2E8F0] rounded-lg animate-pulse" />
      ) : items.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center text-xs text-[#64748B]">
          No workspace notifications yet. Operational alerts appear here when AI jobs complete, fail, or escalate.
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => (
            <div
              key={n.id}
              className={`bg-white border rounded-lg p-4 text-xs flex flex-wrap items-start justify-between gap-3 ${
                n.is_read ? 'border-[#E2E8F0] opacity-75' : 'border-[#2563EB]/40'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold ${
                      n.severity === 'CRITICAL'
                        ? 'text-[#DC2626]'
                        : n.severity === 'WARNING'
                          ? 'text-[#D97706]'
                          : 'text-[#2563EB]'
                    }`}
                  >
                    {n.severity}
                  </span>
                  <span className="font-bold text-[#0B1830]">{n.title}</span>
                  <span className="font-mono text-[#64748B]">{n.created_at.slice(0, 19).replace('T', ' ')}</span>
                </div>
                <p className="text-slate-700">{n.message}</p>
              </div>
              <div className="flex items-center gap-2">
                {n.resource_type === 'encounter' && n.resource_id && (
                  <button
                    type="button"
                    onClick={() => onOpenEncounter(n.resource_id!)}
                    className="px-2.5 py-1 font-semibold text-[#2563EB] hover:bg-blue-50 rounded cursor-pointer"
                  >
                    View Encounter
                  </button>
                )}
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => void markRead(n.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#E2E8F0] rounded hover:bg-slate-50 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const EncountersView: React.FC<OperationsViewProps> = ({ onOpenEncounter, onNavigate }) => {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadEncounters(targetPage = page, status = statusFilter) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: '25' });
      if (status) params.set('status', status);
      const res = await apiRequest<{ encounters: Encounter[]; total: number }>(`/encounters?${params.toString()}`);
      setEncounters(res.encounters);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEncounters(page, statusFilter);
  }, [page, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#64748B]">
          <ClipboardList className="w-4 h-4 text-[#0B1830]" />
          <span>Full encounter directory ({total} total)</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter encounters by status"
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            className="px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-md"
          >
            <option value="">All Statuses</option>
            <option value="PENDING_EXTRACTION">Pending Extraction</option>
            <option value="NEEDS_CODING_REVIEW">Needs Coding Review</option>
            <option value="APPROVED">Approved</option>
            <option value="ESCALATED">Escalated</option>
            <option value="CLAIM_READY">Claim Ready</option>
          </select>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('records')}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
            >
              Ingest Encounter Record
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
              <th className="py-2.5 px-4 font-semibold">Encounter</th>
              <th className="py-2.5 px-4 font-semibold">Patient</th>
              <th className="py-2.5 px-4 font-semibold">DOS</th>
              <th className="py-2.5 px-4 font-semibold">Provider</th>
              <th className="py-2.5 px-4 font-semibold">Chief Complaint</th>
              <th className="py-2.5 px-4 font-semibold">Status</th>
              <th className="py-2.5 px-4 font-semibold text-right">Workspace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[#64748B]">Loading encounters...</td>
              </tr>
            ) : encounters.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#64748B]">
                  No encounters recorded yet. Register a patient and upload a clinical record to create an encounter.
                </td>
              </tr>
            ) : (
              encounters.map((enc) => (
                <tr key={enc.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-semibold text-[#0B1830]">{enc.encounter_number}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{enc.patient_name}</div>
                    <div className="font-mono text-[#64748B]">{enc.patient_mrn}</div>
                  </td>
                  <td className="py-3 px-4 font-mono">{enc.date_of_service}</td>
                  <td className="py-3 px-4 text-slate-700">{enc.provider_name}</td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{enc.chief_complaint}</td>
                  <td className="py-3 px-4 font-semibold text-[#2563EB]">{enc.coding_status.replace(/_/g, ' ')}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenEncounter(enc.id)}
                      className="inline-flex items-center gap-1 text-[#2563EB] font-semibold hover:underline cursor-pointer"
                    >
                      Open
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 25 && (
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Page {page} of {Math.ceil(total / 25)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 bg-white border border-[#E2E8F0] rounded disabled:opacity-50 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 bg-white border border-[#E2E8F0] rounded disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const QualityAssuranceView: React.FC<{ onOpenEncounter: (id: string) => void }> = ({ onOpenEncounter }) => {
  const [data, setData] = useState<{
    escalatedEncounters: Array<Record<string, unknown>>;
    qaAnnotations: Array<Record<string, unknown>>;
    summary: { reviewed_count: number; first_pass_count: number; modified_count: number; escalated_count: number };
  } | null>(null);

  useEffect(() => {
    void apiRequest<NonNullable<typeof data>>('/quality-assurance').then(setData);
  }, []);

  if (!data) {
    return <div className="h-64 bg-white border border-[#E2E8F0] rounded-lg animate-pulse" />;
  }

  const { summary, escalatedEncounters, qaAnnotations } = data;
  const firstPassPct =
    summary.reviewed_count > 0 ? Math.round((summary.first_pass_count / summary.reviewed_count) * 1000) / 10 : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">First-Pass Agreement Rate</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0B1830]">
            {firstPassPct !== null ? `${firstPassPct}%` : 'Insufficient data'}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Reviewed Codes</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0B1830]">{summary.reviewed_count}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Coder Modifications</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#D97706]">{summary.modified_count}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Escalated Cases</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#DC2626]">{summary.escalated_count}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[#0B1830]">
            <CheckSquare className="w-4 h-4 text-[#DC2626]" />
            <span>Escalated Encounters Pending Physician / QA Review</span>
          </div>
          {escalatedEncounters.length === 0 ? (
            <p className="text-xs text-[#64748B] py-4">No escalated encounters currently open.</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {escalatedEncounters.map((enc) => (
                <div key={String(enc.id)} className="p-3 rounded border border-[#E2E8F0] flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-bold text-[#0B1830]">
                      {String(enc.encounter_number)} · {String(enc.patient_name)}
                    </p>
                    <p className="text-[#64748B] mt-0.5">{String(enc.notes || enc.chief_complaint)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenEncounter(String(enc.id))}
                    className="text-[#2563EB] font-semibold hover:underline cursor-pointer shrink-0"
                  >
                    Inspect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
          <h3 className="font-display text-sm font-bold text-[#0B1830]">Deficiency Alerts &amp; Physician Queries</h3>
          {qaAnnotations.length === 0 ? (
            <p className="text-xs text-[#64748B] py-4">No deficiency alerts or physician queries logged yet.</p>
          ) : (
            <div className="space-y-2.5 text-xs max-h-96 overflow-y-auto">
              {qaAnnotations.map((ann) => (
                <div key={String(ann.id)} className="p-3 rounded border border-[#E2E8F0] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#D97706]">
                      {String(ann.annotation_type).replace(/_/g, ' ')} · {String(ann.encounter_number)}
                    </span>
                    <span className={ann.resolved ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                      {ann.resolved ? 'Resolved' : 'Open'}
                    </span>
                  </div>
                  <p className="text-slate-800">{String(ann.content)}</p>
                  <p className="text-[11px] text-[#64748B]">By {String(ann.author_email)} (p.{String(ann.page_number)})</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
