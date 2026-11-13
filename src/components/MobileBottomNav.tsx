import React from 'react';
import { LayoutDashboard, Mic, Award, Users, BookOpen, Sparkles, School } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentTab, onSelectTab }) => {
  // Masquer la barre inférieure sur l'écran d'évaluation orale car il possède sa propre barre d'action sticky
  if (currentTab === 'evaluation') return null;

  const items = [
    { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
    { id: 'lessons', label: 'Cours', icon: BookOpen },
    { id: 'quizzes', label: 'Quiz', icon: Sparkles },
    { id: 'exercises', label: 'Exercices', icon: BookOpen },
    { id: 'evaluation', label: 'Évaluer', icon: Mic, highlight: true },
    { id: 'results', label: 'Notes', icon: Award },
    { id: 'students', label: 'Élèves', icon: Users },
    { id: 'enrollments', label: 'Inscriptions', icon: School }
  ];

  return (
    <nav 
      aria-label="Navigation mobile"
      className="fixed bottom-[calc(6px+env(safe-area-inset-bottom,0px))] left-2 right-2 z-40 rounded-2xl border border-[#d8e6ee] bg-white/95 px-2 pt-1.5 pb-1.5 shadow-[0_12px_36px_rgba(7,42,63,.14)] backdrop-blur-xl lg:hidden no-print"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          if (item.highlight) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className="-mt-4 flex h-12 w-12 flex-col items-center justify-center rounded-full border-2 border-white bg-[#072a3f] text-white shadow-lg ring-2 ring-[#2fa36b]/20 transition-transform active:scale-95 active:bg-[#0b3c5d]"
                aria-label="Évaluer en direct"
              >
                <Icon className="h-5 w-5 text-emerald-300" />
                <span className="mt-0.5 text-[8px] font-bold tracking-tight text-white">Noter</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              title={item.label}
              className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-0.5 py-1 transition-colors ${
                isActive 
                  ? 'bg-[#e6f0f7] font-bold text-[#072a3f]'
                  : 'text-slate-500 hover:text-[#072a3f] active:bg-[#f3f8fb]'
              }`}
            >
              <Icon className={`mb-0.5 h-4.5 w-4.5 sm:h-5 sm:w-5 ${isActive ? 'text-[#2fa36b] stroke-[2.5]' : 'text-slate-400'}`} />
              <span className="text-[9px] leading-tight font-medium truncate max-w-full text-center">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
