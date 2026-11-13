import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  BookOpen, 
  CheckCircle2, 
  Search, 
  SlidersHorizontal, 
  X, 
  ChevronRight
} from 'lucide-react';
import { AuthUser } from '../services/authService';
import { lessonsService } from '../services/lessonsService';
import { Lesson, LessonLevel, LessonProgress, LessonType } from '../types/lessons';
import { LessonPlayer } from '../components/lessons/LessonRenderer';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  LearningModuleHeader,
  StatusBadge
} from '../components/LearningCard';
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
    <div className="w-full min-w-0 space-y-5">
      <LearningModuleHeader
        kicker="Parcours d’italien en ligne"
        title="Leçons de cours"
        description="Apprenez l’italien pas à pas : observez les dialogues, découvrez les règles et consolidez vos connaissances."
        aside={
          <div className="rounded-[18px] border border-[#d8e6ee] bg-white px-4 py-3 shadow-[0_4px_14px_rgba(7,42,63,0.04)] sm:min-w-[250px]">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-[#072a3f]">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-[#2fa36b]" />
                <span>Votre progression</span>
              </span>
              <span className="font-extrabold tabular-nums text-[#145c3d]">
                {completedCount} / {totalPublished}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#e6f0f7]">
              <div
                className="h-full rounded-full bg-[#2fa36b] transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-[#607f93]">
              <span className="tabular-nums">{progressPercent}% achevé</span>
              {completedCount === totalPublished && totalPublished > 0 && (
                <span className="font-bold text-[#145c3d]">Parcours terminé</span>
              )}
            </div>
          </div>
        }
      />

      {/* Search & Filter Toolbar */}
      <section className="space-y-3 rounded-[22px] border border-[#d8e6ee] bg-white p-3.5 shadow-[0_6px_20px_rgba(7,42,63,0.04)] sm:p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 text-[#607f93]" size={16} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher une leçon par thème, mot-clé…"
            className="w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] py-2.5 pl-10 pr-9 text-xs text-[#072a3f] placeholder:text-[#607f93] focus:border-[#0b3c5d] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3c5d]/15 sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-3 p-0.5 text-[#607f93] hover:text-[#072a3f]"
              aria-label="Effacer la recherche"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-scroll">
            <span className="mr-1 hidden shrink-0 text-[11px] font-bold uppercase tracking-wider text-[#607f93] sm:inline">
              Type :
            </span>
            <button
              type="button"
              onClick={() => setType('all')}
              className={`min-h-9 shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                type === 'all'
                  ? 'bg-[#072a3f] text-white shadow-xs'
                  : 'bg-[#f5f9fc] text-[#46657a] hover:bg-[#e6f0f7] hover:text-[#072a3f]'
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
                  className={`min-h-9 shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#072a3f] text-white shadow-xs'
                      : 'bg-[#f5f9fc] text-[#46657a] hover:bg-[#e6f0f7] hover:text-[#072a3f]'
                  }`}
                >
                  {cfg?.label || t}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-scroll">
            <span className="mr-1 hidden shrink-0 text-[11px] font-bold uppercase tracking-wider text-[#607f93] sm:inline">
              Niveau :
            </span>
            <button
              type="button"
              onClick={() => setLevel('all')}
              className={`min-h-8 shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                level === 'all'
                  ? 'bg-[#072a3f] text-white shadow-xs'
                  : 'bg-[#f5f9fc] text-[#46657a] hover:bg-[#e6f0f7] hover:text-[#072a3f]'
              }`}
            >
              Tous les niveaux
            </button>
            {(['A1', 'A2', 'B1', 'B2', 'C1'] as LessonLevel[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={`min-h-8 shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  level === l
                    ? 'bg-[#2fa36b] text-white shadow-xs'
                    : 'bg-[#f5f9fc] text-[#46657a] hover:bg-[#e6f0f7] hover:text-[#072a3f]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 shadow-xs sm:text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="p-1 hover:text-rose-950">
            <X size={15} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-[22px] border border-[#d8e6ee] bg-white p-12 text-center text-[#607f93] shadow-[0_6px_20px_rgba(7,42,63,0.04)]">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-3 border-[#2fa36b] border-t-transparent" />
          <p className="text-sm font-semibold">Chargement des parcours de leçons…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#b9cfdd] bg-white/90 p-10 text-center text-[#607f93] sm:p-14">
          <SlidersHorizontal className="mx-auto mb-3 text-[#607f93]" size={32} />
          <p className="text-base font-bold text-[#072a3f]">Aucune leçon ne correspond à vos filtres.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-[#607f93] sm:text-sm">
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
              className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#072a3f] px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#0b3c5d]"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map(lesson => {
            const p = progress[lesson.id];
            const cfg = TYPE_CONFIG[lesson.type] || { label: lesson.type, color: '#0b3c5d', bg: 'bg-[#e6f0f7]', text: 'text-[#0b3c5d]' };
            const isDone = p?.status === 'done';
            const isStarted = p?.status === 'started';

            const statusBadge = isDone ? (
              <StatusBadge tone="success" icon={<CheckCircle2 size={12} />}>
                Terminée
              </StatusBadge>
            ) : isStarted ? (
              <StatusBadge tone="info" icon={<BookOpen size={12} />}>
                En cours
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">
                À découvrir
              </StatusBadge>
            );

            return (
              <LearningCard
                key={lesson.id}
                asButton
                active={isStarted}
                onClick={() => setSelected(lesson)}
                className="group"
              >
                <LearningCardHeader
                  kicker={`${cfg.label} · ${lesson.level}`}
                  status={statusBadge}
                />

                <div className="min-w-0 space-y-1.5">
                  <h2 className="break-words font-display text-base font-extrabold leading-snug text-[#072a3f] transition-colors group-hover:text-[#0b3c5d] sm:text-lg">
                    {lesson.title_it}
                  </h2>
                  <p className="line-clamp-1 text-xs font-semibold text-[#0b3c5d] sm:text-[13px]">
                    {lesson.title_fr}
                  </p>
                  {lesson.objective && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-[#607f93]">
                      {lesson.objective}
                    </p>
                  )}
                </div>

                <LearningCardMetrics
                  columns={2}
                  items={[
                    {
                      label: 'Durée estimée',
                      value: `${lesson.duration_min} min`
                    },
                    {
                      label: 'Parcours',
                      value: `${lesson.blocks?.length || 0} étape${(lesson.blocks?.length || 0) > 1 ? 's' : ''}`,
                      tone: isDone ? 'success' : 'default'
                    }
                  ]}
                />

                <LearningCardFooter>
                  <span
                    className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-4 py-2.5 text-xs font-extrabold transition-colors sm:text-[13px] ${
                      isDone
                        ? 'border border-[#bfe3ce] bg-[#eef9f3] text-[#145c3d] group-hover:bg-[#e1f4e9]'
                        : isStarted
                          ? 'bg-[#2fa36b] text-white shadow-sm group-hover:bg-[#248556]'
                          : 'bg-[#072a3f] text-white shadow-sm group-hover:bg-[#0b3c5d]'
                    }`}
                  >
                    <span>{isDone ? 'Relire la leçon' : isStarted ? 'Continuer la leçon' : 'Commencer la leçon'}</span>
                    <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </LearningCardFooter>
              </LearningCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
