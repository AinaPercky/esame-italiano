import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { Quiz } from '../types';

import { PublicQuizzesHomeView } from './publicQuiz/PublicQuizzesHomeView';
import { PublicQuizStartScreen } from './publicQuiz/PublicQuizStartScreen';
import { PublicQuizQuestionScreen } from './publicQuiz/PublicQuizQuestionScreen';
import { PublicQuizResultScreen } from './publicQuiz/PublicQuizResultScreen';

import {
  evaluateQuizAnswers,
  getQuizTimeTone,
  QuizFeedbackEntry,
  QuizEvaluationResult,
} from './publicQuiz/publicQuizUtils';
import {
  parsePublicQuizConfig,
} from './publicQuiz/publicQuizConfig';

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
  ['studentName', 'answers', 'questionTimeLeftMs', 'currentIndex', 'validated'].forEach(
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
  // timePerQuestionMs = (duration_minutes * 60 * 1000) / questions.length
  const [timePerQuestionMs, setTimePerQuestionMs] = useState<number>(0);
  // Current question time remaining
  const [questionTimeLeftMs, setQuestionTimeLeftMs] = useState<number>(0);

  // ── Result ────────────────────────────────────────────────────────────────
  const [result, setResult] = useState<QuizEvaluationResult | null>(null);

  // ── Per-question feedback (shown after validation) ─────────────────────────
  const [perQuestionFeedback, setPerQuestionFeedback] = useState<
    Record<string, QuizFeedbackEntry>
  >({});

  // Refs to avoid stale closures in timer callbacks
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isQuizActive = screen === 'quiz';

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers (stable refs so callbacks don't need them in deps)
  // ─────────────────────────────────────────────────────────────────────────
  const quizRef = useRef<Quiz | null>(null);
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
  const handleSubmit = useCallback(() => {
    const q = quizRef.current;
    const qId = activeQuizIdRef.current;
    if (!q) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const evaluation = evaluateQuizAnswers(q, answersRef.current);
    setResult(evaluation);
    if (qId) clearStorage(qId);
    setScreen('result');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Validate current question and compute feedback
  // ─────────────────────────────────────────────────────────────────────────
  const doValidate = useCallback((questionId: string) => {
    const q = quizRef.current;
    if (!q) return;

    const currentAnswers = answersRef.current;
    const evalResult = evaluateQuizAnswers(q, currentAnswers);
    const entry = evalResult.feedback[questionId];

    if (entry) {
      setPerQuestionFeedback((prev) => ({ ...prev, [questionId]: entry }));
      perQuestionFeedbackRef.current = { ...perQuestionFeedbackRef.current, [questionId]: entry };
    }
    setValidatedSet((prev) => ({ ...prev, [questionId]: true }));
    validatedSetRef.current = { ...validatedSetRef.current, [questionId]: true };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Advance to next question OR submit if last
  // ─────────────────────────────────────────────────────────────────────────
  const doAdvance = useCallback((fromIndex: number, total: number) => {
    if (fromIndex < total - 1) {
      const nextIdx = fromIndex + 1;
      setCurrentIndex(nextIdx);
      currentIndexRef.current = nextIdx;
      // Reset per-question timer
      setQuestionTimeLeftMs(timePerQuestionMsRef.current);
    } else {
      handleSubmit();
    }
  }, [handleSubmit]);

  // ─────────────────────────────────────────────────────────────────────────
  // Load quiz data
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeQuizId) {
      setScreen('home');
      return;
    }

    let cancelled = false;

    const loadQuiz = async () => {
      setScreen('loading');
      setLoadError(null);

      let q: Quiz | null = dataService.getPublicQuiz(activeQuizId);

      if (!q) {
        try {
          q = await supabaseService.fetchPublicQuiz(activeQuizId);
        } catch (err) {
          console.error('Erreur chargement quiz distant:', err);
        }
      }

      if (cancelled) return;

      if (!q) {
        setLoadError('Quiz introuvable. Vérifiez le lien ou contactez votre enseignant.');
        setScreen('start');
        return;
      }

      // Parse config embedded in description
      const { description, config } = parsePublicQuizConfig(q.description);
      setCleanDescription(description);
      setAllowBackNavigation(config.allowBackNavigation);
      setShowCorrectionAtEnd(config.showCorrectionAtEnd);
      setQuiz(q);
      quizRef.current = q;

      // Compute per-question time
      const totalMs = (q.duration_minutes || 10) * 60 * 1000;
      const numQ = Math.max(1, (q.questions || []).length);
      const perQ = Math.floor(totalMs / numQ);
      setTimePerQuestionMs(perQ);
      timePerQuestionMsRef.current = perQ;

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
        storageKey(activeQuizId, 'questionTimeLeftMs'), perQ
      );

      setStudentName(savedName);
      setAnswers(savedAnswers);
      answersRef.current = savedAnswers;
      setCurrentIndex(savedIndex);
      currentIndexRef.current = savedIndex;
      setValidatedSet(savedValidated);
      validatedSetRef.current = savedValidated;
      setQuestionTimeLeftMs(savedQTime);

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

  // ─────────────────────────────────────────────────────────────────────────
  // Per-question countdown timer
  // Resets whenever currentIndex changes (new question) or quiz starts
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isQuizActive) return;

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
  }, [isQuizActive, currentIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // When per-question timer hits 0 → no answer = 0 pts, advance immediately
  // (no validation feedback shown — just skip to next question)
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

    // Advance directly — no validation, no feedback, answer counts as empty (0 pts)
    setTimeout(() => {
      const total = quizRef.current?.questions.length ?? 0;
      doAdvance(currentIndexRef.current, total);
    }, 300);
  }, [questionTimeLeftMs, isQuizActive, currentIndex, doAdvance]);

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
    if (!quizRef.current || !studentName.trim()) return;
    const qId = activeQuizIdRef.current;
    if (qId) saveToStorage(storageKey(qId, 'studentName'), studentName.trim());
    // Reset timer to per-question duration
    setQuestionTimeLeftMs(timePerQuestionMsRef.current);
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
    doAdvance(currentIndexRef.current, q.questions.length);
  }, [doAdvance]);

  // Précédent supprimé — navigation arrière désactivée

  // ─────────────────────────────────────────────────────────────────────────
  // Retry
  // ─────────────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    const qId = activeQuizIdRef.current;
    const q = quizRef.current;
    if (!qId || !q) return;
    clearStorage(qId);
    setAnswers({});
    answersRef.current = {};
    setValidatedSet({});
    validatedSetRef.current = {};
    setPerQuestionFeedback({});
    perQuestionFeedbackRef.current = {};
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setQuestionTimeLeftMs(timePerQuestionMsRef.current);
    timeZeroFiredRef.current = -1;
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
  }, [screen, currentQuestion, isCurrentValidated, handleValidate, handleNext]);

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
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto w-full max-w-[720px] px-4 py-8">
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

    return (
      <div className="min-h-screen bg-[#f4f7f7] text-slate-900">
        <div className="mx-auto w-full max-w-[720px] px-4 py-0">
          <PublicQuizQuestionScreen
            question={currentQuestion}
            questionIndex={currentIndex}
            totalQuestions={totalQuestions}
            answer={currentAnswer}
            isValidated={isCurrentValidated}
            canGoBack={false}
            progressPercent={progressPercent}
            timeLeft={questionTimeLeftMs}
            timeTone={timeTone}
            feedback={feedback}
            showCorrection={!showCorrectionAtEnd}
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
        </div>
      </div>
    );
  }

  if (screen === 'result' && quiz && result) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto w-full max-w-[720px] px-4 py-8">
          <PublicQuizResultScreen
            quiz={quiz}
            score={result.rawScore}
            maxScore={result.maxScore}
            score20={result.score20}
            feedback={result.feedback}
            onRetry={handleRetry}
            onBackToList={handleBackToList}
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
