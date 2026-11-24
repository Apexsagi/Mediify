import React, { useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { apiRequest, setSessionToken } from '../lib/api';
import type { UserProfile } from '../lib/types';

interface AuthPagesProps {
  initialMode: 'login' | 'register';
  onBackToLanding: () => void;
  onAuthenticated: (user: UserProfile, isNewOrg: boolean) => void;
  onLaunchSandbox: () => void;
  sandboxLoading: boolean;
}

export const AuthPages: React.FC<AuthPagesProps> = ({
  initialMode,
  onBackToLanding,
  onAuthenticated,
  onLaunchSandbox,
  sandboxLoading,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
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
      setError(err instanceof Error ? err.message : 'Sign-in failed');
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
          syntheticMode: true,
        }),
      });
      setSessionToken(resp.token);
      onAuthenticated(resp.user, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-6">
      <div className="max-w-md w-full mx-auto">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#071D49] mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to MEDIIFY overview
        </button>

        <div className="bg-white border border-slate-200 rounded-lg p-7">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-xl font-bold text-[#071D49]">
                {mode === 'login' ? 'Sign in to MEDIIFY' : 'Register Healthcare Organization'}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Access your organization coding & RCM workspace'
                  : 'Create an isolated tenant with organization-level access control'}
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
                mode === 'login' ? 'bg-white text-[#071D49] shadow-sm' : 'text-slate-600 hover:text-[#071D49]'
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
                mode === 'register' ? 'bg-white text-[#071D49] shadow-sm' : 'text-slate-600 hover:text-[#071D49]'
              }`}
            >
              Create Organization
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-[#DC2626]">
              {error}
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {mfaRequired && (
                <div>
                  <label htmlFor="login-mfa" className="block text-xs font-medium text-slate-700 mb-1">
                    6-Digit MFA Verification Code
                  </label>
                  <input
                    id="login-mfa"
                    type="text"
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#071D49] hover:bg-[#0D2B66] rounded-md transition-colors cursor-pointer disabled:opacity-60"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="reg-pw" className="block text-xs font-medium text-slate-700 mb-1">
                  Password (10+ characters)
                </label>
                <input
                  id="reg-pw"
                  type="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Strong passphrase"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Creating Organization...' : 'Create Organization & Continue'}
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2.5">
              Evaluating MEDIIFY? Enter the isolated synthetic sandbox with pre-loaded test encounters (no real PHI).
            </p>
            <button
              type="button"
              onClick={onLaunchSandbox}
              disabled={sandboxLoading}
              className="w-full py-2 text-xs font-semibold text-[#0D9488] bg-teal-50/70 border border-teal-200 hover:bg-teal-50 rounded-md transition-colors cursor-pointer disabled:opacity-60"
            >
              {sandboxLoading ? 'Opening Synthetic Sandbox...' : 'Enter Synthetic Sandbox Workspace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
