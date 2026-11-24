import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Edit3,
  FileText,
  Plus,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  CodingRecommendation,
  CodingValidationResult,
  DenialRiskItem,
  EligibilityVerification,
  Encounter,
  ExtractedEntity,
  InsurancePolicy,
  MedicalRecord,
  Patient,
  RevenueIntegrityFinding,
} from '../lib/types';

interface WorkspacePayload {
  encounter: Encounter & { provider_specialty?: string; provider_network_status?: string };
  patient: Patient;
  patientEncounters: Array<{
    id: string;
    encounter_number: string;
    date_of_service: string;
    encounter_type: string;
    chief_complaint: string;
    coding_status: string;
  }>;
  records: MedicalRecord[];
  entities: ExtractedEntity[];
  insurancePolicies: InsurancePolicy[];
  eligibility: EligibilityVerification | null;
  recommendations: CodingRecommendation[];
  validations: CodingValidationResult[];
  denialRisks: DenialRiskItem[];
  integrityFindings: RevenueIntegrityFinding[];
  approvals: Array<{
    id: string;
    action: string;
    previous_code: string;
    new_code: string;
    notes: string;
    actor_email: string;
    created_at: string;
  }>;
}

interface CodingWorkspaceViewProps {
  encounterId: string | null;
  onSelectEncounter: (id: string) => void;
}

export const CodingWorkspaceView: React.FC<CodingWorkspaceViewProps> = ({
  encounterId,
  onSelectEncounter,
}) => {
  const [encountersList, setEncountersList] = useState<Encounter[]>([]);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusBanner, setStatusBanner] = useState('');
  const [highlightSnippet, setHighlightSnippet] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  // Edit / Modify modal state
  const [editingRec, setEditingRec] = useState<CodingRecommendation | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editModifiers, setEditModifiers] = useState('');
  const [editUnits, setEditUnits] = useState(1);
  const [editPointers, setEditPointers] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Add Manual Code modal state
  const [showAddCode, setShowAddCode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newSystem, setNewSystem] = useState<'ICD-10-CM' | 'CPT' | 'HCPCS' | 'ICD-10-PCS'>('CPT');
  const [newRole, setNewRole] = useState<'PRIMARY' | 'SECONDARY' | 'PROCEDURE'>('PROCEDURE');
  const [newMods, setNewMods] = useState('');
  const [newUnits, setNewUnits] = useState(1);
  const [newEvidence, setNewEvidence] = useState('');
  const [newRationale, setNewRationale] = useState('');

  async function loadWorkspace(targetId?: string) {
    setLoading(true);
    setError('');
    try {
      const listRes = await apiRequest<{ encounters: Encounter[] }>('/encounters');
      setEncountersList(listRes.encounters);
      const idToLoad = targetId || encounterId || listRes.encounters[0]?.id;
      if (!idToLoad) {
        setWorkspace(null);
        setLoading(false);
        return;
      }
      if (idToLoad !== encounterId) {
        onSelectEncounter(idToLoad);
      }
      const ws = await apiRequest<WorkspacePayload>(`/coding-workspace/${idToLoad}`);
      setWorkspace(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coding workspace');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace(encounterId ?? undefined);
  }, [encounterId]);

  async function handleRunAiExtraction() {
    if (!workspace) return;
    setAnalyzing(true);
    setError('');
    setStatusBanner('');
    try {
      const res = await apiRequest<{
        providerUsed: string;
        modelUsed: string;
        verifiedCount: number;
        rejectedRecommendations: Array<{ code: string; reason: string }>;
        promptInjectionDetected: boolean;
      }>(`/coding-workspace/${workspace.encounter.id}/analyze`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const blockedMsg =
        res.rejectedRecommendations.length > 0
          ? ` (${res.rejectedRecommendations.length} unverified/invalid code(s) blocked by catalog guard)`
          : '';
      setStatusBanner(
        `AI analysis completed using ${res.modelUsed}: ${res.verifiedCount} verified recommendation(s)${blockedMsg}.`,
      );
      await loadWorkspace(workspace.encounter.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI extraction failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDecision(
    rec: CodingRecommendation,
    action: 'APPROVED' | 'MODIFIED' | 'REJECTED' | 'ESCALATED',
    overrides?: { new_code?: string; modifiers?: string; units?: number; diagnosis_pointers?: string; notes?: string },
  ) {
    setError('');
    setStatusBanner('');
    try {
      await apiRequest(`/coding-recommendations/${rec.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          ...overrides,
        }),
      });
      setStatusBanner(`Code ${rec.code} marked ${action}. Deterministic validation updated.`);
      setEditingRec(null);
      if (workspace) await loadWorkspace(workspace.encounter.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save coding decision');
    }
  }

  async function handleAddManualCode(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setError('');
    try {
      await apiRequest(`/coding-workspace/${workspace.encounter.id}/recommendations`, {
        method: 'POST',
        body: JSON.stringify({
          code: newCode,
          code_system: newSystem,
          diagnosis_role: newRole,
          modifiers: newMods,
          units: newUnits,
          supporting_evidence: newEvidence,
          coding_rationale: newRationale,
        }),
      });
      setShowAddCode(false);
      setNewCode('');
      setNewMods('');
      setNewEvidence('');
      setNewRationale('');
      setStatusBanner(`Added verified code ${newCode.toUpperCase()} to encounter.`);
      await loadWorkspace(workspace.encounter.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add code');
    }
  }

  function renderHighlightedDocument(rawText: string, snippet: string) {
    if (!snippet || snippet.trim().length < 4) {
      return <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">{rawText}</pre>;
    }
    const idx = rawText.toLowerCase().indexOf(snippet.trim().toLowerCase().slice(0, 40));
    if (idx === -1) {
      return <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">{rawText}</pre>;
    }
    const matchLen = Math.min(snippet.trim().length, rawText.length - idx);
    const before = rawText.slice(0, idx);
    const hit = rawText.slice(idx, idx + matchLen);
    const after = rawText.slice(idx + matchLen);
    return (
      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
        {before}
        <mark className="bg-amber-200/80 text-slate-950 px-0.5 rounded-sm">{hit}</mark>
        {after}
      </pre>
    );
  }

  if (loading && !workspace) {
    return <div className="h-96 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  if (!workspace) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
        {error ? (
          <>
            <p className="text-sm font-medium text-[#DC2626]">{error}</p>
            <button
              type="button"
              onClick={() => void loadWorkspace(encounterId ?? undefined)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#071D49] rounded-md cursor-pointer"
            >
              Retry
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">No encounters available yet. Upload a clinical document in Medical Records.</p>
        )}
      </div>
    );
  }

  const {
    encounter,
    patient,
    patientEncounters,
    records,
    entities,
    insurancePolicies,
    eligibility,
    recommendations,
    validations,
    denialRisks,
    approvals,
  } = workspace;

  const activeRecord = records[0];

  return (
    <div className="space-y-4">
      {/* Workspace Action Bar */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="enc-select" className="text-xs font-semibold text-slate-600">
            Encounter:
          </label>
          <select
            id="enc-select"
            value={encounter.id}
            onChange={(e) => onSelectEncounter(e.target.value)}
            className="text-xs font-mono border border-slate-300 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            {encountersList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.encounter_number} · {e.patient_name} ({e.date_of_service})
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            Status:{' '}
            <strong className="text-[#071D49]">{encounter.coding_status.replace(/_/g, ' ')}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddCode(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#071D49] bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Verified Code
          </button>
          <button
            type="button"
            onClick={handleRunAiExtraction}
            disabled={analyzing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Cpu className="w-3.5 h-3.5" />
            {analyzing ? 'Running Clinical AI...' : 'Run AI Extraction & Coding'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>
      )}
      {statusBanner && (
        <div className="p-3 rounded-md bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">
          {statusBanner}
        </div>
      )}

      {/* Three-Panel Coding Interface */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT PANEL: Patient, Insurance, Records, Encounter History */}
        <section aria-label="Patient and Insurance Context" className="xl:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="font-display text-xs font-semibold text-[#071D49] mb-2.5">
              Patient Demographics
            </h2>
            <p className="text-sm font-bold text-[#071D49]">
              {patient.first_name} {patient.last_name}
            </p>
            <div className="mt-2 space-y-1 text-xs text-slate-600 tabular-nums">
              <p>
                MRN: <span className="font-mono text-slate-900">{patient.mrn}</span>
              </p>
              <p>
                DOB: <span className="font-mono text-slate-900">{patient.dob}</span> · Sex: {patient.sex}
              </p>
              <p>
                DOS: <span className="font-mono text-slate-900">{encounter.date_of_service}</span> · POS{' '}
                {encounter.place_of_service}
              </p>
              <p>Attending: {encounter.provider_name}</p>
              <p className="font-mono text-[11px] text-slate-500">NPI: {encounter.provider_npi}</p>
            </div>
            {patient.is_synthetic === 1 && (
              <p className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] font-medium text-[#D97706]">
                Synthetic Test Record (Non-PHI)
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="font-display text-xs font-semibold text-[#071D49] mb-2.5">
              Insurance &amp; Eligibility Provenance
            </h2>
            {insurancePolicies.length === 0 ? (
              <p className="text-xs text-slate-500">No insurance policies on file.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {insurancePolicies.map((pol) => (
                  <div key={pol.id} className="pb-2.5 border-b border-slate-100 last:border-b-0 last:pb-0">
                    <p className="font-semibold text-[#071D49]">
                      {pol.priority}: {pol.payer_name}
                    </p>
                    <p className="font-mono text-slate-600 mt-0.5">Member: {pol.member_id}</p>
                    <p className="text-slate-500 mt-0.5">
                      Source: <span className="font-medium text-slate-700">{pol.provenance.replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-200">
                  <p className="font-medium text-slate-700">Clearinghouse 271 Status:</p>
                  <p
                    className={`mt-0.5 font-semibold ${
                      eligibility?.x12_271_status === 'VERIFIED_ACTIVE'
                        ? 'text-[#16A34A]'
                        : eligibility?.x12_271_status === 'VERIFIED_INACTIVE'
                          ? 'text-[#DC2626]'
                          : 'text-[#D97706]'
                    }`}
                  >
                    {eligibility ? eligibility.x12_271_status.replace(/_/g, ' ') : 'NOT VERIFIED'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="font-display text-xs font-semibold text-[#071D49] mb-2.5">
              Encounter History
            </h2>
            <ul className="space-y-2 text-xs">
              {patientEncounters.map((pe) => (
                <li key={pe.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEncounter(pe.id)}
                    className={`w-full text-left p-2 rounded border transition-colors cursor-pointer ${
                      pe.id === encounter.id
                        ? 'border-[#2563EB] bg-blue-50/50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="font-semibold text-[#071D49]">{pe.encounter_number}</span>
                      <span className="text-slate-500">{pe.date_of_service}</span>
                    </div>
                    <p className="text-slate-700 truncate mt-0.5">{pe.chief_complaint}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CENTER PANEL: Clinical Document Viewer & Extracted Entities */}
        <section aria-label="Clinical Document and Extracted Entities" className="xl:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#071D49] shrink-0" />
                <span className="text-xs font-semibold text-[#071D49] truncate">
                  {activeRecord ? activeRecord.file_name : 'No Document'}
                </span>
              </div>
              {activeRecord && (
                <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                  {activeRecord.document_type} · {activeRecord.page_count} page(s)
                </span>
              )}
            </div>

            {activeRecord?.prompt_injection_flagged === 1 && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-[#D97706] font-medium">
                Prompt-injection patterns detected and neutralized before AI inference.
              </div>
            )}

            <div className="p-4 max-h-[430px] overflow-y-auto bg-[#F8FAFC]">
              {activeRecord ? (
                renderHighlightedDocument(activeRecord.raw_text, highlightSnippet)
              ) : (
                <p className="text-xs text-slate-500">No source clinical text available.</p>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-xs font-semibold text-[#071D49]">
                Extracted Clinical Entities ({entities.length})
              </h2>
              {highlightSnippet && (
                <button
                  type="button"
                  onClick={() => setHighlightSnippet('')}
                  className="text-[11px] text-[#2563EB] hover:underline cursor-pointer"
                >
                  Clear highlight
                </button>
              )}
            </div>

            {entities.length === 0 ? (
              <p className="text-xs text-slate-500">Run AI Extraction to identify clinical entities and certainty status.</p>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {entities.map((ent) => {
                  const certaintyColor =
                    ent.certainty === 'confirmed'
                      ? 'text-[#16A34A]'
                      : ent.certainty === 'negated'
                        ? 'text-slate-500'
                        : ent.certainty === 'suspected'
                          ? 'text-[#D97706]'
                          : 'text-[#2563EB]';
                  return (
                    <button
                      key={ent.id}
                      type="button"
                      onClick={() => setHighlightSnippet(ent.evidence_snippet)}
                      className="w-full text-left p-2.5 rounded border border-slate-200 hover:border-[#2563EB] bg-white transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#071D49]">{ent.entity_text}</span>
                        <span className={`font-medium shrink-0 ${certaintyColor}`}>
                          {ent.certainty.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                        <span>{ent.entity_type}</span>
                        <span aria-hidden="true">·</span>
                        <span>Laterality: {ent.laterality}</span>
                        <span aria-hidden="true">·</span>
                        <span>Page {ent.page_number}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: AI Recommendations, Validation Results, Denial Risks & Approvals */}
        <section aria-label="Coding Recommendations and Validation" className="xl:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="font-display text-xs font-semibold text-[#071D49] mb-3">
              Coding Recommendations ({recommendations.length})
            </h2>

            {recommendations.length === 0 ? (
              <p className="text-xs text-slate-500">
                No coding recommendations yet. Click &ldquo;Run AI Extraction &amp; Coding&rdquo; or add a verified code.
              </p>
            ) : (
              <div className="space-y-3">
                {recommendations.map((rec) => {
                  const valColor =
                    rec.validation_status === 'PASSED'
                      ? 'text-[#16A34A]'
                      : rec.validation_status === 'FAILED'
                        ? 'text-[#DC2626]'
                        : 'text-[#D97706]';
                  const appColor =
                    rec.approval_status === 'APPROVED' || rec.approval_status === 'MODIFIED'
                      ? 'text-[#16A34A]'
                      : rec.approval_status === 'REJECTED' || rec.approval_status === 'ESCALATED'
                        ? 'text-[#DC2626]'
                        : 'text-slate-600';

                  return (
                    <div
                      key={rec.id}
                      onClick={() => setHighlightSnippet(rec.supporting_evidence)}
                      className="p-3 rounded-md border border-slate-200 hover:border-slate-300 bg-[#F8FAFC] space-y-2 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-[#071D49]">{rec.code}</span>
                            {rec.modifiers && (
                              <span className="font-mono text-xs font-semibold text-[#2563EB]">
                                -{rec.modifiers}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-500">
                              {rec.code_system} · {rec.diagnosis_role}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-800 mt-0.5">{rec.description}</p>
                        </div>
                        <span className={`text-[11px] font-semibold shrink-0 ${appColor}`}>
                          {rec.approval_status}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 space-y-1">
                        <p>
                          <strong className="text-slate-700">Evidence (p.{rec.page_reference}):</strong> &ldquo;
                          {rec.supporting_evidence}&rdquo;
                        </p>
                        <p>
                          <strong className="text-slate-700">Rationale:</strong> {rec.coding_rationale}
                        </p>
                        <p>
                          <strong className="text-slate-700">Guideline:</strong> {rec.guideline_citation}
                        </p>
                        <p className="tabular-nums">
                          Units: <span className="font-mono">{rec.units}</span> · Dx Pointers:{' '}
                          <span className="font-mono">{rec.diagnosis_pointers || '—'}</span> · Rule Check:{' '}
                          <span className={`font-semibold ${valColor}`}>{rec.validation_status}</span>
                        </p>
                      </div>

                      <div
                        className="pt-2 border-t border-slate-200 flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => void handleDecision(rec, 'APPROVED')}
                          aria-label={`Approve ${rec.code}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-[#16A34A] hover:bg-green-700 rounded cursor-pointer whitespace-nowrap"
                        >
                          <Check className="w-3 h-3" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRec(rec);
                            setEditCode(rec.code);
                            setEditModifiers(rec.modifiers);
                            setEditUnits(rec.units);
                            setEditPointers(rec.diagnosis_pointers);
                            setEditNotes('');
                          }}
                          aria-label={`Modify ${rec.code}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#071D49] bg-white border border-slate-300 hover:bg-slate-50 rounded cursor-pointer whitespace-nowrap"
                        >
                          <Edit3 className="w-3 h-3" />
                          Modify
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDecision(rec, 'REJECTED', { notes: 'Rejected by coder' })}
                          aria-label={`Reject ${rec.code}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#DC2626] bg-white border border-red-200 hover:bg-red-50 rounded cursor-pointer whitespace-nowrap"
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDecision(rec, 'ESCALATED', { notes: 'Escalated for physician query / audit' })
                          }
                          aria-label={`Escalate ${rec.code}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#D97706] bg-white border border-amber-200 hover:bg-amber-50 rounded cursor-pointer whitespace-nowrap"
                        >
                          Escalate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Deterministic Validation Results */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="font-display text-xs font-semibold text-[#071D49] mb-3">
              Deterministic Rules Validation ({validations.length})
            </h2>
            <div className="space-y-2">
              {validations.map((val, idx) => (
                <div key={val.id ?? idx} className="p-2.5 rounded border border-slate-200 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#071D49]">
                      {val.rule_category.replace(/_/g, ' ')} · <span className="font-mono">{val.code_involved}</span>
                    </span>
                    <span
                      className={`font-semibold shrink-0 inline-flex items-center gap-1 ${
                        val.severity === 'PASS'
                          ? 'text-[#16A34A]'
                          : val.severity === 'ERROR'
                            ? 'text-[#DC2626]'
                            : 'text-[#D97706]'
                      }`}
                    >
                      {val.severity === 'PASS' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {val.severity}
                    </span>
                  </div>
                  <p className="text-slate-700 mt-1">{val.message}</p>
                  {val.severity !== 'PASS' && (
                    <p className="text-slate-500 mt-1">
                      <strong>Action:</strong> {val.remediation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Denial Risk Indicators */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="font-display text-xs font-semibold text-[#071D49] mb-3">
              Pre-Bill Denial Risks ({denialRisks.length})
            </h2>
            {denialRisks.length === 0 ? (
              <p className="text-xs text-[#16A34A] font-medium">No pre-submission denial risks identified.</p>
            ) : (
              <div className="space-y-2">
                {denialRisks.map((dr, idx) => (
                  <div key={dr.id ?? idx} className="p-2.5 rounded border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#071D49] flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626]" />
                        {dr.risk_category.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`font-semibold ${
                          dr.severity === 'CRITICAL' || dr.severity === 'HIGH'
                            ? 'text-[#DC2626]'
                            : 'text-[#D97706]'
                        }`}
                      >
                        {dr.severity}
                      </span>
                    </div>
                    <p className="text-slate-700 mt-1">{dr.supporting_evidence}</p>
                    <p className="text-slate-500 mt-1">Policy: {dr.applicable_policy}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Human Approval Audit History */}
          {approvals.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h2 className="font-display text-xs font-semibold text-[#071D49] mb-2.5">
                Decision Audit Trail
              </h2>
              <ul className="space-y-1.5 text-[11px] text-slate-600">
                {approvals.slice(0, 6).map((a) => (
                  <li key={a.id} className="border-b border-slate-100 pb-1.5 last:border-b-0">
                    <span className="font-semibold text-[#071D49]">{a.action}</span>{' '}
                    <span className="font-mono">{a.new_code || a.previous_code}</span> by {a.actor_email}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Modify Recommendation Modal */}
      {editingRec && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#071D49]">
              Modify Coding Recommendation ({editingRec.code_system})
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="mod-code" className="block font-medium text-slate-700 mb-1">
                  Code (validated against authoritative catalog)
                </label>
                <input
                  id="mod-code"
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="mod-mods" className="block font-medium text-slate-700 mb-1">
                    Modifiers
                  </label>
                  <input
                    id="mod-mods"
                    type="text"
                    placeholder="25, RT"
                    value={editModifiers}
                    onChange={(e) => setEditModifiers(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="mod-units" className="block font-medium text-slate-700 mb-1">
                    Units
                  </label>
                  <input
                    id="mod-units"
                    type="number"
                    min={1}
                    max={99}
                    value={editUnits}
                    onChange={(e) => setEditUnits(Number(e.target.value))}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="mod-ptr" className="block font-medium text-slate-700 mb-1">
                    Dx Pointers
                  </label>
                  <input
                    id="mod-ptr"
                    type="text"
                    placeholder="A,B"
                    value={editPointers}
                    onChange={(e) => setEditPointers(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="mod-notes" className="block font-medium text-slate-700 mb-1">
                  Coder Modification Rationale
                </label>
                <textarea
                  id="mod-notes"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Appended Modifier 25 for separate moderate MDM E/M service"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRec(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleDecision(editingRec, 'MODIFIED', {
                    new_code: editCode,
                    modifiers: editModifiers,
                    units: editUnits,
                    diagnosis_pointers: editPointers,
                    notes: editNotes,
                  })
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
              >
                Save &amp; Re-Validate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Verified Code Modal */}
      {showAddCode && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddManualCode}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-[#071D49]">Add Verified Medical Code</h3>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="add-sys" className="block font-medium text-slate-700 mb-1">
                    Code System
                  </label>
                  <select
                    id="add-sys"
                    value={newSystem}
                    onChange={(e) => setNewSystem(e.target.value as typeof newSystem)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  >
                    <option value="CPT">CPT</option>
                    <option value="ICD-10-CM">ICD-10-CM</option>
                    <option value="ICD-10-PCS">ICD-10-PCS</option>
                    <option value="HCPCS">HCPCS</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="add-code" className="block font-medium text-slate-700 mb-1">
                    Code
                  </label>
                  <input
                    id="add-code"
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g. 93000"
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="add-role" className="block font-medium text-slate-700 mb-1">
                    Role
                  </label>
                  <select
                    id="add-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                    className="w-full px-2 py-2 border border-slate-300 rounded-md"
                  >
                    <option value="PROCEDURE">Procedure</option>
                    <option value="PRIMARY">Primary Dx</option>
                    <option value="SECONDARY">Secondary Dx</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="add-mods" className="block font-medium text-slate-700 mb-1">
                    Modifiers
                  </label>
                  <input
                    id="add-mods"
                    type="text"
                    value={newMods}
                    onChange={(e) => setNewMods(e.target.value)}
                    placeholder="25"
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="add-units" className="block font-medium text-slate-700 mb-1">
                    Units
                  </label>
                  <input
                    id="add-units"
                    type="number"
                    min={1}
                    value={newUnits}
                    onChange={(e) => setNewUnits(Number(e.target.value))}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="add-ev" className="block font-medium text-slate-700 mb-1">
                  Supporting Clinical Evidence
                </label>
                <input
                  id="add-ev"
                  type="text"
                  required
                  minLength={4}
                  value={newEvidence}
                  onChange={(e) => setNewEvidence(e.target.value)}
                  placeholder="Verbatim quote from clinical note"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="add-rat" className="block font-medium text-slate-700 mb-1">
                  Coding Rationale
                </label>
                <input
                  id="add-rat"
                  type="text"
                  required
                  minLength={4}
                  value={newRationale}
                  onChange={(e) => setNewRationale(e.target.value)}
                  placeholder="Why this code is supported"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCode(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
              >
                Add &amp; Validate
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
