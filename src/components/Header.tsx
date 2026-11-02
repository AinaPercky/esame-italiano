import React, { useState } from 'react';
import { 
  Mic, 
  FileSpreadsheet, 
  Menu, 
  X, 
  LayoutDashboard, 
  School, 
  Users, 
  BookOpen, 
  Shuffle, 
  Award, 
  Settings,
  LogOut,
  UserCheck,
  Sparkles,
  GraduationCap,
  QrCode
} from 'lucide-react';
import { AuthUser } from '../services/authService';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onQuickEvaluate: () => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  pendingStudentsCount?: number;
}

interface HeaderNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  group: string;
  badge?: string;
}

export const Header: React.FC<HeaderProps> = ({ 
  currentTab, 
  onSelectTab, 
  onQuickEvaluate,
  currentUser,
  onLogout,
  pendingStudentsCount = 0
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: HeaderNavItem[] = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, group: 'Vue d\'ensemble' },
    { id: 'lessons', label: 'Leçons de cours', icon: BookOpen, group: 'Quiz & Cours', badge: 'Cours' },
    { id: 'quizzes', label: 'Quiz en Direct & Notes', icon: Sparkles, highlight: true, group: 'Quiz & Cours' },
    { id: 'classes', label: 'Gestion des Classes', icon: School, group: 'Classes & Étudiants' },
    { id: 'students', label: 'Gestion des Élèves', icon: Users, group: 'Classes & Étudiants' },
    { id: 'exams', label: 'Examens & Rubriques', icon: GraduationCap, group: 'Examens Oraux' },
    { id: 'pass-order', label: 'Ordre de passage', icon: Shuffle, group: 'Examens Oraux' },
    { id: 'evaluation', label: 'Évaluation orale', icon: Mic, group: 'Examens Oraux' },
    { id: 'results', label: 'Résultats & Fiches', icon: Award, group: 'Examens Oraux' },
    { id: 'qrcode', label: 'Codes QR Élèves', icon: QrCode, group: 'Examens Oraux' },
    { id: 'settings', label: 'Paramètres & Sécurité', icon: Settings, group: 'Configuration' }
  ];

  const handleMobileNav = (tabId: string) => {
    onSelectTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="teacher-topbar sticky top-0 z-30 border-b border-[#d8e6ee] bg-white/95 backdrop-blur-xl no-print">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3">
          {/* Zone 1: Brand Wordmark & Mobile Menu Trigger */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="-ml-1 flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[#315267] transition-colors hover:bg-[#e6f0f7] hover:text-[#072a3f] sm:min-h-11 sm:min-w-11 lg:hidden"
              aria-label={mobileMenuOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation'}
              aria-expanded={mobileMenuOpen}
              aria-controls={mobileMenuOpen ? 'teacher-mobile-drawer' : undefined}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <button 
              onClick={() => onSelectTab('dashboard')} 
              type="button"
              className="flex min-w-0 items-center gap-1.5 text-left font-display text-sm font-bold tracking-tight text-[#072a3f] transition-colors hover:text-[#0b3c5d] xs:text-base sm:gap-2 sm:text-2xl"
            >
              <img
                src="/percky-lingua-logo.webp"
                alt=""
                className="h-8 w-8 shrink-0 rounded-xl bg-white object-contain shadow-sm sm:h-10 sm:w-10"
              />
              <span>PerckyLingua</span>
            </button>
          </div>

          {/* Zone 2: Desktop 4-6 text navigation links */}
          <nav className="hidden items-center gap-5 text-sm font-medium text-slate-600">
            {navItems.slice(0, 6).map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`transition-colors py-1 relative flex items-center gap-1.5 ${
                  currentTab === item.id
                    ? 'border-b-2 border-[#2fa36b] font-semibold text-[#072a3f]'
                    : 'hover:text-[#072a3f]'
                }`}
              >
                <span>{item.label}</span>
                {item.id === 'students' && pendingStudentsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-600 text-white animate-pulse">
                    {pendingStudentsCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Zone 3: Primary actions & User profile */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectTab('settings')}
              title="Base de données Supabase connectée en temps réel"
              className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="font-sans">Supabase Cloud</span>
            </button>

            {/* Connected Examiner Badge */}
            {currentUser && (
              <div 
                className="hidden items-center gap-1.5 rounded-xl border border-[#d1e1ec] bg-[#e6f0f7] px-2.5 py-1.5 text-xs font-medium text-[#072a3f] md:flex"
                title={`Connecté en tant que ${currentUser.email} (${currentUser.role})`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#072a3f] text-[9px] font-bold text-white">
                  {(currentUser.name.trim()[0] || 'P').toUpperCase()}
                </span>
                <span className="font-mono text-[11px] truncate max-w-[140px]">
                  {currentUser.email}
                </span>
              </div>
            )}

            <button
              onClick={() => onSelectTab('results')}
              className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-[#d8e6ee] bg-white px-3 py-2 text-xs font-semibold text-[#315267] transition-colors hover:bg-[#f3f8fb] sm:inline-flex"
              title="Consulter les notes et exporter"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Notes</span>
            </button>

            <button
              onClick={onQuickEvaluate}
              className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-xl bg-[#072a3f] px-2.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] active:bg-[#062438] sm:min-h-11 sm:gap-2 sm:px-4 sm:text-sm"
            >
              <Mic className="h-4 w-4 shrink-0 text-emerald-300" />
              <span className="hidden xs:inline">Évaluer</span>
              <span className="xs:hidden">Noter</span>
            </button>

            {/* Logout button */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700 sm:min-h-10 sm:min-w-10"
                title="Déconnexion de la session"
                aria-label="Se déconnecter"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Barre des menus mobile enseignant (défilement horizontal fluide) */}
        <nav 
          aria-label="Barre des menus mobile enseignant"
          className="flex lg:hidden items-center gap-1.5 overflow-x-auto px-3 py-1.5 bg-[#f5f8fa] border-t border-[#e2edf3] no-scrollbar touch-scroll"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const shortLabelMap: Record<string, string> = {
              dashboard: 'Accueil',
              lessons: 'Cours',
              quizzes: 'Quiz',
              classes: 'Classes',
              students: 'Élèves',
              exams: 'Examens',
              'pass-order': 'Ordre',
              evaluation: 'Oral',
              results: 'Notes',
              qrcode: 'QR',
              settings: 'Paramètres'
            };
            const label = shortLabelMap[item.id] || item.label;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#072a3f] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-[#d8e6ee] hover:bg-slate-50 hover:text-[#072a3f] active:bg-slate-100'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-emerald-300' : 'text-slate-500'}`} />
                <span>{label}</span>
                {item.id === 'lessons' && !isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2fa36b]" />
                )}
                {item.id === 'students' && pendingStudentsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-600 text-white animate-pulse">
                    {pendingStudentsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Mobile Drawer Backdrop & Menu */}
      {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
          <div 
            className="fixed inset-0 bg-[#072a3f]/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div id="teacher-mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation professeur" className="relative z-10 flex h-dvh w-[min(84vw,22rem)] flex-col justify-between overflow-y-auto rounded-r-3xl border-r border-[#d8e6ee] bg-white p-4 shadow-2xl">
            <div>
              <div className="mb-3 flex items-center justify-between border-b border-[#e2edf3] pb-3">
                <span className="font-display text-base font-bold text-[#072a3f]">
                  Menu Principal
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-slate-400 hover:bg-[#e6f0f7] hover:text-[#072a3f]"
                  aria-label="Fermer le menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {currentUser && (
                <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-[#d1e1ec] bg-[#f3f8fb] p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#072a3f] text-xs font-bold text-white">
                    {(currentUser.name.trim()[0] || 'P').toUpperCase()}
                  </span>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {currentUser.name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-[#46657a]">
                      {currentUser.email}
                    </p>
                  </div>
                </div>
              )}

              <div className="max-h-[calc(100dvh-14rem)] space-y-1 overflow-y-auto overscroll-contain pr-1">
                {navItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  const showGroupHeader = idx === 0 || item.group !== navItems[idx - 1].group;

                  return (
                    <React.Fragment key={item.id}>
                      {showGroupHeader && (
                        <div className={`px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${idx > 0 ? 'mt-3 mb-1 pt-2 border-t border-slate-100' : 'mb-1'}`}>
                          {item.group}
                        </div>
                      )}
                      <button
                        onClick={() => handleMobileNav(item.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                          isActive
                            ? 'bg-[#e6f0f7] font-bold text-[#072a3f] ring-1 ring-[#d1e1ec]'
                            : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-[#2fa36b]' : 'text-slate-400'}`} />
                          <span className="truncate text-xs sm:text-sm">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.badge && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {item.badge}
                            </span>
                          )}
                          {item.id === 'students' && pendingStudentsCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white animate-pulse">
                              {pendingStudentsCount}
                            </span>
                          )}
                          {item.highlight && !item.badge && (
                            <span className="h-2 w-2 rounded-full bg-[#2fa36b] animate-pulse" />
                          )}
                        </div>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 border-t border-[#e2edf3] pt-4">
              <button
                onClick={() => {
                  onQuickEvaluate();
                  setMobileMenuOpen(false);
                }}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d]"
              >
                <Mic className="h-4 w-4 text-emerald-300" />
                <span>Démarrer une évaluation</span>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-200 py-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Se déconnecter</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
