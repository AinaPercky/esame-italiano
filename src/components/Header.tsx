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
  QrCode
} from 'lucide-react';
import { AuthUser } from '../services/authService';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onQuickEvaluate: () => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  currentTab, 
  onSelectTab, 
  onQuickEvaluate,
  currentUser,
  onLogout 
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'quizzes', label: 'Quiz en Direct', icon: BookOpen, highlight: true },
    { id: 'pass-order', label: 'Ordre de passage', icon: Shuffle },
    { id: 'evaluation', label: 'Évaluation orale', icon: Mic },
    { id: 'results', label: 'Résultats', icon: Award },
    { id: 'qrcode', label: 'Codes QR', icon: QrCode },
    { id: 'classes', label: 'Classes', icon: School },
    { id: 'students', label: 'Élèves', icon: Users },
    { id: 'exams', label: 'Examens', icon: BookOpen },
    { id: 'settings', label: 'Paramètres', icon: Settings }
  ];

  const handleMobileNav = (tabId: string) => {
    onSelectTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-3 sm:px-8 py-2.5 sm:py-3.5 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Zone 1: Brand Wordmark & Mobile Menu Trigger */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center -ml-1"
              aria-label="Ouvrir le menu de navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <button 
              onClick={() => onSelectTab('dashboard')} 
              className="text-left font-display text-base sm:text-2xl font-bold tracking-tight text-slate-900 hover:text-amber-800 transition-colors flex items-center gap-1.5 sm:gap-2"
            >
              <img
                src="/lingua-percky-logo.png"
                alt=""
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain bg-white shadow-xs"
              />
              <span>LinguaPercky</span>
            </button>
          </div>

          {/* Zone 2: Desktop 4-6 text navigation links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            {navItems.slice(0, 6).map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`transition-colors py-1 relative ${
                  currentTab === item.id
                    ? 'text-amber-800 font-semibold border-b-2 border-amber-700'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
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
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200/80 rounded-lg text-xs text-amber-950 font-medium"
                title={`Connecté en tant que ${currentUser.email} (${currentUser.role})`}
              >
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-[10px]">
                  A
                </span>
                <span className="font-mono text-[11px] truncate max-w-[140px]">
                  {currentUser.email}
                </span>
              </div>
            )}

            <button
              onClick={() => onSelectTab('results')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors min-h-[40px]"
              title="Consulter les notes et exporter"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Notes</span>
            </button>

            <button
              onClick={onQuickEvaluate}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg shadow-sm transition-colors whitespace-nowrap min-h-[44px]"
            >
              <Mic className="w-4 h-4 text-amber-200 shrink-0" />
              <span className="hidden xs:inline">Évaluer</span>
              <span className="xs:hidden">Noter</span>
            </button>

            {/* Logout button */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-2 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                title="Déconnexion de la session"
                aria-label="Se déconnecter"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer Backdrop & Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col justify-between z-10 p-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <span className="font-display font-bold text-slate-900 text-base">
                  Menu Principal
                </span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {currentUser && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-amber-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    A
                  </span>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {currentUser.name}
                    </p>
                    <p className="text-[11px] font-mono text-amber-900 truncate">
                      {currentUser.email}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleMobileNav(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors min-h-[48px] ${
                        isActive
                          ? 'bg-amber-50 text-amber-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-amber-800' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <button
                onClick={() => {
                  onQuickEvaluate();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-amber-800 text-white font-medium text-sm rounded-lg shadow-sm min-h-[48px]"
              >
                <Mic className="w-4 h-4 text-amber-200" />
                <span>Démarrer une évaluation</span>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-rose-700 hover:bg-rose-50 font-medium text-xs rounded-lg border border-rose-200 min-h-[40px] cursor-pointer"
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
