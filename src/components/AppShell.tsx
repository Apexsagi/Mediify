import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Command,
  Cpu,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  Link2,
  ListChecks,
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
import type { Organization, UserProfile, UserRole } from '../lib/types';
import { MediifyLogo } from './MediifyLogo';

export type AppPageId =
  | 'dashboard'
  | 'worklist'
  | 'notifications'
  | 'patients'
  | 'records'
  | 'encounters'
  | 'coding-workspace'
  | 'icd10'
  | 'cpt'
  | 'hcpcs'
  | 'modifiers'
  | 'medical-necessity'
  | 'insurance'
  | 'denials'
  | 'revenue-integrity'
  | 'claims'
  | 'audits'
  | 'quality-assurance'
  | 'reports'
  | 'onboarding'
  | 'team'
  | 'ai-models'
  | 'integrations'
  | 'security'
  | 'audit-logs'
  | 'settings';

interface NavItem {
  id: AppPageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
      { id: 'worklist', label: 'My Worklist', icon: ListChecks },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Clinical Operations',
    items: [
      { id: 'patients', label: 'Patient Registry', icon: Users },
      { id: 'records', label: 'Medical Records', icon: FileText },
      { id: 'encounters', label: 'Clinical Encounters', icon: ClipboardList },
    ],
  },
  {
    label: 'Coding Intelligence',
    items: [
      { id: 'coding-workspace', label: 'AI Coding Workspace', icon: Stethoscope },
      { id: 'icd10', label: 'ICD-10 Explorer', icon: BookOpen },
      { id: 'cpt', label: 'CPT Explorer', icon: FileSpreadsheet },
      { id: 'hcpcs', label: 'HCPCS Explorer', icon: FileCheck2 },
      { id: 'modifiers', label: 'Modifier Library', icon: SlidersHorizontal },
      { id: 'medical-necessity', label: 'Medical Necessity', icon: CheckSquare },
    ],
  },
  {
    label: 'Revenue Cycle',
    items: [
      { id: 'insurance', label: 'Insurance Verification', icon: ShieldCheck },
      { id: 'denials', label: 'Denial Prevention', icon: AlertTriangle },
      { id: 'revenue-integrity', label: 'Revenue Integrity', icon: TrendingUp },
      { id: 'claims', label: 'Claim Readiness', icon: FileCheck2 },
    ],
  },
  {
    label: 'Quality Management',
    items: [
      { id: 'audits', label: 'Coding Audits', icon: Activity },
      { id: 'quality-assurance', label: 'Quality Assurance', icon: CheckSquare },
      { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'onboarding', label: 'Org Onboarding', icon: Building2, roles: ['admin', 'coding_director'] },
      { id: 'team', label: 'Team & Roles', icon: Users, roles: ['admin', 'coding_director'] },
      { id: 'ai-models', label: 'AI Model Settings', icon: Cpu, roles: ['admin', 'coding_director'] },
      { id: 'integrations', label: 'Integrations', icon: Link2, roles: ['admin', 'coding_director'] },
      { id: 'security', label: 'Security & MFA', icon: Lock },
      { id: 'audit-logs', label: 'Audit Logs', icon: History, roles: ['admin', 'coding_director', 'auditor'] },
      { id: 'settings', label: 'Org Settings', icon: Settings, roles: ['admin', 'coding_director'] },
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
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandFilter, setCommandFilter] = useState('');

  // Filter navigation items based on user role
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(user.role)),
  })).filter((g) => g.items.length > 0);

  const allVisibleItems = visibleGroups.flatMap((g) =>
    g.items.map((item) => ({ ...item, group: g.label })),
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((open) => !open);
        setCommandFilter('');
      } else if (e.key === 'Escape' && commandOpen) {
        setCommandOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandOpen]);

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

  const activeMeta = allVisibleItems.find((i) => i.id === activePage) ?? {
    label: 'MEDIIFY',
    group: 'Overview',
  };

  const filteredCommands = commandFilter.trim()
    ? allVisibleItems.filter(
        (item) =>
          item.label.toLowerCase().includes(commandFilter.toLowerCase()) ||
          item.group.toLowerCase().includes(commandFilter.toLowerCase()),
      )
    : allVisibleItems;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Collapsible #06152B Midnight Navy Sidebar */}
      <aside
        className={`${
          mobileOpen ? 'fixed inset-y-0 left-0 flex' : 'hidden lg:flex lg:sticky lg:top-0'
        } z-50 h-screen bg-[#06152B] text-slate-200 flex-col border-r border-white/10 ${
          collapsed ? 'w-[68px]' : 'w-[260px]'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          {!collapsed && (
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="cursor-pointer"
            >
              <MediifyLogo variant="light" compact />
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
          {visibleGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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

        {!collapsed && (
          <div className="mx-3 mb-2 p-2.5 rounded-lg bg-[#0B2244] border border-[#22D3EE]/25 text-[11px]">
            <p className="font-display font-bold text-white flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#22D3EE]" />
              <span>MEDIIFY AI</span>
            </p>
            <p className="font-mono text-[10px] text-[#22D3EE] mt-0.5">Analyze · Code · Verify · Prevent</p>
          </div>
        )}

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
                <p className="text-[11px] text-slate-400 truncate capitalize">{user.role.replace(/_/g, ' ')}</p>
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
        <header className="h-16 bg-white border-b border-[#E2E8F0] px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-md border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#64748B]">
                <span className="truncate max-w-[180px]">{organization?.name ?? 'Organization'}</span>
                <span aria-hidden="true">/</span>
                <span>{activeMeta.group}</span>
                <span aria-hidden="true">/</span>
                <span className="font-medium text-[#0B1830]">{activeMeta.label}</span>
              </nav>
              <h1 className="font-display text-sm sm:text-base font-bold text-[#0B1830] truncate">
                {activeMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-1 justify-end max-w-xl">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Global search patients, encounters, or medical codes"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search MRN, encounter, ICD-10, CPT..."
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-[#F1F5F9] border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#2563EB]"
              />

              {searchResults && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#E2E8F0] rounded-lg shadow-lg p-3 z-50 max-h-80 overflow-y-auto text-xs space-y-3">
                  {searchResults.patients.length === 0 &&
                    searchResults.encounters.length === 0 &&
                    searchResults.codes.length === 0 && (
                      <p className="text-[#64748B]">No matching patients, encounters, or reference codes.</p>
                    )}

                  {searchResults.encounters.length > 0 && (
                    <div>
                      <p className="font-semibold text-[#64748B] mb-1">Encounters</p>
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
                          <span className="font-mono font-medium text-[#0B1830]">{enc.encounter_number}</span>
                          <span className="text-[#64748B] truncate ml-2">{enc.chief_complaint}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.patients.length > 0 && (
                    <div>
                      <p className="font-semibold text-[#64748B] mb-1">Patients</p>
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
                          <span className="font-mono text-[#64748B]">{pat.mrn}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.codes.length > 0 && (
                    <div>
                      <p className="font-semibold text-[#64748B] mb-1">Authoritative Reference Codes</p>
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
                          <span className="text-[#64748B] shrink-0">{c.code_system}</span>
                          <span className="text-slate-700 truncate">{c.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Open Command Palette"
              title="Command Palette (Ctrl/Cmd+K)"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#64748B] bg-[#F1F5F9] hover:bg-slate-200 border border-[#E2E8F0] rounded-md cursor-pointer whitespace-nowrap"
            >
              <Command className="w-3.5 h-3.5" />
              <span className="font-mono text-[11px]">Ctrl+K</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              aria-label="Notifications"
              className="p-2 rounded-md border border-[#E2E8F0] text-[#64748B] hover:text-[#0B1830] hover:bg-slate-50 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1680px] w-full mx-auto">{children}</main>
      </div>

      {/* Cmd/Ctrl+K Command Palette */}
      {commandOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center pt-20 p-4"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className="bg-white border border-[#E2E8F0] rounded-lg max-w-lg w-full shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-[#E2E8F0] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#64748B]" />
              <input
                type="text"
                autoFocus
                aria-label="Jump to workspace view"
                value={commandFilter}
                onChange={(e) => setCommandFilter(e.target.value)}
                placeholder="Jump to workspace screen, code explorer, or governance setting..."
                className="flex-1 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setCommandOpen(false)}
                className="text-xs font-mono text-[#64748B] px-1.5 py-0.5 rounded bg-slate-100 cursor-pointer"
              >
                ESC
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {filteredCommands.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => {
                      onNavigate(cmd.id);
                      setCommandOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-[#F1F5F9] flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 font-medium text-[#0B1830]">
                      <Icon className="w-4 h-4 text-[#2563EB]" />
                      {cmd.label}
                    </span>
                    <span className="text-[11px] text-[#64748B]">{cmd.group}</span>
                  </button>
                );
              })}
              {filteredCommands.length === 0 && (
                <p className="text-xs text-[#64748B] p-4 text-center">No matching views.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
