import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Link2, Lock, Plus, RefreshCw } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AIModelConfig, AuditLogEntry, IntegrationConfig, Organization } from '../lib/types';

interface OrgViewProps {
  organization: Organization | null;
  onUpdated: () => void;
}

export const OrganizationSettingsView: React.FC<OrgViewProps & { isOnboarding?: boolean }> = ({
  organization,
  onUpdated,
  isOnboarding,
}) => {
  const [name, setName] = useState(organization?.name ?? '');
  const [npi, setNpi] = useState(organization?.npi ?? '');
  const [taxId, setTaxId] = useState(organization?.tax_id ?? '');
  const [specialty, setSpecialty] = useState(organization?.specialty ?? '');
  const [retentionDays, setRetentionDays] = useState(organization?.retention_days ?? 2555);
  const [baaAttested, setBaaAttested] = useState(organization?.baa_attested === 1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setNpi(organization.npi);
      setTaxId(organization.tax_id);
      setSpecialty(organization.specialty);
      setRetentionDays(organization.retention_days);
      setBaaAttested(organization.baa_attested === 1);
    }
  }, [organization]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest('/organizations/current', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          npi,
          tax_id: taxId,
          specialty,
          retention_days: retentionDays,
          baa_attested: baaAttested,
          onboarding_completed: true,
        }),
      });
      setMessage(isOnboarding ? 'Organization onboarding completed and saved.' : 'Organization settings saved.');
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save organization');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl bg-white border border-slate-200 rounded-lg p-6 space-y-5">
      <div>
        <h2 className="font-display text-base font-bold text-[#071D49]">
          {isOnboarding ? 'Organization Onboarding & Governance Setup' : 'Organization Settings & Retention Policy'}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure group billing identifiers, HIPAA retention window, and Business Associate Agreement attestation.
        </p>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}
      {message && <div className="p-3 rounded bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">{message}</div>}

      <form onSubmit={handleSave} className="space-y-4 text-xs">
        <div>
          <label htmlFor="org-name" className="block font-medium text-slate-700 mb-1">
            Organization Name
          </label>
          <input
            id="org-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="org-npi" className="block font-medium text-slate-700 mb-1">
              Group NPI (10 digits)
            </label>
            <input
              id="org-npi"
              type="text"
              required
              pattern="\d{10}"
              value={npi}
              onChange={(e) => setNpi(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="org-tin" className="block font-medium text-slate-700 mb-1">
              Tax ID / EIN
            </label>
            <input
              id="org-tin"
              type="text"
              required
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="org-spec" className="block font-medium text-slate-700 mb-1">
              Specialty Focus
            </label>
            <input
              id="org-spec"
              type="text"
              required
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="org-ret" className="block font-medium text-slate-700 mb-1">
              Record Retention (Days)
            </label>
            <input
              id="org-ret"
              type="number"
              min={365}
              max={3650}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
            />
          </div>
        </div>
        <label className="flex items-start gap-2.5 p-3 rounded border border-slate-200 bg-[#F8FAFC] cursor-pointer">
          <input
            type="checkbox"
            checked={baaAttested}
            onChange={(e) => setBaaAttested(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-slate-700">
            Attest that required Business Associate Agreements (BAAs) are executed with cloud infrastructure, storage, and AI model vendors prior to processing live patient ePHI.
          </span>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 font-semibold text-white bg-[#071D49] hover:bg-[#0D2B66] rounded-md cursor-pointer disabled:opacity-60"
        >
          {saving ? 'Saving...' : isOnboarding ? 'Complete Onboarding' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
};

export const TeamManagementView: React.FC = () => {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('medical_coder');
  const [credentials, setCredentials] = useState('CPC');
  const [tempPw, setTempPw] = useState('');
  const [error, setError] = useState('');

  async function loadTeam() {
    const res = await apiRequest<{ users: Array<Record<string, unknown>> }>('/team');
    setUsers(res.users);
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/team', {
        method: 'POST',
        body: JSON.stringify({
          email,
          full_name: fullName,
          role,
          credentials,
          temporary_password: tempPw,
        }),
      });
      setShowAdd(false);
      setEmail('');
      setFullName('');
      setTempPw('');
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add team member');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">Role-Based Access Control (RBAC) &amp; MFA status across organization staff.</p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Team Member
        </button>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
              <th className="py-2.5 px-4 font-semibold">Name</th>
              <th className="py-2.5 px-4 font-semibold">Email</th>
              <th className="py-2.5 px-4 font-semibold">Role</th>
              <th className="py-2.5 px-4 font-semibold">Credentials</th>
              <th className="py-2.5 px-4 font-semibold">MFA</th>
              <th className="py-2.5 px-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={String(u.id)}>
                <td className="py-3 px-4 font-medium text-[#071D49]">{String(u.full_name)}</td>
                <td className="py-3 px-4 text-slate-700">{String(u.email)}</td>
                <td className="py-3 px-4 font-medium">{String(u.role).replace(/_/g, ' ')}</td>
                <td className="py-3 px-4 font-mono text-slate-600">{String(u.credentials || '—')}</td>
                <td className="py-3 px-4">
                  <span className={u.mfa_enabled === 1 ? 'text-[#16A34A] font-semibold' : 'text-[#D97706]'}>
                    {u.mfa_enabled === 1 ? 'Enrolled' : 'Not Enabled'}
                  </span>
                </td>
                <td className="py-3 px-4 text-[#16A34A]">{u.is_active === 1 ? 'Active' : 'Disabled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAdd} className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-display text-base font-bold text-[#071D49]">Invite Team Member</h3>
            <div>
              <label htmlFor="tm-name" className="block font-medium text-slate-700 mb-1">Full Name</label>
              <input id="tm-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
            </div>
            <div>
              <label htmlFor="tm-email" className="block font-medium text-slate-700 mb-1">Work Email</label>
              <input id="tm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="tm-role" className="block font-medium text-slate-700 mb-1">Role</label>
                <select id="tm-role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-2 py-2 border border-slate-300 rounded-md">
                  <option value="medical_coder">Medical Coder</option>
                  <option value="coding_director">Coding Director</option>
                  <option value="auditor">Auditor</option>
                  <option value="physician">Physician</option>
                  <option value="rcm_analyst">RCM Analyst</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label htmlFor="tm-cred" className="block font-medium text-slate-700 mb-1">Credentials</label>
                <input id="tm-cred" value={credentials} onChange={(e) => setCredentials(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
              </div>
            </div>
            <div>
              <label htmlFor="tm-pw" className="block font-medium text-slate-700 mb-1">Initial Password (10+ chars)</label>
              <input id="tm-pw" type="password" required minLength={10} value={tempPw} onChange={(e) => setTempPw(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-slate-300 rounded-md cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer">Create User</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const AIModelSettingsView: React.FC = () => {
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [editing, setEditing] = useState<AIModelConfig | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');

  async function loadModels() {
    const res = await apiRequest<{ models: AIModelConfig[] }>('/ai-models');
    setModels(res.models);
  }

  useEffect(() => {
    void loadModels();
  }, []);

  async function checkHealth(id: string) {
    setError('');
    setStatusMsg('');
    const res = await apiRequest<{ last_health_status: string; last_health_message: string }>(`/ai-models/${id}/health`, {
      method: 'POST',
    });
    setStatusMsg(`Health check result: ${res.last_health_status} — ${res.last_health_message}`);
    await loadModels();
  }

  async function saveModel(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError('');
    try {
      await apiRequest(`/ai-models/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          model_name: editing.model_name,
          api_url: editing.api_url,
          timeout_ms: editing.timeout_ms,
          max_tokens: editing.max_tokens,
          is_active: editing.is_active === 1,
          approved_for_phi: editing.approved_for_phi === 1,
          baa_status: editing.baa_status,
        }),
      });
      setEditing(null);
      setStatusMsg('AI model configuration saved.');
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update AI model');
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-700">
        <strong>Server-Side Inference Architecture:</strong> Credentials (<code className="font-mono">GEMINI_API_KEY</code>, <code className="font-mono">LINGSANTE_API_KEY</code>, <code className="font-mono">HUGGINGFACE_API_TOKEN</code>) are managed strictly via server environment secrets—never in the browser. Primary medical VLM target: <code className="font-mono">inclusionAI/LingSante-3.1-air-VL</code>.
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}
      {statusMsg && <div className="p-3 rounded bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">{statusMsg}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        {models.map((m) => (
          <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#071D49]" />
                  <h3 className="font-display text-sm font-bold text-[#071D49]">{m.display_name}</h3>
                </div>
                <p className="font-mono text-slate-600 mt-1">{m.model_name}</p>
              </div>
              <span className={`font-semibold ${m.is_active === 1 ? 'text-[#16A34A]' : 'text-slate-500'}`}>
                {m.is_active === 1 ? 'ACTIVE PROVIDER' : 'STANDBY'}
              </span>
            </div>

            <div className="space-y-1 text-slate-600 tabular-nums">
              <p>Endpoint: <span className="font-mono">{m.api_url || 'Not configured'}</span></p>
              <p>
                Timeout: <span className="font-mono">{m.timeout_ms}ms</span> · Max Tokens:{' '}
                <span className="font-mono">{m.max_tokens}</span>
              </p>
              <p>
                PHI Approval: <strong>{m.approved_for_phi === 1 ? 'Approved' : 'Synthetic / Non-PHI Only'}</strong> · BAA:{' '}
                {m.baa_status.replace(/_/g, ' ')}
              </p>
              <p>
                Health:{' '}
                <strong
                  className={
                    m.last_health_status === 'HEALTHY'
                      ? 'text-[#16A34A]'
                      : m.last_health_status === 'UNCONFIGURED'
                        ? 'text-[#D97706]'
                        : 'text-[#DC2626]'
                  }
                >
                  {m.last_health_status}
                </strong>{' '}
                — {m.last_health_message}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(m)}
                className="px-3 py-1.5 font-semibold text-[#071D49] bg-white border border-slate-300 hover:bg-slate-50 rounded cursor-pointer"
              >
                Configure
              </button>
              <button
                type="button"
                onClick={() => void checkHealth(m.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 rounded cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Run Health Check
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={saveModel} className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-display text-base font-bold text-[#071D49]">Configure {editing.display_name}</h3>
            <div>
              <label htmlFor="ai-model-name" className="block font-medium text-slate-700 mb-1">Model Identifier</label>
              <input
                id="ai-model-name"
                required
                value={editing.model_name}
                onChange={(e) => setEditing({ ...editing, model_name: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="ai-url" className="block font-medium text-slate-700 mb-1">Inference API URL (HTTPS)</label>
              <input
                id="ai-url"
                value={editing.api_url}
                onChange={(e) => setEditing({ ...editing, api_url: e.target.value })}
                placeholder="https://inference.your-vpc.org/v1/chat/completions"
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ai-timeout" className="block font-medium text-slate-700 mb-1">Timeout (ms)</label>
                <input
                  id="ai-timeout"
                  type="number"
                  value={editing.timeout_ms}
                  onChange={(e) => setEditing({ ...editing, timeout_ms: Number(e.target.value) })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="ai-tokens" className="block font-medium text-slate-700 mb-1">Max Tokens</label>
                <input
                  id="ai-tokens"
                  type="number"
                  value={editing.max_tokens}
                  onChange={(e) => setEditing({ ...editing, max_tokens: Number(e.target.value) })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.is_active === 1}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })}
              />
              <span>Set as primary active provider for clinical extraction</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.approved_for_phi === 1}
                onChange={(e) => setEditing({ ...editing, approved_for_phi: e.target.checked ? 1 : 0 })}
              />
              <span>Approved for production ePHI (BAA verified)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-slate-300 rounded-md cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer">Save Config</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const IntegrationManagementView: React.FC = () => {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [endpointInputs, setEndpointInputs] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');

  async function loadIntegrations() {
    const res = await apiRequest<{ integrations: IntegrationConfig[] }>('/integrations');
    setIntegrations(res.integrations);
  }

  useEffect(() => {
    void loadIntegrations();
  }, []);

  async function testConnection(id: string) {
    setFeedback('');
    try {
      const res = await apiRequest<{ connection_status: string }>(`/integrations/${id}/test-connection`, {
        method: 'POST',
        body: JSON.stringify({ endpoint_url: endpointInputs[id] ?? '' }),
      });
      setFeedback(`Connectivity check: ${res.connection_status}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Connectivity test failed');
    }
    await loadIntegrations();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-700">
        EHR and Clearinghouse integrations (Epic, Oracle Health/Cerner, Allscripts, athenahealth, Nextech, HL7 FHIR R4, X12 270/271) remain disconnected until endpoint URL, OAuth/mTLS credentials, and live handshake verification succeed.
      </div>

      {feedback && (
        <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">{feedback}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {integrations.map((intg) => (
          <div key={intg.id} className="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#071D49]" />
                <h3 className="font-display text-sm font-bold text-[#071D49]">{intg.vendor_name}</h3>
              </div>
              <span
                className={`font-semibold ${
                  intg.connection_status === 'VERIFIED_CONNECTED'
                    ? 'text-[#16A34A]'
                    : intg.connection_status === 'ERROR'
                      ? 'text-[#DC2626]'
                      : 'text-[#D97706]'
                }`}
              >
                {intg.connection_status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="space-y-1 text-slate-600">
              <p>Type: {intg.integration_type.replace(/_/g, ' ')} · Auth: {intg.auth_method}</p>
              <p>Scopes: <span className="font-mono text-[11px]">{intg.permissions_scope}</span></p>
              {intg.last_error && <p className="text-[#DC2626]">Last Error: {intg.last_error}</p>}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <input
                type="url"
                aria-label={`FHIR or API Endpoint URL for ${intg.vendor_name}`}
                value={endpointInputs[intg.id] ?? intg.endpoint_url}
                onChange={(e) => setEndpointInputs({ ...endpointInputs, [intg.id]: e.target.value })}
                placeholder="https://fhir.healthsystem.org/R4/metadata"
                className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 rounded-md"
              />
              <button
                type="button"
                onClick={() => void testConnection(intg.id)}
                className="px-3 py-1.5 font-semibold text-white bg-[#071D49] hover:bg-[#0D2B66] rounded-md cursor-pointer whitespace-nowrap"
              >
                Verify Connection
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SecurityComplianceView: React.FC = () => {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [mfaHint, setMfaHint] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMsg, setMfaMsg] = useState('');

  async function loadOverview() {
    const res = await apiRequest<Record<string, unknown>>('/security/overview');
    setOverview(res);
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  async function startMfaEnroll() {
    const res = await apiRequest<{ verificationHint: string }>('/auth/mfa/enroll', { method: 'POST' });
    setMfaHint(res.verificationHint);
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiRequest<{ mfa_enabled: number }>('/auth/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ code: mfaCode }),
    });
    if (res.mfa_enabled === 1) {
      setMfaMsg('Multi-factor authentication enabled for your account.');
      setMfaHint('');
      setMfaCode('');
      await loadOverview();
    }
  }

  const controls = (overview?.controls as Record<string, unknown>) || {};

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-2">
        <div className="flex items-center gap-2 text-[#071D49] font-display text-sm font-bold">
          <Lock className="w-4 h-4 text-[#0D9488]" />
          <span>HIPAA-Aligned Technical Safeguards</span>
        </div>
        <p className="text-slate-700 leading-relaxed">{String(controls.complianceNote ?? '')}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">MFA Adoption</p>
          <p className="mt-1 font-display text-xl font-bold text-[#071D49]">
            {String(controls.mfaUsers ?? 0)} / {String(controls.totalUsers ?? 0)} Users
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Prompt Injections Neutralized</p>
          <p className="mt-1 font-display text-xl font-bold text-[#0D9488]">
            {String(controls.injectionFlaggedDocuments ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Immutable Audit Events</p>
          <p className="mt-1 font-display text-xl font-bold text-[#071D49]">
            {String(controls.totalAuditEvents ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Tenant Isolation</p>
          <p className="mt-1 text-xs font-semibold text-[#16A34A] flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            Enforced per Organization
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-3 max-w-lg">
        <h3 className="font-display text-sm font-bold text-[#071D49]">Enroll Account MFA (TOTP)</h3>
        {mfaMsg && <p className="text-[#16A34A] font-semibold">{mfaMsg}</p>}
        {!mfaHint ? (
          <button
            type="button"
            onClick={() => void startMfaEnroll()}
            className="px-3.5 py-2 font-semibold text-white bg-[#071D49] rounded-md cursor-pointer"
          >
            Generate TOTP MFA Secret
          </button>
        ) : (
          <form onSubmit={verifyMfa} className="space-y-3">
            <p className="p-2.5 rounded bg-slate-100 font-mono text-slate-800">{mfaHint}</p>
            <div className="flex gap-2">
              <input
                type="text"
                required
                pattern="\d{6}"
                placeholder="Enter 6-digit code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="px-3 py-2 font-mono border border-slate-300 rounded-md"
              />
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#16A34A] rounded-md cursor-pointer">
                Activate MFA
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void apiRequest<{ logs: AuditLogEntry[] }>(`/audit-logs?q=${encodeURIComponent(query)}`).then((res) =>
      setLogs(res.logs),
    );
  }, [query]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        aria-label="Filter audit logs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter audit trail by action, user email, or details..."
        className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md w-80"
      />
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
              <th className="py-2.5 px-4 font-semibold">Timestamp (UTC)</th>
              <th className="py-2.5 px-4 font-semibold">User</th>
              <th className="py-2.5 px-4 font-semibold">Action</th>
              <th className="py-2.5 px-4 font-semibold">Resource</th>
              <th className="py-2.5 px-4 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                  {l.created_at.slice(0, 19).replace('T', ' ')}
                </td>
                <td className="py-2.5 px-4 text-slate-800">{l.user_email}</td>
                <td className="py-2.5 px-4 font-mono font-semibold text-[#071D49]">{l.action}</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">{l.resource_type}</td>
                <td className="py-2.5 px-4 text-slate-700">{l.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
