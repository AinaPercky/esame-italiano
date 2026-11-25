import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Layers3,
  PenLine,
  RotateCcw,
  Save,
  Search,
  X,
  XCircle
} from 'lucide-react';
import {
  formatPointsCompact,
  hasStudentResponse,
  resolveQuickScoreOptions
} from '../utils/quizManualCorrectionDisplay';
import {
  buildWrittenQuestionCorrectionBreakdown,
  getOrderedWrittenQuestions,
  getWrittenAnswerValue,
  getWrittenAttemptReviewState,
  getWrittenQuestionExplanation,
  type OrderedWrittenQuestion
} from '../utils/writtenExamCorrectionDisplay';
import { downloadWrittenExamCopyPdf, getWrittenQuestionAutoScore } from './WrittenExamCopy';
import { hasPendingExpressionWritingScore, type WrittenQuestionType } from '../utils/writtenExam';

interface WrittenExamCorrectionPanelProps {
  examTitle: string;
  attempts: any[];
  initialAttemptId: string;
  definitions: any[];
  onClose: () => void;
  onSaveAttempt: (
    attempt: any,
    manualScores: Record<string, number>,
    expressionWritingScore: number | null
  ) => Promise<any[]>;
}

type PendingNavigationAction =
  | { type: 'select'; attemptId: string }
  | { type: 'close' };

type ExamSlide =
  | { kind: 'question'; id: string; item: OrderedWrittenQuestion }
  | { kind: 'expression'; id: '__expression__' };

const questionTypeLabel: Record<WrittenQuestionType, string> = {
  qcm: 'QCM',
  text: 'Réponse libre',
  reorder: 'Réordonnement',
  verbes_trous: 'Verbes à trous',
  mots_trous: 'Mots à trous'
};

function attemptStatusLabel(attempt: any): string {
  if (attempt.status === 'graded') return 'Corrigé';
  if (attempt.status === 'needs_review') return 'À corriger';
  if (attempt.status === 'timed_out') return 'Temps écoulé';
  if (attempt.status === 'submitted') return 'Remis';
  if (attempt.status === 'in_progress') return 'En cours';
  return String(attempt.status || '—');
}

function buildBaselineForAttempt(
  attempt: any | null,
  orderedQuestions: OrderedWrittenQuestion[]
): {
  points: Record<string, string>;
  expressionScore: string;
} {
  const points: Record<string, string> = {};
  if (!attempt) return { points, expressionScore: '' };

  orderedQuestions.forEach(({ question }) => {
    const saved = attempt.manual_scores?.[question.id];
    const auto = getWrittenQuestionAutoScore(question, getWrittenAnswerValue(attempt, question));
    points[question.id] = formatPointsCompact(Number(saved ?? auto ?? 0));
  });

  const expressionScore =
    attempt.expression_writing_score === null || attempt.expression_writing_score === undefined
      ? ''
      : String(attempt.expression_writing_score);

  return { points, expressionScore };
}

export const WrittenExamCorrectionPanel: React.FC<WrittenExamCorrectionPanelProps> = ({
  examTitle,
  attempts,
  initialAttemptId,
  definitions,
  onClose,
  onSaveAttempt
}) => {
  const [search, setSearch] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [questionFilter, setQuestionFilter] = useState<'all' | 'review' | 'correct' | 'missing'>('all');
  const [slideIndex, setSlideIndex] = useState(0);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialAttemptId || attempts[0]?.id || null);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [expressionScore, setExpressionScore] = useState<string>('');
  const [baseline, setBaseline] = useState<{
    points: Record<string, string>;
    expressionScore: string;
  }>({ points: {}, expressionScore: '' });
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(true);
  const [pendingNav, setPendingNav] = useState<PendingNavigationAction | null>(null);

  const dialogRef = useRef<HTMLElement | null>(null);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const slidePillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const sortedAttempts = useMemo(
    () =>
      [...attempts].sort(
        (a, b) =>
          new Date(b.submitted_at || b.started_at || 0).getTime() -
          new Date(a.submitted_at || a.started_at || 0).getTime()
      ),
    [attempts]
  );

  const pendingCount = useMemo(
    () => sortedAttempts.filter(item => getWrittenAttemptReviewState(item) === 'pending').length,
    [sortedAttempts]
  );
  const reviewedCount = useMemo(
    () => sortedAttempts.filter(item => getWrittenAttemptReviewState(item) === 'reviewed').length,
    [sortedAttempts]
  );

  const filteredAttempts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fr');
    return sortedAttempts.filter(item => {
      const reviewState = getWrittenAttemptReviewState(item);
      if (sidebarFilter === 'pending' && reviewState !== 'pending') return false;
      if (sidebarFilter === 'reviewed' && reviewState !== 'reviewed') return false;
      if (!term) return true;
      const hay = [
        item.students?.first_name,
        item.students?.last_name,
        item.students?.student_number,
        item.student_id
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr');
      return hay.includes(term);
    });
  }, [sortedAttempts, search, sidebarFilter]);

  const selectedAttempt = useMemo(
    () => sortedAttempts.find(item => item.id === selectedId) || null,
    [sortedAttempts, selectedId]
  );

  const activeDefinition = useMemo(
    () =>
      definitions.find((v: any) => v.id === selectedAttempt?.version_id) ||
      definitions[0] ||
      null,
    [definitions, selectedAttempt?.version_id]
  );

  const orderedQuestions = useMemo(
    () => (selectedAttempt && activeDefinition ? getOrderedWrittenQuestions(selectedAttempt, activeDefinition) : []),
    [selectedAttempt, activeDefinition]
  );

  const expressionMax = Number(activeDefinition?.expression_writing_max_points || 0);
  const canReview = Boolean(selectedAttempt && (orderedQuestions.length > 0 || expressionMax > 0));

  useEffect(() => {
    if (!selectedAttempt) {
      setPoints({});
      setExpressionScore('');
      setBaseline({ points: {}, expressionScore: '' });
      return;
    }
    const nextOrdered = activeDefinition ? getOrderedWrittenQuestions(selectedAttempt, activeDefinition) : [];
    const initial = buildBaselineForAttempt(selectedAttempt, nextOrdered);
    setPoints(initial.points);
    setExpressionScore(initial.expressionScore);
    setBaseline(initial);
    setSectionsOpen(false);
    setSupportOpen(false);
    setSlideIndex(0);
    setSaveNotice(null);
    setError(null);
    setPendingNav(null);
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  }, [selectedId, activeDefinition?.id]);

  const automaticQuestionTotal = orderedQuestions.reduce((sum, { question }) => {
    const auto = getWrittenQuestionAutoScore(question, getWrittenAnswerValue(selectedAttempt, question));
    return sum + (Number.isFinite(auto) ? auto : 0);
  }, 0);

  const maxQuestionTotal = orderedQuestions.reduce(
    (sum, { question }) => sum + (Number(question.points) || 0),
    0
  );

  const manualQuestionTotal = orderedQuestions.reduce((sum, { question }) => {
    const raw = points[question.id];
    const max = Number(question.points) || 0;
    const val =
      raw === undefined
        ? Number(
            selectedAttempt?.manual_scores?.[question.id] ??
              getWrittenQuestionAutoScore(question, getWrittenAnswerValue(selectedAttempt, question)) ??
              0
          )
        : Number(raw);
    return sum + (Number.isFinite(val) ? Math.min(max, Math.max(0, val)) : 0);
  }, 0);

  const parsedExprScore =
    expressionScore.trim() !== '' && Number.isFinite(Number(expressionScore))
      ? Math.min(expressionMax, Math.max(0, Number(expressionScore)))
      : 0;
  const totalWithExpression = Number((manualQuestionTotal + (expressionMax > 0 ? parsedExprScore : 0)).toFixed(2));
  const maxWithExpression = maxQuestionTotal + expressionMax;
  const deltaQuestionTotal = Number((manualQuestionTotal - automaticQuestionTotal).toFixed(2));

  const isDirty = useMemo(() => {
    if (!selectedAttempt || !canReview) return false;
    if (expressionScore !== baseline.expressionScore) return true;
    return orderedQuestions.some(({ question }) => {
      const curPoint = points[question.id] ?? '';
      const basePoint = baseline.points[question.id] ?? '';
      return curPoint !== basePoint;
    });
  }, [selectedAttempt, canReview, expressionScore, baseline, orderedQuestions, points]);

  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const getFocusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter(element => element.offsetParent !== null);
    getFocusable()[0]?.focus();

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (savingRef.current) return;
        if (isDirtyRef.current) {
          setPendingNav({ type: 'close' });
        } else {
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeys);
    return () => {
      document.removeEventListener('keydown', handleDialogKeys);
      previousFocus?.focus();
    };
  }, []);

  const questionStatus = (question: any): 'missing' | 'correct' | 'partial' | 'review' => {
    const rawAns = getWrittenAnswerValue(selectedAttempt, question);
    if (!hasStudentResponse(rawAns)) return 'missing';
    const auto = getWrittenQuestionAutoScore(question, rawAns);
    const raw = points[question.id];
    const awarded =
      raw === undefined
        ? Number(selectedAttempt?.manual_scores?.[question.id] ?? auto ?? 0)
        : Number(raw);
    const max = Number(question.points || 0);
    if (max > 0 && awarded >= max) return 'correct';
    if (awarded > 0) return 'partial';
    return 'review';
  };

  const correctQuestionCount = orderedQuestions.filter(item => questionStatus(item.question) === 'correct').length;
  const reviewQuestionCount = orderedQuestions.filter(item => {
    const st = questionStatus(item.question);
    return st === 'review' || st === 'partial';
  }).length;
  const missingQuestionCount = orderedQuestions.filter(item => questionStatus(item.question) === 'missing').length;

  const visibleQuestions = orderedQuestions.filter(item => {
    if (questionFilter === 'all') return true;
    const st = questionStatus(item.question);
    if (questionFilter === 'review') return st === 'review' || st === 'partial';
    return st === questionFilter;
  });

  const visibleSlides: ExamSlide[] = useMemo(() => {
    const qSlides: ExamSlide[] = visibleQuestions.map(item => ({
      kind: 'question',
      id: item.question.id,
      item
    }));
    if (expressionMax > 0) {
      qSlides.push({ kind: 'expression', id: '__expression__' });
    }
    return qSlides;
  }, [visibleQuestions, expressionMax]);

  const safeSlideIndex =
    visibleSlides.length > 0 ? Math.min(Math.max(0, slideIndex), visibleSlides.length - 1) : 0;
  const currentSlide = visibleSlides[safeSlideIndex] || null;

  const goToSlide = (targetIndex: number) => {
    if (visibleSlides.length === 0) return;
    const clamped = Math.min(Math.max(0, targetIndex), visibleSlides.length - 1);
    setSlideIndex(clamped);
    setSupportOpen(false);
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    setSlideIndex(0);
    setSupportOpen(false);
  }, [questionFilter]);

  useEffect(() => {
    if (!currentSlide) return;
    const pill = slidePillRefs.current[currentSlide.id];
    if (pill && typeof pill.scrollIntoView === 'function') {
      pill.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  }, [currentSlide?.id]);

  useEffect(() => {
    const handleSlideArrows = (event: KeyboardEvent) => {
      if (!canReview || visibleSlides.length <= 1) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToSlide(safeSlideIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToSlide(safeSlideIndex + 1);
      }
    };
    document.addEventListener('keydown', handleSlideArrows);
    return () => document.removeEventListener('keydown', handleSlideArrows);
  }, [canReview, visibleSlides.length, safeSlideIndex]);

  const navPool = filteredAttempts.some(item => item.id === selectedId) ? filteredAttempts : sortedAttempts;
  const currentNavIndex = navPool.findIndex(item => item.id === selectedId);
  const prevAttempt = currentNavIndex > 0 ? navPool[currentNavIndex - 1] : null;
  const nextAttempt =
    currentNavIndex >= 0 && currentNavIndex < navPool.length - 1 ? navPool[currentNavIndex + 1] : null;

  const nextPendingAttempt = useMemo(() => {
    const pendingList = sortedAttempts.filter(
      item => item.id !== selectedId && getWrittenAttemptReviewState(item) === 'pending'
    );
    if (pendingList.length === 0) return null;
    const currentIndex = sortedAttempts.findIndex(s => s.id === selectedId);
    const afterCurrent = pendingList.find(item => sortedAttempts.indexOf(item) > currentIndex);
    return afterCurrent || pendingList[0];
  }, [sortedAttempts, selectedId]);

  const performNavigation = (action: PendingNavigationAction) => {
    setPendingNav(null);
    if (action.type === 'close') {
      onClose();
      return;
    }
    setSelectedId(action.attemptId);
    setQuestionFilter('all');
    setMobileDetailOpen(true);
  };

  const requestSelectAttempt = (attemptId: string) => {
    if (saving || attemptId === selectedId) {
      setMobileDetailOpen(true);
      return;
    }
    if (isDirty) {
      setPendingNav({ type: 'select', attemptId });
      return;
    }
    performNavigation({ type: 'select', attemptId });
  };

  const requestClose = () => {
    if (saving) return;
    if (isDirty) {
      setPendingNav({ type: 'close' });
      return;
    }
    onClose();
  };

  const validateAndBuildScores = (): {
    scores: Record<string, number>;
    exprValue: number | null;
  } | null => {
    if (!selectedAttempt || !canReview) return null;
    setError(null);

    const scores: Record<string, number> = {};
    for (const { question } of orderedQuestions) {
      const rawValue =
        points[question.id] ??
        String(
          selectedAttempt.manual_scores?.[question.id] ??
            getWrittenQuestionAutoScore(question, getWrittenAnswerValue(selectedAttempt, question)) ??
            0
        );
      const value = Number(rawValue);
      const maximum = Number(question.points) || 0;
      if (String(rawValue).trim() === '' || !Number.isFinite(value) || value < 0 || value > maximum) {
        setError(
          `La note de la question « ${question.prompt} » doit être comprise entre 0 et ${maximum} points.`
        );
        return null;
      }
      scores[question.id] = value;
    }

    let exprValue: number | null = null;
    if (expressionMax > 0) {
      const parsed = Number(expressionScore);
      if (
        expressionScore.trim() === '' ||
        !Number.isFinite(parsed) ||
        parsed < 0 ||
        parsed > expressionMax
      ) {
        const exprSlideIdx = visibleSlides.findIndex(s => s.kind === 'expression');
        if (exprSlideIdx >= 0) setSlideIndex(exprSlideIdx);
        setError(
          `Saisissez une note d’expression écrite valide entre 0 et ${expressionMax} avant d’enregistrer.`
        );
        return null;
      }
      exprValue = parsed;
    }

    return { scores, exprValue };
  };

  const handleSave = async (afterSave?: PendingNavigationAction | 'next_pending'): Promise<boolean> => {
    if (!selectedAttempt || !canReview) return false;
    const validated = validateAndBuildScores();
    if (!validated) return false;

    try {
      setSaving(true);
      setSaveNotice(null);
      const updatedRows = await onSaveAttempt(selectedAttempt, validated.scores, validated.exprValue);
      const refreshed = updatedRows.find(item => item.id === selectedAttempt.id) || selectedAttempt;
      const nextBaseline = buildBaselineForAttempt(refreshed, orderedQuestions);
      setPoints(nextBaseline.points);
      setExpressionScore(nextBaseline.expressionScore);
      setBaseline(nextBaseline);

      if (afterSave === 'next_pending') {
        const target = nextPendingAttempt || nextAttempt;
        if (target) {
          performNavigation({ type: 'select', attemptId: target.id });
        } else {
          setSaveNotice('Correction enregistrée. Toutes les copies disponibles ont été vérifiées.');
        }
      } else if (afterSave) {
        performNavigation(afterSave);
      } else {
        const studentName = [
          selectedAttempt.students?.first_name,
          selectedAttempt.students?.last_name
        ]
          .filter(Boolean)
          .join(' ');
        setSaveNotice(
          `Correction enregistrée${studentName ? ` pour ${studentName}` : ''}.`
        );
      }
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'La correction n’a pas pu être enregistrée.'
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetToAutomatic = () => {
    if (!selectedAttempt) return;
    setPoints(
      Object.fromEntries(
        orderedQuestions.map(({ question }) => [
          question.id,
          formatPointsCompact(
            getWrittenQuestionAutoScore(question, getWrittenAnswerValue(selectedAttempt, question)) ?? 0
          )
        ])
      )
    );
    setSaveNotice(null);
  };

  const setQuestionScore = (questionId: string, score: number) => {
    setPoints(prev => ({ ...prev, [questionId]: formatPointsCompact(score) }));
    setSaveNotice(null);
  };

  const studentFullName = selectedAttempt
    ? [selectedAttempt.students?.first_name, selectedAttempt.students?.last_name]
        .filter(Boolean)
        .join(' ') || 'Élève sans nom'
    : '';

  const expressionPending = expressionMax > 0 && expressionScore.trim() === '';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-[#072a3f]/60 p-0 sm:p-3 lg:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="written-exam-correction-title"
    >
      <section
        ref={dialogRef}
        className="flex h-[100dvh] w-full max-w-[1440px] flex-col overflow-hidden bg-[#f5f8fa] shadow-2xl sm:h-full sm:rounded-2xl"
      >
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#d8e6ee] bg-white px-3 py-1.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e6f0f7] text-[#0b3c5d]">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <h2
              id="written-exam-correction-title"
              className="truncate text-xs font-extrabold text-[#072a3f] sm:text-sm"
            >
              <span className="font-semibold text-[#176b45]">Correction · </span>
              {examTitle}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {selectedAttempt && navPool.length > 1 && (
              <div className="hidden items-center gap-0.5 rounded-lg border border-[#d8e6ee] bg-[#f8fbfd] p-0.5 md:flex">
                <button
                  type="button"
                  onClick={() => prevAttempt && requestSelectAttempt(prevAttempt.id)}
                  disabled={!prevAttempt || saving}
                  className="inline-flex h-7 items-center gap-0.5 rounded px-1.5 text-[11px] font-semibold text-[#0b3c5d] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  title="Copie précédente"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Préc.</span>
                </button>
                <span className="px-1.5 text-[11px] font-bold tabular-nums text-[#46657a]">
                  {currentNavIndex >= 0 ? `${currentNavIndex + 1}/${navPool.length}` : `${navPool.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => nextAttempt && requestSelectAttempt(nextAttempt.id)}
                  disabled={!nextAttempt || saving}
                  className="inline-flex h-7 items-center gap-0.5 rounded px-1.5 text-[11px] font-semibold text-[#0b3c5d] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  title="Copie suivante"
                >
                  <span>Suiv.</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {nextPendingAttempt && (
              <button
                type="button"
                onClick={() => requestSelectAttempt(nextPendingAttempt.id)}
                disabled={saving}
                className="hidden h-8 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-45 sm:inline-flex"
                title="Aller directement à la prochaine copie à corriger"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Prochaine à corriger</span>
              </button>
            )}

            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              aria-label="Fermer la correction d’examen"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d8e6ee] text-[#46657a] hover:bg-[#f3f8fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Inline unsaved changes confirmation banner */}
        {pendingNav && (
          <div
            role="alert"
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 sm:px-6"
          >
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
              <span>Vous avez des modifications non enregistrées sur cette copie.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingNav(null)}
                disabled={saving}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
              >
                Rester ici
              </button>
              <button
                type="button"
                onClick={() => performNavigation(pendingNav)}
                disabled={saving}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-50"
              >
                Ignorer les modifications
              </button>
              <button
                type="button"
                onClick={() => void handleSave(pendingNav)}
                disabled={saving}
                className="rounded-lg bg-[#072a3f] px-3 py-1.5 font-bold text-white hover:bg-[#0b3c5d]"
              >
                Enregistrer et continuer
              </button>
            </div>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[310px_minmax(0,1fr)]">
          {/* Left sidebar: filter tiles + student copies list */}
          <aside
            className={
              (mobileDetailOpen ? 'hidden lg:flex' : 'flex') +
              ' min-h-0 flex-col border-r border-[#d8e6ee] bg-white'
            }
          >
            <div className="border-b border-[#e6edf2] p-3.5">
              <div
                className="grid grid-cols-3 gap-1.5 text-center"
                role="group"
                aria-label="Filtrer les copies par statut"
              >
                {(
                  [
                    { id: 'all', label: 'Toutes', count: sortedAttempts.length, tone: 'text-[#072a3f]' },
                    { id: 'pending', label: 'À corriger', count: pendingCount, tone: 'text-amber-800' },
                    { id: 'reviewed', label: 'Corrigées', count: reviewedCount, tone: 'text-[#176b45]' }
                  ] as const
                ).map(tab => {
                  const active = sidebarFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSidebarFilter(tab.id)}
                      className={
                        'rounded-lg border px-2 py-2 transition-colors ' +
                        (active
                          ? 'border-[#0b3c5d] bg-[#edf5fa] shadow-2xs'
                          : 'border-[#e6edf2] bg-[#f8fbfd] hover:bg-[#f1f6f9]')
                      }
                    >
                      <div className={`text-base font-extrabold tabular-nums ${tab.tone}`}>
                        {tab.count}
                      </div>
                      <div className="text-[11px] font-semibold text-[#46657a]">{tab.label}</div>
                    </button>
                  );
                })}
              </div>

              <label className="mt-2.5 block">
                <span className="sr-only">Rechercher un élève</span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Nom, prénom, matricule…"
                    className="min-h-10 w-full rounded-lg border border-[#cbd9e2] bg-white pl-9 pr-3 text-sm text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15"
                  />
                </span>
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredAttempts.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  Aucune copie ne correspond à ce filtre.
                </div>
              ) : (
                filteredAttempts.map(item => {
                  const active = selectedId === item.id;
                  const state = getWrittenAttemptReviewState(item);
                  const name =
                    [item.students?.first_name, item.students?.last_name].filter(Boolean).join(' ') ||
                    'Élève sans nom';
                  const hasPendingExpr = hasPendingExpressionWritingScore(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => requestSelectAttempt(item.id)}
                      className={
                        'flex w-full items-center justify-between gap-2.5 border-b border-[#edf1f4] px-3.5 py-2.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#0b3c5d] ' +
                        (active ? 'bg-[#edf5fa]' : 'bg-white hover:bg-[#f7fafc]')
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[#072a3f]">{name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {item.students?.student_number || 'Sans matricule'} · T{item.attempt_number || 1}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#46657a]">
                          <span className="font-bold tabular-nums text-[#072a3f]">
                            {item.raw_score == null ? '—' : `${item.raw_score}/${item.raw_max}`}
                          </span>
                          <span>·</span>
                          <span>{attemptStatusLabel(item)}</span>
                          {item.integrity_failed && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                              Disq.
                            </span>
                          )}
                        </span>
                      </span>

                      <span className="shrink-0 text-right">
                        {state === 'reviewed' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#eef9f3] px-2 py-1 text-[11px] font-bold text-[#176b45]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Corrigée
                          </span>
                        ) : state === 'unavailable' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            <Clock className="h-3.5 w-3.5" />
                            En cours
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                            <Clock className="h-3.5 w-3.5" />
                            {hasPendingExpr ? 'Expr.' : 'À corriger'}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Main detail panel (NOT <main> to avoid .teacher-space main padding-bottom rule) */}
          <div
            role="region"
            aria-label="Détail de la copie d’examen"
            className={(mobileDetailOpen ? 'flex' : 'hidden lg:flex') + ' min-h-0 min-w-0 flex-col'}
          >
            {!selectedAttempt ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <FileText className="mx-auto h-10 w-10 text-slate-300" />
                  <h3 className="mt-3 font-bold text-[#072a3f]">Sélectionnez une copie</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Choisissez un élève dans la liste pour vérifier ses réponses et ajuster sa note.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Student copy header */}
                <div className="shrink-0 border-b border-[#d8e6ee] bg-white px-3 py-1.5 sm:px-5 sm:py-2">
                  <div className="flex items-center justify-between gap-2 lg:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileDetailOpen(false)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0b3c5d]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Liste
                    </button>

                    <div className="flex items-center gap-1.5">
                      {(selectedAttempt.written_exam_section_results || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSectionsOpen(prev => !prev)}
                          aria-expanded={sectionsOpen}
                          className={
                            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ' +
                            (sectionsOpen
                              ? 'border-[#0b3c5d]/30 bg-[#edf5fa] text-[#0b3c5d]'
                              : 'border-[#d8e6ee] bg-white text-[#46657a]')
                          }
                        >
                          <Layers3 className="h-3 w-3 shrink-0" />
                          <span>Sections</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => downloadWrittenExamCopyPdf(selectedAttempt, activeDefinition)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#d8e6ee] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#0b3c5d]"
                        title="Télécharger la feuille de copie en PDF"
                      >
                        <Download className="h-3 w-3 shrink-0" />
                        <span>PDF</span>
                      </button>
                    </div>

                    {navPool.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => prevAttempt && requestSelectAttempt(prevAttempt.id)}
                          disabled={!prevAttempt || saving}
                          aria-label="Copie précédente"
                          className="rounded border border-[#d8e6ee] p-0.5 text-[#0b3c5d] disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[11px] font-bold tabular-nums text-[#46657a]">
                          {currentNavIndex + 1}/{navPool.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => nextAttempt && requestSelectAttempt(nextAttempt.id)}
                          disabled={!nextAttempt || saving}
                          aria-label="Copie suivante"
                          className="rounded border border-[#d8e6ee] p-0.5 text-[#0b3c5d] disabled:opacity-40"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2 lg:mt-0">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-extrabold text-[#072a3f] sm:text-base">
                        {studentFullName}
                      </h3>
                      <p className="truncate text-[11px] text-slate-500">
                        {selectedAttempt.students?.student_number || selectedAttempt.student_id} · T{selectedAttempt.attempt_number || 1}
                        {selectedAttempt.submitted_at
                          ? ` · ${new Date(selectedAttempt.submitted_at).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {(selectedAttempt.written_exam_section_results || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSectionsOpen(prev => !prev)}
                          aria-expanded={sectionsOpen}
                          className={
                            'hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors lg:inline-flex ' +
                            (sectionsOpen
                              ? 'border-[#0b3c5d]/30 bg-[#edf5fa] text-[#0b3c5d]'
                              : 'border-[#d8e6ee] bg-white text-[#46657a] hover:bg-[#f3f8fb]')
                          }
                        >
                          <Layers3 className="h-3.5 w-3.5 shrink-0" />
                          <span>Sections</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => downloadWrittenExamCopyPdf(selectedAttempt, activeDefinition)}
                        className="hidden items-center gap-1.5 rounded-lg border border-[#d8e6ee] bg-white px-2.5 py-1 text-xs font-semibold text-[#0b3c5d] hover:bg-[#f3f8fb] lg:inline-flex"
                        title="Télécharger la feuille de copie en PDF"
                      >
                        <Download className="h-3.5 w-3.5 shrink-0" />
                        <span>PDF</span>
                      </button>

                      <div className="flex items-center gap-1.5 rounded-lg border border-[#d8e6ee] bg-[#f8fbfd] px-2.5 py-1 text-xs">
                        <span className="hidden text-[11px] font-semibold text-slate-500 sm:inline">Auto</span>
                        <span className="font-mono font-bold tabular-nums text-[#072a3f]">
                          {formatPointsCompact(automaticQuestionTotal)}
                        </span>
                        <span className="text-slate-300">→</span>
                        <span className="font-mono font-extrabold tabular-nums text-[#176b45]">
                          {formatPointsCompact(totalWithExpression)}
                          <span className="text-[11px] font-semibold text-[#5c8b72]">
                            /{formatPointsCompact(maxWithExpression)}
                          </span>
                        </span>
                        {deltaQuestionTotal !== 0 && (
                          <span
                            className={
                              'rounded px-1 py-0.5 text-[10px] font-extrabold tabular-nums ' +
                              (deltaQuestionTotal > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800')
                            }
                          >
                            {deltaQuestionTotal > 0
                              ? `+${formatPointsCompact(deltaQuestionTotal)}`
                              : formatPointsCompact(deltaQuestionTotal)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {sectionsOpen && (selectedAttempt.written_exam_section_results || []).length > 0 && (
                    <div className="mt-2 grid gap-1.5 border-t border-[#edf1f4] pt-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(selectedAttempt.written_exam_section_results || []).map((sectionResult: any) => {
                        const section = (activeDefinition?.written_exam_sections || []).find(
                          (x: any) => x.id === sectionResult.section_id
                        );
                        return (
                          <div
                            key={sectionResult.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-[#f8fbfd] px-2.5 py-1.5 text-xs"
                          >
                            <span className="truncate font-medium text-[#46657a]">
                              {section?.title || 'Section'}
                            </span>
                            <strong className="shrink-0 font-mono tabular-nums text-[#072a3f]">
                              {sectionResult.raw_score} / {sectionResult.raw_max}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedAttempt.integrity_failed && (
                    <div
                      role="alert"
                      className="mt-1.5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-900"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                      <span className="truncate">
                        Disqualifiée ({selectedAttempt.integrity_failure_reason || 'intégrité'}) · note finale 0
                      </span>
                    </div>
                  )}
                </div>

                {/* Horizontal slide-by-slide correction stage */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:bg-[#f7fafc]">
                  {!activeDefinition || (!orderedQuestions.length && expressionMax === 0) ? (
                    <div className="p-4">
                      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                        <div className="flex items-center gap-2 font-bold">
                          <AlertCircle className="h-4 w-4" />
                          Contenu d’examen indisponible
                        </div>
                        <p className="mt-1 text-xs leading-relaxed">
                          Aucune question n’est disponible pour cette tentative.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                      {/* Lean Filter + Horizontal slide stepper strip */}
                      <div className="shrink-0 border-b border-[#e3ecf2] bg-[#f8fbfd] px-3 py-1.5 sm:px-5 sm:py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto"
                            role="group"
                            aria-label="Filtrer les questions de l’examen"
                          >
                            {(
                              [
                                { id: 'all', label: 'Toutes', count: orderedQuestions.length },
                                { id: 'review', label: 'À vérifier', count: reviewQuestionCount },
                                { id: 'correct', label: 'Justes', count: correctQuestionCount },
                                { id: 'missing', label: 'Vides', count: missingQuestionCount }
                              ] as const
                            ).map(filter => {
                              const active = questionFilter === filter.id;
                              return (
                                <button
                                  key={filter.id}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => setQuestionFilter(filter.id)}
                                  className={
                                    'h-6.5 shrink-0 whitespace-nowrap rounded-md border px-2 text-[11px] font-bold tabular-nums transition-colors ' +
                                    (active
                                      ? filter.id === 'review'
                                        ? 'border-rose-700 bg-rose-700 text-white'
                                        : filter.id === 'correct'
                                          ? 'border-emerald-700 bg-emerald-700 text-white'
                                          : filter.id === 'missing'
                                            ? 'border-slate-700 bg-slate-700 text-white'
                                            : 'border-[#0b3c5d] bg-[#0b3c5d] text-white'
                                      : 'border-[#d5e1e9] bg-white text-[#46657a] hover:bg-[#edf5fa]')
                                  }
                                >
                                  {filter.label} ({filter.count})
                                </button>
                              );
                            })}
                          </div>

                          {visibleSlides.length > 0 && (
                            <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-[#0b3c5d]">
                              {safeSlideIndex + 1}/{visibleSlides.length}
                            </span>
                          )}
                        </div>

                        {visibleSlides.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => goToSlide(safeSlideIndex - 1)}
                              disabled={safeSlideIndex === 0}
                              aria-label="Diapositive précédente"
                              title="Précédente (Flèche gauche)"
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#cbd9e2] bg-white text-[#0b3c5d] hover:bg-[#edf5fa] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>

                            <nav
                              aria-label="Navigation par diapositives des questions"
                              className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
                            >
                              {visibleSlides.map((slide, idx) => {
                                const isCurrent = idx === safeSlideIndex;
                                if (slide.kind === 'expression') {
                                  return (
                                    <button
                                      key={slide.id}
                                      ref={el => {
                                        slidePillRefs.current[slide.id] = el;
                                      }}
                                      type="button"
                                      onClick={() => goToSlide(idx)}
                                      aria-current={isCurrent ? 'step' : undefined}
                                      aria-label="Note d’expression écrite"
                                      className={
                                        'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-bold tabular-nums transition-colors ' +
                                        (isCurrent
                                          ? 'border-[#072a3f] bg-[#072a3f] text-white'
                                          : expressionPending
                                            ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100')
                                      }
                                    >
                                      <PenLine className="h-3 w-3 shrink-0" />
                                      <span>Expr.</span>
                                      {!expressionPending && <Check className="h-3 w-3 shrink-0" />}
                                    </button>
                                  );
                                }

                                const qItem = slide.item;
                                const st = questionStatus(qItem.question);
                                return (
                                  <button
                                    key={slide.id}
                                    ref={el => {
                                      slidePillRefs.current[slide.id] = el;
                                    }}
                                    type="button"
                                    onClick={() => goToSlide(idx)}
                                    aria-current={isCurrent ? 'step' : undefined}
                                    aria-label={`Question ${qItem.questionIndex + 1}`}
                                    className={
                                      'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-bold tabular-nums transition-colors ' +
                                      (isCurrent
                                        ? 'border-[#072a3f] bg-[#072a3f] text-white'
                                        : st === 'correct'
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                          : st === 'partial'
                                            ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                            : st === 'missing'
                                              ? 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                                              : 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100')
                                    }
                                  >
                                    <span>Q{qItem.questionIndex + 1}</span>
                                    {st === 'correct' ? (
                                      <Check className="h-3 w-3 shrink-0" />
                                    ) : st === 'review' ? (
                                      <X className="h-3 w-3 shrink-0" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </nav>

                            <button
                              type="button"
                              onClick={() => goToSlide(safeSlideIndex + 1)}
                              disabled={safeSlideIndex >= visibleSlides.length - 1}
                              aria-label="Diapositive suivante"
                              title="Suivante (Flèche droite)"
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#cbd9e2] bg-white text-[#0b3c5d] hover:bg-[#edf5fa] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {!currentSlide ? (
                        <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-500">
                          Aucune question dans cette catégorie.
                        </div>
                      ) : currentSlide.kind === 'expression' ? (
                        /* Expression écrite dedicated slide */
                        <article
                          key="__expression__"
                          onTouchStart={event => {
                            const touch = event.touches[0];
                            if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                          }}
                          onTouchEnd={event => {
                            const start = touchStartRef.current;
                            touchStartRef.current = null;
                            const touch = event.changedTouches[0];
                            if (!start || !touch || visibleSlides.length <= 1) return;
                            const dx = touch.clientX - start.x;
                            const dy = touch.clientY - start.y;
                            if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                              if (dx < 0) goToSlide(safeSlideIndex + 1);
                              else goToSlide(safeSlideIndex - 1);
                            }
                          }}
                          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:mx-4 sm:my-2.5 sm:rounded-xl sm:border sm:border-[#d8e6ee]"
                        >
                          <div className="shrink-0 border-b border-[#edf1f4] px-3.5 py-2.5 sm:px-5 sm:py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs text-[#58768a]">
                                <span className="font-extrabold text-[#0b3c5d]">Expression écrite</span>
                                <span>·</span>
                                <span className="font-semibold tabular-nums">/{expressionMax} pts</span>
                              </div>
                              {expressionPending ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                  <Clock className="h-3 w-3" />
                                  À noter
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Notée
                                </span>
                              )}
                            </div>
                            <h4 className="mt-1.5 text-[15px] font-bold leading-snug text-[#072a3f] sm:text-base">
                              Note de production écrite
                            </h4>
                          </div>

                          <div ref={detailScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-5 sm:py-5">
                            <div className="rounded-xl border border-[#b9d8c9] bg-[#f4fbf7] p-4 sm:p-5">
                              <p className="text-xs font-bold uppercase tracking-wider text-[#176b45]">
                                Barème d’expression écrite
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-[#072a3f]">
                                Attribuez la note obtenue par l’élève sur {expressionMax} points. Elle s’ajoute automatiquement au score des questions pour composer la note finale.
                              </p>
                              {selectedAttempt.integrity_failed && (
                                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                                  Cette tentative est disqualifiée (note finale fixée à 0), mais la note d’expression écrite reste enregistrée à titre pédagogique.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 border-t border-[#e3ecf2] bg-[#f8fbfd] px-3.5 py-2.5 sm:px-5 sm:py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Attribution rapide expression écrite">
                                {[0, Number((expressionMax / 2).toFixed(1)), expressionMax].map(preset => {
                                  const active =
                                    expressionScore.trim() !== '' &&
                                    Math.abs(Number(expressionScore) - preset) < 0.001;
                                  return (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() => {
                                        setSaveNotice(null);
                                        setExpressionScore(formatPointsCompact(preset));
                                      }}
                                      disabled={saving}
                                      className={
                                        'h-8 rounded-lg border px-2.5 text-xs font-bold tabular-nums transition-colors disabled:opacity-45 ' +
                                        (active
                                          ? preset === expressionMax
                                            ? 'border-[#176b45] bg-[#176b45] text-white'
                                            : preset === 0
                                              ? 'border-rose-700 bg-rose-700 text-white'
                                              : 'border-[#0b3c5d] bg-[#0b3c5d] text-white'
                                          : 'border-[#cbd9e2] bg-white text-[#072a3f] hover:bg-[#edf5fa]')
                                      }
                                    >
                                      {preset === expressionMax
                                        ? `Max (${formatPointsCompact(preset)})`
                                        : formatPointsCompact(preset)}
                                    </button>
                                  );
                                })}
                              </div>

                              <label className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-[#46657a]">Note :</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  max={expressionMax}
                                  step="0.5"
                                  value={expressionScore}
                                  onChange={event => {
                                    setSaveNotice(null);
                                    setExpressionScore(event.target.value);
                                  }}
                                  placeholder="—"
                                  disabled={saving}
                                  className="h-8 w-20 rounded-lg border border-[#cbd9e2] bg-white px-2 text-right text-sm font-extrabold tabular-nums text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15"
                                />
                                <span className="font-mono text-xs font-semibold tabular-nums text-slate-500">
                                  / {formatPointsCompact(expressionMax)}
                                </span>
                              </label>
                            </div>
                          </div>
                        </article>
                      ) : (() => {
                          const { question, section, sectionIndex, questionIndex } = currentSlide.item;
                          const qType = (question.question_type || 'text') as WrittenQuestionType;
                          const rawAnswer = getWrittenAnswerValue(selectedAttempt, question);
                          const autoPts = Number(getWrittenQuestionAutoScore(question, rawAnswer) ?? 0);
                          const maximum = Number(question.points) || 0;
                          const rawValue =
                            points[question.id] ??
                            String(selectedAttempt.manual_scores?.[question.id] ?? autoPts);
                          const numericValue = Number(rawValue);
                          const isInvalid =
                            rawValue.trim() === '' ||
                            !Number.isFinite(numericValue) ||
                            numericValue < 0 ||
                            numericValue > maximum;
                          const isChanged = Number.isFinite(numericValue) && numericValue !== autoPts;
                          const status = questionStatus(question);
                          const breakdown = buildWrittenQuestionCorrectionBreakdown(question, rawAnswer);
                          const explanation = getWrittenQuestionExplanation(question);
                          const quickOptions = resolveQuickScoreOptions(maximum, autoPts);
                          const hasSupport = Boolean(section?.support_text || section?.support_url);

                          return (
                            <article
                              key={question.id}
                              onTouchStart={event => {
                                const touch = event.touches[0];
                                if (touch) {
                                  touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                                }
                              }}
                              onTouchEnd={event => {
                                const start = touchStartRef.current;
                                touchStartRef.current = null;
                                const touch = event.changedTouches[0];
                                if (!start || !touch || visibleSlides.length <= 1) return;
                                const dx = touch.clientX - start.x;
                                const dy = touch.clientY - start.y;
                                if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                                  if (dx < 0) goToSlide(safeSlideIndex + 1);
                                  else goToSlide(safeSlideIndex - 1);
                                }
                              }}
                              className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:mx-4 sm:my-2.5 sm:rounded-xl sm:border sm:border-[#d8e6ee]"
                            >
                              {/* Minimalist slide question header */}
                              <div className="shrink-0 border-b border-[#edf1f4] px-3.5 py-2.5 sm:px-5 sm:py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-[#58768a]">
                                    <span className="font-extrabold text-[#0b3c5d]">
                                      Q{questionIndex + 1}
                                    </span>
                                    <span>·</span>
                                    <span className="truncate font-semibold text-[#176b45]">
                                      P{sectionIndex + 1} · {section?.title || 'Section'}
                                    </span>
                                    <span>·</span>
                                    <span className="font-medium">{questionTypeLabel[qType]}</span>
                                    <span>·</span>
                                    <span className="font-semibold tabular-nums">
                                      {formatPointsCompact(maximum)} pt{maximum > 1 ? 's' : ''}
                                    </span>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {hasSupport && (
                                      <button
                                        type="button"
                                        onClick={() => setSupportOpen(prev => !prev)}
                                        aria-expanded={supportOpen}
                                        className={
                                          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ' +
                                          (supportOpen
                                            ? 'border-[#0b3c5d]/30 bg-[#edf5fa] text-[#0b3c5d]'
                                            : 'border-[#d8e6ee] bg-white text-[#46657a] hover:bg-[#f3f8fb]')
                                        }
                                      >
                                        <BookOpen className="h-3 w-3 shrink-0" />
                                        <span className="hidden sm:inline">Support</span>
                                      </button>
                                    )}
                                    {isChanged && (
                                      <span className="rounded bg-[#e6f0f7] px-1.5 py-0.5 text-[11px] font-bold text-[#0b3c5d]">
                                        Modifiée
                                      </span>
                                    )}
                                    {status === 'correct' ? (
                                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Juste
                                      </span>
                                    ) : status === 'partial' ? (
                                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                        <AlertCircle className="h-3 w-3" />
                                        Partiel
                                      </span>
                                    ) : status === 'missing' ? (
                                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                        <AlertCircle className="h-3 w-3" />
                                        Sans réponse
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                                        <XCircle className="h-3 w-3" />
                                        À vérifier
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <h4 className="mt-1.5 whitespace-pre-wrap text-[15px] font-bold leading-snug text-[#072a3f] sm:text-base">
                                  {question.prompt}
                                </h4>

                                {supportOpen && hasSupport && (
                                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[#d8e6ee] bg-[#f8fbfd] p-3 text-xs leading-relaxed text-[#072a3f]">
                                    {section.support_text && (
                                      <p className="whitespace-pre-wrap">{section.support_text}</p>
                                    )}
                                    {section.support_url && (
                                      <a
                                        href={section.support_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-1.5 inline-flex items-center gap-1 font-semibold text-[#0b3c5d] underline"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Ouvrir le document support
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Spacious Student Answer vs Expected Answer Body */}
                              <div
                                ref={detailScrollRef}
                                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:px-5 sm:py-4"
                              >
                                {breakdown.type === 'qcm' && (
                                  <div className="space-y-3">
                                    <div className="grid divide-y divide-[#e3ecf2] overflow-hidden rounded-xl border border-[#d8e6ee] bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                                      <div
                                        className={
                                          'flex flex-col justify-between p-4 sm:p-5 ' +
                                          (!breakdown.hasResponse
                                            ? 'bg-slate-50/70'
                                            : breakdown.isCorrect
                                              ? 'bg-emerald-50/45'
                                              : 'bg-rose-50/45')
                                        }
                                      >
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#46657a]">
                                          {breakdown.hasResponse ? (
                                            breakdown.isCorrect ? (
                                              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                                            ) : (
                                              <X className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                                            )
                                          ) : null}
                                          <span>Réponse de l’élève</span>
                                        </div>
                                        <p className="mt-2.5 min-h-[2.75rem] break-words text-base font-semibold leading-relaxed text-[#072a3f] sm:text-[17px]">
                                          {breakdown.studentDisplay}
                                        </p>
                                      </div>

                                      <div className="flex flex-col justify-between bg-[#f4fbf7] p-4 sm:p-5">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#176b45]">
                                          <Check className="h-3.5 w-3.5 shrink-0 text-[#176b45]" />
                                          <span>Corrigé attendu</span>
                                        </div>
                                        <p className="mt-2.5 min-h-[2.75rem] break-words text-base font-semibold leading-relaxed text-[#0f472d] sm:text-[17px]">
                                          {breakdown.expectedDisplay}
                                        </p>
                                      </div>
                                    </div>

                                    {breakdown.options.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {breakdown.options.map(opt => (
                                          <span
                                            key={`${opt.index}-${opt.label}`}
                                            className={
                                              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ' +
                                              (opt.isExpected && opt.isSelected
                                                ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-900'
                                                : opt.isSelected
                                                  ? 'border-rose-300 bg-rose-50 font-bold text-rose-900'
                                                  : opt.isExpected
                                                    ? 'border-emerald-300 bg-[#f3faf6] font-bold text-[#176b45]'
                                                    : 'border-slate-200 bg-slate-50 text-slate-600')
                                            }
                                          >
                                            <span className="font-mono text-[11px] opacity-70">
                                              {String.fromCharCode(65 + opt.index)}.
                                            </span>
                                            <span>{opt.label}</span>
                                            {opt.isSelected && <span className="text-[10px] underline">Élève</span>}
                                            {opt.isExpected && !opt.isSelected && (
                                              <span className="text-[10px] underline">Attendu</span>
                                            )}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {breakdown.type === 'text' && !breakdown.isMultiBlank && (
                                  <div className="grid divide-y divide-[#e3ecf2] overflow-hidden rounded-xl border border-[#d8e6ee] bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                                    <div
                                      className={
                                        'flex flex-col justify-between p-4 sm:p-5 ' +
                                        (breakdown.slots[0]?.isEmpty
                                          ? 'bg-slate-50/70'
                                          : breakdown.slots[0]?.isCorrect
                                            ? 'bg-emerald-50/45'
                                            : 'bg-rose-50/45')
                                      }
                                    >
                                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#46657a]">
                                        {breakdown.slots[0] && !breakdown.slots[0].isEmpty ? (
                                          breakdown.slots[0].isCorrect ? (
                                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                                          ) : (
                                            <X className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                                          )
                                        ) : null}
                                        <span>Réponse de l’élève</span>
                                      </div>
                                      <p
                                        className={
                                          'mt-2.5 min-h-[3rem] whitespace-pre-wrap break-words text-base font-semibold leading-relaxed sm:text-[17px] ' +
                                          (breakdown.slots[0]?.isEmpty ? 'text-slate-400 italic' : 'text-[#072a3f]')
                                        }
                                      >
                                        {breakdown.slots[0]?.studentValue || 'Aucune réponse'}
                                      </p>
                                    </div>

                                    <div className="flex flex-col justify-between bg-[#f4fbf7] p-4 sm:p-5">
                                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#176b45]">
                                        <Check className="h-3.5 w-3.5 shrink-0 text-[#176b45]" />
                                        <span>Corrigé attendu</span>
                                      </div>
                                      <p className="mt-2.5 min-h-[3rem] whitespace-pre-wrap break-words text-base font-semibold leading-relaxed text-[#0f472d] sm:text-[17px]">
                                        {breakdown.slots[0]?.expectedValue || 'Corrigé non défini'}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {breakdown.type === 'text' && breakdown.isMultiBlank && (
                                  <div className="overflow-hidden rounded-xl border border-[#d8e6ee] bg-white">
                                    <div className="hidden grid-cols-[74px_minmax(0,1fr)_minmax(0,1fr)] bg-[#f8fbfd] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#46657a] sm:grid">
                                      <span>Trou</span>
                                      <span>Réponse de l’élève</span>
                                      <span>Corrigé attendu</span>
                                    </div>
                                    <div className="divide-y divide-[#edf1f4]">
                                      {breakdown.slots.map(slot => (
                                        <div
                                          key={slot.index}
                                          className="grid grid-cols-1 gap-1.5 px-4 py-3 text-[15px] sm:grid-cols-[74px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
                                        >
                                          <span className="text-xs font-bold text-[#46657a]">
                                            {slot.label}
                                          </span>
                                          <span
                                            className={
                                              'inline-flex items-center gap-1.5 font-semibold ' +
                                              (slot.isEmpty
                                                ? 'text-slate-400'
                                                : slot.isCorrect
                                                  ? 'text-emerald-800'
                                                  : 'text-rose-800')
                                            }
                                          >
                                            {slot.isEmpty ? (
                                              'Aucune réponse'
                                            ) : (
                                              <>
                                                {slot.isCorrect ? (
                                                  <Check className="h-4 w-4 shrink-0 text-emerald-700" />
                                                ) : (
                                                  <X className="h-4 w-4 shrink-0 text-rose-700" />
                                                )}
                                                <span className="break-words">{slot.studentValue}</span>
                                              </>
                                            )}
                                          </span>
                                          <span className="font-semibold text-[#176b45] break-words">
                                            {slot.expectedValue}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {breakdown.type === 'reorder' && (
                                  <div className="space-y-2.5">
                                    {breakdown.items.length > 0 ? (
                                      <div className="overflow-hidden rounded-xl border border-[#d8e6ee] bg-white">
                                        <div className="hidden grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)] bg-[#f8fbfd] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#46657a] sm:grid">
                                          <span>Pos.</span>
                                          <span>Ordre élève</span>
                                          <span>Ordre attendu</span>
                                        </div>
                                        <div className="divide-y divide-[#edf1f4]">
                                          {breakdown.items.map(item => (
                                            <div
                                              key={item.position}
                                              className="grid grid-cols-1 gap-1.5 px-4 py-3 text-[15px] sm:grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
                                            >
                                              <span className="font-mono text-xs font-bold tabular-nums text-[#46657a]">
                                                #{item.position}
                                              </span>
                                              <span
                                                className={
                                                  'inline-flex items-center gap-1.5 font-semibold ' +
                                                  (item.studentText === '—'
                                                    ? 'text-slate-400'
                                                    : item.isMatch
                                                      ? 'text-emerald-800'
                                                      : 'text-rose-800')
                                                }
                                              >
                                                {item.studentText !== '—' &&
                                                  (item.isMatch ? (
                                                    <Check className="h-4 w-4 shrink-0 text-emerald-700" />
                                                  ) : (
                                                    <X className="h-4 w-4 shrink-0 text-rose-700" />
                                                  ))}
                                                <span className="break-words">{item.studentText}</span>
                                              </span>
                                              <span className="font-semibold text-[#176b45] break-words">
                                                {item.expectedText}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="grid divide-y divide-[#e3ecf2] overflow-hidden rounded-xl border border-[#d8e6ee] bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                                        <div className="bg-slate-50/70 p-4 sm:p-5">
                                          <p className="text-[11px] font-bold uppercase tracking-wider text-[#46657a]">Ordre élève</p>
                                          <p className="mt-2.5 text-base font-semibold leading-relaxed text-[#072a3f]">
                                            {breakdown.studentSummary}
                                          </p>
                                        </div>
                                        <div className="bg-[#f4fbf7] p-4 sm:p-5">
                                          <p className="text-[11px] font-bold uppercase tracking-wider text-[#176b45]">Ordre attendu</p>
                                          <p className="mt-2.5 text-base font-semibold leading-relaxed text-[#0f472d]">
                                            {breakdown.expectedSummary}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {breakdown.type === 'verbes_trous' && (
                                  <div className="overflow-hidden rounded-xl border border-[#d8e6ee] bg-white">
                                    <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_68px] gap-3 bg-[#f8fbfd] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#46657a] md:grid">
                                      <span>Phrase</span>
                                      <span>Verbe</span>
                                      <span>Conjugaison</span>
                                      <span className="text-right">Auto</span>
                                    </div>
                                    <div className="divide-y divide-[#edf1f4]">
                                      {breakdown.phrases.map(phrase => (
                                        <div
                                          key={phrase.index}
                                          className="grid grid-cols-1 gap-2 px-4 py-3 text-[15px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_68px] md:items-center"
                                        >
                                          <div className="text-[#072a3f]">
                                            <span className="mr-1.5 font-mono text-xs font-bold tabular-nums text-[#58768a]">
                                              {phrase.index}.
                                            </span>
                                            <span>{phrase.debut}</span>
                                            <span className="mx-1 inline-block rounded bg-[#edf5fa] px-1.5 py-0.5 font-semibold text-[#0b3c5d]">
                                              {phrase.typedText || phrase.chosenVerb || '___'}
                                            </span>
                                            <span>{phrase.fin}</span>
                                          </div>

                                          <div className="space-y-0.5 text-xs sm:text-sm">
                                            <div
                                              className={
                                                'flex items-center gap-1 font-bold ' +
                                                (!phrase.chosenVerb
                                                  ? 'text-slate-400'
                                                  : phrase.isVerbCorrect
                                                    ? 'text-emerald-800'
                                                    : 'text-rose-800')
                                              }
                                            >
                                              {phrase.chosenVerb ? (
                                                phrase.isVerbCorrect ? (
                                                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                                                ) : (
                                                  <X className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                                                )
                                              ) : null}
                                              <span>{phrase.chosenVerb || 'Aucun verbe'}</span>
                                            </div>
                                            {!phrase.isVerbCorrect && (
                                              <div className="font-semibold text-[#176b45]">
                                                Attendu : {phrase.expectedVerb || '—'}
                                              </div>
                                            )}
                                          </div>

                                          <div className="space-y-0.5 text-xs sm:text-sm">
                                            <div
                                              className={
                                                'flex items-center gap-1 font-bold ' +
                                                (!phrase.typedText
                                                  ? 'text-slate-400'
                                                  : phrase.isConjugationCorrect
                                                    ? 'text-emerald-800'
                                                    : 'text-rose-800')
                                              }
                                            >
                                              {phrase.typedText ? (
                                                phrase.isConjugationCorrect ? (
                                                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                                                ) : (
                                                  <X className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                                                )
                                              ) : null}
                                              <span>{phrase.typedText || 'Aucune saisie'}</span>
                                            </div>
                                            {!phrase.isConjugationCorrect && (
                                              <div className="font-semibold text-[#176b45]">
                                                Attendu : {phrase.expectedAnswers.join(' / ') || '—'}
                                              </div>
                                            )}
                                          </div>

                                          <div className="text-left font-mono text-xs font-bold tabular-nums text-[#46657a] md:text-right">
                                            {phrase.pointsEarned}/{phrase.maxPoints} pt{phrase.maxPoints > 1 ? 's' : ''}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {breakdown.type === 'mots_trous' && (
                                  <div className="overflow-hidden rounded-xl border border-[#d8e6ee] bg-white">
                                    <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_64px] gap-3 bg-[#f8fbfd] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#46657a] md:grid">
                                      <span>Phrase</span>
                                      <span>Mot de l’élève</span>
                                      <span>Mot attendu</span>
                                      <span className="text-right">Auto</span>
                                    </div>
                                    <div className="divide-y divide-[#edf1f4]">
                                      {breakdown.phrases.map(phrase => (
                                        <div
                                          key={phrase.index}
                                          className="grid grid-cols-1 gap-2 px-4 py-3 text-[15px] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_64px] md:items-center"
                                        >
                                          <div className="text-[#072a3f]">
                                            <span className="mr-1.5 font-mono text-xs font-bold tabular-nums text-[#58768a]">
                                              {phrase.index}.
                                            </span>
                                            <span>{phrase.debut}</span>
                                            <span
                                              className={
                                                'mx-1 inline-block rounded px-1.5 py-0.5 font-bold ' +
                                                (!phrase.chosenWord
                                                  ? 'bg-slate-100 text-slate-500'
                                                  : phrase.isCorrect
                                                    ? 'bg-emerald-100 text-emerald-900'
                                                    : 'bg-rose-100 text-rose-900')
                                              }
                                            >
                                              {phrase.chosenWord || '___'}
                                            </span>
                                            <span>{phrase.fin}</span>
                                          </div>

                                          <div
                                            className={
                                              'inline-flex items-center gap-1.5 text-xs font-bold sm:text-sm ' +
                                              (!phrase.chosenWord
                                                ? 'text-slate-400'
                                                : phrase.isCorrect
                                                  ? 'text-emerald-800'
                                                  : 'text-rose-800')
                                            }
                                          >
                                            {phrase.chosenWord ? (
                                              phrase.isCorrect ? (
                                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                                              ) : (
                                                <X className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                                              )
                                            ) : null}
                                            <span>{phrase.chosenWord || 'Aucun mot'}</span>
                                          </div>

                                          <div className="text-xs font-bold text-[#176b45] sm:text-sm">
                                            {phrase.expectedWord || '—'}
                                          </div>

                                          <div className="text-left font-mono text-xs font-bold tabular-nums text-[#46657a] md:text-right">
                                            {phrase.pointsEarned}/{phrase.maxPoints} pt{phrase.maxPoints > 1 ? 's' : ''}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {explanation && (
                                  <p className="mt-3 rounded-lg border border-[#e3ecf2] bg-[#f8fbfd] px-3.5 py-2.5 text-xs leading-relaxed text-[#46657a] sm:text-[13px]">
                                    <span className="font-bold text-[#0b3c5d]">Explication : </span>
                                    {explanation}
                                  </p>
                                )}
                              </div>

                              {/* Lean single-row rapid grading dock */}
                              <div className="shrink-0 border-t border-[#e3ecf2] bg-[#f8fbfd] px-3.5 py-2 sm:px-5 sm:py-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div
                                    className="flex flex-wrap items-center gap-1.5"
                                    role="group"
                                    aria-label={`Attribution rapide pour la question ${questionIndex + 1}`}
                                  >
                                    {quickOptions.map(option => {
                                      const isSelectedPreset =
                                        !isInvalid && Math.abs(numericValue - option.value) < 0.001;
                                      return (
                                        <button
                                          key={`${option.kind}-${option.value}`}
                                          type="button"
                                          onClick={() => setQuestionScore(question.id, option.value)}
                                          disabled={!canReview || saving}
                                          className={
                                            'h-8 rounded-lg border px-2.5 text-xs font-bold tabular-nums transition-colors disabled:opacity-45 ' +
                                            (isSelectedPreset
                                              ? option.kind === 'max'
                                                ? 'border-[#176b45] bg-[#176b45] text-white'
                                                : option.kind === 'zero'
                                                  ? 'border-rose-700 bg-rose-700 text-white'
                                                  : 'border-[#0b3c5d] bg-[#0b3c5d] text-white'
                                              : 'border-[#cbd9e2] bg-white text-[#072a3f] hover:bg-[#edf5fa]')
                                          }
                                        >
                                          {option.label}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  <label className="flex items-center gap-1.5">
                                    <span className="sr-only">
                                      Points attribués pour la question {questionIndex + 1}
                                    </span>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      max={maximum}
                                      step="0.25"
                                      value={rawValue}
                                      aria-invalid={isInvalid}
                                      onChange={event => {
                                        setSaveNotice(null);
                                        setPoints(previous => ({
                                          ...previous,
                                          [question.id]: event.target.value
                                        }));
                                      }}
                                      disabled={!canReview || saving}
                                      className={
                                        'h-8 w-16 rounded-lg border bg-white px-2 text-right text-sm font-extrabold tabular-nums text-[#072a3f] outline-none focus:ring-2 disabled:bg-slate-100 ' +
                                        (isInvalid
                                          ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-200'
                                          : 'border-[#cbd9e2] focus:border-[#0b3c5d] focus:ring-[#0b3c5d]/15')
                                      }
                                    />
                                    <span className="font-mono text-xs font-semibold tabular-nums text-slate-500">
                                      / {formatPointsCompact(maximum)}
                                    </span>
                                  </label>
                                </div>
                              </div>
                            </article>
                          );
                        })()}
                    </div>
                  )}

                  {error && (
                    <div
                      role="alert"
                      className="mx-3 mb-1.5 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 sm:mx-4"
                    >
                      {error}
                    </div>
                  )}

                  {saveNotice && (
                    <div
                      role="status"
                      className="mx-3 mb-1.5 flex shrink-0 items-center gap-2 rounded-lg border border-[#b9d8c9] bg-[#f6fbf8] px-3 py-1.5 text-xs font-semibold text-[#176b45] sm:mx-4"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>{saveNotice}</span>
                    </div>
                  )}
                </div>

                {/* Ultra-compact single-row footer */}
                <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[#d8e6ee] bg-white px-2.5 py-1 pb-[max(4px,env(safe-area-inset-bottom))] sm:px-4 sm:py-1.5">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs">
                    {selectedAttempt.integrity_failed ? (
                      <span className="truncate font-bold text-rose-700">Note finale : 0</span>
                    ) : (
                      <span className="font-extrabold tabular-nums text-[#176b45]">
                        {formatPointsCompact(totalWithExpression)}/{formatPointsCompact(maxWithExpression)} pts
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
                    {orderedQuestions.length > 0 && (
                      <button
                        type="button"
                        onClick={resetToAutomatic}
                        disabled={!canReview || saving}
                        title="Rétablir les points automatiques"
                        aria-label="Rétablir les points automatiques"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#cbd9e2] px-2 text-xs font-bold text-[#46657a] hover:bg-[#f7fafc] disabled:opacity-40 sm:px-2.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">Rétablir auto</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={!canReview || saving}
                      className="inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#072a3f] bg-white px-2.5 text-[11px] font-bold text-[#072a3f] hover:bg-[#edf5fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-xs"
                    >
                      {saving ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#072a3f]/30 border-t-[#072a3f]" />
                          <span>Enreg…</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 shrink-0" />
                          <span>Enregistrer</span>
                        </>
                      )}
                    </button>

                    {(nextPendingAttempt || nextAttempt) && (
                      <button
                        type="button"
                        onClick={() => void handleSave('next_pending')}
                        disabled={!canReview || saving}
                        className="inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-[#072a3f] px-2.5 text-[11px] font-bold text-white hover:bg-[#0b3c5d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-xs"
                      >
                        <span className="sm:hidden">Suivante</span>
                        <span className="hidden sm:inline">Enreg. & suivante</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    )}
                  </div>
                </footer>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
