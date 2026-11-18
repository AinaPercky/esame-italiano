import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  PenSquare,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import {
  CEFR_LEVELS,
  QUIZ_CATEGORIES,
  normalizeQuizCategory,
  type CEFRLevel,
  type ClassRoom,
  type ExerciseDefinition,
  type Quiz,
  type QuizCategory
} from '../types';
import { dataService } from '../services/dataService';
import { convertQuizToExercise, exerciseService } from '../services/exerciseService';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  StatusBadge
} from './LearningCard';
import {
  DEFAULT_EXERCISE_CATALOG_FILTERS,
  DEFAULT_QUIZ_CONVERSION_FILTERS,
  countActiveExerciseFilters,
  countActiveQuizFilters,
  filterAndSortExercises,
  filterAndSortQuizzes,
  formatExerciseTotalDuration,
  getDistinctExerciseCategories,
  getDistinctQuizCategories,
  type ExerciseCatalogFilters,
  type ExerciseSortOption,
  type QuizConversionFilters,
  type QuizConversionSortOption
} from '../utils/exerciseAdminFilters';

export type ConverterDirection = 'quiz_to_exercise' | 'exercise_to_quiz';

interface ExerciseQuizConverterPanelProps {
  classes: ClassRoom[];
  quizzes: Quiz[];
  exercises: ExerciseDefinition[];
  initialDirection?: ConverterDirection;
  initialExerciseId?: string;
  autoOpenModalForExercise?: boolean;
  onLoadDraftInEditor: (payload: {
    title: string;
    description: string;
    category: string;
    level: string;
    classIds: string[];
    json: string;
    message: string;
  }) => void;
  onExerciseCreated: (exerciseId: string, createdTitle: string) => Promise<void>;
  onQuizCreated: (quiz: Quiz) => void;
  onOpenCatalog: () => void;
}

function getQuizStatusBadge(status: Quiz['status']) {
  if (status === 'launched') return <StatusBadge tone="live">En direct</StatusBadge>;
  if (status === 'closed') return <StatusBadge tone="neutral">Clôturé</StatusBadge>;
  return <StatusBadge tone="warning">Brouillon</StatusBadge>;
}

function getExerciseStatusBadge(status: ExerciseDefinition['status']) {
  if (status === 'published') return <StatusBadge tone="success">Publié</StatusBadge>;
  if (status === 'archived') return <StatusBadge tone="neutral">Archivé</StatusBadge>;
  return <StatusBadge tone="warning">Brouillon</StatusBadge>;
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getQuestionTypeLabel(type: string): string {
  if (type === 'qcm') return 'QCM';
  if (type === 'text') return 'Texte / Trous';
  if (type === 'reorder') return 'Remise en ordre';
  if (type === 'verbes_trous') return 'Banque de verbes';
  return type;
}

export const ExerciseQuizConverterPanel: React.FC<ExerciseQuizConverterPanelProps> = ({
  classes,
  quizzes,
  exercises,
  initialDirection = 'quiz_to_exercise',
  initialExerciseId = '',
  autoOpenModalForExercise = false,
  onLoadDraftInEditor,
  onExerciseCreated,
  onQuizCreated,
  onOpenCatalog
}) => {
  const [direction, setDirection] = useState<ConverterDirection>(initialDirection);
  const [panelError, setPanelError] = useState('');
  const [panelSuccess, setPanelSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Quiz -> Exercise filters & modal state
  const [quizFilters, setQuizFilters] = useState<QuizConversionFilters>(
    DEFAULT_QUIZ_CONVERSION_FILTERS
  );
  const [quizAdvancedOpen, setQuizAdvancedOpen] = useState(false);
  const [modalQuiz, setModalQuiz] = useState<Quiz | null>(null);
  const [targetExerciseTitle, setTargetExerciseTitle] = useState('');
  const [targetExerciseClassIds, setTargetExerciseClassIds] = useState<string[]>([]);

  // Exercise -> Quiz filters & modal state
  const [exerciseFilters, setExerciseFilters] = useState<ExerciseCatalogFilters>(
    DEFAULT_EXERCISE_CATALOG_FILTERS
  );
  const [exerciseAdvancedOpen, setExerciseAdvancedOpen] = useState(false);
  const [modalExercise, setModalExercise] = useState<ExerciseDefinition | null>(null);
  const [targetQuizTitle, setTargetQuizTitle] = useState('');
  const [targetQuizCategory, setTargetQuizCategory] = useState<QuizCategory>('Autre');
  const [targetQuizLevel, setTargetQuizLevel] = useState<CEFRLevel | ''>('');
  const [targetQuizDuration, setTargetQuizDuration] = useState<number>(10);
  const [targetQuizClassIds, setTargetQuizClassIds] = useState<string[]>([]);

  // Quick questions preview modal (read-only inspection before converting)
  const [previewItem, setPreviewItem] = useState<
    | { kind: 'quiz'; title: string; subtitle: string; questions: Quiz['questions'] }
    | { kind: 'exercise'; title: string; subtitle: string; questions: ExerciseDefinition['questions'] }
    | null
  >(null);

  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c.name])), [classes]);

  const openQuizConversionModal = (quiz: Quiz) => {
    setPanelError('');
    setModalQuiz(quiz);
    setTargetExerciseTitle(`${quiz.title} — Exercice`);
    const ids = quiz.class_ids?.length
      ? quiz.class_ids
      : quiz.class_id
      ? [quiz.class_id]
      : [];
    setTargetExerciseClassIds(ids.filter(id => classMap.has(id)));
  };

  const openExerciseConversionModal = (exercise: ExerciseDefinition) => {
    setPanelError('');
    setModalExercise(exercise);
    setTargetQuizTitle(`${exercise.title} — Quiz`);
    setTargetQuizCategory(normalizeQuizCategory(exercise.category));
    setTargetQuizLevel(exercise.level || '');
    const totalSeconds = (exercise.questions || []).reduce(
      (sum, q) => sum + Number(q.time_limit_seconds || 0),
      0
    );
    setTargetQuizDuration(Math.max(1, Math.ceil(totalSeconds / 60)));
    setTargetQuizClassIds((exercise.class_ids || []).filter(id => classMap.has(id)));
  };

  useEffect(() => {
    setDirection(initialDirection);
  }, [initialDirection]);

  useEffect(() => {
    if (autoOpenModalForExercise && initialExerciseId) {
      const target = exercises.find(e => e.id === initialExerciseId);
      if (target) {
        setDirection('exercise_to_quiz');
        openExerciseConversionModal(target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenModalForExercise, initialExerciseId]);

  // Escape key support to close active modals
  useEffect(() => {
    if (!modalQuiz && !modalExercise && !previewItem) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || submitting) return;
      if (previewItem) {
        setPreviewItem(null);
      } else if (modalQuiz) {
        setModalQuiz(null);
      } else if (modalExercise) {
        setModalExercise(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalQuiz, modalExercise, previewItem, submitting]);

  const distinctQuizCategories = useMemo(() => {
    const set = new Set<string>([...QUIZ_CATEGORIES, ...getDistinctQuizCategories(quizzes)]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [quizzes]);

  const distinctExerciseCategories = useMemo(() => {
    const set = new Set<string>([...QUIZ_CATEGORIES, ...getDistinctExerciseCategories(exercises)]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [exercises]);

  const filteredQuizzes = useMemo(
    () => filterAndSortQuizzes(quizzes, classes, quizFilters),
    [quizzes, classes, quizFilters]
  );

  const filteredExercises = useMemo(
    () => filterAndSortExercises(exercises, classes, exerciseFilters),
    [exercises, classes, exerciseFilters]
  );

  const activeQuizFilterCount = useMemo(
    () => countActiveQuizFilters(quizFilters),
    [quizFilters]
  );

  const activeExerciseFilterCount = useMemo(
    () => countActiveExerciseFilters(exerciseFilters),
    [exerciseFilters]
  );

  const quizConversionPreview = useMemo(() => {
    if (!modalQuiz) return { doc: null, error: null as string | null };
    try {
      return { doc: convertQuizToExercise(modalQuiz), error: null };
    } catch (e) {
      return {
        doc: null,
        error: e instanceof Error ? e.message : 'Conversion impossible pour ce quiz.'
      };
    }
  }, [modalQuiz]);

  const handleOpenInEditor = () => {
    setPanelError('');
    setPanelSuccess('');
    if (!modalQuiz || !quizConversionPreview.doc) {
      setPanelError(quizConversionPreview.error || 'Quiz invalide pour la conversion.');
      return;
    }
    const finalTitle = targetExerciseTitle.trim() || `${modalQuiz.title} — Exercice`;
    const doc = {
      ...quizConversionPreview.doc,
      metadata: {
        ...quizConversionPreview.doc.metadata,
        title: finalTitle
      }
    };
    setModalQuiz(null);
    onLoadDraftInEditor({
      title: finalTitle,
      description: doc.metadata.description,
      category: doc.metadata.category,
      level: doc.metadata.level || '',
      classIds: targetExerciseClassIds,
      json: JSON.stringify(doc, null, 2),
      message:
        'Conversion préparée : vérifiez les durées de chaque question et confirmez les classes avant d’enregistrer. Le quiz original reste inchangé.'
    });
  };

  const handleCreateExerciseDirectly = async () => {
    setPanelError('');
    setPanelSuccess('');
    if (!modalQuiz || !quizConversionPreview.doc) {
      setPanelError(quizConversionPreview.error || 'Quiz invalide pour la conversion.');
      return;
    }
    const finalTitle = targetExerciseTitle.trim() || `${modalQuiz.title} — Exercice`;
    setSubmitting(true);
    try {
      const id = await exerciseService.saveDefinition({
        id: null,
        metadata: {
          title: finalTitle,
          description: quizConversionPreview.doc.metadata.description,
          category: quizConversionPreview.doc.metadata.category,
          level: quizConversionPreview.doc.metadata.level || null,
          status: 'draft'
        },
        questions: quizConversionPreview.doc.questions,
        classIds: targetExerciseClassIds
      });
      await onExerciseCreated(id, finalTitle);
      setModalQuiz(null);
      setPanelSuccess(
        `Exercice brouillon créé : « ${finalTitle} ». Le quiz d’origine reste inchangé.`
      );
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Création de l’exercice impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateQuizFromExercise = () => {
    setPanelError('');
    setPanelSuccess('');
    if (!modalExercise) {
      setPanelError('Sélectionnez un exercice à convertir.');
      return;
    }
    if (!modalExercise.questions?.length) {
      setPanelError('Cet exercice ne contient aucune question.');
      return;
    }
    if (targetQuizClassIds.length === 0) {
      setPanelError('Sélectionnez au moins une classe pour créer le quiz.');
      return;
    }
    const finalTitle = targetQuizTitle.trim() || `${modalExercise.title} — Quiz`;
    try {
      const quiz = dataService.createQuiz({
        title: finalTitle,
        description: modalExercise.description || '',
        category: targetQuizCategory,
        level: targetQuizLevel || null,
        class_id: targetQuizClassIds[0],
        class_ids: targetQuizClassIds,
        duration_minutes: Math.max(1, Math.round(targetQuizDuration || 1)),
        questions: modalExercise.questions
      });
      onQuizCreated(quiz);
      setModalExercise(null);
      setPanelSuccess(
        `Nouveau quiz créé : « ${quiz.title} ». L’exercice source et ses tentatives restent inchangés.`
      );
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Création du quiz impossible.');
    }
  };

  return (
    <section className="space-y-4">
      {/* Direction Header & Switcher */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#d8e6ee] bg-white p-4 shadow-[0_6px_20px_rgba(7,42,63,0.03)] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#2fa36b]">
            Passerelle bidirectionnelle
          </p>
          <h2 className="mt-0.5 text-lg font-black text-[#072a3f]">
            Convertir un Quiz en Exercice et vice-versa
          </h2>
          <p className="mt-0.5 text-xs text-[#607f93] sm:text-sm">
            Recherchez et filtrez vos contenus, inspectez leurs questions puis ouvrez la fenêtre de conversion dédiée sans altérer l’original.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sens de conversion"
          className="grid shrink-0 grid-cols-2 gap-1.5 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={direction === 'quiz_to_exercise'}
            onClick={() => {
              setDirection('quiz_to_exercise');
              setPanelError('');
              setPanelSuccess('');
            }}
            className={`inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              direction === 'quiz_to_exercise'
                ? 'bg-[#072a3f] text-white'
                : 'text-[#46657a] hover:text-[#072a3f]'
            }`}
          >
            <span>Quiz</span>
            <ArrowRight size={13} />
            <span>Exercice</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={direction === 'exercise_to_quiz'}
            onClick={() => {
              setDirection('exercise_to_quiz');
              setPanelError('');
              setPanelSuccess('');
            }}
            className={`inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              direction === 'exercise_to_quiz'
                ? 'bg-[#072a3f] text-white'
                : 'text-[#46657a] hover:text-[#072a3f]'
            }`}
          >
            <span>Exercice</span>
            <ArrowRight size={13} />
            <span>Quiz</span>
          </button>
        </div>
      </div>

      {panelError && !modalQuiz && !modalExercise && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <span>{panelError}</span>
          <button
            type="button"
            aria-label="Fermer l’alerte"
            onClick={() => setPanelError('')}
            className="shrink-0 rounded-lg p-1 text-rose-600 hover:bg-rose-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {panelSuccess && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={16} className="shrink-0 text-[#2fa36b]" />
            {panelSuccess}
          </span>
          <div className="flex items-center gap-2">
            {direction === 'quiz_to_exercise' && (
              <button
                type="button"
                onClick={onOpenCatalog}
                className="whitespace-nowrap rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100/60"
              >
                Voir dans le catalogue
              </button>
            )}
            <button
              type="button"
              aria-label="Fermer le message"
              onClick={() => setPanelSuccess('')}
              className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DIRECTION 1: QUIZ -> EXERCICE                                       */}
      {/* =================================================================== */}
      {direction === 'quiz_to_exercise' && (
        <div className="space-y-4">
          {/* Multi-Criteria Quiz Filter Bar */}
          <div className="space-y-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block sm:col-span-2 lg:col-span-1">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Rechercher un quiz
                </span>
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#607f93]"
                  />
                  <input
                    type="search"
                    value={quizFilters.search}
                    onChange={e =>
                      setQuizFilters(prev => ({ ...prev, search: e.target.value }))
                    }
                    placeholder="Titre, question, classe…"
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] py-2 pl-9 pr-3 text-sm text-[#072a3f] placeholder:text-[#89a8bb]"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Statut du quiz
                </span>
                <select
                  aria-label="Filtrer les quiz par statut"
                  value={quizFilters.status}
                  onChange={e =>
                    setQuizFilters(prev => ({
                      ...prev,
                      status: e.target.value as QuizConversionFilters['status']
                    }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="draft">Brouillons</option>
                  <option value="launched">En direct</option>
                  <option value="closed">Clôturés</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Accès
                </span>
                <select
                  aria-label="Filtrer les quiz par visibilité"
                  value={quizFilters.visibility}
                  onChange={e =>
                    setQuizFilters(prev => ({
                      ...prev,
                      visibility: e.target.value as QuizConversionFilters['visibility']
                    }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="all">Publics et privés</option>
                  <option value="public">Publics</option>
                  <option value="private">Privés</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Classe
                </span>
                <select
                  aria-label="Filtrer les quiz par classe"
                  value={quizFilters.classId}
                  onChange={e =>
                    setQuizFilters(prev => ({ ...prev, classId: e.target.value }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="all">Toutes les classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Trier par
                </span>
                <select
                  aria-label="Trier les quiz"
                  value={quizFilters.sortBy}
                  onChange={e =>
                    setQuizFilters(prev => ({
                      ...prev,
                      sortBy: e.target.value as QuizConversionSortOption
                    }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="created_desc">Plus récents</option>
                  <option value="title_asc">Titre (A–Z)</option>
                  <option value="questions_desc">Nombre de questions</option>
                  <option value="duration_desc">Durée (min)</option>
                </select>
              </label>
            </div>

            {quizAdvancedOpen && (
              <div className="grid grid-cols-1 gap-3 border-t border-[#eaf1f6] pt-3 sm:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Catégorie
                  </span>
                  <select
                    aria-label="Filtrer les quiz par catégorie"
                    value={quizFilters.category}
                    onChange={e =>
                      setQuizFilters(prev => ({ ...prev, category: e.target.value }))
                    }
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                  >
                    <option value="all">Toutes les catégories</option>
                    {distinctQuizCategories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Niveau CECRL
                  </span>
                  <select
                    aria-label="Filtrer les quiz par niveau CECRL"
                    value={quizFilters.level}
                    onChange={e =>
                      setQuizFilters(prev => ({
                        ...prev,
                        level: e.target.value as QuizConversionFilters['level']
                      }))
                    }
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                  >
                    <option value="all">Tous les niveaux</option>
                    {CEFR_LEVELS.map(lvl => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                    <option value="none">Non précisé</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Questions minimum
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={quizFilters.minQuestions}
                    onChange={e =>
                      setQuizFilters(prev => ({ ...prev, minQuestions: e.target.value }))
                    }
                    placeholder="Ex. 5"
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm tabular-nums text-[#072a3f]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Questions maximum
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={quizFilters.maxQuestions}
                    onChange={e =>
                      setQuizFilters(prev => ({ ...prev, maxQuestions: e.target.value }))
                    }
                    placeholder="Ex. 25"
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm tabular-nums text-[#072a3f]"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eaf1f6] pt-3">
              <p className="text-xs font-semibold tabular-nums text-[#46657a]" aria-live="polite">
                {filteredQuizzes.length} quiz affiché{filteredQuizzes.length === 1 ? '' : 's'} sur{' '}
                {quizzes.length}
                {activeQuizFilterCount > 0 && ` · ${activeQuizFilterCount} filtre(s) actif(s)`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-expanded={quizAdvancedOpen}
                  onClick={() => setQuizAdvancedOpen(open => !open)}
                  className={`inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    quizAdvancedOpen
                      ? 'border-[#0b3c5d] bg-[#edf5fa] text-[#072a3f]'
                      : 'border-[#cfe1ec] bg-white text-[#46657a] hover:bg-[#f5f9fc]'
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  Filtres avancés
                </button>
                {activeQuizFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuizFilters(DEFAULT_QUIZ_CONVERSION_FILTERS)}
                    className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold text-[#0b3c5d] underline decoration-[#b3cad9] underline-offset-2 hover:text-[#072a3f]"
                  >
                    <RotateCcw size={13} />
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Full-width Quiz Cards Grid */}
          {quizzes.length === 0 ? (
            <div className="rounded-2xl border border-[#d8e6ee] bg-white p-10 text-center">
              <FileText size={32} className="mx-auto text-[#89a8bb]" />
              <h3 className="mt-3 text-base font-extrabold text-[#072a3f]">
                Aucun quiz disponible à convertir
              </h3>
              <p className="mt-1 text-sm text-[#607f93]">
                Créez un quiz dans le module Quiz pour pouvoir le transformer en exercice d’entraînement.
              </p>
            </div>
          ) : filteredQuizzes.length === 0 ? (
            <div className="rounded-2xl border border-[#d8e6ee] bg-white p-10 text-center">
              <Search size={28} className="mx-auto text-[#89a8bb]" />
              <h3 className="mt-3 text-base font-extrabold text-[#072a3f]">
                Aucun quiz ne correspond aux filtres sélectionnés
              </h3>
              <p className="mt-1 text-sm text-[#607f93]">
                Ajustez votre recherche ou réinitialisez les filtres actifs.
              </p>
              <button
                type="button"
                onClick={() => setQuizFilters(DEFAULT_QUIZ_CONVERSION_FILTERS)}
                className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-4 py-2 text-xs font-bold text-[#0b3c5d]"
              >
                <RotateCcw size={14} />
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredQuizzes.map(quiz => {
                const quizClassIds = quiz.class_ids?.length
                  ? quiz.class_ids
                  : quiz.class_id
                  ? [quiz.class_id]
                  : [];
                const assignedClassNames = quizClassIds
                  .map(id => classMap.get(id) || quiz.class_name)
                  .filter(Boolean);

                return (
                  <LearningCard key={quiz.id} active={quiz.status === 'launched'}>
                    <LearningCardHeader
                      kicker={`${quiz.category || 'Autre'}${
                        quiz.level ? ` · ${quiz.level}` : ''
                      } · ${quiz.is_public ? 'Public' : 'Privé'}`}
                      status={getQuizStatusBadge(quiz.status)}
                    />
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="break-words text-base font-extrabold text-[#072a3f]">
                        {quiz.title}
                      </h3>
                      {quiz.description && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-[#46657a]">
                          {quiz.description}
                        </p>
                      )}
                      <p className="truncate text-[11px] font-medium text-[#607f93]">
                        {assignedClassNames.length > 0
                          ? `Classes : ${assignedClassNames.join(', ')}`
                          : 'Aucune classe'}
                        {' · '}
                        Créé le {formatShortDate(quiz.created_at)}
                      </p>
                    </div>

                    <LearningCardMetrics
                      columns={3}
                      items={[
                        { label: 'Questions', value: `${quiz.questions?.length || 0}` },
                        { label: 'Points', value: `${quiz.total_points || 0}` },
                        { label: 'Durée', value: `${quiz.duration_minutes} min` }
                      ]}
                    />

                    <LearningCardFooter>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openQuizConversionModal(quiz)}
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#072a3f] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#0b3c5d]"
                        >
                          <ArrowLeftRight size={14} />
                          Convertir en exercice
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewItem({
                              kind: 'quiz',
                              title: quiz.title,
                              subtitle: `${quiz.questions?.length || 0} question(s) · ${quiz.total_points || 0} pts · ${quiz.duration_minutes} min`,
                              questions: quiz.questions || []
                            })
                          }
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition hover:bg-[#e6f0f7]"
                        >
                          <Eye size={14} />
                          Aperçu
                        </button>
                      </div>
                    </LearningCardFooter>
                  </LearningCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* DIRECTION 2: EXERCICE -> QUIZ                                       */}
      {/* =================================================================== */}
      {direction === 'exercise_to_quiz' && (
        <div className="space-y-4">
          {/* Multi-Criteria Exercise Filter Bar */}
          <div className="space-y-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block sm:col-span-2 lg:col-span-1">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Rechercher un exercice
                </span>
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#607f93]"
                  />
                  <input
                    type="search"
                    value={exerciseFilters.search}
                    onChange={e =>
                      setExerciseFilters(prev => ({ ...prev, search: e.target.value }))
                    }
                    placeholder="Titre, question, classe…"
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] py-2 pl-9 pr-3 text-sm text-[#072a3f] placeholder:text-[#89a8bb]"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Statut
                </span>
                <select
                  aria-label="Filtrer les exercices par statut"
                  value={exerciseFilters.status}
                  onChange={e =>
                    setExerciseFilters(prev => ({
                      ...prev,
                      status: e.target.value as ExerciseCatalogFilters['status']
                    }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="published">Publiés</option>
                  <option value="draft">Brouillons</option>
                  <option value="archived">Archivés</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Classe attribuée
                </span>
                <select
                  aria-label="Filtrer les exercices par classe"
                  value={exerciseFilters.classId}
                  onChange={e =>
                    setExerciseFilters(prev => ({ ...prev, classId: e.target.value }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="all">Toutes les classes</option>
                  <option value="unassigned">Sans classe attribuée</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Niveau CECRL
                </span>
                <select
                  aria-label="Filtrer les exercices par niveau"
                  value={exerciseFilters.level}
                  onChange={e =>
                    setExerciseFilters(prev => ({
                      ...prev,
                      level: e.target.value as ExerciseCatalogFilters['level']
                    }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="all">Tous les niveaux</option>
                  {CEFR_LEVELS.map(lvl => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                  <option value="none">Non précisé</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Trier par
                </span>
                <select
                  aria-label="Trier les exercices à convertir"
                  value={exerciseFilters.sortBy}
                  onChange={e =>
                    setExerciseFilters(prev => ({
                      ...prev,
                      sortBy: e.target.value as ExerciseSortOption
                    }))
                  }
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                >
                  <option value="updated_desc">Plus récents</option>
                  <option value="title_asc">Titre (A–Z)</option>
                  <option value="questions_desc">Nombre de questions</option>
                  <option value="classes_desc">Classes attribuées</option>
                </select>
              </label>
            </div>

            {exerciseAdvancedOpen && (
              <div className="grid grid-cols-1 gap-3 border-t border-[#eaf1f6] pt-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Catégorie
                  </span>
                  <select
                    aria-label="Filtrer les exercices par catégorie"
                    value={exerciseFilters.category}
                    onChange={e =>
                      setExerciseFilters(prev => ({ ...prev, category: e.target.value }))
                    }
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                  >
                    <option value="all">Toutes les catégories</option>
                    {distinctExerciseCategories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Questions minimum
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={exerciseFilters.minQuestions}
                    onChange={e =>
                      setExerciseFilters(prev => ({ ...prev, minQuestions: e.target.value }))
                    }
                    placeholder="Ex. 3"
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm tabular-nums text-[#072a3f]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Questions maximum
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={exerciseFilters.maxQuestions}
                    onChange={e =>
                      setExerciseFilters(prev => ({ ...prev, maxQuestions: e.target.value }))
                    }
                    placeholder="Ex. 20"
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm tabular-nums text-[#072a3f]"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eaf1f6] pt-3">
              <p className="text-xs font-semibold tabular-nums text-[#46657a]" aria-live="polite">
                {filteredExercises.length} exercice{filteredExercises.length === 1 ? '' : 's'} affiché
                {filteredExercises.length === 1 ? '' : 's'} sur {exercises.length}
                {activeExerciseFilterCount > 0 && ` · ${activeExerciseFilterCount} filtre(s) actif(s)`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-expanded={exerciseAdvancedOpen}
                  onClick={() => setExerciseAdvancedOpen(open => !open)}
                  className={`inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    exerciseAdvancedOpen
                      ? 'border-[#0b3c5d] bg-[#edf5fa] text-[#072a3f]'
                      : 'border-[#cfe1ec] bg-white text-[#46657a] hover:bg-[#f5f9fc]'
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  Filtres avancés
                </button>
                {activeExerciseFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setExerciseFilters(DEFAULT_EXERCISE_CATALOG_FILTERS)}
                    className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold text-[#0b3c5d] underline decoration-[#b3cad9] underline-offset-2 hover:text-[#072a3f]"
                  >
                    <RotateCcw size={13} />
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Full-width Exercise Cards Grid */}
          {exercises.length === 0 ? (
            <div className="rounded-2xl border border-[#d8e6ee] bg-white p-10 text-center">
              <FileText size={32} className="mx-auto text-[#89a8bb]" />
              <h3 className="mt-3 text-base font-extrabold text-[#072a3f]">
                Aucun exercice disponible à convertir
              </h3>
              <p className="mt-1 text-sm text-[#607f93]">
                Créez un exercice ou convertissez d’abord un quiz existant.
              </p>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="rounded-2xl border border-[#d8e6ee] bg-white p-10 text-center">
              <Search size={28} className="mx-auto text-[#89a8bb]" />
              <h3 className="mt-3 text-base font-extrabold text-[#072a3f]">
                Aucun exercice ne correspond aux filtres sélectionnés
              </h3>
              <button
                type="button"
                onClick={() => setExerciseFilters(DEFAULT_EXERCISE_CATALOG_FILTERS)}
                className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-4 py-2 text-xs font-bold text-[#0b3c5d]"
              >
                <RotateCcw size={14} />
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredExercises.map(item => {
                const assignedClassNames = (item.class_ids || [])
                  .map(id => classMap.get(id))
                  .filter(Boolean);
                const totalSeconds = (item.questions || []).reduce(
                  (sum, q) => sum + Number(q.time_limit_seconds || 0),
                  0
                );

                return (
                  <LearningCard key={item.id} active={item.status === 'published'}>
                    <LearningCardHeader
                      kicker={`${item.category || 'Autre'}${
                        item.level ? ` · ${item.level}` : ''
                      } · v${item.current_version_number || 1}`}
                      status={getExerciseStatusBadge(item.status)}
                    />
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="break-words text-base font-extrabold text-[#072a3f]">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-[#46657a]">
                          {item.description}
                        </p>
                      )}
                      <p className="truncate text-[11px] font-medium text-[#607f93]">
                        {assignedClassNames.length > 0
                          ? `Classes : ${assignedClassNames.join(', ')}`
                          : 'Aucune classe attribuée'}
                        {' · '}
                        Mis à jour le {formatShortDate(item.updated_at || item.created_at)}
                      </p>
                    </div>

                    <LearningCardMetrics
                      columns={3}
                      items={[
                        { label: 'Questions', value: `${item.questions.length}` },
                        { label: 'Classes', value: `${item.class_ids.length}` },
                        { label: 'Durée', value: formatExerciseTotalDuration(totalSeconds) }
                      ]}
                    />

                    <LearningCardFooter>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openExerciseConversionModal(item)}
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#072a3f] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#0b3c5d]"
                        >
                          <ArrowLeftRight size={14} />
                          Convertir en quiz
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewItem({
                              kind: 'exercise',
                              title: item.title,
                              subtitle: `${item.questions.length} question(s) · ${formatExerciseTotalDuration(totalSeconds)}`,
                              questions: item.questions || []
                            })
                          }
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition hover:bg-[#e6f0f7]"
                        >
                          <Eye size={14} />
                          Aperçu
                        </button>
                      </div>
                    </LearningCardFooter>
                  </LearningCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: CONVERTIR QUIZ -> EXERCICE                                 */}
      {/* =================================================================== */}
      {modalQuiz && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-quiz-to-ex-title"
          onClick={e => {
            if (e.target === e.currentTarget && !submitting) setModalQuiz(null);
          }}
        >
          <section className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#d8e6ee] bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-[#eaf1f6] bg-[#f7fafc] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2fa36b]">
                  Conversion Quiz → Exercice
                </p>
                <h3
                  id="modal-quiz-to-ex-title"
                  className="mt-0.5 truncate text-lg font-black text-[#072a3f]"
                >
                  {modalQuiz.title}
                </h3>
                <p className="mt-0.5 text-xs text-[#607f93]">
                  Le quiz original reste totalement inchangé. Chaque question conserve son chronomètre individuel.
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                aria-label="Fermer la fenêtre de conversion"
                onClick={() => setModalQuiz(null)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#d8e6ee] bg-white px-3 py-1.5 text-xs font-bold text-[#46657a] hover:bg-[#f5f9fc]"
              >
                <X size={15} />
                Fermer
              </button>
            </header>

            <div className="space-y-4 overflow-y-auto p-5">
              {panelError && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                  {panelError}
                </p>
              )}

              <label className="block space-y-1 text-xs font-bold text-[#315267]">
                <span>Titre du nouvel exercice</span>
                <input
                  value={targetExerciseTitle}
                  onChange={e => setTargetExerciseTitle(e.target.value)}
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-normal text-[#072a3f]"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#315267]">
                    Classes à attribuer ({targetExerciseClassIds.length})
                  </span>
                  {classes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setTargetExerciseClassIds(
                          targetExerciseClassIds.length === classes.length
                            ? []
                            : classes.map(c => c.id)
                        )
                      }
                      className="text-xs font-bold text-[#0b3c5d] underline decoration-[#b3cad9] underline-offset-2"
                    >
                      {targetExerciseClassIds.length === classes.length
                        ? 'Tout décocher'
                        : 'Tout cocher'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {classes.map(c => {
                    const checked = targetExerciseClassIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                          checked
                            ? 'border-[#2fa36b] bg-[#eef9f3] text-[#145c3d]'
                            : 'border-[#d8e6ee] bg-[#f7fafc] text-[#46657a]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e =>
                            setTargetExerciseClassIds(old =>
                              e.target.checked
                                ? [...old, c.id]
                                : old.filter(id => id !== c.id)
                            )
                          }
                        />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {quizConversionPreview.error ? (
                <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">
                  {quizConversionPreview.error}
                </p>
              ) : (
                quizConversionPreview.doc && (
                  <div className="space-y-2.5 rounded-xl border border-[#e5eff5] bg-[#f7fafc] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#072a3f]">
                      <span>
                        Aperçu des {quizConversionPreview.doc.questions.length} question(s)
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums text-[#0b3c5d]">
                        <Clock size={13} />
                        Durée totale :{' '}
                        {formatExerciseTotalDuration(
                          quizConversionPreview.doc.questions.reduce(
                            (sum, q) => sum + Number(q.time_limit_seconds || 0),
                            0
                          )
                        )}
                      </span>
                    </div>
                    <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-xs">
                      {quizConversionPreview.doc.questions.map((q, idx) => (
                        <li
                          key={q.id}
                          className="flex items-center justify-between gap-2 border-b border-[#e5eff5] pb-1.5 last:border-0 last:pb-0"
                        >
                          <span className="min-w-0 truncate text-[#315267]">
                            <strong className="text-[#072a3f]">{idx + 1}.</strong>{' '}
                            <span className="text-[11px] font-bold uppercase text-[#607f93]">
                              [{getQuestionTypeLabel(q.type)}]
                            </span>{' '}
                            {q.question}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-[#0b3c5d]">
                            {q.time_limit_seconds} s
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaf1f6] bg-[#f7fafc] px-5 py-3.5">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setModalQuiz(null)}
                className="inline-flex min-h-10 items-center rounded-xl border border-[#d8e6ee] bg-white px-4 py-2 text-xs font-semibold text-[#46657a] hover:bg-[#f5f9fc]"
              >
                Annuler
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={submitting || !quizConversionPreview.doc}
                  onClick={handleOpenInEditor}
                  className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#072a3f] bg-white px-4 py-2 text-xs font-bold text-[#072a3f] transition hover:bg-[#f5f9fc] disabled:opacity-40"
                >
                  <PenSquare size={14} />
                  Ajuster dans l’éditeur
                </button>
                <button
                  type="button"
                  disabled={submitting || !quizConversionPreview.doc}
                  onClick={() => void handleCreateExerciseDirectly()}
                  className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#2fa36b] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#268d5b] disabled:opacity-40"
                >
                  <Plus size={14} />
                  {submitting ? 'Création…' : 'Créer en brouillon'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: CONVERTIR EXERCICE -> QUIZ                                 */}
      {/* =================================================================== */}
      {modalExercise && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-ex-to-quiz-title"
          onClick={e => {
            if (e.target === e.currentTarget) setModalExercise(null);
          }}
        >
          <section className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#d8e6ee] bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-[#eaf1f6] bg-[#f7fafc] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2fa36b]">
                  Conversion Exercice → Quiz
                </p>
                <h3
                  id="modal-ex-to-quiz-title"
                  className="mt-0.5 truncate text-lg font-black text-[#072a3f]"
                >
                  {modalExercise.title}
                </h3>
                <p className="mt-0.5 text-xs text-[#607f93]">
                  L’exercice source et les tentatives des élèves restent intacts.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer la fenêtre de conversion"
                onClick={() => setModalExercise(null)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#d8e6ee] bg-white px-3 py-1.5 text-xs font-bold text-[#46657a] hover:bg-[#f5f9fc]"
              >
                <X size={15} />
                Fermer
              </button>
            </header>

            <div className="space-y-4 overflow-y-auto p-5">
              {panelError && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                  {panelError}
                </p>
              )}

              <label className="block space-y-1 text-xs font-bold text-[#315267]">
                <span>Titre du nouveau quiz</span>
                <input
                  value={targetQuizTitle}
                  onChange={e => setTargetQuizTitle(e.target.value)}
                  className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-normal text-[#072a3f]"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1 text-xs font-bold text-[#315267]">
                  <span>Catégorie du quiz</span>
                  <select
                    value={targetQuizCategory}
                    onChange={e => setTargetQuizCategory(e.target.value as QuizCategory)}
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-medium text-[#072a3f]"
                  >
                    {QUIZ_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1 text-xs font-bold text-[#315267]">
                  <span>Niveau</span>
                  <select
                    value={targetQuizLevel}
                    onChange={e => setTargetQuizLevel(e.target.value as CEFRLevel | '')}
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-medium text-[#072a3f]"
                  >
                    <option value="">Non précisé</option>
                    {CEFR_LEVELS.map(lvl => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1 text-xs font-bold text-[#315267]">
                  <span>Durée globale (min)</span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={targetQuizDuration}
                    onChange={e => setTargetQuizDuration(Math.max(1, Number(e.target.value)))}
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm tabular-nums text-[#072a3f]"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#315267]">
                    Classes du quiz * ({targetQuizClassIds.length})
                  </span>
                  {classes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setTargetQuizClassIds(
                          targetQuizClassIds.length === classes.length
                            ? []
                            : classes.map(c => c.id)
                        )
                      }
                      className="text-xs font-bold text-[#0b3c5d] underline decoration-[#b3cad9] underline-offset-2"
                    >
                      {targetQuizClassIds.length === classes.length
                        ? 'Tout décocher'
                        : 'Tout cocher'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {classes.map(c => {
                    const checked = targetQuizClassIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                          checked
                            ? 'border-[#2fa36b] bg-[#eef9f3] text-[#145c3d]'
                            : 'border-[#d8e6ee] bg-[#f7fafc] text-[#46657a]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e =>
                            setTargetQuizClassIds(old =>
                              e.target.checked
                                ? [...old, c.id]
                                : old.filter(id => id !== c.id)
                            )
                          }
                        />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
                {targetQuizClassIds.length === 0 && (
                  <p className="text-xs text-amber-800">
                    Sélectionnez au moins une classe pour créer le quiz.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-[#e5eff5] bg-[#f7fafc] p-3.5 text-xs text-[#46657a]">
                <strong className="text-[#072a3f]">
                  {modalExercise.questions.length} question(s)
                </strong>{' '}
                seront copiées avec leurs barèmes et chronomètres individuels.
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaf1f6] bg-[#f7fafc] px-5 py-3.5">
              <button
                type="button"
                onClick={() => setModalExercise(null)}
                className="inline-flex min-h-10 items-center rounded-xl border border-[#d8e6ee] bg-white px-4 py-2 text-xs font-semibold text-[#46657a] hover:bg-[#f5f9fc]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  targetQuizClassIds.length === 0 || modalExercise.questions.length === 0
                }
                onClick={handleCreateQuizFromExercise}
                className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#072a3f] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#0b3c5d] disabled:opacity-40"
              >
                <ArrowLeftRight size={14} />
                Créer le quiz
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: APERÇU RAPIDE DES QUESTIONS                                */}
      {/* =================================================================== */}
      {previewItem && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-preview-title"
          onClick={e => {
            if (e.target === e.currentTarget) setPreviewItem(null);
          }}
        >
          <section className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#d8e6ee] bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-[#eaf1f6] bg-[#f7fafc] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2fa36b]">
                  {previewItem.kind === 'quiz' ? 'Aperçu du quiz' : 'Aperçu de l’exercice'}
                </p>
                <h3
                  id="modal-preview-title"
                  className="mt-0.5 truncate text-lg font-black text-[#072a3f]"
                >
                  {previewItem.title}
                </h3>
                <p className="mt-0.5 text-xs tabular-nums text-[#607f93]">
                  {previewItem.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#d8e6ee] bg-white px-3 py-1.5 text-xs font-bold text-[#46657a] hover:bg-[#f5f9fc]"
              >
                <X size={15} />
                Fermer
              </button>
            </header>

            <div className="space-y-2.5 overflow-y-auto p-5">
              {previewItem.questions.length === 0 ? (
                <p className="text-sm text-[#607f93]">Aucune question enregistrée.</p>
              ) : (
                previewItem.questions.map((q, idx) => (
                  <article
                    key={q.id || idx}
                    className="rounded-xl border border-[#e5eff5] bg-[#f7fafc] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#607f93]">
                      <span className="uppercase">
                        Question {idx + 1} · {getQuestionTypeLabel(q.type)}
                      </span>
                      <span className="tabular-nums text-[#0b3c5d]">
                        {q.points || 1} pt(s)
                        {q.time_limit_seconds ? ` · ${q.time_limit_seconds} s` : ''}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-[#072a3f]">{q.question}</p>
                    {q.explanation && (
                      <p className="mt-1 text-xs text-[#607f93]">{q.explanation}</p>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
};
