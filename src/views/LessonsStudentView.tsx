import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  ArrowLeft, 
  BookOpen, 
  CheckCircle2, 
  Clock3, 
  Search, 
  SlidersHorizontal, 
  Sparkles, 
  X, 
  ChevronRight,
  TrendingUp,
  Layers,
  Award
} from 'lucide-react';
import { AuthUser } from '../services/authService';
import { lessonsService } from '../services/lessonsService';
import { Lesson, LessonLevel, LessonProgress, LessonType } from '../types/lessons';
import { LessonPlayer } from '../components/lessons/LessonRenderer';
import '../components/lessons/lessonExperience.css';
import '../components/lessons/lessonGuidedQuiz.css';
import '../components/lessons/lessonPlayer.css';

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  grammaire: { label: 'Grammaire', color: '#2f6fd6', bg: 'bg-blue-100', text: 'text-blue-800' },
  vocabulaire: { label: 'Vocabulaire', color: '#178a55', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  fonction: { label: 'Fonction', color: '#c2570a', bg: 'bg-amber-100', text: 'text-amber-800' },
  theme: { label: 'Thème', color: '#d7263d', bg: 'bg-rose-100', text: 'text-rose-800' },
  prononciation: { label: 'Prononciation', color: '#7a4fd0', bg: 'bg-purple-100', text: 'text-purple-800' }
};

export const LessonsStudentView: React.FC<{ 
  currentUser: AuthUser; 
  onOpenQuiz?: (quizRef: string) => void 
}> = ({ currentUser, onOpenQuiz }) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('all');
  const [level, setLevel] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progressUserId, setProgressUserId] = useState(currentUser.id);
  const progressSaveQueue = useRef<Promise<void>>(Promise.resolve());

  const load = async () => {
    setLoading(true);
    try {
      const authUserId = await lessonsService.getAuthenticatedUserId(currentUser.id);
      setProgressUserId(authUserId);
      const list = await lessonsService.list({ publishedOnly: true });
      setLessons(list);
      const entries = await Promise.all(
        list.map(async lesson => [lesson.id, await lessonsService.getProgress(authUserId, lesson.id)] as const)
      );
      setProgress(Object.fromEntries(entries.filter(([, value]) => value).map(([id, value]) => [id, value!])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les leçons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [currentUser.id]);

  const visible = useMemo(() => {
    return lessons.filter(l => {
      const matchesQuery = !query || `${l.title_it} ${l.title_fr} ${l.objective || ''}`.toLowerCase().includes(query.toLowerCase());
      const matchesType = type === 'all' || l.type === type;
      const matchesLevel = level === 'all' || l.level === level;
      return matchesQuery && matchesType && matchesLevel;
    });
  }, [lessons, query, type, level]);

  const save = async (state: LessonProgress['discovery_state'], done = false, screen?: number) => {
    const lessonId = selected?.id;
    const userId = progressUserId;
    if (!lessonId) return;

    const saveTask = progressSaveQueue.current.then(async () => {
      const discovery_state = screen === undefined ? state : { ...state, screen };
      const saved = await lessonsService.saveProgress({
        user_id: userId,
        lesson_id: lessonId,
        status: done ? 'done' : 'started',
        discovery_state
      });
      setProgress(previous => ({ ...previous, [lessonId]: saved }));
    });

    progressSaveQueue.current = saveTask.then(() => undefined, () => undefined);
    try {
      await saveTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Progression non enregistrée.');
    }
  };

  // Completed lessons stats
  const completedCount = useMemo(() => {
    return Object.values(progress).filter(p => p.status === 'done').length;
  }, [progress]);

  const totalPublished = lessons.length;
  const progressPercent = totalPublished > 0 ? Math.round((completedCount / totalPublished) * 100) : 0;

  if (selected) {
    return (
      <LessonPlayer
        lesson={selected}
        progress={progress[selected.id]}
        avatarUrl={currentUser.avatar}
        profileName={currentUser.name}
        onProgress={save}
        onQuiz={onOpenQuiz}
        onExit={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="lessons-root min-h-full">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        
        {/* Welcome & Progress Banner */}
        <section className="rounded-3xl border border-[#d5e2f3] bg-gradient-to-br from-white via-[#f7faff] to-[#edf4fc] p-4 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-800">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>PARCOURS D'ITALIEN EN LIGNE</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#072a3f]">
                Leçons de cours
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xl">
                Apprenez l'italien pas à pas : observez les dialogues, découvrez les règles et consolidez vos connaissances.
              </p>
            </div>

            {/* Progression Box */}
            <div className="rounded-2xl border border-[#d5e2f3] bg-white p-3.5 sm:p-4 shadow-2xs sm:min-w-[220px]">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  <span>Votre progression</span>
                </span>
                <span className="font-mono text-emerald-700 font-extrabold">
                  {completedCount} / {totalPublished}
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                <span>{progressPercent}% achevé</span>
                {completedCount === totalPublished && totalPublished > 0 && (
                  <span className="text-emerald-700 font-bold">Bravo ! Tout est terminé 🎉</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Search & Filter Toolbar */}
        <section className="rounded-2xl border border-[#d5e2f3] bg-white p-3 sm:p-4 shadow-2xs space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher une leçon par thème, mot-clé…"
              className="w-full rounded-xl border border-[#d5e2f3] bg-[#f8fbff] py-2.5 pl-10 pr-9 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#072a3f]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                aria-label="Effacer la recherche"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Quick Filter Pills (Type & Level) */}
          <div className="space-y-2">
            {/* Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-scroll pb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">
                Type :
              </span>
              <button
                type="button"
                onClick={() => setType('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  type === 'all'
                    ? 'bg-[#072a3f] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tous les types
              </button>
              {(['grammaire', 'vocabulaire', 'fonction', 'theme', 'prononciation'] as LessonType[]).map(t => {
                const cfg = TYPE_CONFIG[t];
                const isSelected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#072a3f] text-white shadow-xs'
                        : `${cfg?.bg || 'bg-slate-100'} ${cfg?.text || 'text-slate-700'} hover:opacity-85`
                    }`}
                  >
                    {cfg?.label || t}
                  </button>
                );
              })}
            </div>

            {/* Level Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-scroll">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">
                Niveau :
              </span>
              <button
                type="button"
                onClick={() => setLevel('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  level === 'all'
                    ? 'bg-[#072a3f] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tous les niveaux
              </button>
              {(['A1', 'A2', 'B1', 'B2', 'C1'] as LessonLevel[]).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    level === l
                      ? 'bg-[#2fa36b] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Global Error Banner */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs sm:text-sm text-rose-800 shadow-xs flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="p-1 hover:text-rose-950">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="rounded-3xl border border-[#d5e2f3] bg-white p-12 text-center text-slate-500 shadow-2xs">
            <div className="h-8 w-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold">Chargement des parcours de leçons…</p>
          </div>
        ) : visible.length === 0 ? (
          /* Empty state */
          <div className="rounded-3xl border border-dashed border-[#d5e2f3] bg-white p-10 sm:p-14 text-center text-slate-500 shadow-2xs">
            <SlidersHorizontal className="mx-auto mb-3 text-slate-400" size={32} />
            <p className="font-bold text-base text-slate-800">Aucune leçon ne correspond à vos filtres.</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Essayez de modifier votre recherche ou réinitialisez les critères sélectionnés.
            </p>
            {(query || type !== 'all' || level !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setType('all');
                  setLevel('all');
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#072a3f] text-white text-xs font-bold shadow-xs hover:bg-[#0b3c5d] active:scale-95 transition-all"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          /* Lesson Cards Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
            {visible.map(lesson => {
              const p = progress[lesson.id];
              const cfg = TYPE_CONFIG[lesson.type] || { label: lesson.type, color: '#2f6fd6', bg: 'bg-blue-100', text: 'text-blue-800' };
              const isDone = p?.status === 'done';
              const isStarted = p?.status === 'started';

              return (
                <button
                  type="button"
                  key={lesson.id}
                  onClick={() => setSelected(lesson)}
                  className="group relative flex flex-col justify-between rounded-3xl border border-[#d5e2f3] bg-white p-4 sm:p-5 text-left shadow-2xs transition-all hover:-translate-y-1 hover:shadow-lg active:scale-98 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#072a3f]"
                >
                  <div>
                    {/* Top Badges */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span 
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-white shadow-2xs"
                          style={{ background: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">
                          {lesson.level}
                        </span>
                      </div>

                      {/* Status indicator pill */}
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                          <CheckCircle2 size={12} className="text-emerald-700" />
                          Terminée
                        </span>
                      ) : isStarted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                          En cours
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold text-slate-400">
                          À découvrir
                        </span>
                      )}
                    </div>

                    {/* Titles */}
                    <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#072a3f] leading-snug group-hover:text-[#0b3c5d] transition-colors">
                      {lesson.title_it}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 font-medium line-clamp-2">
                      {lesson.title_fr}
                    </p>

                    {lesson.objective && (
                      <p className="mt-2 text-[11px] text-slate-600 bg-slate-50 rounded-xl p-2 font-normal line-clamp-2 border border-slate-100">
                        {lesson.objective}
                      </p>
                    )}
                  </div>

                  {/* Footer Row */}
                  <div className="mt-4 flex items-center justify-between border-t border-[#eef3fa] pt-3 text-xs font-bold text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={13} className="text-slate-400" />
                      {lesson.duration_min} min
                    </span>

                    <span className={`inline-flex items-center gap-1 transition-transform group-hover:translate-x-0.5 ${
                      isDone ? 'text-emerald-700' : isStarted ? 'text-amber-700' : 'text-[#072a3f]'
                    }`}>
                      <span>{isDone ? 'Relire' : isStarted ? 'Continuer' : 'Commencer'}</span>
                      <ChevronRight size={14} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
