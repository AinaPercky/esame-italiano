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
  onLogout
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
        { id: 'quizzes', label: 'Quiz en Direct & Notes', icon: Sparkles, highlight: true }
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
    <aside className="hidden lg:flex w-68 bg-white border-r border-slate-200 flex-col shrink-0 no-print min-h-[calc(100vh-60px)]">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="text-[10px] font-bold tracking-wider text-amber-900 uppercase mb-0.5">
          Espace Enseignant • Esame
        </div>
        <div className="text-xs font-medium text-slate-800 flex items-center justify-between">
          <span>Session Italienne 2026</span>
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold">
            Actif
          </span>
        </div>
      </div>

      <nav className="p-3 space-y-4 flex-1 overflow-y-auto">
        {groups.map((group, idx) => (
          <div key={idx} className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
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
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-amber-50 text-amber-950 shadow-xs font-bold ring-1 ring-amber-200'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  } ${item.highlight && !isActive ? 'hover:bg-amber-50/50' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber-800' : 'text-slate-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.highlight ? (
                    <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse shrink-0" />
                  ) : isActive ? (
                    <ChevronRight className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Progress stats */}
      {stats && (
        <div className="p-3 m-3 mb-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <div className="text-slate-500 mb-0.5 font-medium text-[11px]">Progression session</div>
          {stats.sessionLabel && (
            <div className="text-[11px] text-amber-900 font-semibold truncate mb-1" title={stats.sessionLabel}>
              {stats.sessionLabel}
            </div>
          )}
          <div className="flex items-center justify-between font-semibold text-slate-800 mb-1.5 font-mono text-[11px]">
            <span>{stats.evaluatedCount} / {stats.totalStudents} élèves</span>
            <span>{stats.totalStudents > 0 ? Math.min(100, Math.round((stats.evaluatedCount / stats.totalStudents) * 100)) : 0}%</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-amber-700 h-full transition-all duration-300"
              style={{ width: `${stats.totalStudents > 0 ? Math.min(100, (stats.evaluatedCount / stats.totalStudents) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* User Session Footer Card */}
      {currentUser && (
        <div className="p-3 m-3 mt-1 bg-amber-50/80 border border-amber-200/90 rounded-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-amber-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
              A
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-slate-900 truncate">
                {currentUser.name}
              </div>
              <div className="text-[10px] font-mono text-amber-900 truncate" title={currentUser.email}>
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
