import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AppShell, type AppPageId } from './components/AppShell';
import { AuthPages, type AuthViewMode } from './components/AuthPages';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { MarketingSubPages, type PublicMarketingRoute } from './components/MarketingSubPages';
import { apiRequest, setSessionToken } from './lib/api';
import type { Organization, UserProfile } from './lib/types';

// Route-based lazy loading for bundle efficiency
const DashboardView = lazy(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const MyWorklistView = lazy(() => import('./components/OperationsViews').then((m) => ({ default: m.MyWorklistView })));
const NotificationsView = lazy(() =>
  import('./components/OperationsViews').then((m) => ({ default: m.NotificationsView })),
);
const EncountersView = lazy(() => import('./components/OperationsViews').then((m) => ({ default: m.EncountersView })));
const QualityAssuranceView = lazy(() =>
  import('./components/OperationsViews').then((m) => ({ default: m.QualityAssuranceView })),
);
const PatientManagementView = lazy(() =>
  import('./components/ClinicalDataViews').then((m) => ({ default: m.PatientManagementView })),
);
const MedicalRecordsView = lazy(() =>
  import('./components/ClinicalDataViews').then((m) => ({ default: m.MedicalRecordsView })),
);
const CodingWorkspaceView = lazy(() =>
  import('./components/CodingWorkspaceView').then((m) => ({ default: m.CodingWorkspaceView })),
);
const CodeExplorerView = lazy(() =>
  import('./components/ReferenceLibraryViews').then((m) => ({ default: m.CodeExplorerView })),
);
const MedicalNecessityView = lazy(() =>
  import('./components/ReferenceLibraryViews').then((m) => ({ default: m.MedicalNecessityView })),
);
const InsuranceVerificationView = lazy(() =>
  import('./components/RcmViews').then((m) => ({ default: m.InsuranceVerificationView })),
);
const DenialPreventionView = lazy(() =>
  import('./components/RcmViews').then((m) => ({ default: m.DenialPreventionView })),
);
const RevenueIntegrityView = lazy(() =>
  import('./components/RcmViews').then((m) => ({ default: m.RevenueIntegrityView })),
);
const CodingAuditView = lazy(() => import('./components/RcmViews').then((m) => ({ default: m.CodingAuditView })));
const ClaimReadinessView = lazy(() =>
  import('./components/RcmViews').then((m) => ({ default: m.ClaimReadinessView })),
);
const ReportsAnalyticsView = lazy(() =>
  import('./components/RcmViews').then((m) => ({ default: m.ReportsAnalyticsView })),
);
const OrganizationSettingsView = lazy(() =>
  import('./components/AdminGovernanceViews').then((m) => ({ default: m.OrganizationSettingsView })),
);
const TeamManagementView = lazy(() =>
  import('./components/AdminGovernanceViews').then((m) => ({ default: m.TeamManagementView })),
);
const AIModelSettingsView = lazy(() =>
  import('./components/AdminGovernanceViews').then((m) => ({ default: m.AIModelSettingsView })),
);
const IntegrationManagementView = lazy(() =>
  import('./components/AdminGovernanceViews').then((m) => ({ default: m.IntegrationManagementView })),
);
const SecurityComplianceView = lazy(() =>
  import('./components/AdminGovernanceViews').then((m) => ({ default: m.SecurityComplianceView })),
);
const AuditLogsView = lazy(() =>
  import('./components/AdminGovernanceViews').then((m) => ({ default: m.AuditLogsView })),
);

type RootScreen = 'marketing' | 'auth' | 'workspace';

const VALID_PAGES = new Set<AppPageId>([
  'dashboard',
  'worklist',
  'notifications',
  'patients',
  'records',
  'encounters',
  'coding-workspace',
  'icd10',
  'cpt',
  'hcpcs',
  'modifiers',
  'medical-necessity',
  'insurance',
  'denials',
  'revenue-integrity',
  'claims',
  'audits',
  'quality-assurance',
  'reports',
  'onboarding',
  'team',
  'ai-models',
  'integrations',
  'security',
  'audit-logs',
  'settings',
]);

function parseUrlRoute(): {
  screen: RootScreen;
  marketingRoute: PublicMarketingRoute;
  authMode: AuthViewMode;
  page: AppPageId;
  encounterId: string | null;
} {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) {
    return { screen: 'marketing', marketingRoute: { kind: 'landing' }, authMode: 'login', page: 'dashboard', encounterId: null };
  }
  if (path === 'login') {
    return { screen: 'auth', marketingRoute: { kind: 'landing' }, authMode: 'login', page: 'dashboard', encounterId: null };
  }
  if (path === 'register') {
    return { screen: 'auth', marketingRoute: { kind: 'landing' }, authMode: 'register', page: 'dashboard', encounterId: null };
  }
  if (path === 'forgot-password') {
    return { screen: 'auth', marketingRoute: { kind: 'landing' }, authMode: 'forgot', page: 'dashboard', encounterId: null };
  }
  if (path === 'reset-password') {
    return { screen: 'auth', marketingRoute: { kind: 'landing' }, authMode: 'reset', page: 'dashboard', encounterId: null };
  }
  if (path === 'auth/callback') {
    return { screen: 'auth', marketingRoute: { kind: 'landing' }, authMode: 'callback', page: 'dashboard', encounterId: null };
  }
  if (path === 'integrations-hub') {
    return { screen: 'marketing', marketingRoute: { kind: 'integrations-hub' }, authMode: 'login', page: 'dashboard', encounterId: null };
  }
  if (path === 'security-governance') {
    return { screen: 'marketing', marketingRoute: { kind: 'security-governance' }, authMode: 'login', page: 'dashboard', encounterId: null };
  }
  if (path === 'request-demo') {
    return { screen: 'marketing', marketingRoute: { kind: 'request-demo' }, authMode: 'login', page: 'dashboard', encounterId: null };
  }
  if (path === 'contact') {
    return { screen: 'marketing', marketingRoute: { kind: 'contact' }, authMode: 'login', page: 'dashboard', encounterId: null };
  }

  const [seg1, seg2] = path.split('/');
  if (seg1 === 'products' && seg2) {
    return { screen: 'marketing', marketingRoute: { kind: 'product', slug: seg2 }, authMode: 'login', page: 'dashboard', encounterId: null };
  }
  if (seg1 === 'solutions' && seg2) {
    return { screen: 'marketing', marketingRoute: { kind: 'solution', slug: seg2 }, authMode: 'login', page: 'dashboard', encounterId: null };
  }
  if (VALID_PAGES.has(seg1 as AppPageId)) {
    return {
      screen: 'workspace',
      marketingRoute: { kind: 'landing' },
      authMode: 'login',
      page: seg1 as AppPageId,
      encounterId: seg2 || null,
    };
  }
  return { screen: 'marketing', marketingRoute: { kind: 'landing' }, authMode: 'login', page: 'dashboard', encounterId: null };
}

export default function App() {
  const initial = parseUrlRoute();
  const [screen, setScreen] = useState<RootScreen>(initial.screen === 'workspace' ? 'auth' : initial.screen);
  const [marketingRoute, setMarketingRoute] = useState<PublicMarketingRoute>(initial.marketingRoute);
  const [authMode, setAuthMode] = useState<AuthViewMode>(initial.authMode);
  const [activePage, setActivePage] = useState<AppPageId>(initial.page);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(initial.encounterId);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);

  const syncHistory = useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, []);

  const navigateMarketing = useCallback(
    (nextPath: string) => {
      syncHistory(nextPath);
      const parsed = parseUrlRoute();
      setMarketingRoute(parsed.marketingRoute);
      setScreen('marketing');
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [syncHistory],
  );

  useEffect(() => {
    function onPopState() {
      const parsed = parseUrlRoute();
      if (parsed.screen === 'marketing') {
        setMarketingRoute(parsed.marketingRoute);
        setScreen('marketing');
      } else if (parsed.screen === 'auth' || !user) {
        setAuthMode(parsed.authMode);
        setScreen('auth');
      } else {
        setActivePage(parsed.page);
        if (parsed.encounterId) setSelectedEncounterId(parsed.encounterId);
        setScreen('workspace');
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  async function refreshSessionContext() {
    const me = await apiRequest<{ user: UserProfile; organization: Organization }>('/auth/me');
    setUser(me.user);
    setOrganization(me.organization);
  }

  async function handleAuthenticated(loggedInUser: UserProfile, isNewOrg: boolean) {
    setUser(loggedInUser);
    await refreshSessionContext();
    const targetPage: AppPageId = isNewOrg ? 'onboarding' : activePage || 'dashboard';
    setActivePage(targetPage);
    setScreen('workspace');
    syncHistory(
      targetPage === 'coding-workspace' && selectedEncounterId
        ? `/coding-workspace/${selectedEncounterId}`
        : `/${targetPage}`,
    );
  }

  async function handleSignOut() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors during logout cleanup
    }
    setSessionToken(null);
    setUser(null);
    setOrganization(null);
    setMarketingRoute({ kind: 'landing' });
    setScreen('marketing');
    syncHistory('/');
  }

  function handleNavigate(page: AppPageId, encounterId?: string) {
    if (encounterId) setSelectedEncounterId(encounterId);
    setActivePage(page);
    const enc = encounterId ?? (page === 'coding-workspace' ? selectedEncounterId : null);
    syncHistory(page === 'coding-workspace' && enc ? `/coding-workspace/${enc}` : `/${page}`);
  }

  function handleOpenEncounter(encounterId: string) {
    setSelectedEncounterId(encounterId);
    setActivePage('coding-workspace');
    syncHistory(`/coding-workspace/${encounterId}`);
  }

  function openAuth(mode: 'login' | 'register') {
    setAuthMode(mode);
    setScreen('auth');
    syncHistory(mode === 'register' ? '/register' : '/login');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (screen === 'marketing') {
    if (marketingRoute.kind === 'landing') {
      return (
        <ErrorBoundary>
          <LandingPage onOpenAuth={openAuth} onNavigateMarketing={navigateMarketing} />
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary>
        <MarketingSubPages
          route={marketingRoute}
          onNavigateMarketing={navigateMarketing}
          onOpenAuth={openAuth}
        />
      </ErrorBoundary>
    );
  }

  if (screen === 'auth' || !user) {
    return (
      <ErrorBoundary>
        <AuthPages
          initialMode={authMode}
          onBackToLanding={() => navigateMarketing('/')}
          onRouteChange={syncHistory}
          onAuthenticated={(u, isNew) => void handleAuthenticated(u, isNew)}
        />
      </ErrorBoundary>
    );
  }

  return (
    <AppShell
      activePage={activePage}
      onNavigate={handleNavigate}
      user={user}
      organization={organization}
      onSignOut={() => void handleSignOut()}
    >
      <ErrorBoundary>
        <Suspense fallback={<div className="h-72 bg-white border border-[#E2E8F0] rounded-lg animate-pulse" />}>
          {activePage === 'dashboard' && (
            <DashboardView onOpenEncounter={handleOpenEncounter} onNavigate={handleNavigate} />
          )}
          {activePage === 'worklist' && (
            <MyWorklistView onOpenEncounter={handleOpenEncounter} onNavigate={handleNavigate} />
          )}
          {activePage === 'notifications' && <NotificationsView onOpenEncounter={handleOpenEncounter} />}
          {activePage === 'patients' && <PatientManagementView />}
          {activePage === 'records' && <MedicalRecordsView onOpenEncounter={handleOpenEncounter} />}
          {activePage === 'encounters' && (
            <EncountersView onOpenEncounter={handleOpenEncounter} onNavigate={handleNavigate} />
          )}
          {activePage === 'coding-workspace' && (
            <CodingWorkspaceView
              encounterId={selectedEncounterId}
              onSelectEncounter={(id) => {
                setSelectedEncounterId(id);
                syncHistory(`/coding-workspace/${id}`);
              }}
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
          {activePage === 'claims' && <ClaimReadinessView onOpenEncounter={handleOpenEncounter} />}
          {activePage === 'audits' && <CodingAuditView onOpenEncounter={handleOpenEncounter} />}
          {activePage === 'quality-assurance' && <QualityAssuranceView onOpenEncounter={handleOpenEncounter} />}
          {activePage === 'reports' && <ReportsAnalyticsView />}
          {activePage === 'onboarding' && (
            <OrganizationSettingsView
              organization={organization}
              onUpdated={() => void refreshSessionContext()}
              isOnboarding
            />
          )}
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
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
