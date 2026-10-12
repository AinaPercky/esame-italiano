import React from 'react';
import { LayoutDashboard, Mic, Shuffle, Award, Users, BookOpen } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentTab, onSelectTab }) => {
  // Masquer la barre inférieure sur l'écran d'évaluation orale car il possède sa propre barre d'action sticky
  if (currentTab === 'evaluation') return null;

  const items = [
    { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
    { id: 'quizzes', label: 'Quiz', icon: BookOpen },
    { id: 'evaluation', label: 'Évaluer', icon: Mic, highlight: true },
    { id: 'results', label: 'Notes', icon: Award },
    { id: 'students', label: 'Élèves', icon: Users }
  ];

  return (
    <nav 
      aria-label="Navigation mobile"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-lg no-print"
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
                className="flex flex-col items-center justify-center -mt-5 bg-amber-800 text-white rounded-full w-14 h-14 shadow-lg active:bg-amber-950 transition-transform active:scale-95 border-2 border-white ring-2 ring-amber-800/20"
                aria-label="Évaluer en direct"
              >
                <Icon className="w-6 h-6 text-amber-200" />
                <span className="text-[9px] font-bold text-amber-100 tracking-tight mt-0.5">Noter</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-lg min-w-[56px] min-h-[44px] transition-colors ${
                isActive 
                  ? 'text-amber-900 font-bold bg-amber-50/80' 
                  : 'text-slate-500 hover:text-slate-900 active:bg-slate-100'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-amber-800 stroke-[2.5]' : 'text-slate-400'}`} />
              <span className="text-[10px] leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
