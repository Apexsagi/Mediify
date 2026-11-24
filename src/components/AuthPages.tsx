import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, KeyRound, MailCheck, Shield } from 'lucide-react';
import { ApiError, apiRequest, setSessionToken } from '../lib/api';
import type { UserProfile } from '../lib/types';

export type AuthViewMode = 'login' | 'register' | 'forgot' | 'reset' | 'callback';

interface AuthPagesProps {
  initialMode: AuthViewMode;
  onBackToLanding: () => void;
  onAuthenticated: (user: UserProfile, isNewOrg: boolean) => void;
  onRouteChange?: (path: string) => void;
}

interface AuthStatusResponse {
  configured: boolean;
  missingVariables: string[];
  hasUsers: boolean;
  hasOrganizations: boolean;
  googleOAuthEnabled?: boolean;
  emailVerificationRequired?: boolean;
  supabasePublicConfig?: {
    url: string;
    anonKey: string;
  } | null;
}

export const AuthPages: React.FC<AuthPagesProps> = ({
  initialMode,
  onBackToLanding,
  onAuthenticated,
  onRouteChange,
}) => {
  const [mode, setMode] = useState<AuthViewMode>(initialMode);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  // Verification / Recovery states
  const [verificationPendingEmail, setVerificationPendingEmail] = useState('');
  const [oauthAccessToken, setOauthAccessToken] = useState('');
  const [oauthNeedsOnboarding, setOauthNeedsOnboarding] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState('');

  // Registration / OAuth Onboarding fields
  const [orgName, setOrgName] = useState('');
  const [npi, setNpi] = useState('');
  const [taxId, setTaxId] = useState('');
  const [specialty, setSpecialty] = useState('Multi-Specialty Clinic');
  const [fullName, setFullName] = useState('');
  const [credentials, setCredentials] = useState('CPC, CCS');

  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    void apiRequest<AuthStatusResponse>('/auth/status')
      .then((status) => {
        setAuthStatus(status);
        // Handle Supabase OAuth or recovery hash/code parameters
        if (typeof window !== 'undefined') {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const queryParams = new URLSearchParams(window.location.search);
          const hashToken = hashParams.get('access_token');
          const hashType = hashParams.get('type');
          const authCode = queryParams.get('code');

          if (hashType === 'recovery' && hashToken) {
            setRecoveryToken(hashToken);
            setMode('reset');
            window.history.replaceState({}, '', '/reset-password');
            return;
          }

          if ((initialMode === 'callback' || hashToken || authCode) && status.supabasePublicConfig) {
            void resolveSupabaseCallback(status.supabasePublicConfig, hashToken, authCode);
          }
        }
      })
      .catch(() => {
        setAuthStatus({
          configured: false,
          missingVariables: ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
          hasUsers: false,
          hasOrganizations: false,
          googleOAuthEnabled: false,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolveSupabaseCallback(
    pubCfg: { url: string; anonKey: string },
    hashToken: string | null,
    authCode: string | null,
  ) {
    setSubmitting(true);
    setError('');
    try {
      let token = hashToken;
      if (!token && authCode) {
        const sb = createClient(pubCfg.url, pubCfg.anonKey);
        const exchanged = await sb.auth.exchangeCodeForSession(authCode);
        if (exchanged.error) throw new Error(exchanged.error.message);
        token = exchanged.data.session?.access_token ?? null;
      }
      if (!token) {
        setError('Authentication callback did not return a valid Supabase session token.');
        setMode('login');
        return;
      }

      if (initialMode === 'reset') {
        setRecoveryToken(token);
        setMode('reset');
        return;
      }

      const resp = await apiRequest<{
        token?: string;
        user?: UserProfile;
        needsOnboarding?: boolean;
        email?: string;
        fullName?: string;
      }>('/auth/supabase-session', {
        method: 'POST',
        body: JSON.stringify({ accessToken: token }),
      });

      if (resp.needsOnboarding) {
        setOauthAccessToken(token);
        setEmail(resp.email ?? '');
        setFullName(resp.fullName ?? '');
        setOauthNeedsOnboarding(true);
        setMode('callback');
        return;
      }

      if (resp.token && resp.user) {
        setSessionToken(resp.token);
        onAuthenticated(resp.user, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete authentication callback.');
      setMode('login');
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: AuthViewMode) {
    setMode(next);
    setError('');
    setInfoMessage('');
    setMfaRequired(false);
    if (next === 'login') onRouteChange?.('/login');
    if (next === 'register') onRouteChange?.('/register');
    if (next === 'forgot') onRouteChange?.('/forgot-password');
    if (next === 'reset') onRouteChange?.('/reset-password');
  }

  async function handleGoogleSignIn() {
    setError('');
    if (!authStatus?.configured || !authStatus.supabasePublicConfig) {
      setError('Supabase Auth must be configured before initiating Google sign-in.');
      return;
    }
    if (!authStatus.googleOAuthEnabled) {
      setError('Google OAuth provider is not enabled yet. Set GOOGLE_OAUTH_ENABLED=true and enable Google in Supabase Auth.');
      return;
    }
    const sb = createClient(authStatus.supabasePublicConfig.url, authStatus.supabasePublicConfig.anonKey);
    const { error: oauthErr } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMessage('');
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
    setInfoMessage('');
    setSubmitting(true);
    try {
      const resp = await apiRequest<{
        token?: string;
        user?: UserProfile;
        verificationRequired?: boolean;
        email?: string;
        message?: string;
      }>('/auth/register', {
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

      if (resp.verificationRequired) {
        setVerificationPendingEmail(resp.email ?? email);
        setInfoMessage(resp.message ?? 'Check your inbox to verify your work email before signing in.');
        setSubmitting(false);
        return;
      }

      if (resp.token && resp.user) {
        setSessionToken(resp.token);
        onAuthenticated(resp.user, true);
      }
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

  async function handleOAuthOnboard(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const resp = await apiRequest<{ token: string; user: UserProfile }>('/auth/oauth-onboard', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: oauthAccessToken,
          organizationName: orgName,
          npi,
          taxId,
          specialty,
          fullName,
          credentials,
        }),
      });
      setSessionToken(resp.token);
      onAuthenticated(resp.user, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete organization onboarding.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfoMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send password recovery email.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    if (password !== confirmPassword) {
      setError('Passphrase confirmation does not match.');
      return;
    }
    if (!recoveryToken) {
      setError('Missing recovery token. Open the reset link from your email inbox.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: recoveryToken,
          newPassword: password,
        }),
      });
      setInfoMessage(res.message);
      setPassword('');
      setConfirmPassword('');
      setMode('login');
      onRouteChange?.('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (!verificationPendingEmail) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: verificationPendingEmail }),
      });
      setInfoMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setSubmitting(false);
    }
  }

  const dbNotConfigured = authStatus !== null && !authStatus.configured;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-6 px-6">
      <div className="max-w-md w-full mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#071D49] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to MEDIIFY
          </button>
          <span className="font-display text-sm font-bold text-[#071D49] tracking-tight">MEDIIFY</span>
        </div>

        {dbNotConfigured && (
          <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-800">
              <Database className="w-4 h-4 shrink-0" />
              <span>Supabase PostgreSQL Connection Required</span>
            </div>
            <p className="text-amber-900 leading-relaxed">
              MEDIIFY operates strictly on real Supabase PostgreSQL persistence and authentication without
              synthetic fallback data. Configure these server environment variables to enable registration,
              Google sign-in, email verification, and password recovery:
            </p>
            <ul className="font-mono text-[11px] text-amber-950 bg-white/85 border border-amber-200 rounded p-2 space-y-0.5">
              {authStatus.missingVariables.map((v) => (
                <li key={v}>• {v}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="font-display text-xl font-bold text-[#071D49]">
                {oauthNeedsOnboarding
                  ? 'Complete Organization Onboarding'
                  : mode === 'register'
                    ? 'Register Healthcare Organization'
                    : mode === 'forgot'
                      ? 'Recover Account Access'
                      : mode === 'reset'
                        ? 'Set New Passphrase'
                        : 'Sign in to MEDIIFY'}
              </h1>
              <p className="text-xs text-[#64748B] mt-1">
                {oauthNeedsOnboarding
                  ? 'Provision your independent RLS-isolated PostgreSQL workspace'
                  : mode === 'register'
                    ? 'Provision an empty, RLS-isolated organization workspace'
                    : mode === 'forgot'
                      ? 'Send a secure Supabase password recovery link'
                      : mode === 'reset'
                        ? 'Choose a new 12+ character healthcare passphrase'
                        : 'Access your organization coding & RCM workspace'}
              </p>
            </div>
            <Shield className="w-5 h-5 text-[#0D9488] shrink-0" />
          </div>

          {(mode === 'login' || mode === 'register') && !verificationPendingEmail && !oauthNeedsOnboarding && (
            <div className="flex items-center gap-1 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg mb-5">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'login' ? 'bg-white text-[#071D49] shadow-sm' : 'text-[#64748B] hover:text-[#071D49]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'register' ? 'bg-white text-[#071D49] shadow-sm' : 'text-[#64748B] hover:text-[#071D49]'
                }`}
              >
                Create Organization
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 p-3 rounded-md bg-teal-50 border border-teal-200 text-xs text-[#0D9488] flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {verificationPendingEmail ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-[#071D49]">
                  <MailCheck className="w-4 h-4 text-[#0D9488]" />
                  <span>Verify Your Work Email</span>
                </div>
                <p className="text-[#64748B] leading-relaxed">
                  An isolated workspace was provisioned for{' '}
                  <span className="font-mono text-[#071D49]">{verificationPendingEmail}</span>. Confirm your
                  email via the Supabase verification link before signing in.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleResendVerification()}
                  className="flex-1 py-2 text-xs font-semibold text-[#071D49] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md cursor-pointer"
                >
                  Resend Verification Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVerificationPendingEmail('');
                    switchMode('login');
                  }}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-[#071D49] hover:bg-[#0C2B68] rounded-md cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          ) : oauthNeedsOnboarding ? (
            <form onSubmit={handleOAuthOnboard} className="space-y-3.5">
              <div>
                <label htmlFor="oauth-org" className="block text-xs font-medium text-slate-700 mb-1">
                  Organization Legal Name
                </label>
                <input
                  id="oauth-org"
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
                  <label htmlFor="oauth-npi" className="block text-xs font-medium text-slate-700 mb-1">
                    Group NPI (10 digits)
                  </label>
                  <input
                    id="oauth-npi"
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
                  <label htmlFor="oauth-tin" className="block text-xs font-medium text-slate-700 mb-1">
                    Tax ID / EIN
                  </label>
                  <input
                    id="oauth-tin"
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
                  <label htmlFor="oauth-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Admin Full Name
                  </label>
                  <input
                    id="oauth-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label htmlFor="oauth-cred" className="block text-xs font-medium text-slate-700 mb-1">
                    Credentials
                  </label>
                  <input
                    id="oauth-cred"
                    type="text"
                    value={credentials}
                    onChange={(e) => setCredentials(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="oauth-spec" className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Specialty
                </label>
                <input
                  id="oauth-spec"
                  type="text"
                  required
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Provisioning Workspace...' : 'Finish Organization Setup'}
              </button>
            </form>
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Work Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coder@organization.org"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || dbNotConfigured}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#071D49] hover:bg-[#0C2B68] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Sending Recovery Link...' : 'Send Recovery Link'}
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-xs font-medium text-[#64748B] hover:text-[#071D49] cursor-pointer"
              >
                Back to Sign In
              </button>
            </form>
          ) : mode === 'reset' ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="reset-pw" className="block text-xs font-medium text-slate-700 mb-1">
                  New Passphrase (12+ characters)
                </label>
                <input
                  id="reset-pw"
                  type="password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 12 character passphrase"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <div>
                <label htmlFor="reset-pw2" className="block text-xs font-medium text-slate-700 mb-1">
                  Confirm New Passphrase
                </label>
                <input
                  id="reset-pw2"
                  type="password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat passphrase"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || dbNotConfigured}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Updating Passphrase...' : 'Update Passphrase'}
              </button>
            </form>
          ) : mode === 'login' ? (
            <div className="space-y-4">
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
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="login-password" className="block text-xs font-medium text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
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
                      placeholder="000000 or XXXXX-XXXXX"
                      className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || dbNotConfigured}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-[#071D49] hover:bg-[#0C2B68] rounded-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Authenticating...' : mfaRequired ? 'Verify MFA & Sign In' : 'Sign In'}
                </button>
              </form>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-[#E2E8F0]" />
                <span className="shrink mx-3 text-[11px] text-[#64748B]">or</span>
                <div className="flex-grow border-t border-[#E2E8F0]" />
              </div>

              <button
                type="button"
                disabled={submitting || dbNotConfigured}
                onClick={() => void handleGoogleSignIn()}
                className="w-full py-2.5 px-4 text-xs font-semibold text-[#071D49] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>
                  {authStatus?.googleOAuthEnabled
                    ? 'Continue with Google Workspace SSO'
                    : 'Continue with Google (Configure Supabase OAuth)'}
                </span>
              </button>
            </div>
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
