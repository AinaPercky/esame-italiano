import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { Quiz } from '../types';
import {
  isTimerBeepEnabled,
  playTimerBeep,
  primeTimerAudio,
  setTimerBeepEnabled,
  useAssessmentTimerBeeper
} from '../utils/timerAudio';

import { PublicQuizzesHomeView } from './publicQuiz/PublicQuizzesHomeView';
import { PublicQuizStartScreen } from './publicQuiz/PublicQuizStartScreen';
import { PublicQuizQuestionScreen } from './publicQuiz/PublicQuizQuestionScreen';
import { PublicQuizResultScreen } from './publicQuiz/PublicQuizResultScreen';

import {
  getQuizTimeTone,
  QuizFeedbackEntry,
  QuizEvaluationResult,
} from './publicQuiz/publicQuizUtils';
import {
  parsePublicQuizConfig,
} from './publicQuiz/publicQuizConfig';
import { applyQuizQuestionOrder, shuffleArray, shuffleQuizQuestions } from '../utils/quizQuestionOrder';
import { getQuestionTimeSeconds, getQuizTotalTimeSeconds } from '../utils/quizTiming';
import { applyQuizItemOrder } from '../utils/quizReorder';

interface PublicQuizViewProps {
  quizId: string | null;
  onBackToApp: () => void;
}

// ─── LocalStorage persistence keys ────────────────────────────────────────────
function storageKey(quizId: string, suffix: string) {
  return `pq_${quizId}_${suffix}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function clearStorage(quizId: string) {
  ['studentName', 'answers', 'questionTimeLeftMs', 'totalTimeLeftMs', 'currentIndex', 'validated', 'questionOrder', 'itemOrders'].forEach(
    (suffix) => localStorage.removeItem(storageKey(quizId, suffix))
  );
}

// ─── Screen enum ──────────────────────────────────────────────────────────────
type Screen = 'loading' | 'home' | 'start' | 'quiz' | 'result';

export const PublicQuizView: React.FC<PublicQuizViewProps> = ({
  quizId,
  onBackToApp,
}) => {
  // ── Quiz data ──────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>(quizId ? 'loading' : 'home');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Derived from quiz.description
  const [cleanDescription, setCleanDescription] = useState<string>('');
  const [allowBackNavigation, setAllowBackNavigation] = useState<boolean>(true);
  const [showCorrectionAtEnd, setShowCorrectionAtEnd] = useState<boolean>(false);

  // ── Active quiz ID ─────────────────────────────────────────────────────────
  const [activeQuizId, setActiveQuizId] = useState<string | null>(quizId);

  // ── Student & quiz progress (persisted) ───────────────────────────────────
  const [studentName, setStudentName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [validatedSet, setValidatedSet] = useState<Record<string, boolean>>({});

  // ── Per-question timer ─────────────────────────────────────────────────────
  // Individual timer duration for the active question.
  const [timePerQuestionMs, setTimePerQuestionMs] = useState<number>(0);
  // Current question time remaining
  const [questionTimeLeftMs, setQuestionTimeLeftMs] = useState<number>(0);
  // Global quiz time remaining, distinct from the per-question timer
  const [totalTimeLeftMs, setTotalTimeLeftMs] = useState<number>(0);

  // ── Result ────────────────────────────────────────────────────────────────
  const [result, setResult] = useState<QuizEvaluationResult | null>(null);

  // ── Per-question feedback (shown after validation) ─────────────────────────
  const [perQuestionFeedback, setPerQuestionFeedback] = useState<
    Record<string, QuizFeedbackEntry>
  >({});

  // Refs to avoid stale closures in timer callbacks
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isQuizActive = screen === 'quiz';
  const hasSubmittedRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isTimerBeepEnabled());
  const correctionAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionForCorrection = quiz?.questions[currentIndex];
  const isCorrectionModalOpen = Boolean(
    !showCorrectionAtEnd && questionForCorrection && validatedSet[questionForCorrection.id] &&
    perQuestionFeedback[questionForCorrection.id]
  );
  const totalQuizDurationMs = quiz ? getQuizTotalTimeSeconds(quiz) * 1000 : 1;

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers (stable refs so callbacks don't need them in deps)
  // ─────────────────────────────────────────────────────────────────────────
  const quizRef = useRef<Quiz | null>(null);
  const sourceQuizRef = useRef<Quiz | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const activeQuizIdRef = useRef<string | null>(null);
  const currentIndexRef = useRef<number>(0);
  const validatedSetRef = useRef<Record<string, boolean>>({});
  const perQuestionFeedbackRef = useRef<Record<string, QuizFeedbackEntry>>({});
  const timePerQuestionMsRef = useRef<number>(0);

  // Keep refs in sync with state
  useEffect(() => { quizRef.current = quiz; }, [quiz]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { activeQuizIdRef.current = activeQuizId; }, [activeQuizId]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { validatedSetRef.current = validatedSet; }, [validatedSet]);
  useEffect(() => { perQuestionFeedbackRef.current = perQuestionFeedback; }, [perQuestionFeedback]);
  useEffect(() => { timePerQuestionMsRef.current = timePerQuestionMs; }, [timePerQuestionMs]);

  // ─────────────────────────────────────────────────────────────────────────
  // Submit the entire quiz (all answers collected so far)
  // ─────────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (hasSubmittedRef.current) return;
    const q = quizRef.current;
    const qId = activeQuizIdRef.current;
    if (!q) return;
    hasSubmittedRef.current = true;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (correctionAdvanceTimeoutRef.current) {
      clearTimeout(correctionAdvanceTimeoutRef.current);
      correctionAdvanceTimeoutRef.current = null;
    }

    try {
      const publicId = qId || q.public_id || q.id;
      const feedback: Record<string, QuizFeedbackEntry> = {};
      let rawScore = 0;
      for (const question of q.questions || []) {
        const entry = await supabaseService.evaluatePublicQuizQuestion(
          publicId,
          question.id,
          answersRef.current[question.id] || ''
        );
        feedback[question.id] = entry;
        rawScore += Number(entry.points) || 0;
      }
      const maxScore = Number(q.total_points) || 20;
      setResult({
        rawScore,
        maxScore,
        score20: maxScore > 0 ? Number(((rawScore / maxScore) * 20).toFixed(1)) : 0,
        feedback
      });
      if (qId) clearStorage(qId);
      setScreen('result');
    } catch (error: any) {
      hasSubmittedRef.current = false;
      setLoadError(error?.message || 'La correction sécurisée est indisponible. Réessayez.');
      setScreen('start');
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Validate current question and compute feedback
  // ─────────────────────────────────────────────────────────────────────────
  const doValidate = useCallback(async (questionId: string) => {
    const q = quizRef.current;
    if (!q) return;
    const publicId = activeQuizIdRef.current || q.public_id || q.id;
    try {
      const entry = await supabaseService.evaluatePublicQuizQuestion(
        publicId,
        questionId,
        answersRef.current[questionId] || ''
      );
      setPerQuestionFeedback((prev) => ({ ...prev, [questionId]: entry }));
      perQuestionFeedbackRef.current = { ...perQuestionFeedbackRef.current, [questionId]: entry };
      setValidatedSet((prev) => ({ ...prev, [questionId]: true }));
      validatedSetRef.current = { ...validatedSetRef.current, [questionId]: true };
    } catch (error: any) {
      setLoadError(error?.message || 'La correction sécurisée est indisponible. Rechargez le quiz.');
      setScreen('start');
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Advance to next question OR submit if last
  // ─────────────────────────────────────────────────────────────────────────
  const doAdvance = useCallback((fromIndex: number, total: number) => {
    if (correctionAdvanceTimeoutRef.current) {
      clearTimeout(correctionAdvanceTimeoutRef.current);
      correctionAdvanceTimeoutRef.current = null;
    }
    if (fromIndex < total - 1) {
      const nextIdx = fromIndex + 1;
      setCurrentIndex(nextIdx);
      currentIndexRef.current = nextIdx;
      // Reset to this question's own configured duration.
      const nextQuestionTimeMs = getQuestionTimeSeconds(quizRef.current?.questions[nextIdx]) * 1000;
      timePerQuestionMsRef.current = nextQuestionTimeMs;
      setTimePerQuestionMs(nextQuestionTimeMs);
      setQuestionTimeLeftMs(nextQuestionTimeMs);
    } else {
      handleSubmit();
    }
  }, [handleSubmit]);

  const scheduleAdvanceAfterCorrection = useCallback((fromIndex: number, total: number) => {
    if (correctionAdvanceTimeoutRef.current) clearTimeout(correctionAdvanceTimeoutRef.current);
    correctionAdvanceTimeoutRef.current = setTimeout(() => {
      correctionAdvanceTimeoutRef.current = null;
      if (currentIndexRef.current === fromIndex) doAdvance(fromIndex, total);
    }, 8000);
  }, [doAdvance]);

  // ─────────────────────────────────────────────────────────────────────────
  // Load quiz data
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeQuizId) {
      sourceQuizRef.current = null;
      setScreen('home');
      return;
    }

    let cancelled = false;

    const loadQuiz = async () => {
      setScreen('loading');
      setLoadError(null);

      let q: Quiz | null = null;
      let fetchErrorMessage: string | null = null;
      try {
        // Toujours charger une version nettoyée par le serveur, même si l'état local
        // du navigateur contient une copie professeur avec les réponses attendues.
        q = await supabaseService.fetchPublicQuiz(activeQuizId);
      } catch (err) {
        console.error('Erreur chargement sécurisé du quiz public:', err);
        fetchErrorMessage = err instanceof Error ? err.message : null;
      }

      if (cancelled) return;

      if (!q) {
        sourceQuizRef.current = null;
        setLoadError(fetchErrorMessage || 'Quiz introuvable. Vérifiez le lien ou contactez votre enseignant.');
        setScreen('start');
        return;
      }

      // Parse config embedded in description
      const { description, config } = parsePublicQuizConfig(q.description);
      setCleanDescription(description);
      setAllowBackNavigation(config.allowBackNavigation);
      setShowCorrectionAtEnd(config.showCorrectionAtEnd);
      sourceQuizRef.current = q;
      setQuiz(q);
      quizRef.current = q;

      // The overall deadline is the sum of each question's independent time.
      const totalMs = getQuizTotalTimeSeconds(q) * 1000;
      const firstQuestionTimeMs = getQuestionTimeSeconds(q.questions?.[0]) * 1000;
      setTimePerQuestionMs(firstQuestionTimeMs);
      timePerQuestionMsRef.current = firstQuestionTimeMs;

      // Restore persisted state
      const savedName = loadFromStorage<string>(storageKey(activeQuizId, 'studentName'), '');
      const savedAnswers = loadFromStorage<Record<string, string>>(
        storageKey(activeQuizId, 'answers'), {}
      );
      const savedIndex = loadFromStorage<number>(storageKey(activeQuizId, 'currentIndex'), 0);
      const savedValidated = loadFromStorage<Record<string, boolean>>(
        storageKey(activeQuizId, 'validated'), {}
      );
      // Restore per-question timer (if same question reloaded, keep remaining time)
      const savedQTime = loadFromStorage<number>(
        storageKey(activeQuizId, 'questionTimeLeftMs'), firstQuestionTimeMs
      );
      const savedTotalTime = loadFromStorage<number>(
        storageKey(activeQuizId, 'totalTimeLeftMs'), totalMs
      );

      setStudentName(savedName);
      setAnswers(savedAnswers);
      answersRef.current = savedAnswers;
      setCurrentIndex(savedIndex);
      currentIndexRef.current = savedIndex;
      const restoredQuestionTimeMs = getQuestionTimeSeconds(q.questions?.[savedIndex]) * 1000;
      setTimePerQuestionMs(restoredQuestionTimeMs);
      timePerQuestionMsRef.current = restoredQuestionTimeMs;
      setValidatedSet(savedValidated);
      validatedSetRef.current = savedValidated;
      setQuestionTimeLeftMs(savedQTime);
      setTotalTimeLeftMs(Number.isFinite(savedTotalTime) ? Math.max(0, Math.min(totalMs, savedTotalTime)) : totalMs);
      hasSubmittedRef.current = false;

      setScreen('start');
    };

    void loadQuiz();
    return () => { cancelled = true; };
  }, [activeQuizId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Persist progress
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeQuizId || screen !== 'quiz') return;
    saveToStorage(storageKey(activeQuizId, 'answers'), answers);
    saveToStorage(storageKey(activeQuizId, 'currentIndex'), currentIndex);
    saveToStorage(storageKey(activeQuizId, 'validated'), validatedSet);
  }, [activeQuizId, answers, currentIndex, validatedSet, screen]);

  useEffect(() => {
    if (!activeQuizId || screen !== 'quiz') return;
    saveToStorage(storageKey(activeQuizId, 'questionTimeLeftMs'), questionTimeLeftMs);
  }, [activeQuizId, questionTimeLeftMs, screen]);

  useEffect(() => {
    if (!activeQuizId || screen !== 'quiz') return;
    saveToStorage(storageKey(activeQuizId, 'totalTimeLeftMs'), totalTimeLeftMs);
  }, [activeQuizId, totalTimeLeftMs, screen]);

  // Compte à rebours global, suspendu pendant la correction pédagogique.
  useEffect(() => {
    if (!isQuizActive || !quiz || isCorrectionModalOpen) return;
    const interval = setInterval(() => {
      setTotalTimeLeftMs((previous) => Math.max(0, previous - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isQuizActive, quiz?.id, isCorrectionModalOpen]);

  useEffect(() => {
    if (isQuizActive && totalTimeLeftMs <= 0) handleSubmit();
  }, [isQuizActive, totalTimeLeftMs, handleSubmit]);

  const handleToggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setTimerBeepEnabled(next);
    if (next) {
      primeTimerAudio();
      playTimerBeep(true);
    }
  }, [soundEnabled]);

  useAssessmentTimerBeeper({
    active: isQuizActive && Boolean(quiz),
    paused: isCorrectionModalOpen,
    questionKey: quiz ? `${quiz.id}:${currentIndex}` : '',
    questionTotalSeconds: Math.max(1, Math.ceil(timePerQuestionMs / 1000)),
    questionSecondsRemaining: Math.max(0, Math.ceil(questionTimeLeftMs / 1000)),
    totalSecondsRemaining: Math.max(0, Math.ceil(totalTimeLeftMs / 1000)),
    soundEnabled
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Per-question countdown timer
  // Resets whenever currentIndex changes (new question) or quiz starts
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isQuizActive || isCorrectionModalOpen) return;

    // Clear any previous timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = setInterval(() => {
      setQuestionTimeLeftMs((prev) => {
        if (prev <= 100) {
          return 0; // Will trigger the zero-watcher effect below
        }
        return prev - 100;
      });
    }, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // Re-run whenever currentIndex changes (resets timer for each question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuizActive, currentIndex, isCorrectionModalOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // When per-question timer hits 0 → show correction (even if no answer) then advance
  // Zero‑point answer is recorded automatically by doValidate (empty answer = 0 pts).
  // A visible correction stays open for thirteen seconds before moving on.
  // ─────────────────────────────────────────────────────────────────────────
  const timeZeroFiredRef = useRef<number>(-1); // tracks which question index triggered
  useEffect(() => {
    if (!isQuizActive || questionTimeLeftMs !== 0) return;
    if (timeZeroFiredRef.current === currentIndex) return; // already handled

    const q = quizRef.current;
    if (!q) return;

    timeZeroFiredRef.current = currentIndex;

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const question = q.questions[currentIndex];
    if (!question) return;

    // Auto-validate through the server. Never inspect an answer key in the browser.
    if (!validatedSetRef.current[question.id]) {
      void doValidate(question.id);
    } else {
      scheduleAdvanceAfterCorrection(currentIndex, q.questions.length);
    }
  }, [questionTimeLeftMs, isQuizActive, currentIndex, doValidate, scheduleAdvanceAfterCorrection, showCorrectionAtEnd]);

  // Reset zero-fired tracker when question index changes (new question)
  useEffect(() => {
    if (timeZeroFiredRef.current !== currentIndex) {
      // New question arrived — allow timer-zero to fire again for this index
      // (we don't reset to -1 here because currentIndex IS the new question)
    }
  }, [currentIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // Start handler
  // ─────────────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const sourceQuiz = sourceQuizRef.current ?? quizRef.current;
    const normalizedStudentName = studentName.trim();
    if (!sourceQuiz || !normalizedStudentName) return;

    const qId = activeQuizIdRef.current ?? sourceQuiz.id;
    const storedNameValue = loadFromStorage<unknown>(storageKey(qId, 'studentName'), '');
    const storedName = typeof storedNameValue === 'string' ? storedNameValue.trim() : '';
    const sameStudent = Boolean(storedName)
      && storedName.toLocaleLowerCase() === normalizedStudentName.toLocaleLowerCase();
    const storedOrder = loadFromStorage<unknown>(storageKey(qId, 'questionOrder'), null);
    const storedItemOrders = loadFromStorage<unknown>(storageKey(qId, 'itemOrders'), {});
    const restoredOrder = applyQuizQuestionOrder(sourceQuiz.questions, storedOrder);
    const savedAnswers = loadFromStorage<unknown>(storageKey(qId, 'answers'), {});
    const savedIndex = loadFromStorage<number>(storageKey(qId, 'currentIndex'), 0);
    const savedValidated = loadFromStorage<unknown>(storageKey(qId, 'validated'), {});
    const hasSavedProgress = (Number.isInteger(savedIndex) && savedIndex > 0)
      || Boolean(savedAnswers && typeof savedAnswers === 'object' && Object.keys(savedAnswers).length)
      || Boolean(savedValidated && typeof savedValidated === 'object' && Object.keys(savedValidated).length);
    const resetAttempt = (Boolean(storedName) && !sameStudent)
      || (storedOrder !== null && (!sameStudent || !restoredOrder));
    const isResuming = !resetAttempt && (sameStudent || (!storedName && hasSavedProgress));
    const orderedQuestions = isResuming
      ? (restoredOrder ?? [...sourceQuiz.questions])
      : shuffleQuizQuestions(sourceQuiz.questions);
    const itemOrders: Record<string, string[]> = {};
    const questionsWithItemOrders = orderedQuestions.map((question) => {
      if (question.type !== 'reorder') return question;
      const storedItemOrder = storedItemOrders && typeof storedItemOrders === 'object'
        ? (storedItemOrders as Record<string, unknown>)[question.id]
        : undefined;
      const restoredItems = isResuming ? applyQuizItemOrder(question.items || [], storedItemOrder) : null;
      const items = restoredItems || shuffleArray(question.items || []);
      itemOrders[question.id] = items.map((item) => item.id);
      return { ...question, items };
    });
    const startingIndex = resetAttempt ? 0 : currentIndexRef.current;

    if (resetAttempt) {
      clearStorage(qId);
      setAnswers({});
      answersRef.current = {};
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      setValidatedSet({});
      validatedSetRef.current = {};
      setPerQuestionFeedback({});
      perQuestionFeedbackRef.current = {};
      setResult(null);
    }

    const orderedQuiz = { ...sourceQuiz, questions: questionsWithItemOrders };
    quizRef.current = orderedQuiz;
    setQuiz(orderedQuiz);
    const startingQuestionTimeMs = getQuestionTimeSeconds(orderedQuestions[startingIndex]) * 1000;
    timePerQuestionMsRef.current = startingQuestionTimeMs;
    setTimePerQuestionMs(startingQuestionTimeMs);
    hasSubmittedRef.current = false;
    primeTimerAudio();
    saveToStorage(storageKey(qId, 'studentName'), normalizedStudentName);
    saveToStorage(storageKey(qId, 'questionOrder'), questionsWithItemOrders.map((question) => question.id));
    saveToStorage(storageKey(qId, 'itemOrders'), itemOrders);
    if (!isResuming) {
      setQuestionTimeLeftMs(startingQuestionTimeMs);
      setTotalTimeLeftMs(getQuizTotalTimeSeconds(orderedQuiz) * 1000);
    } else {
      setQuestionTimeLeftMs(previous => Math.min(Math.max(0, previous), startingQuestionTimeMs));
    }
    setScreen('quiz');
  }, [studentName]);

  // ─────────────────────────────────────────────────────────────────────────
  // User-triggered validate
  // ─────────────────────────────────────────────────────────────────────────
  const handleValidate = useCallback(() => {
    const q = quizRef.current;
    if (!q) return;
    const question = q.questions[currentIndexRef.current];
    if (!question) return;
    doValidate(question.id);
  }, [doValidate]);

  // ─────────────────────────────────────────────────────────────────────────
  // User-triggered next
  // ─────────────────────────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    const q = quizRef.current;
    if (!q) return;
    if (correctionAdvanceTimeoutRef.current) {
      clearTimeout(correctionAdvanceTimeoutRef.current);
      correctionAdvanceTimeoutRef.current = null;
    }
    doAdvance(currentIndexRef.current, q.questions.length);
  }, [doAdvance]);

  // Précédent supprimé — navigation arrière désactivée

  // ─────────────────────────────────────────────────────────────────────────
  // Retry
  // ─────────────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    const qId = activeQuizIdRef.current;
    const q = sourceQuizRef.current ?? quizRef.current;
    if (!qId || !q) return;
    clearStorage(qId);
    quizRef.current = q;
    setQuiz(q);
    setAnswers({});
    answersRef.current = {};
    setValidatedSet({});
    validatedSetRef.current = {};
    setPerQuestionFeedback({});
    perQuestionFeedbackRef.current = {};
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    const firstQuestionTimeMs = getQuestionTimeSeconds(q.questions[0]) * 1000;
    timePerQuestionMsRef.current = firstQuestionTimeMs;
    setTimePerQuestionMs(firstQuestionTimeMs);
    setQuestionTimeLeftMs(firstQuestionTimeMs);
    setTotalTimeLeftMs(getQuizTotalTimeSeconds(q) * 1000);
    timeZeroFiredRef.current = -1;
    hasSubmittedRef.current = false;
    setResult(null);
    setScreen('start');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation between quizzes
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenQuiz = useCallback((publicId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'public-quiz');
    url.searchParams.set('id', publicId);
    window.history.pushState({}, '', url.toString());
    setActiveQuizId(publicId);
  }, []);

  const handleBackToList = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'public-quiz');
    url.searchParams.delete('id');
    window.history.pushState({}, '', url.toString());
    setActiveQuizId(null);
    setQuiz(null);
    quizRef.current = null;
    sourceQuizRef.current = null;
    setScreen('home');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────────────
  const currentQuestion = quiz?.questions[currentIndex];
  const isCurrentValidated = currentQuestion ? Boolean(validatedSet[currentQuestion.id]) : false;

  useEffect(() => {
    if (screen !== 'quiz' || !currentQuestion) return;

    const onKey = (e: KeyboardEvent) => {
      if (isCorrectionModalOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        if (!isCurrentValidated) handleValidate();
        else handleNext();
        return;
      }

      if (currentQuestion.type === 'qcm' && !isCurrentValidated) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= (currentQuestion.options?.length ?? 0)) {
          const opt = currentQuestion.options![num - 1];
          setAnswers((prev) => {
            const next = { ...prev, [currentQuestion.id]: opt };
            answersRef.current = next;
            return next;
          });
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, currentQuestion, isCurrentValidated, isCorrectionModalOpen, handleValidate, handleNext]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (correctionAdvanceTimeoutRef.current) clearTimeout(correctionAdvanceTimeoutRef.current);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived display values
  // ─────────────────────────────────────────────────────────────────────────
  const totalQuestions = quiz?.questions.length ?? 0;
  const progressPercent = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const currentAnswer = currentQuestion ? (answers[currentQuestion.id] ?? '') : '';
  const timeTone = getQuizTimeTone(questionTimeLeftMs);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm font-medium">Chargement du quiz…</p>
        </div>
      </div>
    );
  }

  if (screen === 'home') {
    return (
      <PublicQuizzesHomeView
        onOpenQuiz={handleOpenQuiz}
        onBackToApp={onBackToApp}
      />
    );
  }

  if (screen === 'start') {
    if (loadError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-center">
            <p className="text-rose-600 font-semibold mb-4">{loadError}</p>
            <button
              onClick={handleBackToList}
              className="h-12 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold"
            >
              Retour à la liste des quiz
            </button>
          </div>
        </div>
      );
    }

    if (!quiz) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#f4f8fb] text-slate-900">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
          <PublicQuizStartScreen
            quiz={quiz}
            description={cleanDescription}
            studentName={studentName}
            onStudentNameChange={setStudentName}
            onStart={handleStart}
            onBackToList={handleBackToList}
          />
        </div>
      </div>
    );
  }

  if (screen === 'quiz' && quiz && currentQuestion) {
    const feedback = showCorrectionAtEnd
      ? undefined
      : perQuestionFeedback[currentQuestion.id];
    const completedMap = (quiz.questions || []).map(
      (q) => Boolean(validatedSet[q.id] || (answers[q.id] || '').trim())
    );

    return (
      <PublicQuizQuestionScreen
        question={currentQuestion}
        quizTitle={quiz.title}
        totalTimeLeftMs={totalTimeLeftMs}
        totalTimeDurationMs={totalQuizDurationMs}
        questionTimeDurationMs={timePerQuestionMs}
        questionIndex={currentIndex}
        totalQuestions={totalQuestions}
        completedMap={completedMap}
        answer={currentAnswer}
        isValidated={isCurrentValidated}
        canGoBack={false}
        progressPercent={progressPercent}
        timeLeft={questionTimeLeftMs}
        timeTone={timeTone}
        feedback={feedback}
        showCorrection={!showCorrectionAtEnd}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onAnswerChange={(val) => {
          setAnswers((prev) => {
            const next = { ...prev, [currentQuestion.id]: val };
            answersRef.current = next;
            return next;
          });
        }}
        onValidate={handleValidate}
        onNext={handleNext}
        onPrevious={() => {}}
      />
    );
  }

  if (screen === 'result' && quiz && result) {
    return (
      <div className="min-h-screen bg-[#f4f8fb] text-slate-900">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
          <PublicQuizResultScreen
            quiz={quiz}
            score={result.rawScore}
            maxScore={result.maxScore}
            score20={result.score20}
            feedback={result.feedback}
            onRetry={handleRetry}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );
};
