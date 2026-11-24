import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Link2, Lock, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
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
  const [baaAttested, setBaaAttested] = useState(Boolean(organization?.baa_attested));
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
      setBaaAttested(Boolean(organization.baa_attested));
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
    <div className="max-w-2xl bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-5">
      <div>
        <h2 className="font-display text-base font-bold text-[#0B1830]">
          {isOnboarding ? 'Organization Onboarding & Governance Setup' : 'Organization Settings & Retention Policy'}
        </h2>
        <p className="text-xs text-[#64748B] mt-1">
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
            className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
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
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
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
              className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
            />
          </div>
        </div>
        <label className="flex items-start gap-2.5 p-3 rounded border border-[#E2E8F0] bg-[#F1F5F9] cursor-pointer">
          <input
            type="checkbox"
            checked={baaAttested}
            onChange={(e) => setBaaAttested(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-slate-700">
            Attest that required Business Associate Agreements (BAAs) are executed with cloud infrastructure, database, and AI model vendors prior to processing live patient ePHI.
          </span>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md cursor-pointer disabled:opacity-60"
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
        <p className="text-xs text-[#64748B]">Role-Based Access Control (RBAC) &amp; MFA status across organization staff.</p>
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

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
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
                <td className="py-3 px-4 font-medium text-[#0B1830]">{String(u.full_name)}</td>
                <td className="py-3 px-4 text-slate-700">{String(u.email)}</td>
                <td className="py-3 px-4 font-medium capitalize">{String(u.role).replace(/_/g, ' ')}</td>
                <td className="py-3 px-4 font-mono text-[#64748B]">{String(u.credentials || '—')}</td>
                <td className="py-3 px-4">
                  <span className={Boolean(u.mfa_enabled) ? 'text-[#16A34A] font-semibold' : 'text-[#D97706]'}>
                    {Boolean(u.mfa_enabled) ? 'Enrolled' : 'Not Enabled'}
                  </span>
                </td>
                <td className="py-3 px-4 text-[#16A34A]">{Boolean(u.is_active) ? 'Active' : 'Disabled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAdd} className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-display text-base font-bold text-[#0B1830]">Invite Team Member</h3>
            <div>
              <label htmlFor="tm-name" className="block font-medium text-slate-700 mb-1">Full Name</label>
              <input id="tm-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
            </div>
            <div>
              <label htmlFor="tm-email" className="block font-medium text-slate-700 mb-1">Work Email</label>
              <input id="tm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="tm-role" className="block font-medium text-slate-700 mb-1">Role</label>
                <select id="tm-role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md">
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
                <input id="tm-cred" value={credentials} onChange={(e) => setCredentials(e.target.value)} className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div>
              <label htmlFor="tm-pw" className="block font-medium text-slate-700 mb-1">Initial Password (12+ chars)</label>
              <input id="tm-pw" type="password" required minLength={12} value={tempPw} onChange={(e) => setTempPw(e.target.value)} className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-[#E2E8F0] rounded-md cursor-pointer">Cancel</button>
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
    const res = await apiRequest<{ last_health_status: string; last_health_message: string; latency_ms?: number }>(
      `/ai-models/${id}/health`,
      { method: 'POST' },
    );
    setStatusMsg(
      `Health check result: ${res.last_health_status}${res.latency_ms ? ` (${res.latency_ms}ms)` : ''} — ${res.last_health_message}`,
    );
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
          is_active: Boolean(editing.is_active),
          approved_for_phi: Boolean(editing.approved_for_phi),
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
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 text-xs text-slate-700">
        <strong>Server-Side Inference Architecture:</strong> Credentials (<code className="font-mono">GEMINI_API_KEY</code>, <code className="font-mono">LINGSANTE_API_KEY</code>, <code className="font-mono">HUGGINGFACE_API_TOKEN</code>, <code className="font-mono">OPENAI_COMPATIBLE_API_KEY</code>) are managed strictly via server environment secrets—never in the browser. Zero silent provider fallback is permitted. Primary medical VLM: <code className="font-mono">inclusionAI/LingSante-3.1-air-VL</code>.
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}
      {statusMsg && <div className="p-3 rounded bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">{statusMsg}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        {models.map((m) => (
          <div key={m.id} className="bg-white border border-[#E2E8F0] rounded-lg p-5 text-xs space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#0B1830]" />
                  <h3 className="font-display text-sm font-bold text-[#0B1830]">{m.display_name}</h3>
                </div>
                <p className="font-mono text-[#64748B] mt-1">{m.model_name}</p>
              </div>
              <span className={`font-semibold ${Boolean(m.is_active) ? 'text-[#16A34A]' : 'text-[#64748B]'}`}>
                {Boolean(m.is_active) ? 'ACTIVE PROVIDER' : 'STANDBY'}
              </span>
            </div>

            <div className="space-y-1 text-[#64748B] tabular-nums">
              <p>Endpoint: <span className="font-mono text-slate-800">{m.api_url || 'Not configured'}</span></p>
              <p>
                Credentials: <strong>{Boolean(m.has_credentials) ? 'Present in Server Env' : 'Not configured'}</strong> · Latency:{' '}
                <span className="font-mono">{m.latency_ms ? `${m.latency_ms}ms` : 'N/A'}</span> · Errors: {m.error_count ?? 0}
              </p>
              <p>
                Timeout: <span className="font-mono">{m.timeout_ms}ms</span> · Max Tokens:{' '}
                <span className="font-mono">{m.max_tokens}</span>
              </p>
              <p>
                PHI Approval: <strong>{Boolean(m.approved_for_phi) ? 'Approved' : 'Non-PHI / De-Identified Only'}</strong> · BAA:{' '}
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
              {m.last_error && <p className="text-[#DC2626]">Last Error: {m.last_error}</p>}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(m)}
                className="px-3 py-1.5 font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded cursor-pointer"
              >
                Configure
              </button>
              <button
                type="button"
                onClick={() => void checkHealth(m.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 rounded cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Run Live Health Check
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={saveModel} className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-display text-base font-bold text-[#0B1830]">Configure {editing.display_name}</h3>
            <div>
              <label htmlFor="ai-model-name" className="block font-medium text-slate-700 mb-1">Model Identifier</label>
              <input
                id="ai-model-name"
                required
                value={editing.model_name}
                onChange={(e) => setEditing({ ...editing, model_name: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
              />
            </div>
            <div>
              <label htmlFor="ai-url" className="block font-medium text-slate-700 mb-1">Inference API URL (HTTPS)</label>
              <input
                id="ai-url"
                value={editing.api_url}
                onChange={(e) => setEditing({ ...editing, api_url: e.target.value })}
                placeholder="https://inference.your-vpc.org/v1/chat/completions"
                className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
                />
              </div>
              <div>
                <label htmlFor="ai-tokens" className="block font-medium text-slate-700 mb-1">Max Tokens</label>
                <input
                  id="ai-tokens"
                  type="number"
                  value={editing.max_tokens}
                  onChange={(e) => setEditing({ ...editing, max_tokens: Number(e.target.value) })}
                  className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
                />
              </div>
            </div>
            <div>
              <label htmlFor="ai-baa" className="block font-medium text-slate-700 mb-1">BAA Status</label>
              <select
                id="ai-baa"
                value={editing.baa_status}
                onChange={(e) => setEditing({ ...editing, baa_status: e.target.value as AIModelConfig['baa_status'] })}
                className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md bg-white"
              >
                <option value="REQUIRES_BAA">REQUIRES BAA</option>
                <option value="BAA_EXECUTED">BAA EXECUTED</option>
                <option value="NOT_APPLICABLE_SYNTHETIC">NOT APPLICABLE (DE-IDENTIFIED ONLY)</option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(editing.is_active)}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              <span>Set as primary active provider for clinical extraction</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(editing.approved_for_phi)}
                onChange={(e) => setEditing({ ...editing, approved_for_phi: e.target.checked })}
              />
              <span>Approved for production ePHI (BAA verified)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-[#E2E8F0] rounded-md cursor-pointer">Cancel</button>
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
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 text-xs text-slate-700">
        EHR and Clearinghouse connectors remain in <strong>Not configured / Connection required</strong> state until an authorized HTTPS endpoint URL, OAuth/mTLS credentials, and live handshake verification succeed.
      </div>

      {feedback && (
        <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">{feedback}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {integrations.map((intg) => (
          <div key={intg.id} className="bg-white border border-[#E2E8F0] rounded-lg p-5 text-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#0B1830]" />
                <h3 className="font-display text-sm font-bold text-[#0B1830]">{intg.vendor_name}</h3>
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
                {intg.connection_status === 'CONFIGURATION_REQUIRED'
                  ? 'Not configured'
                  : intg.connection_status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="space-y-1 text-[#64748B]">
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
                className="flex-1 px-2.5 py-1.5 font-mono border border-[#E2E8F0] rounded-md"
              />
              <button
                type="button"
                onClick={() => void testConnection(intg.id)}
                className="px-3 py-1.5 font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md cursor-pointer whitespace-nowrap"
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
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [mfaEnrollment, setMfaEnrollment] = useState<{ secretBase32: string; otpauthUri: string; instructions: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaCode, setMfaCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [mfaMsg, setMfaMsg] = useState('');
  const [mfaErr, setMfaErr] = useState('');

  async function loadSecurity() {
    const [ov, sess] = await Promise.all([
      apiRequest<Record<string, unknown>>('/security/overview'),
      apiRequest<{ sessions: Array<Record<string, unknown>> }>('/auth/sessions'),
    ]);
    setOverview(ov);
    setSessions(sess.sessions);
  }

  useEffect(() => {
    void loadSecurity();
  }, []);

  async function startMfaEnroll() {
    setMfaErr('');
    setMfaMsg('');
    setRecoveryCodes([]);
    const res = await apiRequest<{ secretBase32: string; otpauthUri: string; instructions: string }>('/auth/mfa/enroll', {
      method: 'POST',
    });
    setMfaEnrollment(res);
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaErr('');
    try {
      const res = await apiRequest<{ mfa_enabled: boolean; recoveryCodes: string[] }>('/auth/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode }),
      });
      if (res.mfa_enabled) {
        setMfaMsg('Multi-factor authentication enabled. Save your single-use recovery codes below.');
        setRecoveryCodes(res.recoveryCodes);
        setMfaEnrollment(null);
        setMfaCode('');
        await loadSecurity();
      }
    } catch (err) {
      setMfaErr(err instanceof Error ? err.message : 'MFA verification failed');
    }
  }

  async function disableMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaErr('');
    try {
      await apiRequest('/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disablePw }),
      });
      setDisablePw('');
      setMfaMsg('MFA disabled on your account.');
      await loadSecurity();
    } catch (err) {
      setMfaErr(err instanceof Error ? err.message : 'Failed to disable MFA');
    }
  }

  async function revokeSession(id: string) {
    await apiRequest(`/auth/sessions/${id}/revoke`, { method: 'POST' });
    await loadSecurity();
  }

  const controls = (overview?.controls as Record<string, unknown>) || {};

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 text-xs space-y-2">
        <div className="flex items-center gap-2 text-[#0B1830] font-display text-sm font-bold">
          <Lock className="w-4 h-4 text-[#0D9488]" />
          <span>HIPAA-Aligned Technical Safeguards</span>
        </div>
        <p className="text-slate-700 leading-relaxed">{String(controls.complianceNote ?? '')}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">MFA Adoption</p>
          <p className="mt-1 font-display text-xl font-bold text-[#0B1830]">
            {String(controls.mfaUsers ?? 0)} / {String(controls.totalUsers ?? 0)} Users
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Active Tracked Sessions</p>
          <p className="mt-1 font-display text-xl font-bold text-[#0D9488]">
            {String(controls.activeSessions ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Immutable Audit Events</p>
          <p className="mt-1 font-display text-xl font-bold text-[#0B1830]">
            {String(controls.totalAuditEvents ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-[#64748B]">Tenant Isolation</p>
          <p className="mt-1 text-xs font-semibold text-[#16A34A] flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            PostgreSQL RLS Enforced
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 text-xs space-y-3">
          <h3 className="font-display text-sm font-bold text-[#0B1830]">TOTP Multi-Factor Authentication</h3>
          {mfaErr && <p className="text-[#DC2626] flex items-center gap-1"><ShieldAlert className="w-4 h-4" />{mfaErr}</p>}
          {mfaMsg && <p className="text-[#16A34A] font-semibold">{mfaMsg}</p>}

          {recoveryCodes.length > 0 && (
            <div className="p-3 rounded bg-amber-50 border border-amber-200 space-y-2">
              <p className="font-semibold text-amber-950">Single-Use Recovery Codes (Store Securely Now):</p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                {recoveryCodes.map((rc) => (
                  <span key={rc} className="bg-white px-2 py-1 rounded border border-amber-200">{rc}</span>
                ))}
              </div>
            </div>
          )}

          {!mfaEnrollment ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startMfaEnroll()}
                className="px-3.5 py-2 font-semibold text-white bg-[#0B1830] rounded-md cursor-pointer"
              >
                Enroll / Rotate TOTP Secret
              </button>
            </div>
          ) : (
            <form onSubmit={verifyMfa} className="space-y-3">
              <p className="text-[#64748B]">{mfaEnrollment.instructions}</p>
              <div className="p-3 rounded bg-[#F1F5F9] border border-[#E2E8F0] space-y-1.5 font-mono text-[11px] break-all">
                <p><strong>Base32 Secret:</strong> {mfaEnrollment.secretBase32}</p>
                <p><strong>Authenticator URI:</strong> {mfaEnrollment.otpauthUri}</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  pattern="\d{6}"
                  placeholder="Enter 6-digit code from app"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
                />
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#16A34A] rounded-md cursor-pointer">
                  Verify &amp; Activate
                </button>
              </div>
            </form>
          )}

          <form onSubmit={disableMfa} className="pt-3 border-t border-[#E2E8F0] flex items-center gap-2">
            <input
              type="password"
              required
              value={disablePw}
              onChange={(e) => setDisablePw(e.target.value)}
              placeholder="Confirm password to disable MFA"
              className="flex-1 px-2.5 py-1.5 border border-[#E2E8F0] rounded-md"
            />
            <button type="submit" className="px-3 py-1.5 font-medium text-[#DC2626] border border-red-200 rounded-md cursor-pointer">
              Disable MFA
            </button>
          </form>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 text-xs space-y-3">
          <h3 className="font-display text-sm font-bold text-[#0B1830]">Active &amp; Recent Sessions</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {sessions.map((s) => (
              <div key={String(s.id)} className="p-2.5 rounded border border-[#E2E8F0] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[#0B1830] truncate">
                    {Boolean(s.is_current) ? 'Current Session' : 'Session'} · {String(s.ip_address || 'Unknown IP')}
                  </p>
                  <p className="text-[11px] text-[#64748B] truncate">
                    Expires: {String(s.expires_at).slice(0, 19).replace('T', ' ')}
                    {s.revoked_at ? ' · REVOKED' : ''}
                  </p>
                </div>
                {!s.revoked_at && (
                  <button
                    type="button"
                    onClick={() => void revokeSession(String(s.id))}
                    className="px-2.5 py-1 text-[11px] font-semibold text-[#DC2626] border border-red-200 rounded cursor-pointer shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void apiRequest<{ logs: AuditLogEntry[]; total: number }>(
      `/audit-logs?q=${encodeURIComponent(query)}&page=${page}&pageSize=50`,
    ).then((res) => {
      setLogs(res.logs);
      setTotal(res.total);
    });
  }, [query, page]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        aria-label="Filter audit logs"
        value={query}
        onChange={(e) => {
          setPage(1);
          setQuery(e.target.value);
        }}
        placeholder="Filter audit trail by action, user email, or details..."
        className="px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-md w-80"
      />
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
              <th className="py-2.5 px-4 font-semibold">Timestamp (UTC)</th>
              <th className="py-2.5 px-4 font-semibold">User</th>
              <th className="py-2.5 px-4 font-semibold">Action</th>
              <th className="py-2.5 px-4 font-semibold">Resource</th>
              <th className="py-2.5 px-4 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#64748B]">No audit entries match your filter.</td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 px-4 font-mono text-[#64748B] whitespace-nowrap">
                    {l.created_at.slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="py-2.5 px-4 text-slate-800">{l.user_email}</td>
                  <td className="py-2.5 px-4 font-mono font-semibold text-[#0B1830]">{l.action}</td>
                  <td className="py-2.5 px-4 font-mono text-[#64748B]">{l.resource_type}</td>
                  <td className="py-2.5 px-4 text-slate-700">{l.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Page {page} of {Math.ceil(total / 50)} ({total} audit events)
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
    </div>
  );
};
