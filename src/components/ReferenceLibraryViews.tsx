import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { CodingValidationResult, NcciEditRule, PayerPolicyRule, ReferenceCode } from '../lib/types';

interface CodeExplorerViewProps {
  systemFilter: 'ICD-10' | 'CPT' | 'HCPCS' | 'MODIFIER';
}

export const CodeExplorerView: React.FC<CodeExplorerViewProps> = ({ systemFilter }) => {
  const [codes, setCodes] = useState<ReferenceCode[]>([]);
  const [query, setQuery] = useState('');
  const [icdSubFilter, setIcdSubFilter] = useState<'ALL' | 'ICD-10-CM' | 'ICD-10-PCS'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const sysParam = systemFilter === 'ICD-10' ? (icdSubFilter === 'ALL' ? '' : icdSubFilter) : systemFilter;
      try {
        const res = await apiRequest<{ codes: ReferenceCode[] }>(
          `/codes?system=${encodeURIComponent(sysParam)}&q=${encodeURIComponent(query)}`,
        );
        if (!active) return;
        const filtered =
          systemFilter === 'ICD-10' && icdSubFilter === 'ALL'
            ? res.codes.filter((c) => c.code_system === 'ICD-10-CM' || c.code_system === 'ICD-10-PCS')
            : res.codes;
        setCodes(filtered);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [systemFilter, icdSubFilter, query]);

  return (
    <div className="space-y-4">
      {systemFilter === 'CPT' && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>AMA CPT Licensing Notice:</strong> Proprietary CPT codes and official AMA descriptors require an active AMA CPT license for production commercial deployment. Sample descriptive entries below are provided strictly for deterministic validation development and testing.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          aria-label={`Search ${systemFilter} codes`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${systemFilter} code, description, or clinical category...`}
          className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md w-80 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />

        {systemFilter === 'ICD-10' && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(['ALL', 'ICD-10-CM', 'ICD-10-PCS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setIcdSubFilter(tab)}
                className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                  icdSubFilter === tab ? 'bg-white text-[#071D49] shadow-sm' : 'text-slate-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
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
                <td colSpan={8} className="py-6 text-center text-slate-500">
                  Loading authoritative reference catalog...
                </td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-500">
                  No matching codes in catalog.
                </td>
              </tr>
            ) : (
              codes.map((c) => (
                <tr key={`${c.code_system}-${c.code}`} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-bold text-[#071D49]">{c.code}</td>
                  <td className="py-3 px-4 text-slate-600">{c.code_system}</td>
                  <td className="py-3 px-4 text-slate-900 max-w-md">
                    {c.description}
                    {c.is_billable === 0 && (
                      <span className="ml-2 text-[11px] font-semibold text-[#D97706]">(Non-billable header)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{c.category}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{c.effective_date}</td>
                  <td className="py-3 px-4 text-right font-mono">{c.mue_limit ?? '—'}</td>
                  <td className="py-3 px-4 text-right font-mono">{c.global_days !== null ? `${c.global_days}d` : '—'}</td>
                  <td className="py-3 px-4 text-slate-600">{c.guideline_reference}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const MedicalNecessityView: React.FC = () => {
  const [procedureInput, setProcedureInput] = useState('20610, 76942');
  const [diagnosisInput, setDiagnosisInput] = useState('M17.11');
  const [dos, setDos] = useState('2026-11-15');
  const [age, setAge] = useState(65);
  const [sex, setSex] = useState<'M' | 'F' | 'U'>('F');
  const [modifiers, setModifiers] = useState('RT');

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
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="font-display text-sm font-bold text-[#071D49] mb-1">
          Deterministic Medical Necessity, NCCI &amp; Policy Validator
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Test procedure + diagnosis combinations against version-controlled LCD/NCD coverage, NCCI PTP edits, MUE caps, and demographic rules.
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
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
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
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
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
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
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
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
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
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
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
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
            >
              <option value="F">F</option>
              <option value="M">M</option>
              <option value="U">U</option>
            </select>
          </div>
        </form>

        {results.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-200 space-y-2">
            {results.map((r, i) => (
              <div key={i} className="p-3 rounded border border-slate-200 bg-[#F8FAFC] text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#071D49]">
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
                <p className="text-slate-500 mt-1">
                  Policy: {r.policy_reference} · Remediation: {r.remediation}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="font-display text-sm font-semibold text-[#071D49] mb-3">Active LCD / NCD &amp; Payer Policies</h3>
          <div className="space-y-3 text-xs">
            {policies.map((p) => (
              <div key={p.id} className="p-3 border border-slate-200 rounded">
                <p className="font-semibold text-[#071D49]">
                  {p.policy_type} {p.policy_code} · {p.title}
                </p>
                <p className="text-slate-600 mt-1">
                  Procedures: <span className="font-mono">{p.procedure_codes.join(', ')}</span> · Covered ICD-10:{' '}
                  <span className="font-mono">{p.covered_icd10_codes.join(', ')}</span>
                </p>
                <p className="text-slate-500 mt-1">{p.documentation_requirements}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="font-display text-sm font-semibold text-[#071D49] mb-3">NCCI Procedure-to-Procedure Edit Rules</h3>
          <div className="space-y-3 text-xs">
            {ncciRules.map((n) => (
              <div key={n.id} className="p-3 border border-slate-200 rounded">
                <p className="font-mono font-semibold text-[#071D49]">
                  Column 1: {n.column1_code} / Column 2: {n.column2_code} · Modifier Indicator: {n.modifier_indicator}
                </p>
                <p className="text-slate-600 mt-1">{n.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
