import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  MessageSquarePlus,
  RotateCcw,
  Save,
  Search,
  X,
  XCircle
} from 'lucide-react';
import { Quiz, QuizQuestion, QuizSubmission } from '../types';
import {
  buildQuestionCorrectionBreakdown,
  formatPointsCompact,
  getSubmissionReviewState,
  hasStudentResponse,
  resolveQuickScoreOptions
} from '../utils/quizManualCorrectionDisplay';

interface QuizManualCorrectionPanelProps {
  quiz: Quiz;
  submissions: QuizSubmission[];
  onClose: () => void;
  onSave: (
    submissionId: string,
    questionScores: Record<string, number>,
    questionComments: Record<string, string>,
    generalComment: string
  ) => Promise<QuizSubmission>;
}

const questionTypeLabel: Record<QuizQuestion['type'], string> = {
  qcm: 'QCM',
  text: 'Réponse libre',
  reorder: 'Réordonnement',
  verbes_trous: 'Verbes à trous',
  mots_trous: 'Mots à trous'
};

function submissionStatusLabel(submission: QuizSubmission): string {
  if (submission.status === 'completed') return 'Terminée';
  if (submission.status === 'timeout') return 'Temps écoulé';
  return 'Absence';
}

type PendingNavigationAction =
  | { type: 'select'; submissionId: string }
  | { type: 'close' };

function buildBaselineForSubmission(submission: QuizSubmission | null): {
  points: Record<string, string>;
  comments: Record<string, string>;
  generalComment: string;
} {
  const points: Record<string, string> = {};
  const comments: Record<string, string> = {};
  if (!submission) return { points, comments, generalComment: '' };

  (submission.questions_snapshot || []).forEach(question => {
    const savedPoints = submission.manual_review?.question_scores?.[question.id];
    const autoPoints =
      submission.manual_review?.automatic_feedback?.[question.id]?.points ??
      submission.feedback?.[question.id]?.points ??
      0;
    points[question.id] = String(savedPoints ?? autoPoints);
    comments[question.id] = submission.manual_review?.question_comments?.[question.id] || '';
  });

  return {
    points,
    comments,
    generalComment: submission.manual_review?.general_comment || ''
  };
}

export const QuizManualCorrectionPanel: React.FC<QuizManualCorrectionPanelProps> = ({
  quiz,
  submissions,
  onClose,
  onSave
}) => {
  const [search, setSearch] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [questionFilter, setQuestionFilter] = useState<'all' | 'review' | 'correct' | 'missing'>('all');
  const [slideIndex, setSlideIndex] = useState(0);
  const [generalCommentOpen, setGeneralCommentOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const forQuiz = submissions.filter(item => item.quiz_id === quiz.id);
    const firstPending = forQuiz.find(item => getSubmissionReviewState(item) === 'pending');
    return firstPending?.id || forQuiz[0]?.id || null;
  });
  const [points, setPoints] = useState<Record<string, string>>({});
  const [questionComments, setQuestionComments] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [generalComment, setGeneralComment] = useState('');
  const [baseline, setBaseline] = useState<{
    points: Record<string, string>;
    comments: Record<string, string>;
    generalComment: string;
  }>({ points: {}, comments: {}, generalComment: '' });
  const [saving, setSaving] = useState(false);
  const [savedSubmission, setSavedSubmission] = useState<QuizSubmission | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
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

  const quizSubmissions = useMemo(
    () =>
      submissions
        .filter(item => item.quiz_id === quiz.id)
        .sort(
          (a, b) =>
            new Date(b.submitted_at || b.started_at).getTime() -
            new Date(a.submitted_at || a.started_at).getTime()
        ),
    [submissions, quiz.id]
  );

  const pendingCount = useMemo(
    () => quizSubmissions.filter(item => getSubmissionReviewState(item) === 'pending').length,
    [quizSubmissions]
  );
  const reviewedCount = useMemo(
    () => quizSubmissions.filter(item => getSubmissionReviewState(item) === 'reviewed').length,
    [quizSubmissions]
  );

  const filteredSubmissions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return quizSubmissions.filter(item => {
      const reviewState = getSubmissionReviewState(item);
      if (sidebarFilter === 'pending' && reviewState !== 'pending') return false;
      if (sidebarFilter === 'reviewed' && reviewState !== 'reviewed') return false;
      if (!term) return true;
      return `${item.student_name} ${item.student_number || ''} ${item.class_name || ''}`
        .toLocaleLowerCase()
        .includes(term);
    });
  }, [quizSubmissions, search, sidebarFilter]);

  const selectedSubmission =
    savedSubmission?.id === selectedId
      ? savedSubmission
      : quizSubmissions.find(item => item.id === selectedId) || null;

  const questions = selectedSubmission?.questions_snapshot || [];
  const isSnapshotMissing = !selectedSubmission?.questions_snapshot?.length;
  const canReview = Boolean(
    selectedSubmission && selectedSubmission.status !== 'missed' && !isSnapshotMissing
  );

  const automaticTotal = questions.reduce((sum, question) => {
    const autoPoints = Number(
      selectedSubmission?.manual_review?.automatic_feedback?.[question.id]?.points ??
        selectedSubmission?.feedback?.[question.id]?.points ??
        0
    );
    return sum + (Number.isFinite(autoPoints) ? autoPoints : 0);
  }, 0);

  const maxTotal = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);

  const manualTotal = questions.reduce((sum, question) => {
    const raw = points[question.id];
    const value =
      raw === undefined
        ? Number(
            selectedSubmission?.manual_review?.question_scores?.[question.id] ??
              selectedSubmission?.feedback?.[question.id]?.points ??
              0
          )
        : Number(raw);
    return sum + (Number.isFinite(value) ? Math.min(Number(question.points) || 0, Math.max(0, value)) : 0);
  }, 0);

  const retainedScore20 = selectedSubmission?.manual_review
    ? maxTotal > 0
      ? Number(((manualTotal / maxTotal) * 20).toFixed(1))
      : 0
    : Number(selectedSubmission?.score_20 ?? 0);

  const isDirty = useMemo(() => {
    if (!selectedSubmission || !canReview) return false;
    if (generalComment !== baseline.generalComment) return true;
    return questions.some(q => {
      const curPoint = points[q.id] ?? '';
      const basePoint = baseline.points[q.id] ?? '';
      const curComment = questionComments[q.id] ?? '';
      const baseComment = baseline.comments[q.id] ?? '';
      return curPoint !== basePoint || curComment !== baseComment;
    });
  }, [selectedSubmission, canReview, generalComment, baseline, questions, points, questionComments]);

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

  useEffect(() => {
    const initial = buildBaselineForSubmission(selectedSubmission);
    setPoints(initial.points);
    setQuestionComments(initial.comments);
    setGeneralComment(initial.generalComment);
    setGeneralCommentOpen(false);
    setBaseline(initial);
    const expanded: Record<string, boolean> = {};
    Object.entries(initial.comments).forEach(([qId, text]) => {
      if (text.trim()) expanded[qId] = true;
    });
    setExpandedComments(expanded);
    setSlideIndex(0);
    setSavedSubmission(null);
    setSaveNotice(null);
    setError(null);
    setPendingNav(null);
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  }, [selectedId]);

  const questionStatus = (question: QuizQuestion): 'missing' | 'correct' | 'partial' | 'review' => {
    if (!hasStudentResponse(selectedSubmission?.answers?.[question.id])) return 'missing';
    const automatic =
      selectedSubmission?.manual_review?.automatic_feedback?.[question.id] ||
      selectedSubmission?.feedback?.[question.id];
    const raw = points[question.id];
    const awarded =
      raw === undefined
        ? Number(selectedSubmission?.manual_review?.question_scores?.[question.id] ?? automatic?.points ?? 0)
        : Number(raw);
    const max = Number(question.points || 0);
    if (max > 0 && awarded >= max) return 'correct';
    if (awarded > 0) return 'partial';
    return 'review';
  };

  const correctQuestionCount = questions.filter(q => questionStatus(q) === 'correct').length;
  const reviewQuestionCount = questions.filter(q => {
    const st = questionStatus(q);
    return st === 'review' || st === 'partial';
  }).length;
  const missingQuestionCount = questions.filter(q => questionStatus(q) === 'missing').length;

  const visibleQuestions = questions.filter(question => {
    if (questionFilter === 'all') return true;
    const st = questionStatus(question);
    if (questionFilter === 'review') return st === 'review' || st === 'partial';
    return st === questionFilter;
  });

  const safeSlideIndex =
    visibleQuestions.length > 0 ? Math.min(Math.max(0, slideIndex), visibleQuestions.length - 1) : 0;
  const currentQuestion = visibleQuestions[safeSlideIndex] || null;

  const goToSlide = (targetIndex: number) => {
    if (visibleQuestions.length === 0) return;
    const clamped = Math.min(Math.max(0, targetIndex), visibleQuestions.length - 1);
    setSlideIndex(clamped);
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    setSlideIndex(0);
  }, [questionFilter]);

  useEffect(() => {
    if (!currentQuestion) return;
    const pill = slidePillRefs.current[currentQuestion.id];
    if (pill && typeof pill.scrollIntoView === 'function') {
      pill.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  }, [currentQuestion?.id]);

  useEffect(() => {
    const handleSlideArrows = (event: KeyboardEvent) => {
      if (!canReview || visibleQuestions.length <= 1) return;
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
  }, [canReview, visibleQuestions.length, safeSlideIndex]);

  // Navigation entre copies dans la liste filtrée (ou la liste complète si absente)
  const navPool = filteredSubmissions.some(item => item.id === selectedId)
    ? filteredSubmissions
    : quizSubmissions;
  const currentNavIndex = navPool.findIndex(item => item.id === selectedId);
  const prevSubmission = currentNavIndex > 0 ? navPool[currentNavIndex - 1] : null;
  const nextSubmission =
    currentNavIndex >= 0 && currentNavIndex < navPool.length - 1
      ? navPool[currentNavIndex + 1]
      : null;

  const nextPendingSubmission = useMemo(() => {
    const pendingList = quizSubmissions.filter(
      item => item.id !== selectedId && getSubmissionReviewState(item) === 'pending'
    );
    if (pendingList.length === 0) return null;
    const afterCurrent = pendingList.find(
      item => quizSubmissions.indexOf(item) > quizSubmissions.findIndex(s => s.id === selectedId)
    );
    return afterCurrent || pendingList[0];
  }, [quizSubmissions, selectedId]);

  const performNavigation = (action: PendingNavigationAction) => {
    setPendingNav(null);
    if (action.type === 'close') {
      onClose();
      return;
    }
    setSelectedId(action.submissionId);
    setQuestionFilter('all');
    setMobileDetailOpen(true);
  };

  const requestSelectSubmission = (submissionId: string) => {
    if (saving || submissionId === selectedId) {
      setMobileDetailOpen(true);
      return;
    }
    if (isDirty) {
      setPendingNav({ type: 'select', submissionId });
      return;
    }
    performNavigation({ type: 'select', submissionId });
  };

  const requestClose = () => {
    if (saving) return;
    if (isDirty) {
      setPendingNav({ type: 'close' });
      return;
    }
    onClose();
  };

  const validateAndBuildScores = (): Record<string, number> | null => {
    if (!selectedSubmission || !canReview) return null;
    setError(null);
    const scores: Record<string, number> = {};
    for (const question of questions) {
      const rawValue =
        points[question.id] ??
        String(
          selectedSubmission.manual_review?.question_scores?.[question.id] ??
            selectedSubmission.feedback?.[question.id]?.points ??
            0
        );
      const value = Number(rawValue);
      const maximum = Number(question.points) || 0;
      if (String(rawValue).trim() === '' || !Number.isFinite(value) || value < 0 || value > maximum) {
        setError(
          `La note de la question « ${question.question} » doit être comprise entre 0 et ${maximum} points.`
        );
        return null;
      }
      scores[question.id] = value;
    }
    return scores;
  };

  const handleSave = async (afterSave?: PendingNavigationAction | 'next_pending'): Promise<boolean> => {
    if (!selectedSubmission || !canReview) return false;
    const scores = validateAndBuildScores();
    if (!scores) return false;

    try {
      setSaving(true);
      setSaveNotice(null);
      const updated = await onSave(selectedSubmission.id, scores, questionComments, generalComment);
      setSavedSubmission(updated);
      const nextBaseline = buildBaselineForSubmission(updated);
      setPoints(nextBaseline.points);
      setQuestionComments(nextBaseline.comments);
      setGeneralComment(nextBaseline.generalComment);
      setBaseline(nextBaseline);

      if (afterSave === 'next_pending') {
        const target = nextPendingSubmission || nextSubmission;
        if (target) {
          performNavigation({ type: 'select', submissionId: target.id });
        } else {
          setSaveNotice('Correction enregistrée. Toutes les copies disponibles ont été vérifiées.');
        }
      } else if (afterSave) {
        performNavigation(afterSave);
      } else {
        setSaveNotice('Correction enregistrée. Le classement a été recalculé.');
      }
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'La correction n’a pas pu être enregistrée.'
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetToAutomatic = () => {
    if (!selectedSubmission) return;
    setPoints(
      Object.fromEntries(
        questions.map(question => [
          question.id,
          String(
            selectedSubmission.manual_review?.automatic_feedback?.[question.id]?.points ??
              selectedSubmission.feedback?.[question.id]?.points ??
              0
          )
        ])
      )
    );
    setQuestionComments({});
    setExpandedComments({});
    setGeneralComment('');
    setSaveNotice(null);
  };

  const setQuestionScore = (questionId: string, score: number) => {
    setPoints(prev => ({ ...prev, [questionId]: formatPointsCompact(score) }));
    setSaveNotice(null);
  };

  const deltaTotal = Number((manualTotal - automaticTotal).toFixed(2));

  return (
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-[#072a3f]/60 p-0 sm:p-3 lg:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-manual-correction-title"
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
              id="quiz-manual-correction-title"
              className="truncate text-xs font-extrabold text-[#072a3f] sm:text-sm"
            >
              <span className="font-semibold text-[#176b45]">Correction · </span>
              {quiz.title}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {selectedSubmission && navPool.length > 1 && (
              <div className="hidden items-center gap-0.5 rounded-lg border border-[#d8e6ee] bg-[#f8fbfd] p-0.5 md:flex">
                <button
                  type="button"
                  onClick={() => prevSubmission && requestSelectSubmission(prevSubmission.id)}
                  disabled={!prevSubmission || saving}
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
                  onClick={() => nextSubmission && requestSelectSubmission(nextSubmission.id)}
                  disabled={!nextSubmission || saving}
                  className="inline-flex h-7 items-center gap-0.5 rounded px-1.5 text-[11px] font-semibold text-[#0b3c5d] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  title="Copie suivante"
                >
                  <span>Suiv.</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {nextPendingSubmission && (
              <button
                type="button"
                onClick={() => requestSelectSubmission(nextPendingSubmission.id)}
                disabled={saving}
                className="hidden h-8 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-45 sm:inline-flex"
                title="Aller directement à la prochaine copie à vérifier"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Prochaine à vérifier</span>
              </button>
            )}

            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              aria-label="Fermer la correction manuelle"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d8e6ee] text-[#46657a] hover:bg-[#f3f8fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Inline unsaved changes confirmation banner (no window.confirm) */}
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
          {/* Left sidebar: interactive filter tiles + student list */}
          <aside
            className={
              (mobileDetailOpen ? 'hidden lg:flex' : 'flex') +
              ' min-h-0 flex-col border-r border-[#d8e6ee] bg-white'
            }
          >
            <div className="border-b border-[#e6edf2] p-3.5">
              <div className="grid grid-cols-3 gap-1.5 text-center" role="group" aria-label="Filtrer les copies par statut">
                {(
                  [
                    { id: 'all', label: 'Toutes', count: quizSubmissions.length, tone: 'text-[#072a3f]' },
                    { id: 'pending', label: 'À vérifier', count: pendingCount, tone: 'text-amber-800' },
                    { id: 'reviewed', label: 'Vérifiées', count: reviewedCount, tone: 'text-[#176b45]' }
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
                    placeholder="Nom, matricule, classe…"
                    className="min-h-10 w-full rounded-lg border border-[#cbd9e2] bg-white pl-9 pr-3 text-sm text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15"
                  />
                </span>
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredSubmissions.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  Aucune copie ne correspond à ce filtre.
                </div>
              ) : (
                filteredSubmissions.map(submission => {
                  const active = selectedId === submission.id;
                  const state = getSubmissionReviewState(submission);
                  return (
                    <button
                      key={submission.id}
                      type="button"
                      onClick={() => requestSelectSubmission(submission.id)}
                      className={
                        'flex w-full items-center justify-between gap-2.5 border-b border-[#edf1f4] px-3.5 py-2.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#0b3c5d] ' +
                        (active ? 'bg-[#edf5fa]' : 'bg-white hover:bg-[#f7fafc]')
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[#072a3f]">
                          {submission.student_name || 'Élève sans nom'}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {submission.class_name || 'Classe'} · {submission.student_number || 'Sans matricule'} · T{submission.attempt_number || 1}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#46657a]">
                          <span className="tabular-nums font-bold text-[#072a3f]">
                            {Number(submission.score_20 || 0).toFixed(1)}/20
                          </span>
                          <span>·</span>
                          <span>{submissionStatusLabel(submission)}</span>
                        </span>
                      </span>

                      <span className="shrink-0 text-right">
                        {state === 'reviewed' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#eef9f3] px-2 py-1 text-[11px] font-bold text-[#176b45]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Vérifiée
                          </span>
                        ) : state === 'unavailable' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Indisp.
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                            <Clock className="h-3.5 w-3.5" />
                            À vérifier
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Main detail panel */}
          <div
            role="region"
            aria-label="Détail de la copie"
            className={(mobileDetailOpen ? 'flex' : 'hidden lg:flex') + ' min-h-0 min-w-0 flex-col'}
          >
            {!selectedSubmission ? (
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

                    {canReview && (
                      <button
                        type="button"
                        onClick={() => setGeneralCommentOpen(prev => !prev)}
                        aria-expanded={generalCommentOpen}
                        className={
                          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ' +
                          (generalCommentOpen || generalComment.trim()
                            ? 'border-[#0b3c5d]/30 bg-[#edf5fa] text-[#0b3c5d]'
                            : 'border-[#d8e6ee] bg-white text-[#46657a]')
                        }
                      >
                        <MessageSquarePlus className="h-3 w-3 shrink-0" />
                        <span>{generalComment.trim() ? 'Bilan (ajouté)' : 'Bilan copie'}</span>
                      </button>
                    )}

                    {navPool.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => prevSubmission && requestSelectSubmission(prevSubmission.id)}
                          disabled={!prevSubmission || saving}
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
                          onClick={() => nextSubmission && requestSelectSubmission(nextSubmission.id)}
                          disabled={!nextSubmission || saving}
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
                        {selectedSubmission.student_name || 'Élève sans nom'}
                      </h3>
                      <p className="truncate text-[11px] text-slate-500">
                        {selectedSubmission.class_name || 'Classe'} · {selectedSubmission.student_number || 'Sans matricule'} · T{selectedSubmission.attempt_number || 1}
                        {selectedSubmission.submitted_at
                          ? ` · ${new Date(selectedSubmission.submitted_at).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {canReview && (
                        <button
                          type="button"
                          onClick={() => setGeneralCommentOpen(prev => !prev)}
                          aria-expanded={generalCommentOpen}
                          className={
                            'hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors lg:inline-flex ' +
                            (generalCommentOpen || generalComment.trim()
                              ? 'border-[#0b3c5d]/30 bg-[#edf5fa] text-[#0b3c5d]'
                              : 'border-[#d8e6ee] bg-white text-[#46657a] hover:bg-[#f3f8fb]')
                          }
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
                          <span>{generalComment.trim() ? 'Bilan (ajouté)' : 'Bilan copie'}</span>
                        </button>
                      )}

                      <div className="flex items-center gap-1.5 rounded-lg border border-[#d8e6ee] bg-[#f8fbfd] px-2.5 py-1 text-xs">
                        <span className="hidden text-[11px] font-semibold text-slate-500 sm:inline">Auto</span>
                        <span className="font-mono font-bold tabular-nums text-[#072a3f]">
                          {Number(
                            selectedSubmission.manual_review?.automatic_score_20 ??
                              selectedSubmission.score_20 ??
                              0
                          ).toFixed(1)}
                        </span>
                        <span className="text-slate-300">→</span>
                        <span className="hidden text-[11px] font-semibold text-[#176b45] sm:inline">
                          {selectedSubmission.manual_review ? 'Retenue' : 'Aperçu'}
                        </span>
                        <span className="font-mono font-extrabold tabular-nums text-[#176b45]">
                          {(maxTotal > 0 ? (manualTotal / maxTotal) * 20 : retainedScore20).toFixed(1)}
                          <span className="text-[11px] font-semibold text-[#5c8b72]">/20</span>
                        </span>
                        {deltaTotal !== 0 && (
                          <span
                            className={
                              'rounded px-1 py-0.5 text-[10px] font-extrabold tabular-nums ' +
                              (deltaTotal > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800')
                            }
                          >
                            {deltaTotal > 0 ? `+${formatPointsCompact(deltaTotal)}` : formatPointsCompact(deltaTotal)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {canReview && generalCommentOpen && (
                    <div className="mt-2 border-t border-[#edf1f4] pt-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-[#0b3c5d]">
                          Commentaire général du professeur (facultatif)
                        </span>
                        <textarea
                          rows={2}
                          value={generalComment}
                          onChange={event => {
                            setSaveNotice(null);
                            setGeneralComment(event.target.value);
                          }}
                          placeholder="Observation globale sur cette copie…"
                          className="w-full resize-y rounded-lg border border-[#cbd9e2] bg-white px-2.5 py-1.5 text-sm font-normal text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Horizontal slide-by-slide correction stage */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:bg-[#f7fafc]">
                  {isSnapshotMissing ? (
                    <div className="p-3 sm:p-5">
                      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                        <div className="flex items-center gap-2 font-bold">
                          <AlertCircle className="h-4 w-4" />
                          Sujet original indisponible
                        </div>
                        <p className="mt-1 text-xs leading-relaxed">
                          Cette copie ne possède pas de snapshot des questions au moment du lancement. La correction manuelle est désactivée pour cette tentative.
                        </p>
                      </div>
                    </div>
                  ) : selectedSubmission.status === 'missed' ? (
                    <div className="p-3 sm:p-5">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                        Cette tentative est enregistrée comme absence et ne contient aucune réponse à corriger.
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
                            aria-label="Filtrer les questions"
                          >
                            {(
                              [
                                { id: 'all', label: 'Toutes', count: questions.length },
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

                          {visibleQuestions.length > 0 && (
                            <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-[#0b3c5d]">
                              {safeSlideIndex + 1}/{visibleQuestions.length}
                            </span>
                          )}
                        </div>

                        {visibleQuestions.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => goToSlide(safeSlideIndex - 1)}
                              disabled={safeSlideIndex === 0}
                              aria-label="Question précédente"
                              title="Question précédente (Flèche gauche)"
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#cbd9e2] bg-white text-[#0b3c5d] hover:bg-[#edf5fa] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>

                            <nav
                              aria-label="Navigation par diapositives des questions"
                              className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
                            >
                              {visibleQuestions.map((qItem, idx) => {
                                const origIndex = questions.findIndex(item => item.id === qItem.id);
                                const isCurrent = idx === safeSlideIndex;
                                const st = questionStatus(qItem);
                                return (
                                  <button
                                    key={qItem.id}
                                    ref={el => {
                                      slidePillRefs.current[qItem.id] = el;
                                    }}
                                    type="button"
                                    onClick={() => goToSlide(idx)}
                                    aria-current={isCurrent ? 'step' : undefined}
                                    aria-label={`Question ${origIndex + 1}`}
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
                                    <span>Q{origIndex + 1}</span>
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
                              disabled={safeSlideIndex >= visibleQuestions.length - 1}
                              aria-label="Question suivante"
                              title="Question suivante (Flèche droite)"
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#cbd9e2] bg-white text-[#0b3c5d] hover:bg-[#edf5fa] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {!currentQuestion ? (
                        <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-500">
                          Aucune question dans cette catégorie.
                        </div>
                      ) : (() => {
                          const question = currentQuestion;
                          const index = questions.findIndex(item => item.id === question.id);
                          const feedback = selectedSubmission.feedback?.[question.id];
                          const automaticFeedback =
                            selectedSubmission.manual_review?.automatic_feedback?.[question.id] || feedback;
                          const autoPts = Number(automaticFeedback?.points ?? 0);
                          const maximum = Number(question.points) || 0;
                          const rawValue =
                            points[question.id] ??
                            String(
                              selectedSubmission.manual_review?.question_scores?.[question.id] ??
                                feedback?.points ??
                                0
                            );
                          const numericValue = Number(rawValue);
                          const isInvalid =
                            rawValue.trim() === '' ||
                            !Number.isFinite(numericValue) ||
                            numericValue < 0 ||
                            numericValue > maximum;
                          const isChanged = Number.isFinite(numericValue) && numericValue !== autoPts;
                          const status = questionStatus(question);
                          const breakdown = buildQuestionCorrectionBreakdown(
                            question,
                            selectedSubmission.answers?.[question.id]
                          );
                          const quickOptions = resolveQuickScoreOptions(maximum, autoPts);
                          const commentOpen =
                            Boolean(expandedComments[question.id]) ||
                            Boolean((questionComments[question.id] || '').trim());

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
                                if (!start || !touch || visibleQuestions.length <= 1) return;
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
                                      Q{index + 1}
                                    </span>
                                    <span>·</span>
                                    <span className="font-medium">{questionTypeLabel[question.type]}</span>
                                    <span>·</span>
                                    <span className="font-semibold tabular-nums">
                                      {formatPointsCompact(maximum)} pt{maximum > 1 ? 's' : ''}
                                    </span>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1.5">
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
                                  {question.question}
                                </h4>
                              </div>

                              {/* Spacious Student Answer vs Expected Answer Body */}
                              <div ref={detailScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:px-5 sm:py-4">
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

                                {question.explanation && (
                                  <p className="mt-3 rounded-lg border border-[#e3ecf2] bg-[#f8fbfd] px-3.5 py-2.5 text-xs leading-relaxed text-[#46657a] sm:text-[13px]">
                                    <span className="font-bold text-[#0b3c5d]">Explication : </span>
                                    {question.explanation}
                                  </p>
                                )}
                              </div>

                              {/* Lean single-row rapid grading dock */}
                              <div className="shrink-0 border-t border-[#e3ecf2] bg-[#f8fbfd] px-3.5 py-2 sm:px-5 sm:py-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div
                                    className="flex flex-wrap items-center gap-1.5"
                                    role="group"
                                    aria-label={`Attribution rapide pour la question ${index + 1}`}
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

                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5">
                                      <span className="sr-only">Points attribués pour la question {index + 1}</span>
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

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedComments(prev => ({ ...prev, [question.id]: !commentOpen }))
                                      }
                                      disabled={!canReview || saving}
                                      aria-expanded={commentOpen}
                                      title="Commentaire sur cette question"
                                      className={
                                        'inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-semibold transition-colors disabled:opacity-45 ' +
                                        (commentOpen
                                          ? 'border-[#0b3c5d]/35 bg-[#edf5fa] text-[#0b3c5d]'
                                          : 'border-[#cbd9e2] bg-white text-[#46657a] hover:bg-[#edf5fa]')
                                      }
                                    >
                                      <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
                                      <span className="hidden sm:inline">Note</span>
                                    </button>
                                  </div>
                                </div>

                                {commentOpen && (
                                  <label className="mt-2 block">
                                    <span className="sr-only">Commentaire sur la question {index + 1}</span>
                                    <input
                                      value={questionComments[question.id] || ''}
                                      onChange={event => {
                                        setSaveNotice(null);
                                        setQuestionComments(previous => ({
                                          ...previous,
                                          [question.id]: event.target.value
                                        }));
                                      }}
                                      placeholder="Commentaire facultatif sur cette question…"
                                      disabled={!canReview || saving}
                                      className="h-8 w-full rounded-lg border border-[#cbd9e2] bg-white px-2.5 text-sm text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15"
                                    />
                                  </label>
                                )}
                              </div>
                            </article>
                          );
                        })()}
                    </div>
                  )}

                  {error && (
                    <div role="alert" className="mx-3 mb-1.5 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 sm:mx-4">
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

                {/* Compact footer bar */}
                <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[#d8e6ee] bg-white px-2.5 py-1 pb-[max(4px,env(safe-area-inset-bottom))] sm:px-4 sm:py-1.5">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs">
                    <span className="hidden font-bold tabular-nums text-[#072a3f] sm:inline">
                      {formatPointsCompact(manualTotal)}/{formatPointsCompact(maxTotal)} pts
                    </span>
                    <span className="hidden text-slate-300 sm:inline">·</span>
                    <span className="font-extrabold tabular-nums text-[#176b45]">
                      {maxTotal > 0 ? ((manualTotal / maxTotal) * 20).toFixed(1) : '0.0'}/20
                    </span>
                  </div>

                  <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
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

                    {(nextPendingSubmission || nextSubmission) && (
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
