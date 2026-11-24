import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Database, Shield } from 'lucide-react';
import { ApiError, apiRequest, setSessionToken } from '../lib/api';
import type { UserProfile } from '../lib/types';

interface AuthPagesProps {
  initialMode: 'login' | 'register';
  onBackToLanding: () => void;
  onAuthenticated: (user: UserProfile, isNewOrg: boolean) => void;
}

interface AuthStatusResponse {
  configured: boolean;
  missingVariables: string[];
  hasUsers: boolean;
  hasOrganizations: boolean;
}

export const AuthPages: React.FC<AuthPagesProps> = ({
  initialMode,
  onBackToLanding,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  // Registration fields
  const [orgName, setOrgName] = useState('');
  const [npi, setNpi] = useState('');
  const [taxId, setTaxId] = useState('');
  const [specialty, setSpecialty] = useState('Multi-Specialty Clinic');
  const [fullName, setFullName] = useState('');
  const [credentials, setCredentials] = useState('CPC, CCS');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void apiRequest<AuthStatusResponse>('/auth/status')
      .then(setAuthStatus)
      .catch(() => {
        setAuthStatus({
          configured: false,
          missingVariables: ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
          hasUsers: false,
          hasOrganizations: false,
        });
      });
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const resp = await apiRequest<{
        token?: string;
        user?: UserProfile;
        mfaRequired?: boolean;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(mfaRequired ? { mfaCode } : {}),
        }),
      });

      if (resp.mfaRequired) {
        setMfaRequired(true);
        setSubmitting(false);
        return;
      }

      if (resp.token && resp.user) {
        setSessionToken(resp.token);
        onAuthenticated(resp.user, false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.missingVariables?.length) {
        setError(`${err.message} Missing: ${err.missingVariables.join(', ')}`);
      } else {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const resp = await apiRequest<{ token: string; user: UserProfile }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          organizationName: orgName,
          npi,
          taxId,
          specialty,
          fullName,
          email,
          password,
          credentials,
          syntheticMode: false,
        }),
      });
      setSessionToken(resp.token);
      onAuthenticated(resp.user, true);
    } catch (err) {
      if (err instanceof ApiError && err.missingVariables?.length) {
        setError(`${err.message} Missing: ${err.missingVariables.join(', ')}`);
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const dbNotConfigured = authStatus !== null && !authStatus.configured;

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col justify-center py-6 px-6">
      <div className="max-w-md w-full mx-auto">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#0B1830] mb-4 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to MEDIIFY overview
        </button>

        {dbNotConfigured && (
          <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-[#D97706]">
              <Database className="w-4 h-4 shrink-0" />
              <span>Supabase PostgreSQL Connection Required</span>
            </div>
            <p className="text-amber-900 leading-relaxed">
              MEDIIFY V2 operates strictly on real PostgreSQL persistence and Supabase Auth without synthetic fallback data. Configure the following server environment variables to enable registration and sign-in:
            </p>
            <ul className="font-mono text-[11px] text-amber-950 bg-white/80 border border-amber-200 rounded p-2 space-y-0.5">
              {authStatus.missingVariables.map((v) => (
                <li key={v}>• {v}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-7">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-xl font-bold text-[#0B1830]">
                {mode === 'login' ? 'Sign in to MEDIIFY' : 'Register Healthcare Organization'}
              </h1>
              <p className="text-xs text-[#64748B] mt-1">
                {mode === 'login'
                  ? 'Access your organization coding & RCM workspace'
                  : 'Provision an empty, RLS-isolated organization workspace'}
              </p>
            </div>
            <Shield className="w-5 h-5 text-[#0D9488]" />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-white text-[#0B1830] shadow-sm' : 'text-[#64748B] hover:text-[#0B1830]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
                setMfaRequired(false);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-white text-[#0B1830] shadow-sm' : 'text-[#64748B] hover:text-[#0B1830]'
              }`}
            >
              Create Organization
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Work Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coder@organization.org"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {mfaRequired && (
                <div>
                  <label htmlFor="login-mfa" className="block text-xs font-medium text-slate-700 mb-1">
                    6-Digit Authenticator Code or Recovery Code
                  </label>
                  <input
                    id="login-mfa"
                    type="text"
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000 or XXXX-XXXX"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || dbNotConfigured}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Authenticating...' : mfaRequired ? 'Verify MFA & Sign In' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label htmlFor="reg-org" className="block text-xs font-medium text-slate-700 mb-1">
                  Organization Legal Name
                </label>
                <input
                  id="reg-org"
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Regional Medical Partners"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-npi" className="block text-xs font-medium text-slate-700 mb-1">
                    Group NPI (10 digits)
                  </label>
                  <input
                    id="reg-npi"
                    type="text"
                    required
                    pattern="\d{10}"
                    value={npi}
                    onChange={(e) => setNpi(e.target.value)}
                    placeholder="1234567890"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label htmlFor="reg-tin" className="block text-xs font-medium text-slate-700 mb-1">
                    Tax ID / EIN
                  </label>
                  <input
                    id="reg-tin"
                    type="text"
                    required
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="00-0000000"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Admin Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Jordan Patel"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label htmlFor="reg-cred" className="block text-xs font-medium text-slate-700 mb-1">
                    Credentials
                  </label>
                  <input
                    id="reg-cred"
                    type="text"
                    value={credentials}
                    onChange={(e) => setCredentials(e.target.value)}
                    placeholder="CPC, CCS"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-spec" className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Specialty
                </label>
                <input
                  id="reg-spec"
                  type="text"
                  required
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Admin Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@organization.org"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="reg-pw" className="block text-xs font-medium text-slate-700 mb-1">
                  Password (12+ characters)
                </label>
                <input
                  id="reg-pw"
                  type="password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 12 character passphrase"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || dbNotConfigured}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Creating Organization...' : 'Create Organization & Continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
