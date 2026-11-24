import { useEffect, useState } from 'react';
import { AppShell, type AppPageId } from './components/AppShell';
import { AuthPages } from './components/AuthPages';
import {
  AIModelSettingsView,
  AuditLogsView,
  IntegrationManagementView,
  OrganizationSettingsView,
  SecurityComplianceView,
  TeamManagementView,
} from './components/AdminGovernanceViews';
import { MedicalRecordsView, PatientManagementView } from './components/ClinicalDataViews';
import { CodingWorkspaceView } from './components/CodingWorkspaceView';
import { DashboardView } from './components/DashboardView';
import { LandingPage } from './components/LandingPage';
import {
  ClaimReadinessView,
  CodingAuditView,
  DenialPreventionView,
  InsuranceVerificationView,
  ReportsAnalyticsView,
  RevenueIntegrityView,
} from './components/RcmViews';
import { CodeExplorerView, MedicalNecessityView } from './components/ReferenceLibraryViews';
import { apiRequest, setSessionToken } from './lib/api';
import type { Organization, UserProfile } from './lib/types';

type RootScreen = 'landing' | 'auth' | 'workspace';

export default function App() {
  const [screen, setScreen] = useState<RootScreen>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activePage, setActivePage] = useState<AppPageId>('dashboard');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  async function refreshSessionContext() {
    const me = await apiRequest<{ user: UserProfile; organization: Organization }>('/auth/me');
    setUser(me.user);
    setOrganization(me.organization);
  }

  async function handleLaunchSandbox() {
    setSandboxLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/demo-sandbox', {
        method: 'POST',
      });
      setSessionToken(res.token);
      setUser(res.user);
      await refreshSessionContext();
      setActivePage('dashboard');
      setScreen('workspace');
    } finally {
      setSandboxLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      void handleLaunchSandbox();
    }
  }, []);

  async function handleAuthenticated(loggedInUser: UserProfile, isNewOrg: boolean) {
    setUser(loggedInUser);
    await refreshSessionContext();
    setActivePage(isNewOrg ? 'onboarding' : 'dashboard');
    setScreen('workspace');
  }

  function handleSignOut() {
    setSessionToken(null);
    setUser(null);
    setOrganization(null);
    setScreen('landing');
  }

  function handleNavigate(page: AppPageId, encounterId?: string) {
    if (encounterId) setSelectedEncounterId(encounterId);
    setActivePage(page);
  }

  function handleOpenEncounter(encounterId: string) {
    setSelectedEncounterId(encounterId);
    setActivePage('coding-workspace');
  }

  if (screen === 'landing') {
    return (
      <LandingPage
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setScreen('auth');
        }}
        onLaunchSandbox={() => void handleLaunchSandbox()}
        sandboxLoading={sandboxLoading}
      />
    );
  }

  if (screen === 'auth' || !user) {
    return (
      <AuthPages
        initialMode={authMode}
        onBackToLanding={() => setScreen('landing')}
        onAuthenticated={(u, isNew) => void handleAuthenticated(u, isNew)}
        onLaunchSandbox={() => void handleLaunchSandbox()}
        sandboxLoading={sandboxLoading}
      />
    );
  }

  return (
    <AppShell
      activePage={activePage}
      onNavigate={handleNavigate}
      user={user}
      organization={organization}
      onSignOut={handleSignOut}
    >
      {activePage === 'dashboard' && (
        <DashboardView onOpenEncounter={handleOpenEncounter} onNavigate={handleNavigate} />
      )}
      {activePage === 'onboarding' && (
        <OrganizationSettingsView
          organization={organization}
          onUpdated={() => void refreshSessionContext()}
          isOnboarding
        />
      )}
      {activePage === 'patients' && <PatientManagementView />}
      {activePage === 'records' && <MedicalRecordsView onOpenEncounter={handleOpenEncounter} />}
      {activePage === 'coding-workspace' && (
        <CodingWorkspaceView
          encounterId={selectedEncounterId}
          onSelectEncounter={(id) => setSelectedEncounterId(id)}
        />
      )}
      {activePage === 'icd10' && <CodeExplorerView systemFilter="ICD-10" />}
      {activePage === 'cpt' && <CodeExplorerView systemFilter="CPT" />}
      {activePage === 'hcpcs' && <CodeExplorerView systemFilter="HCPCS" />}
      {activePage === 'modifiers' && <CodeExplorerView systemFilter="MODIFIER" />}
      {activePage === 'medical-necessity' && <MedicalNecessityView />}
      {activePage === 'insurance' && <InsuranceVerificationView />}
      {activePage === 'denials' && <DenialPreventionView onOpenEncounter={handleOpenEncounter} />}
      {activePage === 'revenue-integrity' && <RevenueIntegrityView onOpenEncounter={handleOpenEncounter} />}
      {activePage === 'audits' && <CodingAuditView onOpenEncounter={handleOpenEncounter} />}
      {activePage === 'claims' && <ClaimReadinessView onOpenEncounter={handleOpenEncounter} />}
      {activePage === 'reports' && <ReportsAnalyticsView />}
      {activePage === 'team' && <TeamManagementView />}
      {activePage === 'ai-models' && <AIModelSettingsView />}
      {activePage === 'integrations' && <IntegrationManagementView />}
      {activePage === 'security' && <SecurityComplianceView />}
      {activePage === 'audit-logs' && <AuditLogsView />}
      {activePage === 'settings' && (
        <OrganizationSettingsView
          organization={organization}
          onUpdated={() => void refreshSessionContext()}
        />
      )}
    </AppShell>
  );
}
