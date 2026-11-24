import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Columns,
  Cpu,
  Edit3,
  Eye,
  FileText,
  History,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { apiRequest, fetchAuthenticatedBlobUrl } from '../lib/api';
import type {
  AIProcessingJob,
  CodingAnnotation,
  CodingRecommendation,
  CodingRecommendationVersion,
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
  annotations?: CodingAnnotation[];
  aiJobs?: AIProcessingJob[];
  versions?: CodingRecommendationVersion[];
  reviewers?: Array<{ id: string; full_name: string; email: string; role: string }>;
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

  // Resizable 3-panel widths (percentages on xl screens)
  const [leftPct, setLeftPct] = useState(24);
  const [centerPct, setCenterPct] = useState(40);
  const [isXlViewport, setIsXlViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : true,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1280px)');
    setIsXlViewport(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsXlViewport(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Document viewer state (PDF/Image binary vs text fallback, page, zoom, fullscreen, search)
  const [selectedRecordIdx, setSelectedRecordIdx] = useState(0);
  const [viewerMode, setViewerMode] = useState<'text' | 'binary'>('text');
  const [binaryPreview, setBinaryPreview] = useState<{ url: string; mimeType: string } | null>(null);
  const [binaryError, setBinaryError] = useState('');
  const [docPage, setDocPage] = useState(1);
  const [zoomPct, setZoomPct] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [docSearch, setDocSearch] = useState('');

  // Comparison mode & right-panel sub-tabs
  const [comparisonMode, setComparisonMode] = useState(false);
  const [rightTab, setRightTab] = useState<'codes' | 'validation' | 'history'>('codes');

  // Autosave coder draft notes & unsaved changes guard
  const [draftNotes, setDraftNotes] = useState('');
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Annotations composer
  const [annType, setAnnType] = useState<CodingAnnotation['annotation_type']>('EVIDENCE_NOTE');
  const [annContent, setAnnContent] = useState('');

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

  const loadWorkspace = useCallback(
    async (targetId?: string) => {
      setLoading(true);
      setError('');
      try {
        const listRes = await apiRequest<{ encounters: Encounter[] }>('/encounters?pageSize=100');
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
        setDraftNotes(ws.encounter.draft_notes ?? '');
        setDraftSavedAt(ws.encounter.draft_updated_at ?? null);
        setDraftDirty(false);
        setSelectedRecordIdx(0);
        setDocPage(1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load coding workspace');
      } finally {
        setLoading(false);
      }
    },
    [encounterId, onSelectEncounter],
  );

  useEffect(() => {
    void loadWorkspace(encounterId ?? undefined);
  }, [encounterId, loadWorkspace]);

  // Protect unsaved changes on tab close/refresh
  useEffect(() => {
    const hasUnsaved = draftDirty || editingRec !== null || showAddCode;
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draftDirty, editingRec, showAddCode]);

  // Debounced autosave for draft notes
  useEffect(() => {
    if (!draftDirty || !workspace) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<{ draft_updated_at: string }>(
          `/coding-workspace/${workspace.encounter.id}/draft`,
          {
            method: 'PUT',
            body: JSON.stringify({ draft_notes: draftNotes }),
          },
        );
        setDraftDirty(false);
        setDraftSavedAt(res.draft_updated_at || new Date().toISOString());
      } catch {
        // Retry on next change
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [draftDirty, draftNotes, workspace]);

  // Load binary PDF/image blob URL when switching to binary preview
  useEffect(() => {
    let revokedUrl: string | null = null;
    if (viewerMode !== 'binary' || !workspace) {
      setBinaryPreview(null);
      setBinaryError('');
      return;
    }
    const rec = workspace.records[selectedRecordIdx];
    if (!rec) return;
    setBinaryError('');
    void fetchAuthenticatedBlobUrl(`/medical-records/${rec.id}/content`)
      .then((res) => {
        revokedUrl = res.blobUrl;
        setBinaryPreview({ url: res.blobUrl, mimeType: res.mimeType });
      })
      .catch((err) => {
        setBinaryError(err instanceof Error ? err.message : 'Unable to stream binary medical record');
      });

    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [viewerMode, workspace, selectedRecordIdx]);

  function startResize(which: 'left' | 'right', startEvent: React.MouseEvent) {
    startEvent.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = startEvent.clientX;
    const initialLeft = leftPct;
    const initialCenter = centerPct;

    function onMove(ev: MouseEvent) {
      const deltaPct = ((ev.clientX - startX) / rect.width) * 100;
      if (which === 'left') {
        const nextLeft = Math.min(36, Math.max(18, initialLeft + deltaPct));
        const diff = nextLeft - initialLeft;
        const nextCenter = Math.max(28, initialCenter - diff);
        setLeftPct(Math.round(nextLeft));
        setCenterPct(Math.round(nextCenter));
      } else {
        const nextCenter = Math.min(54, Math.max(28, initialCenter + deltaPct));
        if (100 - leftPct - nextCenter >= 22) {
          setCenterPct(Math.round(nextCenter));
        }
      }
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function handleAssignReviewer(reviewerId: string) {
    if (!workspace) return;
    await apiRequest(`/coding-workspace/${workspace.encounter.id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ assigned_reviewer_id: reviewerId || null }),
    });
    setStatusBanner('Updated encounter reviewer assignment.');
    await loadWorkspace(workspace.encounter.id);
  }

  async function handleRunAiExtraction() {
    if (!workspace) return;
    setAnalyzing(true);
    setError('');
    setStatusBanner('');
    try {
      const res = await apiRequest<{
        providerUsed: string;
        modelUsed: string;
        latencyMs: number;
        verifiedCount: number;
        rejectedRecommendations: Array<{ code: string; reason: string }>;
      }>(`/coding-workspace/${workspace.encounter.id}/analyze`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const blockedMsg =
        res.rejectedRecommendations.length > 0
          ? ` (${res.rejectedRecommendations.length} unverified/invalid code(s) blocked by catalog guard)`
          : '';
      setStatusBanner(
        `AI analysis completed in ${res.latencyMs}ms via ${res.modelUsed}: ${res.verifiedCount} verified recommendation(s)${blockedMsg}.`,
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

  async function handleCreateAnnotation(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !annContent.trim()) return;
    const rec = workspace.records[selectedRecordIdx];
    await apiRequest(`/coding-workspace/${workspace.encounter.id}/annotations`, {
      method: 'POST',
      body: JSON.stringify({
        medical_record_id: rec?.id ?? null,
        page_number: docPage,
        anchor_snippet: highlightSnippet || docSearch,
        annotation_type: annType,
        content: annContent,
      }),
    });
    setAnnContent('');
    setStatusBanner('Annotation saved to encounter.');
    await loadWorkspace(workspace.encounter.id);
  }

  async function handleResolveAnnotation(id: string, resolved: boolean) {
    await apiRequest(`/coding-annotations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolved }),
    });
    if (workspace) await loadWorkspace(workspace.encounter.id);
  }

  function renderHighlightedDocument(rawText: string, snippet: string) {
    const target = (docSearch.trim() || snippet.trim()).slice(0, 48);
    if (!target || target.length < 2) {
      return (
        <pre
          className="whitespace-pre-wrap font-sans leading-relaxed text-slate-800"
          style={{ fontSize: `${Math.round((12 * zoomPct) / 100)}px` }}
        >
          {rawText}
        </pre>
      );
    }
    const idx = rawText.toLowerCase().indexOf(target.toLowerCase());
    if (idx === -1) {
      return (
        <pre
          className="whitespace-pre-wrap font-sans leading-relaxed text-slate-800"
          style={{ fontSize: `${Math.round((12 * zoomPct) / 100)}px` }}
        >
          {rawText}
        </pre>
      );
    }
    const matchLen = Math.min(target.length, rawText.length - idx);
    return (
      <pre
        className="whitespace-pre-wrap font-sans leading-relaxed text-slate-800"
        style={{ fontSize: `${Math.round((12 * zoomPct) / 100)}px` }}
      >
        {rawText.slice(0, idx)}
        <mark className="bg-amber-200/90 text-slate-950 px-0.5 rounded-sm">
          {rawText.slice(idx, idx + matchLen)}
        </mark>
        {rawText.slice(idx + matchLen)}
      </pre>
    );
  }

  if (loading && !workspace) {
    return <div className="h-96 bg-white border border-[#E2E8F0] rounded-lg animate-pulse" />;
  }

  if (!workspace) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center space-y-3">
        {error ? (
          <>
            <p className="text-sm font-medium text-[#DC2626]">{error}</p>
            <button
              type="button"
              onClick={() => void loadWorkspace(encounterId ?? undefined)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1830] rounded-md cursor-pointer"
            >
              Retry
            </button>
          </>
        ) : (
          <p className="text-sm text-[#64748B]">
            No encounters available yet. Register a patient and upload a clinical document in Medical Records.
          </p>
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
    annotations = [],
    aiJobs = [],
    versions = [],
    reviewers = [],
  } = workspace;

  const activeRecord = records[selectedRecordIdx] ?? records[0];
  const rightPct = Math.max(22, 100 - leftPct - centerPct);
  const missingDatasetWarnings = validations.filter((v) => v.rule_category === 'MISSING_REFERENCE_DATASET');

  return (
    <div className="space-y-4">
      {/* Workspace Action Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="enc-select" className="text-xs font-semibold text-[#64748B]">
            Encounter:
          </label>
          <select
            id="enc-select"
            value={encounter.id}
            onChange={(e) => onSelectEncounter(e.target.value)}
            className="text-xs font-mono border border-[#E2E8F0] rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            {encountersList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.encounter_number} · {e.patient_name} ({e.date_of_service})
              </option>
            ))}
          </select>

          <span className="text-xs text-[#64748B]">
            Status: <strong className="text-[#0B1830]">{encounter.coding_status.replace(/_/g, ' ')}</strong>
          </span>

          <div className="flex items-center gap-1.5 text-xs">
            <label htmlFor="enc-reviewer" className="text-[#64748B]">Reviewer:</label>
            <select
              id="enc-reviewer"
              value={encounter.assigned_reviewer_id ?? ''}
              onChange={(e) => void handleAssignReviewer(e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded px-2 py-1 bg-white"
            >
              <option value="">Unassigned</option>
              {reviewers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setComparisonMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-md cursor-pointer ${
              comparisonMode
                ? 'bg-[#0B1830] text-white border-[#0B1830]'
                : 'bg-white text-[#0B1830] border-[#E2E8F0] hover:bg-slate-50'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            AI vs. Coder Diff
          </button>
          <button
            type="button"
            onClick={() => setShowAddCode(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
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

      {missingDatasetWarnings.length > 0 && (
        <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
          <div>
            <strong>Reference Dataset Gate Active:</strong>{' '}
            {missingDatasetWarnings.map((w) => w.message).join(' · ')}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>
      )}
      {statusBanner && (
        <div className="p-3 rounded-md bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">
          {statusBanner}
        </div>
      )}

      {/* Resizable Three-Panel Coding Interface */}
      <div ref={containerRef} className="flex flex-col xl:flex-row gap-3 xl:gap-0 items-stretch">
        {/* LEFT PANEL */}
        <section
          aria-label="Patient and Insurance Context"
          style={isXlViewport ? { width: `${leftPct}%`, maxWidth: '38%' } : undefined}
          className="w-full xl:shrink-0 space-y-4 xl:pr-2"
        >
          <div className="space-y-4">
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
              <h2 className="font-display text-xs font-semibold text-[#0B1830] mb-2.5">
                Patient Demographics
              </h2>
              <p className="text-sm font-bold text-[#0B1830]">
                {patient.first_name} {patient.last_name}
              </p>
              <div className="mt-2 space-y-1 text-xs text-[#64748B] tabular-nums">
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
                <p className="font-mono text-[11px] text-[#64748B]">NPI: {encounter.provider_npi}</p>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
              <h2 className="font-display text-xs font-semibold text-[#0B1830] mb-2.5">
                Insurance &amp; Eligibility Provenance
              </h2>
              {insurancePolicies.length === 0 ? (
                <p className="text-xs text-[#64748B]">No insurance policies on file.</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {insurancePolicies.map((pol) => (
                    <div key={pol.id} className="pb-2.5 border-b border-slate-100 last:border-b-0 last:pb-0">
                      <p className="font-semibold text-[#0B1830]">
                        {pol.priority}: {pol.payer_name}
                      </p>
                      <p className="font-mono text-[#64748B] mt-0.5">Member: {pol.member_id}</p>
                      <p className="text-[#64748B] mt-0.5">
                        Source:{' '}
                        <span className="font-medium text-slate-800">{pol.provenance.replace(/_/g, ' ')}</span>
                      </p>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-[#E2E8F0]">
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
                      {eligibility ? eligibility.x12_271_status.replace(/_/g, ' ') : 'VERIFICATION UNAVAILABLE'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Autosaved Coder Draft Notes */}
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="coder-draft" className="font-display text-xs font-semibold text-[#0B1830]">
                  Coder Working Notes (Autosaved)
                </label>
                <span className="text-[11px] text-[#64748B]">
                  {draftDirty ? 'Saving...' : draftSavedAt ? 'Saved' : 'Ready'}
                </span>
              </div>
              <textarea
                id="coder-draft"
                rows={3}
                value={draftNotes}
                onChange={(e) => {
                  setDraftNotes(e.target.value);
                  setDraftDirty(true);
                }}
                placeholder="Capture coding rationale, query drafts, or documentation observations..."
                className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-md bg-[#F1F5F9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
              <h2 className="font-display text-xs font-semibold text-[#0B1830] mb-2.5">
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
                          : 'border-[#E2E8F0] hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-semibold text-[#0B1830]">{pe.encounter_number}</span>
                        <span className="text-[#64748B]">{pe.date_of_service}</span>
                      </div>
                      <p className="text-slate-700 truncate mt-0.5">{pe.chief_complaint}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Left Splitter Handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left and center panels"
          onMouseDown={(e) => startResize('left', e)}
          className="hidden xl:flex w-2 cursor-col-resize items-center justify-center group shrink-0"
        >
          <div className="w-0.5 h-16 bg-[#E2E8F0] group-hover:bg-[#2563EB] rounded-full transition-colors" />
        </div>

        {/* CENTER PANEL: Clinical Document Viewer, Binary Preview, Annotations & Extracted Entities */}
        <section
          aria-label="Clinical Document and Extracted Entities"
          className={`flex-1 min-w-0 space-y-4 ${
            isFullscreen ? 'fixed inset-4 z-50 bg-[#F1F5F9] p-4 rounded-xl overflow-y-auto shadow-2xl border border-[#E2E8F0]' : ''
          }`}
        >
          <div className="bg-white border border-[#E2E8F0] rounded-lg">
            {/* Document Toolbar */}
            <div className="px-4 py-2.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#0B1830] shrink-0" />
                {records.length > 1 ? (
                  <select
                    aria-label="Select encounter document"
                    value={selectedRecordIdx}
                    onChange={(e) => setSelectedRecordIdx(Number(e.target.value))}
                    className="text-xs font-semibold text-[#0B1830] border border-[#E2E8F0] rounded px-2 py-1 bg-white"
                  >
                    {records.map((r, idx) => (
                      <option key={r.id} value={idx}>
                        {r.file_name} ({r.document_type})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-semibold text-[#0B1830] truncate">
                    {activeRecord ? activeRecord.file_name : 'No Document'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {activeRecord && activeRecord.mime_type !== 'text/plain' && (
                  <button
                    type="button"
                    onClick={() => setViewerMode((m) => (m === 'text' ? 'binary' : 'text'))}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#E2E8F0] bg-[#F1F5F9] hover:bg-slate-200 font-medium cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {viewerMode === 'text' ? 'Original PDF/Image' : 'Extracted Text'}
                  </button>
                )}

                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => setZoomPct((z) => Math.max(75, z - 15))}
                  className="p-1 rounded border border-[#E2E8F0] hover:bg-slate-50 cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] w-10 text-center tabular-nums">{zoomPct}%</span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => setZoomPct((z) => Math.min(200, z + 15))}
                  className="p-1 rounded border border-[#E2E8F0] hover:bg-slate-50 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {activeRecord && (
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      type="button"
                      disabled={docPage <= 1}
                      onClick={() => setDocPage((p) => Math.max(1, p - 1))}
                      className="px-1.5 py-0.5 border border-[#E2E8F0] rounded disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="font-mono text-[11px] text-[#64748B]">
                      p.{docPage}/{activeRecord.page_count}
                    </span>
                    <button
                      type="button"
                      disabled={docPage >= activeRecord.page_count}
                      onClick={() => setDocPage((p) => Math.min(activeRecord.page_count, p + 1))}
                      className="px-1.5 py-0.5 border border-[#E2E8F0] rounded disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen document viewer'}
                  onClick={() => setIsFullscreen((f) => !f)}
                  className="p-1 rounded border border-[#E2E8F0] hover:bg-slate-50 cursor-pointer"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* In-Document Search Bar */}
            <div className="px-4 py-2 border-b border-[#E2E8F0] bg-slate-50/70 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#64748B]" />
              <input
                type="search"
                aria-label="Search inside clinical document"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search findings, laterality, medications inside document..."
                className="flex-1 text-xs bg-transparent focus:outline-none"
              />
              {docSearch && (
                <button
                  type="button"
                  onClick={() => setDocSearch('')}
                  className="text-[11px] text-[#2563EB] cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {Boolean(activeRecord?.prompt_injection_flagged) && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-[#D97706] font-medium">
                Prompt-injection patterns detected and neutralized before AI inference.
              </div>
            )}

            <div className={`p-4 ${isFullscreen ? 'max-h-[65vh]' : 'max-h-[440px]'} overflow-y-auto bg-[#F1F5F9]`}>
              {!activeRecord ? (
                <p className="text-xs text-[#64748B]">No source clinical document attached.</p>
              ) : viewerMode === 'binary' ? (
                binaryError ? (
                  <p className="text-xs text-[#DC2626]">{binaryError}</p>
                ) : !binaryPreview ? (
                  <p className="text-xs text-[#64748B]">Streaming encrypted artifact from private storage...</p>
                ) : binaryPreview.mimeType.includes('pdf') ? (
                  <iframe
                    src={`${binaryPreview.url}#page=${docPage}`}
                    title={activeRecord.file_name}
                    className="w-full h-[390px] border border-[#E2E8F0] rounded bg-white"
                  />
                ) : (
                  <img
                    src={binaryPreview.url}
                    alt={activeRecord.file_name}
                    style={{ transform: `scale(${zoomPct / 100})`, transformOrigin: 'top left' }}
                    className="max-w-full rounded border border-[#E2E8F0] bg-white"
                  />
                )
              ) : (
                renderHighlightedDocument(activeRecord.raw_text, highlightSnippet)
              )}
            </div>
          </div>

          {/* Annotations & Deficiency Alerts */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-3">
            <h2 className="font-display text-xs font-semibold text-[#0B1830]">
              Document Annotations &amp; Deficiency Alerts ({annotations.length})
            </h2>
            <form onSubmit={handleCreateAnnotation} className="flex flex-wrap gap-2 text-xs">
              <select
                aria-label="Annotation category"
                value={annType}
                onChange={(e) => setAnnType(e.target.value as CodingAnnotation['annotation_type'])}
                className="px-2 py-1.5 border border-[#E2E8F0] rounded bg-white"
              >
                <option value="EVIDENCE_NOTE">Evidence Note</option>
                <option value="DEFICIENCY_ALERT">Deficiency Alert</option>
                <option value="PHYSICIAN_QUERY">Physician Query</option>
                <option value="AUDITOR_FLAG">Auditor Flag</option>
              </select>
              <input
                type="text"
                value={annContent}
                onChange={(e) => setAnnContent(e.target.value)}
                placeholder={`Add note anchored to page ${docPage}...`}
                className="flex-1 min-w-[180px] px-2.5 py-1.5 border border-[#E2E8F0] rounded"
              />
              <button
                type="submit"
                className="px-3 py-1.5 font-semibold text-white bg-[#0B1830] rounded cursor-pointer"
              >
                Add Note
              </button>
            </form>

            {annotations.length > 0 && (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {annotations.map((ann) => (
                  <div key={ann.id} className="p-2.5 rounded border border-[#E2E8F0] text-xs flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-[#0B1830]">
                        {ann.annotation_type.replace(/_/g, ' ')} (p.{ann.page_number})
                      </span>
                      <p className="text-slate-700 mt-0.5">{ann.content}</p>
                      <p className="text-[11px] text-[#64748B]">{ann.author_email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleResolveAnnotation(ann.id, !ann.resolved)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                        ann.resolved ? 'bg-green-50 text-[#16A34A]' : 'bg-amber-50 text-[#D97706]'
                      }`}
                    >
                      {ann.resolved ? 'Resolved' : 'Mark Resolved'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extracted Clinical Entities */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-xs font-semibold text-[#0B1830]">
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
              <p className="text-xs text-[#64748B]">Run AI Extraction to identify clinical entities and certainty status.</p>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {entities.map((ent) => {
                  const certaintyColor =
                    ent.certainty === 'confirmed'
                      ? 'text-[#16A34A]'
                      : ent.certainty === 'negated'
                        ? 'text-[#64748B]'
                        : ent.certainty === 'suspected'
                          ? 'text-[#D97706]'
                          : 'text-[#2563EB]';
                  return (
                    <button
                      key={ent.id}
                      type="button"
                      onClick={() => {
                        setHighlightSnippet(ent.evidence_snippet);
                        setDocPage(ent.page_number || 1);
                      }}
                      className="w-full text-left p-2.5 rounded border border-[#E2E8F0] hover:border-[#2563EB] bg-white transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#0B1830]">{ent.entity_text}</span>
                        <span className={`font-medium shrink-0 ${certaintyColor}`}>
                          {ent.certainty.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#64748B] flex flex-wrap gap-x-2">
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

        {/* Right Splitter Handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize center and right panels"
          onMouseDown={(e) => startResize('right', e)}
          className="hidden xl:flex w-2 cursor-col-resize items-center justify-center group shrink-0"
        >
          <div className="w-0.5 h-16 bg-[#E2E8F0] group-hover:bg-[#2563EB] rounded-full transition-colors" />
        </div>

        {/* RIGHT PANEL */}
        <section
          aria-label="Coding Recommendations and Validation"
          className="w-full xl:shrink-0 space-y-4 xl:pl-2"
          style={isXlViewport ? { width: `${rightPct}%`, maxWidth: '42%' } : undefined}
        >
          {/* Right Panel Tabs */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-1 flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setRightTab('codes')}
              className={`flex-1 py-1.5 font-semibold rounded cursor-pointer ${
                rightTab === 'codes' ? 'bg-[#0B1830] text-white' : 'text-[#64748B]'
              }`}
            >
              Codes ({recommendations.length})
            </button>
            <button
              type="button"
              onClick={() => setRightTab('validation')}
              className={`flex-1 py-1.5 font-semibold rounded cursor-pointer ${
                rightTab === 'validation' ? 'bg-[#0B1830] text-white' : 'text-[#64748B]'
              }`}
            >
              Rules &amp; Risks ({validations.length + denialRisks.length})
            </button>
            <button
              type="button"
              onClick={() => setRightTab('history')}
              className={`flex-1 py-1.5 font-semibold rounded cursor-pointer ${
                rightTab === 'history' ? 'bg-[#0B1830] text-white' : 'text-[#64748B]'
              }`}
            >
              Versions &amp; Jobs
            </button>
          </div>

          {rightTab === 'codes' && (
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-xs font-semibold text-[#0B1830]">
                  Coding Recommendations ({recommendations.length})
                </h2>
                {comparisonMode && (
                  <span className="text-[11px] font-semibold text-[#2563EB] inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    AI vs. Coder Comparison Active
                  </span>
                )}
              </div>

              {recommendations.length === 0 ? (
                <p className="text-xs text-[#64748B]">
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
                          : 'text-[#64748B]';

                    const draft = rec.ai_draft_payload;
                    const hasDiff =
                      draft &&
                      (draft.code !== rec.code ||
                        draft.modifiers !== rec.modifiers ||
                        draft.units !== rec.units);

                    return (
                      <div
                        key={rec.id}
                        onClick={() => {
                          setHighlightSnippet(rec.supporting_evidence);
                          setDocPage(rec.page_reference || 1);
                        }}
                        className="p-3 rounded-md border border-[#E2E8F0] hover:border-[#2563EB] bg-[#F1F5F9] space-y-2 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-[#0B1830]">{rec.code}</span>
                              {rec.modifiers && (
                                <span className="font-mono text-xs font-semibold text-[#2563EB]">
                                  -{rec.modifiers}
                                </span>
                              )}
                              <span className="text-[11px] text-[#64748B]">
                                {rec.code_system} · {rec.diagnosis_role}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-slate-800 mt-0.5">{rec.description}</p>
                          </div>
                          <span className={`text-[11px] font-semibold shrink-0 ${appColor}`}>
                            {rec.approval_status}
                          </span>
                        </div>

                        {comparisonMode && draft && (
                          <div className="p-2 rounded bg-white border border-[#E2E8F0] text-[11px] space-y-0.5">
                            <p className="font-semibold text-[#0B1830]">
                              AI Original Draft vs. Current Final {hasDiff ? '(Modified)' : '(Unchanged)'}
                            </p>
                            <p className="font-mono text-[#64748B]">
                              AI: {draft.code} {draft.modifiers ? `-${draft.modifiers}` : ''} · {draft.units}u · Ptr:{' '}
                              {draft.diagnosis_pointers || '—'}
                            </p>
                            <p className="font-mono text-[#2563EB]">
                              Final: {rec.code} {rec.modifiers ? `-${rec.modifiers}` : ''} · {rec.units}u · Ptr:{' '}
                              {rec.diagnosis_pointers || '—'}
                            </p>
                          </div>
                        )}

                        <div className="text-[11px] text-[#64748B] space-y-1">
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
                          className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center gap-1.5"
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
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded cursor-pointer whitespace-nowrap"
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
          )}

          {rightTab === 'validation' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
                <h2 className="font-display text-xs font-semibold text-[#0B1830] mb-3">
                  Deterministic Rules Validation ({validations.length})
                </h2>
                <div className="space-y-2">
                  {validations.map((val, idx) => (
                    <div key={val.id ?? idx} className="p-2.5 rounded border border-[#E2E8F0] text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0B1830]">
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
                        <p className="text-[#64748B] mt-1">
                          <strong>Action:</strong> {val.remediation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
                <h2 className="font-display text-xs font-semibold text-[#0B1830] mb-3">
                  Pre-Bill Denial Risks ({denialRisks.length})
                </h2>
                {denialRisks.length === 0 ? (
                  <p className="text-xs text-[#16A34A] font-medium">No pre-submission denial risks identified.</p>
                ) : (
                  <div className="space-y-2">
                    {denialRisks.map((dr, idx) => (
                      <div key={dr.id ?? idx} className="p-2.5 rounded border border-[#E2E8F0] text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#0B1830] flex items-center gap-1">
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
                        <p className="text-[#64748B] mt-1">Policy: {dr.applicable_policy}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {rightTab === 'history' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2.5">
                <h2 className="font-display text-xs font-semibold text-[#0B1830]">
                  AI Processing Job Lifecycle ({aiJobs.length})
                </h2>
                {aiJobs.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No AI extraction jobs executed for this encounter yet.</p>
                ) : (
                  aiJobs.map((job) => (
                    <div key={job.id} className="p-2.5 rounded border border-[#E2E8F0] text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-[#0B1830]">{job.job_type}</span>
                        <span
                          className={`font-semibold ${
                            job.status === 'COMPLETED'
                              ? 'text-[#16A34A]'
                              : job.status === 'FAILED'
                                ? 'text-[#DC2626]'
                                : 'text-[#2563EB]'
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                      {job.latency_ms && <p className="text-[#64748B] font-mono">Latency: {job.latency_ms}ms</p>}
                      {job.error_message && <p className="text-[#DC2626]">{job.error_message}</p>}
                    </div>
                  ))
                )}
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#0B1830]" />
                  <h2 className="font-display text-xs font-semibold text-[#0B1830]">
                    Code Version &amp; Approval History
                  </h2>
                </div>
                {versions.length === 0 && approvals.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No code edits or approvals recorded yet.</p>
                ) : (
                  <ul className="space-y-2 text-[11px] text-[#64748B]">
                    {versions.slice(0, 12).map((v) => (
                      <li key={v.id} className="p-2 rounded border border-[#E2E8F0] space-y-0.5">
                        <div className="flex items-center justify-between font-semibold text-[#0B1830]">
                          <span>v{v.version_number} · {String((v.snapshot as Record<string, unknown>).code ?? '')}</span>
                          <span className="font-mono text-[#64748B]">{v.created_at.slice(0, 16).replace('T', ' ')}</span>
                        </div>
                        <p>{v.change_reason}</p>
                        <p className="text-[10px]">By {v.changed_by_email}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modify Recommendation Modal */}
      {editingRec && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#0B1830]">
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
                  className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                    className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                    className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                    className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRec(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-md cursor-pointer"
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
            className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-[#0B1830]">Add Verified Medical Code</h3>
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
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
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
                    className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                    className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md"
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
                    className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                    className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCode(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-md cursor-pointer"
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
