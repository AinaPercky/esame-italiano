import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, HelpCircle, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { Quiz } from '../types';
import { PublicQuizQuestionScreen } from './publicQuiz/PublicQuizQuestionScreen';
import { PublicQuizResultScreen } from './publicQuiz/PublicQuizResultScreen';
import { PublicQuizStartScreen } from './publicQuiz/PublicQuizStartScreen';
import { getPublicQuizConfig, getPublicQuizDescription } from './publicQuiz/publicQuizConfig';
import { QuizFeedbackEntry, evaluateQuizAnswers, getQuizTimeTone } from './publicQuiz/publicQuizUtils';

interface PublicQuizViewProps {
  quizId: string; // This is the public_id
  onBackToList: () => void;
}

export const PublicQuizView: React.FC<PublicQuizViewProps> = ({
  quizId,
  onBackToList
}) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const quizRef = useRef<Quiz | null>(null);
  const [studentName, setStudentName] = useState<string>('');
  const [phase, setPhase] = useState<'intro' | 'active' | 'results'>('intro');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [validatedQuestions, setValidatedQuestions] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState<number>(0);
  const [maxScore, setMaxScore] = useState<number>(0);
  const [score20, setScore20] = useState<number>(0);
  const [feedback, setFeedback] = useState<Record<string, QuizFeedbackEntry>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [quizEndTime, setQuizEndTime] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState<boolean>(false);
  const sessionKey = useMemo(() => `public-quiz-session:${quizId}`, [quizId]);
  const isRestoringRef = useRef<boolean>(false);

  useEffect(() => {
    quizRef.current = quiz;
  }, [quiz]);

  useEffect(() => {
    let isActive = true;

    const applyQuiz = (publicQuiz: Quiz) => {
      setQuiz(publicQuiz);
      setMaxScore(publicQuiz.total_points || 20);
    };

    const loadQuiz = async () => {
      setLoading(true);
      setLoadError(null);
      setAnswers({});
      answersRef.current = {};
      setStudentName('');
      setPhase('intro');
      setCurrentQuestionIndex(0);
      setValidatedQuestions({});
      setFeedback({});
      setScore(0);
      setScore20(0);
      setTimerActive(false);
      setTimeLeft(null);
      setQuizEndTime(null);
      setTimedOut(false);

      try {
        const localQuiz = dataService.getPublicQuiz(quizId);
        if (localQuiz && localQuiz.is_public) {
          if (!isActive) return;
          applyQuiz(localQuiz);
          return;
        }

        const remoteQuiz = await supabaseService.fetchPublicQuiz(quizId);
        if (!isActive) return;

        if (remoteQuiz) {
          applyQuiz(remoteQuiz);
        } else {
          setQuiz(null);
        }
      } catch (e: any) {
        if (!isActive) return;
        setQuiz(null);
        setLoadError(e?.message || 'Erreur lors du chargement du quiz.');
      } finally {
        if (isActive) setLoading(false);
      }
    };

    void loadQuiz();

    return () => {
      isActive = false;
    };
  }, [quizId]);

  useEffect(() => {
    if (!quiz) return;

    isRestoringRef.current = true;
    try {
      const raw = window.localStorage.getItem(sessionKey);
      if (!raw) {
        setMaxScore(quiz.total_points || 20);
        return;
      }

      const saved = JSON.parse(raw);
      if (saved?.quizId !== quizId) return;

      const nextAnswers = saved.answers || {};
      const nextFeedback = saved.feedback || {};
      const nextValidated = saved.validatedQuestions || {};
      const nextPhase = saved.phase === 'active' || saved.phase === 'results' ? saved.phase : 'intro';
      const nextEndTime = saved.quizEndTime || null;

      setStudentName(saved.studentName || '');
      setAnswers(nextAnswers);
      answersRef.current = nextAnswers;
      setFeedback(nextFeedback);
      setValidatedQuestions(nextValidated);
      setCurrentQuestionIndex(Math.min(saved.currentQuestionIndex || 0, Math.max(0, (quiz.questions || []).length - 1)));
      setScore(Number(saved.score) || 0);
      setMaxScore(Number(saved.maxScore) || quiz.total_points || 20);
      setScore20(Number(saved.score20) || 0);
      setTimedOut(Boolean(saved.timedOut));
      setPhase(nextPhase);
      setQuizEndTime(nextEndTime);

      if (nextPhase === 'active' && nextEndTime) {
        const remaining = Math.max(0, nextEndTime - Date.now());
        setTimeLeft(remaining);
        setTimerActive(remaining > 0);
        if (remaining <= 0) {
          completeQuiz(true, nextAnswers);
        }
      } else {
        setTimerActive(false);
        setTimeLeft(nextEndTime ? Math.max(0, nextEndTime - Date.now()) : null);
      }
    } catch {
      window.localStorage.removeItem(sessionKey);
    } finally {
      isRestoringRef.current = false;
    }
  }, [quiz, quizId, sessionKey]);

  useEffect(() => {
    if (!quiz || isRestoringRef.current) return;

    window.localStorage.setItem(sessionKey, JSON.stringify({
      quizId,
      phase,
      studentName,
      currentQuestionIndex,
      answers,
      validatedQuestions,
      feedback,
      score,
      maxScore,
      score20,
      quizEndTime,
      timedOut
    }));
  }, [
    answers,
    currentQuestionIndex,
    feedback,
    maxScore,
    phase,
    quiz,
    quizEndTime,
    quizId,
    score,
    score20,
    sessionKey,
    studentName,
    timedOut,
    validatedQuestions
  ]);

  useEffect(() => {
    if (!quiz || phase !== 'active' || !quizEndTime) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, quizEndTime - now);
      setTimeLeft(left);

      if (left <= 0) {
        setTimerActive(false);
        clearInterval(timer);
        completeQuiz(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, quiz, quizEndTime]);

  useEffect(() => {
    if (phase !== 'active' || !quiz) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const currentQuestion = quiz.questions[currentQuestionIndex];
      if (!currentQuestion) return;
      const isValidated = Boolean(validatedQuestions[currentQuestion.id]);

      if (event.key === 'Enter') {
        event.preventDefault();
        if (isValidated) {
          handleNext();
        } else {
          handleValidateCurrentQuestion();
        }
      }

      if (currentQuestion.type === 'qcm' && !isValidated && ['1', '2', '3', '4'].includes(event.key)) {
        const optionIndex = Number(event.key) - 1;
        const option = currentQuestion.options?.[optionIndex];
        if (option !== undefined) {
          event.preventDefault();
          handleAnswerChange(currentQuestion.id, option);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQuestionIndex, phase, quiz, validatedQuestions]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => {
      const next = {
        ...prev,
        [questionId]: answer
      };
      answersRef.current = next;
      return next;
    });
  };

  const completeQuiz = (isTimeout = false, providedAnswers?: Record<string, string>) => {
    const currentQuiz = quizRef.current;
    if (!currentQuiz) return;

    const currentAnswers = providedAnswers || answersRef.current || {};
    const evaluation = evaluateQuizAnswers(currentQuiz, currentAnswers);
    const finalScore = isTimeout ? 0 : evaluation.rawScore;
    const finalScore20 = isTimeout ? 0 : evaluation.score20;

    setAnswers(currentAnswers);
    answersRef.current = currentAnswers;
    setScore(finalScore);
    setMaxScore(evaluation.maxScore);
    setScore20(finalScore20);
    setFeedback(evaluation.feedback);
    setPhase('results');
    setTimerActive(false);
    setTimeLeft(0);
    setTimedOut(isTimeout);
  };

  const startQuiz = () => {
    if (!quiz || !studentName.trim()) return;
    const durationMinutes = quiz.duration_minutes || 10;
    const endTime = Date.now() + durationMinutes * 60 * 1000;
    setPhase('active');
    setCurrentQuestionIndex(0);
    setTimerActive(true);
    setTimeLeft(durationMinutes * 60 * 1000);
    setQuizEndTime(endTime);
    setTimedOut(false);
  };

  const resetQuiz = () => {
    window.localStorage.removeItem(sessionKey);
    setPhase('intro');
    setAnswers({});
    answersRef.current = {};
    setCurrentQuestionIndex(0);
    setValidatedQuestions({});
    setFeedback({});
    setScore(0);
    setMaxScore(quiz?.total_points || 20);
    setScore20(0);
    setTimerActive(false);
    setTimeLeft(null);
    setQuizEndTime(null);
    setTimedOut(false);
  };

  const handleValidateCurrentQuestion = () => {
    if (!quiz) return;
    const currentQuestion = quiz.questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const evaluation = evaluateQuizAnswers(quiz, answersRef.current);
    setValidatedQuestions((prev) => ({
      ...prev,
      [currentQuestion.id]: true
    }));
    setFeedback((prev) => ({
      ...prev,
      [currentQuestion.id]: evaluation.feedback[currentQuestion.id]
    }));
  };

  const handleNext = () => {
    if (!quiz) return;
    if (currentQuestionIndex >= quiz.questions.length - 1) {
      completeQuiz(false);
      return;
    }
    setCurrentQuestionIndex((prev) => Math.min(prev + 1, quiz.questions.length - 1));
  };

  const handlePrevious = () => {
    setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f7f7] flex flex-col items-center justify-center p-6">
        <div className="text-center bg-white rounded-[28px] p-8 shadow-xl shadow-slate-200/70 w-full max-w-md ring-1 ring-slate-200">
          <Loader2 className="w-12 h-12 text-slate-400 mb-4 animate-spin mx-auto" />
          <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">Chargement du quiz…</h2>
          <p className="text-slate-600 mb-6">
            Préparation de l’espace de composition.
          </p>
          <button
            onClick={onBackToList}
            className="h-12 rounded-2xl bg-slate-100 px-5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            Retour à la liste des quiz
          </button>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-[#f4f7f7] flex flex-col items-center justify-center p-6">
        <div className="text-center bg-white rounded-[28px] p-8 shadow-xl shadow-slate-200/70 w-full max-w-md ring-1 ring-slate-200">
          <HelpCircle className="w-12 h-12 text-slate-400 mb-4" />
          <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">Quiz introuvable</h2>
          <p className="text-slate-600 mb-6">
            Le quiz demandé n'existe pas, n'est pas publié publiquement ou le lien a expiré.
          </p>
          {loadError && (
            <div className="text-left bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3 mb-6 text-sm">
              {loadError}
            </div>
          )}
          <button
            onClick={onBackToList}
            className="h-12 rounded-2xl bg-slate-100 px-5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            Retour à la liste des quiz
          </button>
        </div>
      </div>
    );
  }

  const publicConfig = getPublicQuizConfig(quiz);
  const cleanDescription = getPublicQuizDescription(quiz);
  const currentQuestion = quiz.questions[currentQuestionIndex];
  const currentAnswer = currentQuestion ? (answers[currentQuestion.id] || '') : '';
  const currentFeedback = currentQuestion ? feedback[currentQuestion.id] : undefined;
  const isCurrentValidated = currentQuestion ? Boolean(validatedQuestions[currentQuestion.id]) : false;
  const progressPercent = quiz.questions.length > 0 ? ((currentQuestionIndex + 1) / quiz.questions.length) * 100 : 0;
  const showImmediateCorrection = !publicConfig.showCorrectionAtEnd && isCurrentValidated;

  return (
    <div className="min-h-screen bg-[#f4f7f7] text-slate-900">
      <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:py-8">
        {phase === 'intro' && (
          <PublicQuizStartScreen
            quiz={quiz}
            description={cleanDescription}
            studentName={studentName}
            onStudentNameChange={setStudentName}
            onStart={startQuiz}
            onBackToList={onBackToList}
          />
        )}

        {phase === 'active' && currentQuestion && (
          <div className="animate-fade-in">
            <PublicQuizQuestionScreen
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={quiz.questions.length}
              answer={currentAnswer}
              isValidated={isCurrentValidated}
              canGoBack={publicConfig.allowBackNavigation && currentQuestionIndex > 0}
              progressPercent={progressPercent}
              timeLeft={timeLeft}
              timeTone={getQuizTimeTone(timeLeft)}
              feedback={currentFeedback}
              showCorrection={showImmediateCorrection}
              onAnswerChange={(value) => handleAnswerChange(currentQuestion.id, value)}
              onValidate={handleValidateCurrentQuestion}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          </div>
        )}

        {phase === 'results' && (
          <div className="space-y-4 animate-fade-in">
            {timedOut && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    Le temps est écoulé. Le quiz a été terminé automatiquement.
                  </div>
                </div>
              </div>
            )}
            <PublicQuizResultScreen
              quiz={quiz}
              score={score}
              maxScore={maxScore}
              score20={score20}
              feedback={feedback}
              onRetry={resetQuiz}
              onBackToList={onBackToList}
            />
          </div>
        )}

        <div className="mt-6 text-center text-xs text-slate-500">
          <p>
            Ce quiz public conserve temporairement votre progression sur cet appareil afin d’éviter toute perte en cas de rechargement.
          </p>
          <p className="mt-1">
            Les résultats de cette vue publique ne sont pas enregistrés pour l’enseignant.
          </p>
        </div>
      </div>
    </div>
  );
};
