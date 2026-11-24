import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Organization, UserProfile } from '../lib/types';

export type AppPageId =
  | 'dashboard'
  | 'onboarding'
  | 'patients'
  | 'records'
  | 'coding-workspace'
  | 'icd10'
  | 'cpt'
  | 'hcpcs'
  | 'modifiers'
  | 'insurance'
  | 'medical-necessity'
  | 'denials'
  | 'audits'
  | 'revenue-integrity'
  | 'claims'
  | 'reports'
  | 'team'
  | 'ai-models'
  | 'integrations'
  | 'security'
  | 'audit-logs'
  | 'settings';

interface NavGroup {
  label: string;
  items: Array<{ id: AppPageId; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Clinical & Coding',
    items: [
      { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
      { id: 'coding-workspace', label: 'AI Coding Workspace', icon: Stethoscope },
      { id: 'records', label: 'Medical Records', icon: FileText },
      { id: 'patients', label: 'Patient Management', icon: Users },
    ],
  },
  {
    label: 'Code & Policy Libraries',
    items: [
      { id: 'icd10', label: 'ICD-10 Explorer', icon: BookOpen },
      { id: 'cpt', label: 'CPT Explorer', icon: FileSpreadsheet },
      { id: 'hcpcs', label: 'HCPCS Explorer', icon: FileCheck2 },
      { id: 'modifiers', label: 'Modifier Library', icon: SlidersHorizontal },
      { id: 'medical-necessity', label: 'Medical Necessity', icon: CheckSquare },
    ],
  },
  {
    label: 'Revenue & Prevention',
    items: [
      { id: 'insurance', label: 'Insurance Verification', icon: ShieldCheck },
      { id: 'denials', label: 'Denial Prevention', icon: AlertTriangle },
      { id: 'revenue-integrity', label: 'Revenue Integrity', icon: TrendingUp },
      { id: 'audits', label: 'Coding Audit Center', icon: Activity },
      { id: 'claims', label: 'Claim Readiness', icon: FileCheck2 },
      { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'onboarding', label: 'Org Onboarding', icon: Building2 },
      { id: 'team', label: 'Team Management', icon: Users },
      { id: 'ai-models', label: 'AI Model Settings', icon: Cpu },
      { id: 'integrations', label: 'Integrations', icon: Link2 },
      { id: 'security', label: 'Security & Compliance', icon: Lock },
      { id: 'audit-logs', label: 'Activity & Audit Logs', icon: History },
      { id: 'settings', label: 'Organization Settings', icon: Settings },
    ],
  },
];

interface AppShellProps {
  activePage: AppPageId;
  onNavigate: (page: AppPageId, encounterId?: string) => void;
  user: UserProfile;
  organization: Organization | null;
  onSignOut: () => void;
  children: React.ReactNode;
}

interface SearchResults {
  patients: Array<{ id: string; mrn: string; name: string; dob: string }>;
  encounters: Array<{ id: string; encounter_number: string; date_of_service: string; chief_complaint: string }>;
  codes: Array<{ code: string; code_system: string; description: string }>;
}

export const AppShell: React.FC<AppShellProps> = ({
  activePage,
  onNavigate,
  user,
  organization,
  onSignOut,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<SearchResults>(`/search?q=${encodeURIComponent(trimmed)}`);
        setSearchResults(res);
      } catch {
        setSearchResults(null);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeTitle =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activePage)?.label ?? 'MEDIIFY';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Collapsible Sidebar */}
      <aside
        className={`${
          mobileOpen ? 'fixed inset-y-0 left-0 flex' : 'hidden lg:flex lg:sticky lg:top-0'
        } z-50 h-screen bg-[#071D49] text-slate-200 flex-col border-r border-slate-800 ${
          collapsed ? 'w-[68px]' : 'w-[260px]'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          {!collapsed && (
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap cursor-pointer"
            >
              MEDIIFY
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:inline-flex p-1.5 rounded hover:bg-white/10 text-slate-300 cursor-pointer"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden p-1.5 rounded hover:bg-white/10 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav aria-label="Primary Workspace Navigation" className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-2.5 mb-1.5 text-[11px] font-semibold text-slate-400 tracking-wide">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileOpen(false);
                        }}
                        title={collapsed ? item.label : undefined}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-[#2563EB] text-white'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 shrink-0">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <img
                src="/src/assets/images/avatar_physician_coder_1795498095848.jpg"
                alt={user.full_name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-md object-cover border border-white/20 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{user.full_name}</p>
                <p className="text-[11px] text-slate-400 truncate">{user.role.replace(/_/g, ' ')}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="w-full flex justify-center p-1.5 rounded hover:bg-white/10 text-slate-300 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-sm sm:text-base font-bold text-[#071D49] truncate">
                {activeTitle}
              </h1>
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <span className="truncate max-w-[260px]">{organization?.name ?? 'Organization Workspace'}</span>
                {organization?.synthetic_mode === 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#D97706] font-medium">Synthetic Evaluation Dataset</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Global search patients, encounters, or medical codes"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search MRN, encounter, ICD-10, CPT..."
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-[#F8FAFC] border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {searchResults && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-50 max-h-80 overflow-y-auto text-xs space-y-3">
                {searchResults.patients.length === 0 &&
                  searchResults.encounters.length === 0 &&
                  searchResults.codes.length === 0 && (
                    <p className="text-slate-500">No matching patients, encounters, or reference codes.</p>
                  )}

                {searchResults.encounters.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-500 mb-1">Encounters</p>
                    {searchResults.encounters.map((enc) => (
                      <button
                        key={enc.id}
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults(null);
                          onNavigate('coding-workspace', enc.id);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-mono font-medium text-[#071D49]">{enc.encounter_number}</span>
                        <span className="text-slate-600 truncate ml-2">{enc.chief_complaint}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.patients.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-500 mb-1">Patients</p>
                    {searchResults.patients.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults(null);
                          onNavigate('patients');
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-medium text-slate-900">{pat.name}</span>
                        <span className="font-mono text-slate-500">{pat.mrn}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.codes.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-500 mb-1">Authoritative Reference Codes</p>
                    {searchResults.codes.map((c) => (
                      <button
                        key={`${c.code_system}-${c.code}`}
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults(null);
                          onNavigate(
                            c.code_system === 'CPT'
                              ? 'cpt'
                              : c.code_system === 'HCPCS'
                                ? 'hcpcs'
                                : c.code_system === 'MODIFIER'
                                  ? 'modifiers'
                                  : 'icd10',
                          );
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                      >
                        <span className="font-mono font-semibold text-[#2563EB] shrink-0">{c.code}</span>
                        <span className="text-slate-500 shrink-0">{c.code_system}</span>
                        <span className="text-slate-700 truncate">{c.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
