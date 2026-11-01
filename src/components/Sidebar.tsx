import React from 'react';
import { 
  LayoutDashboard, 
  School, 
  Users, 
  BookOpen, 
  Mic, 
  Shuffle, 
  Award, 
  Settings,
  ChevronRight,
  LogOut,
  QrCode,
  Sparkles
} from 'lucide-react';
import { AuthUser } from '../services/authService';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  stats?: {
    evaluatedCount: number;
    totalStudents: number;
    sessionLabel?: string;
  };
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  pendingStudentsCount?: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  onSelectTab, 
  stats,
  currentUser,
  onLogout,
  pendingStudentsCount = 0
}) => {
  const groups: NavGroup[] = [
    {
      title: 'Vue d\'ensemble',
      items: [
        { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard }
      ]
    },
    {
      title: 'Classes & Étudiants',
      items: [
        { id: 'classes', label: 'Gestion des Classes', icon: School },
        { id: 'students', label: 'Gestion des Élèves', icon: Users }
      ]
    },
    {
      title: 'Quiz & QCM',
      items: [
        { id: 'quizzes', label: 'Quiz en Direct & Notes', icon: Sparkles, highlight: true },
        { id: 'lessons', label: 'Leçons de cours', icon: BookOpen }
      ]
    },
    {
      title: 'Examens Oraux',
      items: [
        { id: 'exams', label: 'Examens & Rubriques', icon: BookOpen },
        { id: 'pass-order', label: 'Ordre de passage', icon: Shuffle },
        { id: 'evaluation', label: 'Évaluation orale', icon: Mic },
        { id: 'results', label: 'Résultats & Fiches', icon: Award },
        { id: 'qrcode', label: 'Codes QR Élèves', icon: QrCode }
      ]
    },
    {
      title: 'Configuration',
      items: [
        { id: 'settings', label: 'Paramètres & Sécurité', icon: Settings }
      ]
    }
  ];

  return (
    <aside className="hidden min-h-[calc(100vh-60px)] w-[17rem] shrink-0 flex-col border-r border-[#d8e6ee] bg-white/85 no-print backdrop-blur-xl lg:flex">
      <div className="border-b border-[#e2edf3] bg-[#f7fafc] p-4">
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0b3c5d]">
          Espace Enseignant • PerckyLingua
        </div>
        <div className="flex items-center justify-between text-xs font-medium text-[#072a3f]">
          <span>Session Italienne 2026</span>
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold">
            Actif
          </span>
        </div>
      </div>

      <nav aria-label="Navigation principale professeur" className="flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map((group, idx) => (
          <div key={idx} className="space-y-1">
                    <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`group flex min-h-10 w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#e6f0f7] font-bold text-[#072a3f] shadow-sm ring-1 ring-[#d1e1ec]'
                      : 'text-slate-600 hover:bg-[#f3f8fb] hover:text-[#072a3f]'
                  } ${item.highlight && !isActive ? 'hover:bg-[#f3f8fb]' : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#2fa36b]' : 'text-slate-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.id === 'students' && pendingStudentsCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white animate-pulse shrink-0">
                      {pendingStudentsCount}
                    </span>
                  ) : item.highlight ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#2fa36b] motion-safe:animate-pulse" />
                  ) : isActive ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#0b3c5d]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Progress stats */}
      {stats && (
        <div className="m-3 mb-2 rounded-2xl border border-[#d8e6ee] bg-[#f3f8fb] p-3 text-xs">
          <div className="text-slate-500 mb-0.5 font-medium text-[11px]">Progression session</div>
          {stats.sessionLabel && (
            <div className="mb-1 truncate text-[11px] font-semibold text-[#0b3c5d]" title={stats.sessionLabel}>
              {stats.sessionLabel}
            </div>
          )}
          <div className="flex items-center justify-between font-semibold text-slate-800 mb-1.5 font-mono text-[11px]">
            <span>{stats.evaluatedCount} / {stats.totalStudents} élèves</span>
            <span>{stats.totalStudents > 0 ? Math.min(100, Math.round((stats.evaluatedCount / stats.totalStudents) * 100)) : 0}%</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#2fa36b] transition-all duration-300"
              style={{ width: `${stats.totalStudents > 0 ? Math.min(100, (stats.evaluatedCount / stats.totalStudents) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* User Session Footer Card */}
      {currentUser && (
        <div className="m-3 mt-1 flex items-center justify-between gap-2 rounded-2xl border border-[#d8e6ee] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#072a3f] text-xs font-bold text-white ring-2 ring-[#e6f0f7]">
              {(currentUser.name.trim()[0] || 'P').toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-slate-900 truncate">
                {currentUser.name}
              </div>
              <div className="truncate font-mono text-[10px] text-[#46657a]" title={currentUser.email}>
                {currentUser.email}
              </div>
            </div>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors shrink-0 cursor-pointer"
              title="Se déconnecter"
              aria-label="Déconnexion"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
};
