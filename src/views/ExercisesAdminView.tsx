import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Download,
  Edit3,
  FileText,
  FolderOpen,
  PenSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Upload,
  Users,
  X
} from 'lucide-react';
import {
  CEFR_LEVELS,
  QUIZ_CATEGORIES,
  type CEFRLevel,
  type ClassRoom,
  type ExerciseDefinition,
  type ExerciseStatus,
  type Quiz,
  type QuizQuestion
} from '../types';
import { dataService } from '../services/dataService';
import {
  exerciseService,
  parseExerciseJson
} from '../services/exerciseService';
import { StudentAvatar } from '../components/StudentAvatar';
import {
  ExerciseQuizConverterPanel,
  type ConverterDirection
} from '../components/ExerciseQuizConverterPanel';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  LearningModuleHeader,
  StatusBadge
} from '../components/LearningCard';
import {
  DEFAULT_ATTEMPT_FILTERS,
  DEFAULT_EXERCISE_CATALOG_FILTERS,
  countActiveAttemptFilters,
  buildExercisePedagogicalDiagnostic,
  PEDAGOGICAL_MASTERY_THRESHOLD,
  countActiveExerciseFilters,
  filterAndSortAttempts,
  filterAndSortExercises,
  formatExerciseTotalDuration,
  getAttemptPercentage,
  getDistinctExerciseCategories,
  type AttemptFilters,
  type AttemptProgressFilter,
  type AttemptScoreBandFilter,
  type AttemptSortOption,
  type ExerciseCatalogFilters,
  type ExerciseSortOption,
  type TeacherExerciseAttemptRow
} from '../utils/exerciseAdminFilters';

interface Props {
  classes: ClassRoom[];
}

type WorkspaceMode = 'catalog' | 'editor' | 'converter' | 'attempts';

const EMPTY_JSON = JSON.stringify(
  {
    schema: 'perckylingua.exercise',
    schema_version: 1,
    metadata: {
      title: 'Nouvel exercice',
      description: '',
      category: 'Grammaire',
      level: 'A1'
    },
    questions: [
      {
        id: 'q1',
        type: 'qcm',
        question: 'Scegli la risposta corretta.',
        options: ['A', 'B', 'C'],
        correct_answer: 'A',
        points: 1,
        time_limit_seconds: 20,
        explanation: ''
      }
    ]
  },
  null,
  2
);

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

function formatDateTime(iso?: string | null): string {
  if (!iso) return 'Aucune activité';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Aucune activité';
  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function getExerciseStatusBadge(status: ExerciseStatus) {
  if (status === 'published') {
    return <StatusBadge tone="success">Publié</StatusBadge>;
  }
  if (status === 'archived') {
    return <StatusBadge tone="neutral">Archivé</StatusBadge>;
  }
  return <StatusBadge tone="warning">Brouillon</StatusBadge>;
}

export const ExercisesAdminView: React.FC<Props> = ({ classes }) => {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('catalog');
  const [items, setItems] = useState<ExerciseDefinition[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  // CRUD editor state
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Grammaire');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState<ExerciseStatus>('draft');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [json, setJson] = useState(EMPTY_JSON);

  // Feedback & loading
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Catalog multi-criteria filters
  const [catalogFilters, setCatalogFilters] = useState<ExerciseCatalogFilters>(
    DEFAULT_EXERCISE_CATALOG_FILTERS
  );
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

  // Converter workspace state
  const [converterDirection, setConverterDirection] =
    useState<ConverterDirection>('quiz_to_exercise');
  const [converterExerciseId, setConverterExerciseId] = useState('');
  const [converterAutoOpenModal, setConverterAutoOpenModal] = useState(false);

  // Attempts & analytics state
  const [attemptsExerciseId, setAttemptsExerciseId] = useState('');
  const [attempts, setAttempts] = useState<TeacherExerciseAttemptRow[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptFilters, setAttemptFilters] = useState<AttemptFilters>(DEFAULT_ATTEMPT_FILTERS);
  const [reviewStudent, setReviewStudent] = useState<TeacherExerciseAttemptRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await exerciseService.listTeacherExercises();
      setItems(loaded);
      setQuizzes(dataService.getQuizzes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const jsonValidation = useMemo(() => {
    try {
      return { doc: parseExerciseJson(json), error: null as string | null };
    } catch (e) {
      return {
        doc: null,
        error: e instanceof Error ? e.message : 'Le JSON est invalide.'
      };
    }
  }, [json]);

  const parsed = jsonValidation.doc;

  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c.name])), [classes]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>([...QUIZ_CATEGORIES, ...getDistinctExerciseCategories(items)]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [items]);

  const catalogStats = useMemo(() => {
    const published = items.filter(i => i.status === 'published').length;
    const draft = items.filter(i => i.status === 'draft').length;
    const archived = items.filter(i => i.status === 'archived').length;
    return { total: items.length, published, draft, archived };
  }, [items]);

  const filteredExercises = useMemo(
    () => filterAndSortExercises(items, classes, catalogFilters),
    [items, classes, catalogFilters]
  );

  const activeCatalogFilterCount = useMemo(
    () => countActiveExerciseFilters(catalogFilters),
    [catalogFilters]
  );

  const activeAttemptsExercise = useMemo(
    () => items.find(item => item.id === attemptsExerciseId) || null,
    [items, attemptsExerciseId]
  );

  const availableAttemptClasses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of classes) {
      if (activeAttemptsExercise?.class_ids?.includes(c.id)) {
        seen.set(c.id, c.name);
      }
    }
    for (const row of attempts) {
      if (row.class_id && row.class_name && !seen.has(row.class_id)) {
        seen.set(row.class_id, row.class_name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [classes, activeAttemptsExercise, attempts]);

  const filteredAttempts = useMemo(
    () => filterAndSortAttempts(attempts, attemptFilters),
    [attempts, attemptFilters]
  );

  const activeAttemptFilterCount = useMemo(
    () => countActiveAttemptFilters(attemptFilters),
    [attemptFilters]
  );

  const attemptSummary = useMemo(() => {
    const completed = filteredAttempts.filter(row => row.status === 'completed').length;
    const inProgress = filteredAttempts.filter(row => row.status === 'in_progress').length;
    const notStarted = filteredAttempts.length - completed - inProgress;
    return {
      total: filteredAttempts.length,
      completed,
      inProgress,
      notStarted
    };
  }, [filteredAttempts]);

  const performanceSummary = useMemo(() => {
    const scored = filteredAttempts.filter(row => getAttemptPercentage(row) !== null);
    const percentages = scored
      .map(row => getAttemptPercentage(row))
      .filter((v): v is number => v !== null);
    const average = percentages.length
      ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
      : null;
    return {
      average,
      successRate: percentages.length
        ? (percentages.filter(value => value >= PEDAGOGICAL_MASTERY_THRESHOLD).length / percentages.length) * 100
        : null,
      completionRate: filteredAttempts.length
        ? (filteredAttempts.filter(row => row.status === 'completed').length /
            filteredAttempts.length) *
          100
        : 0,
      scoredCount: scored.length,
      averageAttempts: filteredAttempts.length
        ? filteredAttempts.reduce((sum, row) => sum + Number(row.attempt_count || 0), 0) /
          filteredAttempts.length
        : 0
    };
  }, [filteredAttempts]);

  const scoreDistribution = useMemo(
    () =>
      [
        { label: '0–20 %', min: 0, max: 20 },
        { label: '21–40 %', min: 20, max: 40 },
        { label: '41–60 %', min: 40, max: 60 },
        { label: '61–80 %', min: 60, max: 80 },
        { label: '81–100 %', min: 80, max: 100.001 }
      ].map(range => ({
        ...range,
        count: filteredAttempts.filter(row => {
          const pct = getAttemptPercentage(row);
          return pct !== null && pct >= range.min && pct < range.max;
        }).length
      })),
    [filteredAttempts]
  );

  const pedagogicalDiagnostic = useMemo(
    () => buildExercisePedagogicalDiagnostic(filteredAttempts, PEDAGOGICAL_MASTERY_THRESHOLD),
    [filteredAttempts]
  );

  const questionStats = useMemo(
    () => {
      const questions = new Map<string, { question: QuizQuestion; versionId: string }>();
      for (const row of filteredAttempts) {
        for (const question of row.best_questions || []) {
          questions.set(`${row.best_version_id || 'legacy'}:${question.id}`, { question, versionId: row.best_version_id || 'legacy' });
        }
      }
      return Array.from(questions.values()).map(({ question, versionId }) => {
        const responses = filteredAttempts
          .flatMap(row => (row.best_details || []).map(detail => ({ row, detail })))
          .filter(item => item.detail.question_id === question.id && (item.row.best_version_id || 'legacy') === versionId);
        const correct = responses.filter(item => item.detail.correct).length;
        const points = responses.reduce((sum, item) => sum + Number(item.detail.points || 0), 0);
        const maxPoints = responses.reduce((sum, item) => sum + Number(item.detail.max_points || 0), 0);
        return {
          id: `${versionId}:${question.id}`,
          label: question.question,
          competency: question.competency || 'Compétence à renseigner',
          responses: responses.length,
          correct,
          rate: maxPoints > 0 ? Math.round((points / maxPoints) * 100) : null,
          points,
          maxPoints,
          studentsNeedingSupport: responses.filter(item =>
            Number(item.detail.max_points) > 0 &&
            (Number(item.detail.points || 0) / Number(item.detail.max_points)) * 100 < PEDAGOGICAL_MASTERY_THRESHOLD
          ).map(item => item.row)
        };
      });
    },
    [filteredAttempts]
  );

  const populateEditorFromItem = (item: ExerciseDefinition) => {
    setSelectedId(item.id);
    setTitle(item.title);
    setDescription(item.description || '');
    setCategory(item.category || 'Autre');
    setLevel(item.level || '');
    setStatus(item.status);
    setClassIds(item.class_ids || []);
    setJson(
      JSON.stringify(
        {
          schema: 'perckylingua.exercise',
          schema_version: 1,
          metadata: {
            title: item.title,
            description: item.description || '',
            category: item.category,
            level: item.level || null
          },
          questions: item.questions
        },
        null,
        2
      )
    );
    setError('');
    setMessage('');
    setWorkspaceMode('editor');
  };

  const resetEditor = () => {
    setSelectedId('');
    setTitle('');
    setDescription('');
    setCategory('Grammaire');
    setLevel('');
    setStatus('draft');
    setClassIds([]);
    setJson(EMPTY_JSON);
    setError('');
    setMessage('');
    setWorkspaceMode('editor');
  };

  const loadAttemptsForExercise = useCallback(async (exerciseId: string, resetFilters = true) => {
    if (!exerciseId) {
      setAttempts([]);
      return;
    }
    setError('');
    setReviewStudent(null);
    if (resetFilters) {
      setAttemptFilters(DEFAULT_ATTEMPT_FILTERS);
    }
    setAttemptsExerciseId(exerciseId);
    setAttemptsLoading(true);
    try {
      const data = await exerciseService.listTeacherAttempts(exerciseId);
      setAttempts(data as TeacherExerciseAttemptRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Résultats indisponibles.');
      setAttempts([]);
    } finally {
      setAttemptsLoading(false);
    }
  }, []);

  const openAttemptsForExercise = async (item: ExerciseDefinition) => {
    setMessage('');
    setWorkspaceMode('attempts');
    await loadAttemptsForExercise(item.id, true);
  };

  const openAttemptsWorkspace = async () => {
    setMessage('');
    setWorkspaceMode('attempts');
    const targetId =
      attemptsExerciseId && items.some(i => i.id === attemptsExerciseId)
        ? attemptsExerciseId
        : selectedId && items.some(i => i.id === selectedId)
        ? selectedId
        : items.find(i => i.status === 'published')?.id || items[0]?.id || '';
    if (targetId && (targetId !== attemptsExerciseId || attempts.length === 0)) {
      await loadAttemptsForExercise(targetId, true);
    }
  };

  const persistExercise = async (targetStatus: ExerciseStatus) => {
    setError('');
    setMessage('');
    try {
      const document = parseExerciseJson(json);
      const finalTitle = title.trim() || document.metadata.title;
      if (!finalTitle) throw new Error('Le titre est obligatoire.');
      if (targetStatus === 'published' && classIds.length === 0) {
        throw new Error('Attribuez au moins une classe avant de publier.');
      }
      setLoading(true);
      const id = await exerciseService.saveDefinition({
        id: selectedId || null,
        metadata: {
          title: finalTitle,
          description,
          category,
          level: level || null,
          status: targetStatus === 'published' ? 'draft' : targetStatus
        },
        questions: document.questions,
        classIds
      });
      if (targetStatus === 'published') {
        await exerciseService.publishExercise(id);
      }
      setSelectedId(id);
      setStatus(targetStatus);
      setMessage(
        targetStatus === 'published'
          ? 'Exercice publié et attribué aux classes sélectionnées.'
          : targetStatus === 'archived'
          ? 'Exercice archivé.'
          : 'Exercice enregistré en brouillon.'
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLifecycleChange = async (
    item: ExerciseDefinition,
    targetStatus: ExerciseStatus
  ) => {
    setError('');
    setMessage('');
    if (targetStatus === 'published' && item.class_ids.length === 0) {
      populateEditorFromItem(item);
      setError('Attribuez au moins une classe à cet exercice avant de le publier.');
      return;
    }
    setLoading(true);
    try {
      const id = await exerciseService.saveDefinition({
        id: item.id,
        metadata: {
          title: item.title,
          description: item.description || '',
          category: item.category,
          level: item.level || null,
          status: targetStatus === 'published' ? 'draft' : targetStatus
        },
        questions: item.questions,
        classIds: item.class_ids
      });
      if (targetStatus === 'published') {
        await exerciseService.publishExercise(id);
      }
      setMessage(
        targetStatus === 'published'
          ? `« ${item.title} » est désormais publié.`
          : targetStatus === 'archived'
          ? `« ${item.title} » a été archivé.`
          : `« ${item.title} » est repassé en brouillon.`
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mise à jour du statut impossible.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionTimerChange = (questionId: string, seconds: number) => {
    try {
      const document = parseExerciseJson(json);
      const safeSeconds = Number.isFinite(seconds) ? Math.max(1, Math.min(3600, Math.floor(seconds))) : 1;
      const questions = document.questions.map(question =>
        question.id === questionId ? { ...question, time_limit_seconds: safeSeconds } : question
      );
      setJson(JSON.stringify({ ...document, questions }, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification du chronomètre impossible.');
    }
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const doc = parseExerciseJson(text);
      setTitle(doc.metadata.title);
      setDescription(doc.metadata.description);
      setCategory(doc.metadata.category);
      setLevel(doc.metadata.level || '');
      setJson(JSON.stringify(doc, null, 2));
      setSelectedId('');
      setClassIds([]);
      setStatus('draft');
      setMessage(
        'Fichier validé. Vérifiez le contenu et choisissez les classes avant enregistrement.'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import JSON impossible.');
    }
  };

  const openConverterWorkspace = (
    direction: ConverterDirection = 'quiz_to_exercise',
    exerciseId = '',
    autoOpenModal = false
  ) => {
    setError('');
    setMessage('');
    setConverterDirection(direction);
    setConverterExerciseId(exerciseId);
    setConverterAutoOpenModal(autoOpenModal);
    setWorkspaceMode('converter');
  };

  const exportJson = () => {
    try {
      const doc = parseExerciseJson(json);
      const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download =
        (title || doc.metadata.title || 'exercice')
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-') + '.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export impossible.');
    }
  };

  const totalEditorSeconds = useMemo(
    () =>
      parsed
        ? parsed.questions.reduce((sum, q) => sum + Number(q.time_limit_seconds || 0), 0)
        : 0,
    [parsed]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <LearningModuleHeader
        kicker="Entraînement autonome"
        title="Module Exercices"
        description="Gérez la création et la publication de vos exercices (CRUD), puis analysez les tentatives et la progression des élèves."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-white px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition hover:bg-[#f5f9fc] disabled:opacity-50 sm:text-sm"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Actualiser
            </button>
            <button
              type="button"
              onClick={resetEditor}
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[#072a3f] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0b3c5d] sm:text-sm"
            >
              <Plus size={16} />
              Nouvel exercice
            </button>
          </div>
        }
      />

      {/* Segmented Workspace Navigation: CRUD, Conversion & Tentatives */}
      <nav
        aria-label="Espaces du module exercices"
        role="tablist"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-[#d8e6ee] bg-white p-1.5 shadow-[0_4px_14px_rgba(7,42,63,0.03)] sm:grid-cols-2 lg:grid-cols-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={workspaceMode === 'catalog'}
          onClick={() => setWorkspaceMode('catalog')}
          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left transition ${
            workspaceMode === 'catalog'
              ? 'bg-[#072a3f] text-white'
              : 'text-[#46657a] hover:bg-[#f3f8fb] hover:text-[#072a3f]'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <FolderOpen size={17} className="shrink-0" />
            <span className="truncate text-sm font-bold">Catalogue & Gestion</span>
          </span>
          <span
            className={`shrink-0 text-xs font-extrabold tabular-nums ${
              workspaceMode === 'catalog' ? 'text-emerald-300' : 'text-[#607f93]'
            }`}
          >
            {items.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={workspaceMode === 'editor'}
          onClick={() => setWorkspaceMode('editor')}
          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left transition ${
            workspaceMode === 'editor'
              ? 'bg-[#072a3f] text-white'
              : 'text-[#46657a] hover:bg-[#f3f8fb] hover:text-[#072a3f]'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <PenSquare size={17} className="shrink-0" />
            <span className="truncate text-sm font-bold">Éditeur CRUD</span>
          </span>
          <span
            className={`shrink-0 text-[11px] font-bold whitespace-nowrap ${
              workspaceMode === 'editor' ? 'text-emerald-300' : 'text-[#607f93]'
            }`}
          >
            {selectedId ? 'Édition' : 'Création'}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={workspaceMode === 'converter'}
          onClick={() => openConverterWorkspace(converterDirection, selectedId || '')}
          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left transition ${
            workspaceMode === 'converter'
              ? 'bg-[#072a3f] text-white'
              : 'text-[#46657a] hover:bg-[#f3f8fb] hover:text-[#072a3f]'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <ArrowLeftRight size={17} className="shrink-0" />
            <span className="truncate text-sm font-bold">Passerelle Quiz ↔ Ex.</span>
          </span>
          <span
            className={`shrink-0 text-[11px] font-bold whitespace-nowrap ${
              workspaceMode === 'converter' ? 'text-emerald-300' : 'text-[#607f93]'
            }`}
          >
            {quizzes.length} quiz
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={workspaceMode === 'attempts'}
          onClick={() => void openAttemptsWorkspace()}
          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left transition ${
            workspaceMode === 'attempts'
              ? 'bg-[#072a3f] text-white'
              : 'text-[#46657a] hover:bg-[#f3f8fb] hover:text-[#072a3f]'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <BarChart3 size={17} className="shrink-0" />
            <span className="truncate text-sm font-bold">Tentatives & Suivi</span>
          </span>
          <span
            className={`shrink-0 text-[11px] font-bold whitespace-nowrap ${
              workspaceMode === 'attempts' ? 'text-emerald-300' : 'text-[#607f93]'
            }`}
          >
            {activeAttemptsExercise ? `${attempts.length} élève(s)` : 'Analyse'}
          </span>
        </button>
      </nav>

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <span>{error}</span>
          <button
            type="button"
            aria-label="Fermer l’alerte"
            onClick={() => setError('')}
            className="shrink-0 rounded-lg p-1 text-rose-600 hover:bg-rose-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {message && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <span>{message}</span>
          <button
            type="button"
            aria-label="Fermer le message"
            onClick={() => setMessage('')}
            className="shrink-0 rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODE 1: CATALOGUE & GESTION (READ / SEARCH / FILTER / LIFECYCLE CRUD) */}
      {/* ===================================================================== */}
      {workspaceMode === 'catalog' && (
        <section className="space-y-4">
          {/* Compact KPI Strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#d8e6ee] bg-white px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#607f93]">
                Total exercices
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#072a3f]">
                {catalogStats.total}
              </p>
            </div>
            <div className="rounded-2xl border border-[#bfe3ce] bg-[#eef9f3]/70 px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#17613e]">
                Publiés
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#145c3d]">
                {catalogStats.published}
              </p>
            </div>
            <div className="rounded-2xl border border-[#eed9aa] bg-[#fef9ec]/70 px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8a5108]">
                Brouillons
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#8a5108]">
                {catalogStats.draft}
              </p>
            </div>
            <div className="rounded-2xl border border-[#dde7ee] bg-[#f5f8fa] px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#4c697c]">
                Archivés
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#4c697c]">
                {catalogStats.archived}
              </p>
            </div>
          </div>

          {/* Multi-Criteria Search & Filters */}
          <div className="space-y-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 shadow-[0_6px_20px_rgba(7,42,63,0.03)] sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="relative block sm:col-span-2 lg:col-span-1">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                  Recherche
                </span>
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#607f93]"
                  />
                  <input
                    type="search"
                    value={catalogFilters.search}
                    onChange={e =>
                      setCatalogFilters(prev => ({ ...prev, search: e.target.value }))
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
                  aria-label="Filtrer par statut"
                  value={catalogFilters.status}
                  onChange={e =>
                    setCatalogFilters(prev => ({
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
                  aria-label="Filtrer par classe"
                  value={catalogFilters.classId}
                  onChange={e =>
                    setCatalogFilters(prev => ({ ...prev, classId: e.target.value }))
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
                  aria-label="Filtrer par niveau CECRL"
                  value={catalogFilters.level}
                  onChange={e =>
                    setCatalogFilters(prev => ({
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
                  aria-label="Trier les exercices"
                  value={catalogFilters.sortBy}
                  onChange={e =>
                    setCatalogFilters(prev => ({
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

            {advancedFiltersOpen && (
              <div className="grid grid-cols-1 gap-3 border-t border-[#eaf1f6] pt-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                    Catégorie
                  </span>
                  <select
                    aria-label="Filtrer par catégorie"
                    value={catalogFilters.category}
                    onChange={e =>
                      setCatalogFilters(prev => ({ ...prev, category: e.target.value }))
                    }
                    className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                  >
                    <option value="all">Toutes les catégories</option>
                    {distinctCategories.map(cat => (
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
                    value={catalogFilters.minQuestions}
                    onChange={e =>
                      setCatalogFilters(prev => ({ ...prev, minQuestions: e.target.value }))
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
                    value={catalogFilters.maxQuestions}
                    onChange={e =>
                      setCatalogFilters(prev => ({ ...prev, maxQuestions: e.target.value }))
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
                {filteredExercises.length === 1 ? '' : 's'} sur {items.length}
                {activeCatalogFilterCount > 0 && ` · ${activeCatalogFilterCount} filtre(s) actif(s)`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-expanded={advancedFiltersOpen}
                  onClick={() => setAdvancedFiltersOpen(open => !open)}
                  className={`inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    advancedFiltersOpen
                      ? 'border-[#0b3c5d] bg-[#edf5fa] text-[#072a3f]'
                      : 'border-[#cfe1ec] bg-white text-[#46657a] hover:bg-[#f5f9fc]'
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  Filtres avancés
                </button>
                {activeCatalogFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCatalogFilters(DEFAULT_EXERCISE_CATALOG_FILTERS)}
                    className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold text-[#0b3c5d] underline decoration-[#b3cad9] underline-offset-2 hover:text-[#072a3f]"
                  >
                    <RotateCcw size={13} />
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Catalog Results */}
          {loading && items.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map(skeleton => (
                <div
                  key={skeleton}
                  className="h-56 animate-pulse rounded-[22px] border border-[#d8e6ee] bg-white p-5"
                >
                  <div className="h-3 w-36 rounded bg-[#e6f0f7]" />
                  <div className="mt-4 h-5 w-2/3 rounded bg-[#e6f0f7]" />
                  <div className="mt-6 h-14 rounded-xl bg-[#f3f8fb]" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[#d8e6ee] bg-white p-10 text-center">
              <FileText size={32} className="mx-auto text-[#89a8bb]" />
              <h2 className="mt-3 text-base font-extrabold text-[#072a3f]">
                Aucun exercice enregistré
              </h2>
              <p className="mt-1 text-sm text-[#607f93]">
                Créez votre premier exercice ou convertissez un quiz existant depuis l’éditeur CRUD.
              </p>
              <button
                type="button"
                onClick={resetEditor}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0b3c5d]"
              >
                <Plus size={16} />
                Créer un exercice
              </button>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="rounded-2xl border border-[#d8e6ee] bg-white p-10 text-center">
              <Search size={30} className="mx-auto text-[#89a8bb]" />
              <h2 className="mt-3 text-base font-extrabold text-[#072a3f]">
                Aucun exercice ne correspond aux critères sélectionnés
              </h2>
              <p className="mt-1 text-sm text-[#607f93]">
                Ajustez votre recherche ou réinitialisez les filtres actifs.
              </p>
              <button
                type="button"
                onClick={() => setCatalogFilters(DEFAULT_EXERCISE_CATALOG_FILTERS)}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-4 py-2 text-sm font-bold text-[#0b3c5d] hover:bg-[#e6f0f7]"
              >
                <RotateCcw size={15} />
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredExercises.map(item => {
                const isPublished = item.status === 'published';
                const totalSeconds = (item.questions || []).reduce(
                  (sum, q) => sum + Number(q.time_limit_seconds || 0),
                  0
                );
                const assignedClassNames = (item.class_ids || [])
                  .map(id => classMap.get(id))
                  .filter((name): name is string => Boolean(name));

                return (
                  <LearningCard key={item.id} active={isPublished}>
                    <LearningCardHeader
                      kicker={`${item.category || 'Autre'}${item.level ? ` · ${item.level}` : ''} · v${item.current_version_number || 1}`}
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
                        {
                          label: 'Durée',
                          value: formatExerciseTotalDuration(totalSeconds)
                        }
                      ]}
                    />

                    <LearningCardFooter>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => populateEditorFromItem(item)}
                          className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#072a3f] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#0b3c5d]"
                        >
                          <Edit3 size={13} />
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void openAttemptsForExercise(item)}
                          className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition hover:border-[#2fa36b] hover:bg-[#eef9f3]"
                        >
                          <BarChart3 size={13} />
                          Tentatives
                        </button>
                        {item.status !== 'published' && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handleQuickLifecycleChange(item, 'published')}
                            className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#bfe3ce] bg-[#eef9f3] px-3 py-2 text-xs font-bold text-[#17613e] transition hover:bg-[#dff4e8] disabled:opacity-50"
                          >
                            <Send size={13} />
                            Publier
                          </button>
                        )}
                        {item.status !== 'archived' && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handleQuickLifecycleChange(item, 'archived')}
                            className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#d8e6ee] bg-white px-3 py-2 text-xs font-semibold text-[#46657a] transition hover:bg-[#f5f9fc] disabled:opacity-50"
                          >
                            <Archive size={13} />
                            Archiver
                          </button>
                        )}
                      </div>
                    </LearningCardFooter>
                  </LearningCard>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ===================================================================== */}
      {/* MODE 2: ÉDITEUR CRUD (CREATE / UPDATE / IMPORT / CONVERT / TIMERS)    */}
      {/* ===================================================================== */}
      {workspaceMode === 'editor' && (
        <section className="space-y-4">
          {/* Editor Context Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d8e6ee] bg-white px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setWorkspaceMode('catalog')}
                className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3 py-1.5 text-xs font-bold text-[#0b3c5d] transition hover:bg-[#e6f0f7]"
              >
                <ArrowLeft size={14} />
                Catalogue
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-extrabold text-[#072a3f]">
                    {selectedId ? title || 'Modifier l’exercice' : 'Créer un nouvel exercice'}
                  </h2>
                  {getExerciseStatusBadge(status)}
                </div>
                <p className="text-xs text-[#607f93]">
                  {selectedId
                    ? 'Modification d’un exercice existant — les changements créent ou mettent à jour la définition.'
                    : 'Nouveau brouillon indépendant des quiz évaluatifs.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedId && (
                <button
                  type="button"
                  onClick={() => {
                    const current = items.find(i => i.id === selectedId);
                    if (current) {
                      void openAttemptsForExercise(current);
                    } else {
                      setWorkspaceMode('attempts');
                      void loadAttemptsForExercise(selectedId, true);
                    }
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition hover:border-[#2fa36b] hover:bg-[#eef9f3]"
                >
                  <BarChart3 size={14} />
                  Voir les tentatives
                </button>
              )}
              {selectedId && (
                <button
                  type="button"
                  onClick={resetEditor}
                  className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#d8e6ee] bg-white px-3.5 py-2 text-xs font-semibold text-[#46657a] transition hover:bg-[#f5f9fc]"
                >
                  <Plus size={14} />
                  Nouveau brouillon
                </button>
              )}
            </div>
          </div>

          {/* 2-Column CRUD Workbench */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            {/* Left column: Metadata, Classes, Import/Convert */}
            <div className="space-y-4">
              <div className="space-y-4 rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0b3c5d]">
                  1. Paramètres généraux
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-bold text-[#315267] sm:col-span-2">
                    <span>Titre *</span>
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Ex. Passato prossimo — Verbes usuels"
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-white px-3 py-2 text-sm font-normal text-[#072a3f]"
                    />
                  </label>

                  <label className="space-y-1 text-xs font-bold text-[#315267]">
                    <span>Catégorie</span>
                    <input
                      list="exercise-category-options"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-white px-3 py-2 text-sm font-normal text-[#072a3f]"
                    />
                    <datalist id="exercise-category-options">
                      {distinctCategories.map(cat => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </label>

                  <label className="space-y-1 text-xs font-bold text-[#315267]">
                    <span>Niveau CECRL</span>
                    <select
                      value={level}
                      onChange={e => setLevel(e.target.value)}
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-white px-3 py-2 text-sm font-normal text-[#072a3f]"
                    >
                      <option value="">Non précisé</option>
                      {CEFR_LEVELS.map(v => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-xs font-bold text-[#315267] sm:col-span-2">
                    <span>Statut cible</span>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value as ExerciseStatus)}
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-white px-3 py-2 text-sm font-normal text-[#072a3f]"
                    >
                      <option value="draft">Brouillon</option>
                      <option value="published">Publié</option>
                      <option value="archived">Archivé</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-xs font-bold text-[#315267] sm:col-span-2">
                    <span>Description / Consigne</span>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Objectif pédagogique ou indications pour les élèves…"
                      className="w-full rounded-xl border border-[#cfe1ec] bg-white px-3 py-2 text-sm font-normal text-[#072a3f]"
                    />
                  </label>
                </div>
              </div>

              {/* Class assignments */}
              <div className="space-y-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0b3c5d]">
                    2. Classes autorisées ({classIds.length})
                  </h3>
                  {classes.length > 0 && (
                    <div className="flex items-center gap-3 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setClassIds(classes.map(c => c.id))}
                        className="text-[#0b3c5d] underline decoration-[#b3cad9] underline-offset-2 hover:text-[#072a3f]"
                      >
                        Tout cocher
                      </button>
                      <button
                        type="button"
                        onClick={() => setClassIds([])}
                        className="text-[#607f93] underline decoration-[#d1e1ec] underline-offset-2 hover:text-[#072a3f]"
                      >
                        Effacer
                      </button>
                    </div>
                  )}
                </div>

                {classes.length === 0 ? (
                  <p className="text-xs text-[#607f93]">Aucune classe disponible.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {classes.map(c => {
                      const checked = classIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                            checked
                              ? 'border-[#2fa36b] bg-[#eef9f3] text-[#145c3d]'
                              : 'border-[#d8e6ee] bg-[#f7fafc] text-[#315267] hover:border-[#a9c7d9]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e =>
                              setClassIds(old =>
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
                )}

                {classIds.length === 0 && (
                  <p className="text-xs text-amber-800">
                    Sélectionnez au moins une classe pour pouvoir publier l’exercice.
                  </p>
                )}
              </div>

              {/* Import / Export JSON (CRUD file actions) */}
              <div className="space-y-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0b3c5d]">
                  3. Import & export JSON
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3 py-2 text-xs font-bold text-[#0b3c5d] transition hover:bg-[#e6f0f7]">
                    <Upload size={15} />
                    Importer JSON
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={e => {
                        void handleImportFile(e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    disabled={!parsed}
                    onClick={exportJson}
                    className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-white px-3 py-2 text-xs font-bold text-[#0b3c5d] transition hover:bg-[#f5f9fc] disabled:opacity-40"
                  >
                    <Download size={15} />
                    Exporter JSON
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaf1f6] pt-3">
                  <p className="text-xs text-[#607f93]">
                    Convertir un quiz existant ou transformer cet exercice en quiz :
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      openConverterWorkspace(
                        selectedId ? 'exercise_to_quiz' : 'quiz_to_exercise',
                        selectedId || '',
                        Boolean(selectedId)
                      )
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3 py-1.5 text-xs font-bold text-[#0b3c5d] transition hover:border-[#2fa36b] hover:bg-[#eef9f3]"
                  >
                    <ArrowLeftRight size={14} />
                    Passerelle Quiz ↔ Exercices
                  </button>
                </div>
              </div>
            </div>

            {/* Right column: JSON content & Per-question timers */}
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0b3c5d]">
                    4. Contenu JSON & Validation
                  </h3>
                  {parsed ? (
                    <span className="text-xs font-bold tabular-nums text-[#17613e]">
                      {parsed.questions.length} question(s) ·{' '}
                      {formatExerciseTotalDuration(totalEditorSeconds)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-rose-700">JSON invalide</span>
                  )}
                </div>

                <label className="block">
                  <span className="sr-only">Contenu JSON de l’exercice</span>
                  <textarea
                    value={json}
                    onChange={e => setJson(e.target.value)}
                    spellCheck={false}
                    className="min-h-[340px] w-full rounded-xl border border-[#cfe1ec] bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-emerald-100"
                  />
                </label>

                {jsonValidation.error ? (
                  <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
                    {jsonValidation.error}
                  </p>
                ) : (
                  <p className="text-xs text-[#607f93]">
                    Toutes les questions sont valides et disposent d’un chronomètre strictement positif.
                  </p>
                )}
              </div>

              {parsed && (
                <div className="space-y-2.5 rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0b3c5d]">
                      5. Chronomètre par question
                    </h3>
                    <span className="text-xs font-semibold tabular-nums text-[#607f93]">
                      Total : {formatExerciseTotalDuration(totalEditorSeconds)}
                    </span>
                  </div>
                  <div className="divide-y divide-[#eaf1f6]">
                    {parsed.questions.map((question, index) => (
                      <div
                        key={question.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-1"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#072a3f]">
                            Question {index + 1}{' '}
                            <span className="font-semibold uppercase text-[#607f93]">
                              · {question.type}
                            </span>
                          </p>
                          <p className="truncate text-xs text-[#46657a]">{question.question}</p>
                        </div>
                        <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-[#315267]">
                          <span>Sec.</span>
                          <input
                            type="number"
                            min={1}
                            max={3600}
                            step={1}
                            value={question.time_limit_seconds || 1}
                            onChange={e =>
                              handleQuestionTimerChange(question.id, Number(e.target.value))
                            }
                            className="min-h-9 w-20 rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-2.5 py-1 text-right tabular-nums text-[#072a3f]"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Save / Publish Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 shadow-[0_6px_20px_rgba(7,42,63,0.04)]">
            <button
              type="button"
              onClick={() => setWorkspaceMode('catalog')}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d8e6ee] bg-white px-4 py-2 text-sm font-semibold text-[#46657a] transition hover:bg-[#f5f9fc]"
            >
              <ArrowLeft size={15} />
              Retour au catalogue
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {selectedId && status !== 'archived' && (
                <button
                  type="button"
                  disabled={loading || !parsed}
                  onClick={() => void persistExercise('archived')}
                  className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-[#d8e6ee] bg-white px-4 py-2 text-sm font-semibold text-[#46657a] transition hover:bg-[#f5f9fc] disabled:opacity-40"
                >
                  <Archive size={15} />
                  Archiver
                </button>
              )}
              <button
                type="button"
                disabled={loading || !parsed}
                onClick={() => void persistExercise(status === 'published' ? 'published' : 'draft')}
                className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-[#072a3f] bg-white px-4 py-2 text-sm font-bold text-[#072a3f] transition hover:bg-[#f5f9fc] disabled:opacity-40"
              >
                <Save size={15} />
                Enregistrer
              </button>
              <button
                type="button"
                disabled={loading || !parsed || classIds.length === 0}
                onClick={() => void persistExercise('published')}
                className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[#2fa36b] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#268d5b] disabled:opacity-40"
              >
                <Send size={15} />
                Publier
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* MODE 3: PASSERELLE QUIZ <-> EXERCICES                                 */}
      {/* ===================================================================== */}
      {workspaceMode === 'converter' && (
        <ExerciseQuizConverterPanel
          classes={classes}
          quizzes={quizzes}
          exercises={items}
          initialDirection={converterDirection}
          initialExerciseId={converterExerciseId}
          autoOpenModalForExercise={converterAutoOpenModal}
          onLoadDraftInEditor={payload => {
            setSelectedId('');
            setTitle(payload.title);
            setDescription(payload.description);
            setCategory(payload.category);
            setLevel(payload.level);
            setStatus('draft');
            setClassIds(payload.classIds);
            setJson(payload.json);
            setError('');
            setMessage(payload.message);
            setWorkspaceMode('editor');
          }}
          onExerciseCreated={async exerciseId => {
            setSelectedId(exerciseId);
            await refresh();
          }}
          onQuizCreated={() => {
            setQuizzes(dataService.getQuizzes());
          }}
          onOpenCatalog={() => setWorkspaceMode('catalog')}
        />
      )}

      {/* ===================================================================== */}
      {/* MODE 4: TENTATIVES & SUIVI PÉDAGOGIQUE                               */}
      {/* ===================================================================== */}
      {workspaceMode === 'attempts' && (
        <section className="space-y-5">
          {/* Exercise Selector & Context Banner */}
          <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-[#072a3f] to-[#0b3c5d] p-5 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-300">
                Suivi pédagogique & Tentatives
              </p>
              <h2 className="break-words text-xl font-black">
                {activeAttemptsExercise?.title || 'Sélectionnez un exercice'}
              </h2>
              <p className="text-xs text-white/75 sm:text-sm">
                {activeAttemptsExercise
                  ? `${activeAttemptsExercise.category || 'Autre'}${
                      activeAttemptsExercise.level ? ` · ${activeAttemptsExercise.level}` : ''
                    } · ${activeAttemptsExercise.questions.length} question(s) · ${
                      activeAttemptsExercise.class_ids.length
                    } classe(s) attribuée(s)`
                  : 'Choisissez un exercice pour inspecter les tentatives et la progression.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {items.length > 0 && (
                <select
                  aria-label="Choisir l’exercice à analyser"
                  value={attemptsExerciseId}
                  onChange={e => void loadAttemptsForExercise(e.target.value, true)}
                  className="min-h-10 min-w-[220px] max-w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none transition hover:bg-white/15"
                >
                  {items.map(ex => (
                    <option key={ex.id} value={ex.id} className="text-[#072a3f]">
                      {ex.title} ({ex.status === 'published' ? 'Publié' : ex.status === 'archived' ? 'Archivé' : 'Brouillon'})
                    </option>
                  ))}
                </select>
              )}

              {activeAttemptsExercise && (
                <button
                  type="button"
                  onClick={() => populateEditorFromItem(activeAttemptsExercise)}
                  className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/25 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/10 sm:text-sm"
                >
                  <Edit3 size={14} />
                  Modifier CRUD
                </button>
              )}

              <button
                type="button"
                onClick={() => setWorkspaceMode('catalog')}
                className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/25 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10 sm:text-sm"
              >
                <ArrowLeft size={14} />
                Catalogue
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-[#d8e6ee] bg-white p-10 text-center">
              <BarChart3 size={32} className="mx-auto text-[#89a8bb]" />
              <h3 className="mt-3 text-base font-extrabold text-[#072a3f]">
                Aucun exercice disponible
              </h3>
              <p className="mt-1 text-sm text-[#607f93]">
                Créez et publiez un exercice pour suivre les tentatives de vos élèves.
              </p>
              <button
                type="button"
                onClick={resetEditor}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2 text-sm font-bold text-white"
              >
                <Plus size={16} />
                Nouvel exercice
              </button>
            </div>
          ) : (
            <>
              {/* Multi-Criteria Attempt Filter Bar */}
              <div className="space-y-3 rounded-2xl border border-[#d8e6ee] bg-white p-4 shadow-[0_6px_20px_rgba(7,42,63,0.03)] sm:p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="relative block sm:col-span-2 lg:col-span-1">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                      Recherche élève
                    </span>
                    <div className="relative">
                      <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#607f93]"
                      />
                      <input
                        type="search"
                        value={attemptFilters.search}
                        onChange={e =>
                          setAttemptFilters(prev => ({ ...prev, search: e.target.value }))
                        }
                        placeholder="Nom, N°, classe…"
                        className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] py-2 pl-9 pr-3 text-sm text-[#072a3f] placeholder:text-[#89a8bb]"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                      Classe
                    </span>
                    <select
                      aria-label="Filtrer les tentatives par classe"
                      value={attemptFilters.classId}
                      onChange={e =>
                        setAttemptFilters(prev => ({ ...prev, classId: e.target.value }))
                      }
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                    >
                      <option value="all">Toutes les classes</option>
                      {availableAttemptClasses.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                      Progression
                    </span>
                    <select
                      aria-label="Filtrer par progression"
                      value={attemptFilters.progress}
                      onChange={e =>
                        setAttemptFilters(prev => ({
                          ...prev,
                          progress: e.target.value as AttemptProgressFilter
                        }))
                      }
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                    >
                      <option value="all">Tous les statuts</option>
                      <option value="completed">Terminé</option>
                      <option value="in_progress">En cours</option>
                      <option value="not_started">Non commencé</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                      Résultat
                    </span>
                    <select
                      aria-label="Filtrer par tranche de note"
                      value={attemptFilters.scoreBand}
                      onChange={e =>
                        setAttemptFilters(prev => ({
                          ...prev,
                          scoreBand: e.target.value as AttemptScoreBandFilter
                        }))
                      }
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                    >
                      <option value="all">Toutes les notes</option>
                      <option value="passed">Maîtrisé (≥ 70 %)</option>
                      <option value="needs_review">À accompagner (&lt; 70 %)</option>
                      <option value="unscored">Sans note</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#607f93]">
                      Trier par
                    </span>
                    <select
                      aria-label="Trier les tentatives"
                      value={attemptFilters.sortBy}
                      onChange={e =>
                        setAttemptFilters(prev => ({
                          ...prev,
                          sortBy: e.target.value as AttemptSortOption
                        }))
                      }
                      className="min-h-10 w-full rounded-xl border border-[#cfe1ec] bg-[#f7fafc] px-3 py-2 text-sm font-semibold text-[#072a3f]"
                    >
                      <option value="name_asc">Nom (A–Z)</option>
                      <option value="score_desc">Meilleure note ↓</option>
                      <option value="score_asc">Meilleure note ↑</option>
                      <option value="attempts_desc">Tentatives ↓</option>
                      <option value="activity_desc">Dernière activité</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eaf1f6] pt-3">
                  <p className="text-xs font-semibold tabular-nums text-[#46657a]" aria-live="polite">
                    {filteredAttempts.length} élève{filteredAttempts.length === 1 ? '' : 's'} affiché
                    {filteredAttempts.length === 1 ? '' : 's'} sur {attempts.length}
                    {activeAttemptFilterCount > 0 && ` · ${activeAttemptFilterCount} filtre(s) actif(s)`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={attemptsLoading || !attemptsExerciseId}
                      onClick={() => void loadAttemptsForExercise(attemptsExerciseId, false)}
                      className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#cfe1ec] bg-white px-3 py-1.5 text-xs font-bold text-[#0b3c5d] hover:bg-[#f5f9fc] disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={attemptsLoading ? 'animate-spin' : ''} />
                      Actualiser les données
                    </button>
                    {activeAttemptFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setAttemptFilters(DEFAULT_ATTEMPT_FILTERS)}
                        className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold text-[#0b3c5d] underline decoration-[#b3cad9] underline-offset-2 hover:text-[#072a3f]"
                      >
                        <RotateCcw size={13} />
                        Réinitialiser
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* KPI Summary */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <article className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
                  <div className="flex items-center justify-between text-[#607f93]">
                    <span className="text-xs font-semibold">Étudiants affichés</span>
                    <Users size={17} />
                  </div>
                  <p className="mt-2 text-2xl font-black tabular-nums text-[#072a3f]">
                    {attemptSummary.total}
                  </p>
                </article>
                <article className="rounded-2xl border border-[#bfe3ce] bg-[#eef9f3]/70 p-4">
                  <div className="flex items-center justify-between text-[#17613e]">
                    <span className="text-xs font-semibold">Terminés</span>
                    <CheckCircle2 size={17} />
                  </div>
                  <p className="mt-2 text-2xl font-black tabular-nums text-[#145c3d]">
                    {attemptSummary.completed}
                  </p>
                </article>
                <article className="rounded-2xl border border-[#eed9aa] bg-[#fef9ec]/70 p-4">
                  <div className="flex items-center justify-between text-[#8a5108]">
                    <span className="text-xs font-semibold">En cours</span>
                    <Clock3 size={17} />
                  </div>
                  <p className="mt-2 text-2xl font-black tabular-nums text-[#8a5108]">
                    {attemptSummary.inProgress}
                  </p>
                </article>
                <article className="rounded-2xl border border-[#dde7ee] bg-[#f5f8fa] p-4">
                  <div className="flex items-center justify-between text-[#4c697c]">
                    <span className="text-xs font-semibold">Non commencés</span>
                    <CircleDashed size={17} />
                  </div>
                  <p className="mt-2 text-2xl font-black tabular-nums text-[#4c697c]">
                    {attemptSummary.notStarted}
                  </p>
                </article>
              </div>

              {/* Student Progression — cards on mobile, aligned table on desktop */}
              <section aria-labelledby="student-progression-title" className="min-w-0 overflow-hidden rounded-2xl border border-[#d8e6ee] bg-white shadow-[0_6px_20px_rgba(7,42,63,0.03)]">
                <div className="flex flex-col gap-2 border-b border-[#eaf1f6] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 id="student-progression-title" className="font-bold text-[#072a3f]">Progression des étudiants</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#607f93]">
                      La meilleure note terminée est conservée pour le suivi pédagogique.
                    </p>
                  </div>
                  <span className="self-start rounded-full bg-[#f1f6f9] px-2.5 py-1 text-xs font-bold tabular-nums text-[#46657a] sm:self-center">
                    {attemptSummary.total} étudiant(s)
                  </span>
                </div>

                {attemptsLoading ? (
                  <div className="space-y-3 p-4" aria-label="Chargement des tentatives">
                    {[1, 2, 3].map(idx => (
                      <div key={idx} className="h-28 animate-pulse rounded-xl bg-[#f3f8fb]" />
                    ))}
                  </div>
                ) : filteredAttempts.length === 0 ? (
                  <div className="p-8 text-center sm:p-10">
                    <Users className="mx-auto mb-2 text-[#89a8bb]" size={30} />
                    <p className="font-semibold text-[#315267]">Aucun étudiant dans cette sélection</p>
                    <p className="mt-1 text-xs text-[#607f93]">
                      {attempts.length === 0
                        ? 'Vérifiez les classes attribuées à cet exercice.'
                        : 'Modifiez ou réinitialisez vos critères de recherche.'}
                    </p>
                    {activeAttemptFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setAttemptFilters(DEFAULT_ATTEMPT_FILTERS)}
                        className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2 text-xs font-bold text-[#0b3c5d]"
                      >
                        <RotateCcw size={13} /> Réinitialiser les filtres
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Mobile: each student is a readable, non-clipped card */}
                    <div className="divide-y divide-[#eaf1f6] md:hidden">
                      {filteredAttempts.map(row => {
                        const done = row.status === 'completed';
                        const running = row.status === 'in_progress';
                        const score = row.best_score;
                        const scoreMax = row.max_score;
                        const percentage = getAttemptPercentage(row);
                        const score20 = percentage !== null && Number(scoreMax) > 0
                          ? ((Number(score) / Number(scoreMax)) * 20).toFixed(2).replace(/\.00$/, '')
                          : null;
                        const progressBadge = done ? (
                          <StatusBadge tone="success">Terminé</StatusBadge>
                        ) : running && score !== null && score !== undefined ? (
                          <StatusBadge tone="warning">Nouvelle tentative</StatusBadge>
                        ) : running ? (
                          <StatusBadge tone="warning">En cours</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">Non commencé</StatusBadge>
                        );

                        return (
                          <article key={`${row.student_id}-${row.class_id}`} className="min-w-0 p-3.5">
                            <div className="flex min-w-0 items-start gap-3">
                              <StudentAvatar
                                name={row.student_name || 'Élève'}
                                src={row.avatar_url || undefined}
                                className="h-11 w-11 shrink-0 border border-[#d8e6ee] text-xs"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="break-words font-bold leading-snug text-[#072a3f]">{row.student_name || 'Élève'}</p>
                                {row.student_number && (
                                  <p className="mt-0.5 text-xs tabular-nums text-[#607f93]">N° {row.student_number}</p>
                                )}
                                <p className="mt-1 break-words text-xs text-[#607f93]">{row.class_name || 'Classe non renseignée'}</p>
                              </div>
                              <div className="shrink-0">{progressBadge}</div>
                            </div>

                            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-[#f5f9fc] p-3">
                              <div className="min-w-0">
                                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#607f93]">Meilleure note</dt>
                                <dd className="mt-0.5 font-bold tabular-nums text-[#072a3f]">
                                  {score !== null && score !== undefined && scoreMax > 0 ? `${score} / ${scoreMax}` : '—'}
                                </dd>
                                {percentage !== null && (
                                  <p className="text-[11px] font-semibold tabular-nums text-[#46657a]">{Math.round(percentage)} % · {score20}/20</p>
                                )}
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#607f93]">Tentatives</dt>
                                <dd className="mt-0.5 font-bold tabular-nums text-[#315267]">{row.attempt_count}</dd>
                              </div>
                              <div className="col-span-2 min-w-0">
                                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#607f93]">Dernière activité</dt>
                                <dd className="mt-0.5 break-words text-xs tabular-nums text-[#46657a]">{formatDateTime(row.completed_at || row.started_at)}</dd>
                              </div>
                            </dl>

                            <div className="mt-3">
                              {row.best_attempt_id ? (
                                <button
                                  type="button"
                                  onClick={() => setReviewStudent(row)}
                                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#cfe0ea] bg-white px-3 py-2 text-sm font-bold text-[#0b3c5d] transition hover:border-[#2fa36b] hover:bg-[#eef9f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2fa36b]"
                                >
                                  <FileText size={15} className="mr-2" /> Voir les réponses
                                </button>
                              ) : (
                                <p className="py-1 text-center text-xs text-[#89a8bb]">Aucune tentative terminée à consulter</p>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {/* Desktop/tablet: retain the comparison table where there is room */}
                    <div className="hidden min-w-0 overflow-x-auto md:block">
                      <table className="w-full min-w-[780px] text-left text-sm">
                        <thead className="bg-[#f5f9fc] text-[11px] font-bold uppercase tracking-wide text-[#46657a]">
                          <tr>
                            <th scope="col" className="px-4 py-3">Étudiant</th>
                            <th scope="col" className="px-4 py-3">Classe</th>
                            <th scope="col" className="px-4 py-3">Progression</th>
                            <th scope="col" className="px-4 py-3 text-right">Meilleure note</th>
                            <th scope="col" className="px-4 py-3 text-right">Tentatives</th>
                            <th scope="col" className="px-4 py-3">Dernière activité</th>
                            <th scope="col" className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eaf1f6]">
                          {filteredAttempts.map(row => {
                            const done = row.status === 'completed';
                            const running = row.status === 'in_progress';
                            const score = row.best_score;
                            const scoreMax = row.max_score;
                            const percentage = getAttemptPercentage(row);
                            const score20 = percentage !== null && Number(scoreMax) > 0
                              ? ((Number(score) / Number(scoreMax)) * 20).toFixed(2).replace(/\.00$/, '')
                              : null;
                            const progressBadge = done ? (
                              <StatusBadge tone="success">Terminé</StatusBadge>
                            ) : running && score !== null && score !== undefined ? (
                              <StatusBadge tone="warning">Nouvelle tentative</StatusBadge>
                            ) : running ? (
                              <StatusBadge tone="warning">En cours</StatusBadge>
                            ) : (
                              <StatusBadge tone="neutral">Non commencé</StatusBadge>
                            );

                            return (
                              <tr key={`${row.student_id}-${row.class_id}`} className="transition hover:bg-[#f7fafc]">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <StudentAvatar name={row.student_name || 'Élève'} src={row.avatar_url || undefined} className="h-9 w-9 border border-[#d8e6ee] text-xs" />
                                    <div className="min-w-0">
                                      <p className="truncate font-bold text-[#072a3f]">{row.student_name}</p>
                                      {row.student_number && <p className="text-[11px] tabular-nums text-[#607f93]">N° {row.student_number}</p>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[#46657a]">{row.class_name}</td>
                                <td className="px-4 py-3">{progressBadge}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="font-bold tabular-nums text-[#072a3f]">
                                    {score !== null && score !== undefined && scoreMax > 0 ? <>{score}{' '}<span className="font-medium text-[#607f93]">/ {scoreMax}</span></> : <span className="font-medium text-[#89a8bb]">—</span>}
                                  </div>
                                  {percentage !== null && <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#46657a]">{Math.round(percentage)} % · {score20}/20</p>}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#315267]">{row.attempt_count}</td>
                                <td className="px-4 py-3 text-xs tabular-nums text-[#607f93]">{formatDateTime(row.completed_at || row.started_at)}</td>
                                <td className="px-4 py-3 text-right">
                                  {row.best_attempt_id ? (
                                    <button type="button" onClick={() => setReviewStudent(row)} className="inline-flex min-h-10 items-center whitespace-nowrap rounded-xl border border-[#cfe0ea] bg-[#f5f9fc] px-3 py-2 text-xs font-bold text-[#0b3c5d] transition hover:border-[#2fa36b] hover:bg-[#eef9f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2fa36b]">
                                      Voir les réponses
                                    </button>
                                  ) : <span className="text-xs text-[#89a8bb]">Aucune terminée</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              {/* Analytics Section */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[#072a3f]">Analyse pédagogique</h3>
                    <p className="mt-0.5 text-xs text-[#607f93]">
                      Indicateurs calculés sur la meilleure tentative terminée uniquement (
                      {attemptSummary.total}).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <article className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
                    <p className="text-xs font-semibold text-[#607f93]">Score moyen</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#072a3f]">
                      {performanceSummary.average === null
                        ? '—'
                        : `${performanceSummary.average.toFixed(1)} %`}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
                    <p className="text-xs font-semibold text-[#607f93]">Élèves maîtrisant (≥ 70 %)</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#145c3d]">
                      {performanceSummary.successRate === null
                        ? '—'
                        : `${Math.round(performanceSummary.successRate)} %`}
                    </p>
                    <p className="text-[11px] text-[#607f93]">Seuil : 70 %</p>
                  </article>
                  <article className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
                    <p className="text-xs font-semibold text-[#607f93]">Taux d’achèvement</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#072a3f]">
                      {Math.round(performanceSummary.completionRate)} %
                    </p>
                  </article>
                  <article className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
                    <p className="text-xs font-semibold text-[#607f93]">Tentatives moyennes</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#072a3f]">
                      {performanceSummary.averageAttempts.toFixed(1)}
                    </p>
                  </article>
                </div>

                <div className="rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
                  <h4 className="text-sm font-bold text-[#072a3f]">
                    Répartition des meilleures notes
                  </h4>
                  <p className="mt-0.5 text-xs text-[#607f93]">
                    Nombre d’élèves par tranche de pourcentage.
                  </p>
                  <div className="mt-4 space-y-3">
                    {scoreDistribution.map(bucket => (
                      <div
                        key={bucket.label}
                        className="grid grid-cols-[78px_1fr_34px] items-center gap-3 text-xs"
                      >
                        <span className="tabular-nums text-[#46657a]">{bucket.label}</span>
                        <div className="h-2.5 overflow-hidden rounded-full bg-[#e6f0f7]">
                          <div
                            className="h-full rounded-full bg-[#2fa36b]"
                            style={{
                              width: `${
                                performanceSummary.scoredCount
                                  ? (bucket.count / performanceSummary.scoredCount) * 100
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                        <strong className="text-right tabular-nums text-[#072a3f]">
                          {bucket.count}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>


              <section className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[#072a3f]">Diagnostic par compétence</h3>
                    <p className="mt-0.5 text-xs text-[#607f93]">Seuil de maîtrise : 70 %. Calcul sur les points de la meilleure tentative terminée de chaque élève.</p>
                  </div>
                  <StatusBadge tone={pedagogicalDiagnostic.uncategorizedQuestions > 0 ? 'warning' : 'success'}>
                    {pedagogicalDiagnostic.uncategorizedQuestions > 0 ? `${pedagogicalDiagnostic.uncategorizedQuestions} question(s) à catégoriser` : 'Compétences renseignées'}
                  </StatusBadge>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <article className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
                    <p className="text-xs font-semibold text-[#607f93]">Élèves évalués</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#072a3f]">{pedagogicalDiagnostic.evaluatedStudents}</p>
                  </article>
                  <article className="rounded-2xl border border-[#bfe3ce] bg-[#eef9f3]/60 p-4">
                    <p className="text-xs font-semibold text-[#17613e]">Maîtrisent (≥ 70 %)</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#145c3d]">{pedagogicalDiagnostic.masteredStudents}</p>
                  </article>
                  <article className="rounded-2xl border border-[#f0d5ca] bg-[#fff7f3] p-4">
                    <p className="text-xs font-semibold text-[#9a4c36]">À accompagner</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#9a4c36]">{pedagogicalDiagnostic.studentsNeedingSupport}</p>
                  </article>
                  <article className="rounded-2xl border border-[#f0dfb8] bg-[#fffaf0] p-4">
                    <p className="text-xs font-semibold text-[#8a5108]">Questions difficiles</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-[#8a5108]">{pedagogicalDiagnostic.difficultQuestions}</p>
                  </article>
                </div>
                {pedagogicalDiagnostic.competencies.length > 0 && (
                  <div className="rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
                    <h4 className="font-bold text-[#072a3f]">Maîtrise des compétences</h4>
                    <div className="mt-4 space-y-4">
                      {pedagogicalDiagnostic.competencies.map(skill => (
                        <div key={skill.skillCode || skill.competency} className="space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold text-[#315267]">{skill.competency}</p>
                              <p className="text-[11px] text-[#89a8bb]">{skill.questions} question(s) · {skill.studentsNeedingSupport.length} élève(s) sous 70 %</p>
                            </div>
                            <strong className={`shrink-0 text-sm tabular-nums ${skill.masteryRate !== null && skill.masteryRate >= 70 ? 'text-[#17613e]' : 'text-[#a34f38]'}`}>
                              {skill.masteryRate === null ? '—' : `${Math.round(skill.masteryRate)} %`}
                            </strong>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-[#e6f0f7]">
                            <div className={`h-full rounded-full ${skill.masteryRate !== null && skill.masteryRate >= 70 ? 'bg-[#2fa36b]' : 'bg-[#d97757]'}`} style={{ width: `${Math.min(100, Math.max(0, skill.masteryRate || 0))}%` }} />
                          </div>
                          {skill.studentsNeedingSupport.length > 0 && (
                            <p className="break-words text-[11px] leading-relaxed text-[#9a4c36]">À accompagner : {skill.studentsNeedingSupport.map(student => student.studentName).join(', ')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pedagogicalDiagnostic.targetedStudents.length > 0 && (
                  <div className="rounded-2xl border border-[#f0d5ca] bg-white p-4 sm:p-5">
                    <h4 className="font-bold text-[#072a3f]">Élèves à accompagner</h4>
                    <p className="mt-0.5 text-xs text-[#607f93]">Classement selon leur meilleure note terminée, sous le seuil de 70 %.</p>
                    <div className="mt-3 divide-y divide-[#eaf1f6]">
                      {pedagogicalDiagnostic.targetedStudents.map(student => (
                        <div key={student.studentId} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-[#072a3f]">{student.studentName}</p>
                            <p className="text-xs text-[#607f93]">{student.className}</p>
                          </div>
                          <StatusBadge tone="danger">{Math.round(student.rate)} %</StatusBadge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              {pedagogicalDiagnostic.uncategorizedQuestions > 0 && (
                <div className="rounded-xl border border-[#f0dfb8] bg-[#fffaf0] p-4 text-xs leading-relaxed text-[#77551b]">
                  <p className="font-bold">Pour expliquer les difficultés, associez chaque question à une compétence.</p>
                  <p className="mt-1">Dans le JSON de l’exercice, ajoutez les propriétés competency, skill_code, error_categories et error_category_map. Les causes d’erreur ne sont affichées que lorsqu’elles sont explicitement renseignées par le professeur : le système ne devine pas les raisons d’une mauvaise réponse.</p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 text-[11px] text-[#315267]">{JSON.stringify({competency:"Choix de l’auxiliaire",skill_code:"PASSATO_PROSSIMO_AUX",error_categories:["Confusion essere/avere"],error_category_map:{avere:"Confusion essere/avere"}},null,2)}</pre>
                </div>
              )}
              {questionStats.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-[#d8e6ee] bg-white">
                  <div className="border-b border-[#eaf1f6] px-4 py-4">
                    <h3 className="font-bold text-[#072a3f]">Diagnostic par question</h3>
                    <p className="mt-0.5 text-xs text-[#607f93]">Réponses issues de la meilleure tentative terminée de chaque élève.</p>
                  </div>
                  <div className="divide-y divide-[#eaf1f6]">
                    {questionStats.map((row, index) => (
                      <article key={row.id} className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#607f93]">QUESTION {index + 1}</p>
                            <p className="mt-1 break-words text-sm font-semibold text-[#072a3f]">{row.label}</p>
                            <p className="mt-1 text-xs text-[#607f93]">{row.competency}</p>
                          </div>
                          <StatusBadge tone={row.rate !== null && row.rate >= 70 ? 'success' : 'danger'}>
                            {row.rate === null ? 'Non évaluée' : `${Math.round(row.rate)} %`}
                          </StatusBadge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f5f9fc] p-3 text-center">
                          <div><p className="text-[10px] text-[#607f93]">Réponses</p><p className="font-bold tabular-nums text-[#072a3f]">{row.responses}</p></div>
                          <div><p className="text-[10px] text-[#607f93]">Correctes</p><p className="font-bold tabular-nums text-[#17613e]">{row.correct}</p></div>
                          <div><p className="text-[10px] text-[#607f93]">À revoir</p><p className="font-bold tabular-nums text-[#9a4c36]">{row.studentsNeedingSupport.length}</p></div>
                        </div>
                        {pedagogicalDiagnostic.questions.find(question => question.id === row.id)?.errorPatterns.length ? (
                          <p className="text-xs text-[#8a5108]">Erreurs documentées : {pedagogicalDiagnostic.questions.find(question => question.id === row.id)?.errorPatterns.map(pattern => `${pattern.category} (${pattern.count})`).join(' · ')}</p>
                        ) : null}
                        {row.studentsNeedingSupport.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {row.studentsNeedingSupport.map(student => (
                              <span key={student.student_id} className="rounded-full bg-[#fff1eb] px-2.5 py-1 text-[11px] font-semibold text-[#9a4c36]">{student.student_name}</span>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

            </>
          )}

          {/* Review Best Attempt Modal */}
          {reviewStudent && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Réponses de la meilleure tentative"
            >
              <section className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#d8e6ee] bg-white shadow-2xl">
                <header className="flex items-start justify-between gap-3 border-b border-[#eaf1f6] p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <StudentAvatar
                      name={reviewStudent.student_name || 'Élève'}
                      src={reviewStudent.avatar_url || undefined}
                      className="h-11 w-11 border border-[#d8e6ee] text-sm"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2fa36b]">
                        Meilleure tentative
                      </p>
                      <h3 className="truncate text-lg font-black text-[#072a3f]">
                        {reviewStudent.student_name}
                      </h3>
                      <p className="text-xs tabular-nums text-[#607f93] sm:text-sm">
                        {reviewStudent.class_name} · {reviewStudent.best_score} /{' '}
                        {reviewStudent.max_score} points
                        {getAttemptPercentage(reviewStudent) !== null &&
                          ` (${Math.round(getAttemptPercentage(reviewStudent)!)} %)`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewStudent(null)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d8e6ee] px-3 py-2 text-sm font-semibold text-[#46657a] hover:bg-[#f5f9fc]"
                  >
                    <X size={15} />
                    Fermer
                  </button>
                </header>

                <div className="space-y-3 overflow-y-auto p-5">
                  {(reviewStudent.best_details || []).map((detail, index) => {
                    const question = activeAttemptsExercise?.questions.find(
                      item => item.id === detail.question_id
                    );
                    const expected =
                      question?.answers?.join(' / ') ||
                      question?.correct_answer ||
                      question?.verbes_trous?.phrases
                        ?.map(phrase => phrase.reponses?.join(' / '))
                        .join(' · ') ||
                      'Correction non disponible';

                    return (
                      <article
                        key={detail.question_id}
                        className="rounded-xl border border-[#d8e6ee] p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="font-bold text-[#072a3f]">
                            Question {index + 1} — {question?.question || detail.question_id}
                          </h4>
                          {detail.correct ? (
                            <StatusBadge tone="success">Correcte</StatusBadge>
                          ) : detail.timed_out ? (
                            <StatusBadge tone="warning">Temps écoulé</StatusBadge>
                          ) : (
                            <StatusBadge tone="danger">À corriger</StatusBadge>
                          )}
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-xl bg-[#f5f9fc] p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#607f93]">
                              Réponse de l’élève
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[#072a3f]">
                              {detail.answer == null
                                ? 'Aucune réponse'
                                : typeof detail.answer === 'string'
                                ? detail.answer
                                : JSON.stringify(detail.answer)}
                            </p>
                          </div>
                          <div className="rounded-xl bg-[#eef9f3] p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#17613e]">
                              Réponse attendue
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[#072a3f]">
                              {typeof expected === 'string' ? expected : JSON.stringify(expected)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-semibold tabular-nums text-[#46657a]">
                          Points : {detail.points ?? 0} / {detail.max_points ?? question?.points ?? 0}
                        </p>
                        {question?.explanation && (
                          <p className="mt-1.5 text-xs leading-relaxed text-[#607f93]">
                            {question.explanation}
                          </p>
                        )}
                      </article>
                    );
                  })}

                  {(!reviewStudent.best_details || reviewStudent.best_details.length === 0) && (
                    <p className="rounded-xl bg-[#fef9ec] p-4 text-sm text-[#8a5108]">
                      Aucun détail de réponse n’a été enregistré pour cette tentative.
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
