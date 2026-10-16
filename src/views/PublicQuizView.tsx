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
  getPublicQuizDescription,
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
  ['studentName', 'answers', 'timeLeftMs', 'currentIndex', 'validated'].forEach(
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

  // ── Active quiz ID (may change when user navigates from home list) ─────────
  const [activeQuizId, setActiveQuizId] = useState<string | null>(quizId);

  // ── Student & quiz progress (persisted) ───────────────────────────────────
  const [studentName, setStudentName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [validatedSet, setValidatedSet] = useState<Record<string, boolean>>({});
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);

  // ── Result ────────────────────────────────────────────────────────────────
  const [result, setResult] = useState<QuizEvaluationResult | null>(null);

  // Use a ref for the timer so we can call handleSubmit without stale closures
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isQuizActive = screen === 'quiz';

  // ── Load quiz data ─────────────────────────────────────────────────────────
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

      // Restore persisted state if any
      const savedName = loadFromStorage<string>(storageKey(activeQuizId, 'studentName'), '');
      const savedAnswers = loadFromStorage<Record<string, string>>(
        storageKey(activeQuizId, 'answers'),
        {}
      );
      const savedTimeMs = loadFromStorage<number>(
        storageKey(activeQuizId, 'timeLeftMs'),
        (q.duration_minutes || 10) * 60 * 1000
      );
      const savedIndex = loadFromStorage<number>(storageKey(activeQuizId, 'currentIndex'), 0);
      const savedValidated = loadFromStorage<Record<string, boolean>>(
        storageKey(activeQuizId, 'validated'),
        {}
      );

      setStudentName(savedName);
      setAnswers(savedAnswers);
      setTimeLeftMs(savedTimeMs);
      setCurrentIndex(savedIndex);
      setValidatedSet(savedValidated);

      setScreen('start');
    };

    void loadQuiz();
    return () => {
      cancelled = true;
    };
  }, [activeQuizId]);

  // ── Persist progress whenever it changes ──────────────────────────────────
  useEffect(() => {
    if (!activeQuizId || screen !== 'quiz') return;
    saveToStorage(storageKey(activeQuizId, 'answers'), answers);
    saveToStorage(storageKey(activeQuizId, 'currentIndex'), currentIndex);
    saveToStorage(storageKey(activeQuizId, 'validated'), validatedSet);
  }, [activeQuizId, answers, currentIndex, validatedSet, screen]);

  useEffect(() => {
    if (!activeQuizId || screen !== 'quiz') return;
    saveToStorage(storageKey(activeQuizId, 'timeLeftMs'), timeLeftMs);
  }, [activeQuizId, timeLeftMs, screen]);

  // ── Submit quiz ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!quiz) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const evaluation = evaluateQuizAnswers(quiz, answers);
    setResult(evaluation);
    if (activeQuizId) clearStorage(activeQuizId);
    setScreen('result');
  }, [quiz, answers, activeQuizId]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isQuizActive) return;

    timerRef.current = setInterval(() => {
      setTimeLeftMs((prev) => {
        if (prev <= 100) {
          // Will fire submit on next render tick to avoid setState-in-setState
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isQuizActive]);

  // Watch for timer reaching 0 and auto-submit
  const timeZeroRef = useRef(false);
  useEffect(() => {
    if (isQuizActive && timeLeftMs === 0 && !timeZeroRef.current) {
      timeZeroRef.current = true;
      handleSubmit();
    }
    if (!isQuizActive) {
      timeZeroRef.current = false;
    }
  }, [timeLeftMs, isQuizActive, handleSubmit]);

  // ── Navigation handlers ────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!quiz || !studentName.trim()) return;
    saveToStorage(storageKey(activeQuizId!, 'studentName'), studentName.trim());
    // Reset timer to full duration when starting fresh only if time was never persisted
    const persisted = loadFromStorage<number | null>(storageKey(activeQuizId!, 'timeLeftMs'), null);
    if (persisted === null) {
      setTimeLeftMs((quiz.duration_minutes || 10) * 60 * 1000);
    }
    setScreen('quiz');
  }, [quiz, studentName, activeQuizId]);

  const currentQuestion = quiz?.questions[currentIndex];
  const totalQuestions = quiz?.questions.length ?? 0;
  const progressPercent = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const currentAnswer = currentQuestion ? (answers[currentQuestion.id] ?? '') : '';
  const isCurrentValidated = currentQuestion ? Boolean(validatedSet[currentQuestion.id]) : false;
  const timeTone = getQuizTimeTone(timeLeftMs);

  // Per-question feedback (only available after validation)
  const [perQuestionFeedback, setPerQuestionFeedback] = useState<
    Record<string, QuizFeedbackEntry>
  >({});

  const handleValidate = useCallback(() => {
    if (!currentQuestion) return;
    const evalResult = evaluateQuizAnswers(quiz!, { ...answers });
    const entry = evalResult.feedback[currentQuestion.id];
    setPerQuestionFeedback((prev) => ({
      ...prev,
      [currentQuestion.id]: entry,
    }));
    setValidatedSet((prev) => ({ ...prev, [currentQuestion.id]: true }));
  }, [currentQuestion, quiz, answers]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      handleSubmit();
    }
  }, [currentIndex, totalQuestions, handleSubmit]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const handleRetry = useCallback(() => {
    if (!activeQuizId || !quiz) return;
    clearStorage(activeQuizId);
    setAnswers({});
    setValidatedSet({});
    setPerQuestionFeedback({});
    setCurrentIndex(0);
    setTimeLeftMs((quiz.duration_minutes || 10) * 60 * 1000);
    setResult(null);
    setScreen('start');
  }, [activeQuizId, quiz]);

  const handleOpenQuiz = useCallback((publicId: string) => {
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'public-quiz');
    url.searchParams.set('id', publicId);
    window.history.pushState({}, '', url.toString());
    setActiveQuizId(publicId);
  }, []);

  const handleBackToList = useCallback(() => {
    // Go back to home list
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'public-quiz');
    url.searchParams.delete('id');
    window.history.pushState({}, '', url.toString());
    setActiveQuizId(null);
    setQuiz(null);
    setScreen('home');
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
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
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }));
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, currentQuestion, isCurrentValidated, handleValidate, handleNext]);

  // ── Render ─────────────────────────────────────────────────────────────────
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
            canGoBack={allowBackNavigation && currentIndex > 0}
            progressPercent={progressPercent}
            timeLeft={timeLeftMs}
            timeTone={timeTone}
            feedback={feedback}
            showCorrection={!showCorrectionAtEnd}
            onAnswerChange={(val) =>
              setAnswers((prev) => ({ ...prev, [currentQuestion.id]: val }))
            }
            onValidate={handleValidate}
            onNext={handleNext}
            onPrevious={handlePrevious}
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

  // Fallback
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );
};
