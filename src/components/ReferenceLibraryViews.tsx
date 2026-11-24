import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, History, Upload } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  CodingValidationResult,
  NcciEditRule,
  PayerPolicyRule,
  ReferenceCode,
  ReferenceDatasetImportRecord,
} from '../lib/types';

interface CodeExplorerViewProps {
  systemFilter: 'ICD-10' | 'CPT' | 'HCPCS' | 'MODIFIER';
}

export const CodeExplorerView: React.FC<CodeExplorerViewProps> = ({ systemFilter }) => {
  const [codes, setCodes] = useState<ReferenceCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [datasetCounts, setDatasetCounts] = useState<{
    icd10Count: number;
    cptCount: number;
    hcpcsCount: number;
    modifierCount: number;
  } | null>(null);
  const [imports, setImports] = useState<ReferenceDatasetImportRecord[]>([]);
  const [query, setQuery] = useState('');
  const [icdSubFilter, setIcdSubFilter] = useState<'ALL' | 'ICD-10-CM' | 'ICD-10-PCS'>('ALL');
  const [loading, setLoading] = useState(true);

  // Import Dataset Modal
  const [showImport, setShowImport] = useState(false);
  const [datasetType, setDatasetType] = useState<ReferenceDatasetImportRecord['dataset_type']>(
    systemFilter === 'CPT'
      ? 'CPT'
      : systemFilter === 'HCPCS'
        ? 'HCPCS'
        : systemFilter === 'MODIFIER'
          ? 'MODIFIER'
          : 'ICD-10-CM',
  );
  const [versionLabel, setVersionLabel] = useState('FY2026-Q4');
  const [sourceName, setSourceName] = useState(systemFilter === 'CPT' ? 'AMA Licensed Distribution' : 'CMS Official Release');
  const [fileName, setFileName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [amaAttested, setAmaAttested] = useState(false);
  const [content, setContent] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const sysParam = systemFilter === 'ICD-10' ? (icdSubFilter === 'ALL' ? 'ICD-10' : icdSubFilter) : systemFilter;
    try {
      const [codesRes, impRes] = await Promise.all([
        apiRequest<{
          codes: ReferenceCode[];
          total: number;
          datasetCounts: NonNullable<typeof datasetCounts>;
        }>(`/codes?system=${encodeURIComponent(sysParam)}&q=${encodeURIComponent(query)}&page=${page}&pageSize=50`),
        apiRequest<{ imports: ReferenceDatasetImportRecord[] }>('/reference-datasets/imports'),
      ]);
      setCodes(codesRes.codes);
      setTotal(codesRes.total);
      setDatasetCounts(codesRes.datasetCounts);
      setImports(impRes.imports);
    } finally {
      setLoading(false);
    }
  }, [systemFilter, icdSubFilter, query, page]);

  useEffect(() => {
    setPage(1);
  }, [systemFilter, icdSubFilter, query]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  async function handleFileSelect(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const txt = await file.text();
    setContent(txt);
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setImportError('');
    setImportSuccess('');
    setImporting(true);
    try {
      const res = await apiRequest<{ recordsImported: number }>('/reference-datasets/import', {
        method: 'POST',
        body: JSON.stringify({
          datasetType,
          versionLabel,
          sourceName,
          fileName: fileName || `${datasetType.toLowerCase()}-${versionLabel}.csv`,
          effectiveDate,
          amaLicenseAttested: amaAttested,
          content,
        }),
      });
      setImportSuccess(`Imported ${res.recordsImported} ${datasetType} reference entries (${versionLabel}).`);
      setShowImport(false);
      setContent('');
      setFileName('');
      await loadCatalog();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Dataset import failed');
    } finally {
      setImporting(false);
    }
  }

  const activeSystemMissing =
    datasetCounts !== null &&
    ((systemFilter === 'CPT' && datasetCounts.cptCount === 0) ||
      (systemFilter === 'ICD-10' && datasetCounts.icd10Count === 0) ||
      (systemFilter === 'HCPCS' && datasetCounts.hcpcsCount === 0) ||
      (systemFilter === 'MODIFIER' && datasetCounts.modifierCount === 0));

  return (
    <div className="space-y-4">
      {systemFilter === 'CPT' && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>AMA CPT Licensing Enforcement:</strong> Proprietary CPT codes are excluded from public database seeds. Organizations must import their licensed AMA CPT file with explicit license attestation before CPT validation or claim readiness can succeed.
        </div>
      )}

      {importSuccess && (
        <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">
          {importSuccess}
        </div>
      )}

      {activeSystemMissing && (
        <div className="p-4 rounded-lg bg-white border border-amber-300 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Database className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#0B1830]">
                Authoritative {systemFilter} Dataset Not Loaded
              </p>
              <p className="text-[#64748B] mt-0.5">
                Claim readiness and deterministic code validation for {systemFilter} are blocked until an authoritative dataset is imported.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="px-3.5 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
          >
            Import {systemFilter} Dataset
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          aria-label={`Search ${systemFilter} codes`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${systemFilter} code, description, or clinical category...`}
          className="px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-md w-80 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />

        <div className="flex items-center gap-2">
          {systemFilter === 'ICD-10' && (
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
              {(['ALL', 'ICD-10-CM', 'ICD-10-PCS'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setIcdSubFilter(tab)}
                  className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                    icdSubFilter === tab ? 'bg-white text-[#0B1830] shadow-sm' : 'text-[#64748B]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Reference Dataset
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
              <th className="py-2.5 px-4 font-semibold">Code</th>
              <th className="py-2.5 px-4 font-semibold">System</th>
              <th className="py-2.5 px-4 font-semibold">Description</th>
              <th className="py-2.5 px-4 font-semibold">Category</th>
              <th className="py-2.5 px-4 font-semibold">Effective</th>
              <th className="py-2.5 px-4 font-semibold text-right">MUE</th>
              <th className="py-2.5 px-4 font-semibold text-right">Global</th>
              <th className="py-2.5 px-4 font-semibold">Guideline Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-[#64748B]">
                  Loading authoritative reference catalog...
                </td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[#64748B]">
                  No {systemFilter} entries available. Import a CSV or JSON release to populate this catalog.
                </td>
              </tr>
            ) : (
              codes.map((c) => (
                <tr key={`${c.code_system}-${c.code}`} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-bold text-[#0B1830]">{c.code}</td>
                  <td className="py-3 px-4 text-[#64748B]">{c.code_system}</td>
                  <td className="py-3 px-4 text-slate-900 max-w-md">
                    {c.description}
                    {!Boolean(c.is_billable) && (
                      <span className="ml-2 text-[11px] font-semibold text-[#D97706]">(Non-billable header)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[#64748B]">{c.category}</td>
                  <td className="py-3 px-4 font-mono text-[#64748B]">{c.effective_date}</td>
                  <td className="py-3 px-4 text-right font-mono">{c.mue_limit ?? '—'}</td>
                  <td className="py-3 px-4 text-right font-mono">{c.global_days !== null ? `${c.global_days}d` : '—'}</td>
                  <td className="py-3 px-4 text-[#64748B]">{c.guideline_reference}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Page {page} of {Math.ceil(total / 50)} ({total} codes)
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
              disabled={page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 bg-white border border-[#E2E8F0] rounded disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Dataset Update Audit History */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0B1830]">
          <History className="w-4 h-4 text-[#0D9488]" />
          <span>Authoritative Dataset Import &amp; Version History</span>
        </div>
        {imports.length === 0 ? (
          <p className="text-xs text-[#64748B]">No custom dataset imports logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-left">
                  <th className="py-2 font-medium">Dataset</th>
                  <th className="py-2 font-medium">Version</th>
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 font-medium text-right">Records</th>
                  <th className="py-2 font-medium">Effective</th>
                  <th className="py-2 font-medium">Imported By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {imports.map((imp) => (
                  <tr key={imp.id}>
                    <td className="py-2 font-semibold text-[#0B1830]">{imp.dataset_type}</td>
                    <td className="py-2 font-mono">{imp.version_label}</td>
                    <td className="py-2 text-[#64748B]">{imp.source_name}</td>
                    <td className="py-2 text-right font-mono">{imp.records_imported}</td>
                    <td className="py-2 font-mono">{imp.effective_date}</td>
                    <td className="py-2 text-[#64748B]">{imp.imported_by_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reference Dataset Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleImport} className="bg-white border border-[#E2E8F0] rounded-lg max-w-lg w-full p-6 space-y-3.5 text-xs">
            <h3 className="font-display text-base font-bold text-[#0B1830]">Import Authoritative Coding Dataset</h3>
            {importError && <div className="p-2.5 rounded bg-red-50 border border-red-200 text-[#DC2626]">{importError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="imp-type" className="block font-medium text-slate-700 mb-1">Dataset Type</label>
                <select
                  id="imp-type"
                  value={datasetType}
                  onChange={(e) => setDatasetType(e.target.value as ReferenceDatasetImportRecord['dataset_type'])}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white"
                >
                  <option value="ICD-10-CM">ICD-10-CM</option>
                  <option value="ICD-10-PCS">ICD-10-PCS</option>
                  <option value="CPT">CPT (Licensed)</option>
                  <option value="HCPCS">HCPCS Level II</option>
                  <option value="MODIFIER">Modifiers</option>
                  <option value="NCCI_PTP">NCCI PTP Edits</option>
                  <option value="LCD_NCD">LCD / NCD Policies</option>
                </select>
              </div>
              <div>
                <label htmlFor="imp-ver" className="block font-medium text-slate-700 mb-1">Version Label</label>
                <input id="imp-ver" required value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="imp-src" className="block font-medium text-slate-700 mb-1">Authoritative Source</label>
                <input id="imp-src" required value={sourceName} onChange={(e) => setSourceName(e.target.value)} className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
              </div>
              <div>
                <label htmlFor="imp-eff" className="block font-medium text-slate-700 mb-1">Effective Date</label>
                <input id="imp-eff" type="date" required value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div>
              <label htmlFor="imp-file" className="block font-medium text-slate-700 mb-1">Upload CSV or JSON File</label>
              <input
                id="imp-file"
                type="file"
                accept=".csv,.json,.txt"
                onChange={(e) => void handleFileSelect(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-1.5 border border-[#E2E8F0] rounded-md bg-[#F1F5F9]"
              />
            </div>
            <div>
              <label htmlFor="imp-content" className="block font-medium text-slate-700 mb-1">Dataset Payload (CSV with header or JSON array)</label>
              <textarea
                id="imp-content"
                rows={5}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="code,description,category,effective_date,mue_limit,is_billable"
                className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
              />
            </div>
            {datasetType === 'CPT' && (
              <label className="flex items-start gap-2 p-2.5 rounded bg-amber-50 border border-amber-200 cursor-pointer">
                <input type="checkbox" checked={amaAttested} onChange={(e) => setAmaAttested(e.target.checked)} className="mt-0.5" />
                <span className="text-amber-950">
                  I attest that this organization holds a valid AMA CPT commercial distribution/use license for these procedure descriptors.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 border border-[#E2E8F0] rounded-md cursor-pointer">Cancel</button>
              <button type="submit" disabled={importing} className="px-4 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer disabled:opacity-50">
                {importing ? 'Importing...' : 'Validate & Import'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const MedicalNecessityView: React.FC = () => {
  const [procedureInput, setProcedureInput] = useState('');
  const [diagnosisInput, setDiagnosisInput] = useState('');
  const [dos, setDos] = useState(new Date().toISOString().slice(0, 10));
  const [age, setAge] = useState(55);
  const [sex, setSex] = useState<'M' | 'F' | 'U'>('F');
  const [modifiers, setModifiers] = useState('');

  const [results, setResults] = useState<CodingValidationResult[]>([]);
  const [policies, setPolicies] = useState<PayerPolicyRule[]>([]);
  const [ncciRules, setNcciRules] = useState<NcciEditRule[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiRequest<{ policies: PayerPolicyRule[]; ncciRules: NcciEditRule[] }>('/policies/necessity').then((res) => {
      setPolicies(res.policies);
      setNcciRules(res.ncciRules);
    });
  }, []);

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const procList = procedureInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const dxList = diagnosisInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiRequest<{ validations: CodingValidationResult[] }>('/policies/check-necessity', {
        method: 'POST',
        body: JSON.stringify({
          procedureCodes: procList,
          diagnosisCodes: dxList,
          dateOfService: dos,
          patientAge: age,
          patientSex: sex,
          modifiers,
        }),
      });
      setResults(res.validations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="font-display text-sm font-bold text-[#0B1830] mb-1">
          Deterministic Medical Necessity, NCCI &amp; Policy Validator
        </h2>
        <p className="text-xs text-[#64748B] mb-4">
          Evaluate procedure + diagnosis combinations against imported LCD/NCD coverage, NCCI PTP edits, MUE caps, and demographic rules. Returns Unable to Validate when authoritative datasets are absent.
        </p>

        {error && <div className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}

        <form onSubmit={runCheck} className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs items-end">
          <div className="lg:col-span-2">
            <label htmlFor="mn-proc" className="block font-medium text-slate-700 mb-1">
              Procedure Codes (CPT/HCPCS)
            </label>
            <input
              id="mn-proc"
              type="text"
              required
              value={procedureInput}
              onChange={(e) => setProcedureInput(e.target.value)}
              placeholder="e.g. 20610, 76942"
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
            />
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="mn-dx" className="block font-medium text-slate-700 mb-1">
              Diagnosis Codes (ICD-10-CM)
            </label>
            <input
              id="mn-dx"
              type="text"
              required
              value={diagnosisInput}
              onChange={(e) => setDiagnosisInput(e.target.value)}
              placeholder="e.g. M17.11"
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
            />
          </div>
          <div>
            <label htmlFor="mn-mod" className="block font-medium text-slate-700 mb-1">
              Modifiers
            </label>
            <input
              id="mn-mod"
              type="text"
              value={modifiers}
              onChange={(e) => setModifiers(e.target.value)}
              placeholder="RT, 25"
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
            >
              Evaluate Rules
            </button>
          </div>

          <div>
            <label htmlFor="mn-dos" className="block font-medium text-slate-700 mb-1">
              Date of Service
            </label>
            <input
              id="mn-dos"
              type="date"
              value={dos}
              onChange={(e) => setDos(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
            />
          </div>
          <div>
            <label htmlFor="mn-age" className="block font-medium text-slate-700 mb-1">
              Patient Age
            </label>
            <input
              id="mn-age"
              type="number"
              min={0}
              max={120}
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
            />
          </div>
          <div>
            <label htmlFor="mn-sex" className="block font-medium text-slate-700 mb-1">
              Sex
            </label>
            <select
              id="mn-sex"
              value={sex}
              onChange={(e) => setSex(e.target.value as 'M' | 'F' | 'U')}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white"
            >
              <option value="F">F</option>
              <option value="M">M</option>
              <option value="U">U</option>
            </select>
          </div>
        </form>

        {results.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#E2E8F0] space-y-2">
            {results.map((r, i) => (
              <div key={i} className="p-3 rounded border border-[#E2E8F0] bg-[#F1F5F9] text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0B1830]">
                    {r.rule_category.replace(/_/g, ' ')} · <span className="font-mono">{r.code_involved}</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      r.severity === 'PASS'
                        ? 'text-[#16A34A]'
                        : r.severity === 'ERROR'
                          ? 'text-[#DC2626]'
                          : 'text-[#D97706]'
                    }`}
                  >
                    {r.severity === 'PASS' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {r.severity}
                  </span>
                </div>
                <p className="text-slate-700 mt-1">{r.message}</p>
                <p className="text-[#64748B] mt-1">
                  Policy: {r.policy_reference} · Remediation: {r.remediation}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <h3 className="font-display text-sm font-semibold text-[#0B1830] mb-3">Active LCD / NCD &amp; Payer Policies</h3>
          {policies.length === 0 ? (
            <p className="text-xs text-[#64748B]">No LCD/NCD policy rules imported yet.</p>
          ) : (
            <div className="space-y-3 text-xs">
              {policies.map((p) => (
                <div key={p.id} className="p-3 border border-[#E2E8F0] rounded">
                  <p className="font-semibold text-[#0B1830]">
                    {p.policy_type} {p.policy_code} · {p.title}
                  </p>
                  <p className="text-[#64748B] mt-1">
                    Procedures: <span className="font-mono">{p.procedure_codes.join(', ')}</span> · Covered ICD-10:{' '}
                    <span className="font-mono">{p.covered_icd10_codes.join(', ')}</span>
                  </p>
                  <p className="text-[#64748B] mt-1">{p.documentation_requirements}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <h3 className="font-display text-sm font-semibold text-[#0B1830] mb-3">NCCI Procedure-to-Procedure Edit Rules</h3>
          {ncciRules.length === 0 ? (
            <p className="text-xs text-[#64748B]">No NCCI PTP rules imported yet.</p>
          ) : (
            <div className="space-y-3 text-xs">
              {ncciRules.map((n) => (
                <div key={n.id} className="p-3 border border-[#E2E8F0] rounded">
                  <p className="font-mono font-semibold text-[#0B1830]">
                    Column 1: {n.column1_code} / Column 2: {n.column2_code} · Modifier Indicator: {n.modifier_indicator}
                  </p>
                  <p className="text-[#64748B] mt-1">{n.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
