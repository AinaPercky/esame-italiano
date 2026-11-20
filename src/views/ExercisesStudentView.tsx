import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, CheckCircle2, XCircle, ArrowRight, Loader2, History, Award, Eye, CalendarDays, RefreshCw } from 'lucide-react';
import type { ExerciseAttemptQuestion, ExerciseAttemptBundle, ExerciseCorrection, StudentExerciseItem, ExerciseAttemptResult, ExerciseAttemptReview, QuizQuestion } from '../types';
import { deleteWrittenExamDraft, loadWrittenExamDraft, saveWrittenExamDraft } from '../utils/writtenExamLocalAnswers';
import { exerciseService } from '../services/exerciseService';
import { QuizClozeInput, parseQuestionClozePrompt } from '../components/QuizClozeInput';
import { QuizReorderList } from '../components/QuizReorderList';
import { VerbesTrousQuestion } from '../components/verbesTrous/VerbesTrousQuestion';
import { CORRECTION_DISPLAY_SECONDS } from '../utils/quizTiming';
import {
  isTimerBeepEnabled,
  playTimerBeep,
  primeTimerAudio,
  setTimerBeepEnabled,
  useAssessmentTimerBeeper
} from '../utils/timerAudio';
import {
  AssessmentCorrectionModal,
  AssessmentQcmOptions,
  AssessmentQuestionHeader,
  AssessmentShell
} from '../components/AssessmentRunner';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  LearningModuleHeader,
  StatusBadge
} from '../components/LearningCard';

const hasSubmittedAnswer = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasSubmittedAnswer);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasSubmittedAnswer);
  return false;
};

const formatExerciseExpected = (question: ExerciseAttemptReview['questions'][number]): string => {
  if (question.type === 'reorder' && question.items?.length) {
    try {
      const raw = typeof question.expected === 'string' ? question.expected : JSON.stringify(question.expected);
      const ids = JSON.parse(raw || '[]');
      if (Array.isArray(ids)) {
        return ids.map((id) => question.items?.find((item) => item.id === String(id))?.text || String(id)).join(' → ');
      }
    } catch {
      // Fallback to the raw correction when the legacy answer is not a JSON order.
    }
  }
  return correctionText(question.expected);
};

const correctionText = (value: unknown): string => {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item, index) => {
    if (typeof item === 'string') return item;
    if (item && Array.isArray((item as any).reponses)) return 'Phrase ' + (index + 1) + ' : ' + (item as any).reponses.join(' / ');
    return JSON.stringify(item);
  }).join(' · ');
  return JSON.stringify(value);
};

interface ExercisesStudentViewProps { onFullscreenChange: (fullscreen: boolean) => void; }

export const ExercisesStudentView: React.FC<ExercisesStudentViewProps> = ({ onFullscreenChange }) => {
  const [items, setItems] = useState<StudentExerciseItem[]>([]);
  const [results, setResults] = useState<ExerciseAttemptResult[]>([]);
  const [historyExerciseId, setHistoryExerciseId] = useState<string | null>(null);
  const [attemptReview, setAttemptReview] = useState<ExerciseAttemptReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [active, setActive] = useState<ExerciseAttemptQuestion | null>(null);
  const [batchBundle, setBatchBundle] = useState<ExerciseAttemptBundle | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchAnswers, setBatchAnswers] = useState<Record<string, unknown>>({});
  const [batchMode, setBatchMode] = useState(false);
  const [activeExerciseTitle, setActiveExerciseTitle] = useState('Exercice');
  const [answer, setAnswer] = useState('');
  const [correction, setCorrection] = useState<ExerciseCorrection | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [correctionSeconds, setCorrectionSeconds] = useState(CORRECTION_DISPLAY_SECONDS);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isTimerBeepEnabled());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const timeoutLock = useRef(false);
  const advanceLock = useRef(false);
  const serverClockOffset = useRef(0);
  const localSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setTimerBeepEnabled(next);
    if (next) {
      primeTimerAudio();
      playTimerBeep(true);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [available, history] = await Promise.all([
        exerciseService.listStudentExercises(),
        exerciseService.listStudentResults()
      ]);
      setItems(available);
      setResults(history);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement des exercices impossible.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!active || correction) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((new Date(active.deadline_at).getTime() - (Date.now() - serverClockOffset.current)) / 1000));
      setRemaining(seconds);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [active, correction]);

  const applyAttemptState = useCallback(async (result: ExerciseAttemptQuestion | { completed: true; attempt_id: string }) => {
    if ('completed' in result && result.completed) {
      setActive(null);
      setCorrection(null);
      setAnswer('');
      onFullscreenChange(false);
      await refresh();
      return;
    }
    const nextQuestion = result as ExerciseAttemptQuestion;
    serverClockOffset.current = Date.now() - new Date(nextQuestion.server_now).getTime();
    setActive(nextQuestion);
    setCorrection(nextQuestion.correction || null);
    setAnswer(nextQuestion.correction?.student_answer == null ? '' : String(nextQuestion.correction.student_answer));
    timeoutLock.current = false;
    setRemaining(nextQuestion.seconds_remaining);
  }, [onFullscreenChange, refresh]);

  const activateBatchQuestion = useCallback((bundle: ExerciseAttemptBundle, index: number, answers: Record<string, unknown>) => {
    const item = bundle.questions[index];
    if (!item) return;
    serverClockOffset.current = Date.now() - new Date(bundle.server_now).getTime();
    const nextQuestion: ExerciseAttemptQuestion = {
      attempt_id: bundle.attempt_id,
      question: item.question,
      question_number: item.question_number,
      question_count: item.question_count,
      deadline_at: item.deadline_at,
      seconds_remaining: item.seconds_remaining,
      server_now: bundle.server_now
    };
    setActive(nextQuestion);
    setCorrection(null);
    const savedAnswer = answers[item.question.id];
    setAnswer(typeof savedAnswer === 'string' ? savedAnswer : savedAnswer == null ? '' : JSON.stringify(savedAnswer));
    timeoutLock.current = false;
    setRemaining(item.seconds_remaining);
  }, []);

  const updateAnswer = useCallback((value: string) => {
    setAnswer(value);
    if (!batchMode || !active) return;
    const nextAnswers = { ...batchAnswers, [active.question.id]: value };
    setBatchAnswers(nextAnswers);
    const write = localSaveQueueRef.current.catch(() => undefined).then(() =>
      saveWrittenExamDraft(active.attempt_id, nextAnswers, batchIndex)
    );
    localSaveQueueRef.current = write;
    void write.catch((e) => setError(e instanceof Error ? e.message : 'La sauvegarde locale a échoué.'));
  }, [active, batchAnswers, batchIndex, batchMode]);

  const submit = useCallback(async (value?: string) => {
    if (!active || submitting || correction) return;
    setSubmitting(true); setError('');
    if (batchMode && batchBundle) {
      const currentAnswer = value === undefined ? answer : value;
      const nextAnswers = { ...batchAnswers, [active.question.id]: currentAnswer };
      setBatchAnswers(nextAnswers);
      const localWrite = localSaveQueueRef.current.catch(() => undefined).then(() =>
        saveWrittenExamDraft(active.attempt_id, nextAnswers, batchIndex)
      );
      localSaveQueueRef.current = localWrite;
      try {
        await localWrite;
        if (batchIndex >= batchBundle.questions.length - 1) {
          await localSaveQueueRef.current;
          const submitted = await exerciseService.submitAttemptBatch(active.attempt_id, nextAnswers);
          try { await deleteWrittenExamDraft(active.attempt_id); } catch { /* la remise serveur est déjà confirmée */ }
          const completedReview: ExerciseAttemptReview = {
            attempt_id: active.attempt_id,
            exercise_id: batchBundle.exercise_id,
            score: submitted.score,
            max_score: submitted.max_score,
            status: 'completed',
            started_at: batchBundle.started_at,
            completed_at: submitted.completed_at || new Date().toISOString(),
            questions: batchBundle.questions.map((item) => {
              const questionId = item.question.id;
              const correction = submitted.feedback?.[questionId];
              const fallbackCorrection: ExerciseCorrection = {
                correct: false,
                points: 0,
                max_points: Number(item.question.points) || 0,
                expected: null,
                timed_out: false,
                question_id: questionId
              };
              const graded = correction || fallbackCorrection;
              return {
                question_id: questionId,
                question: item.question.question,
                type: item.question.type,
                points: graded.max_points,
                answer: nextAnswers[questionId] ?? null,
                correct: graded.correct,
                points_awarded: graded.points,
                max_points: graded.max_points,
                timed_out: graded.timed_out,
                expected: graded.expected,
                explanation: graded.explanation,
                options: item.question.options,
                items: item.question.items,
                verbes_trous: item.question.verbes_trous
              };
            })
          };
          setAttemptReview(completedReview);
          setHistoryExerciseId(batchBundle.exercise_id);
          setBatchBundle(null);
          setBatchAnswers({});
          setBatchIndex(0);
          setBatchMode(false);
          setActive(null);
          setCorrection(null);
          setAnswer('');
          onFullscreenChange(false);
          await refresh();
        } else {
          const nextIndex = batchIndex + 1;
          setBatchIndex(nextIndex);
          const nextWrite = localSaveQueueRef.current.catch(() => undefined).then(() =>
            saveWrittenExamDraft(active.attempt_id, nextAnswers, nextIndex)
          );
          localSaveQueueRef.current = nextWrite;
          await nextWrite;
          activateBatchQuestion(batchBundle, nextIndex, nextAnswers);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Remise groupée impossible. Réessayez.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const result = await exerciseService.submitAnswer(active.attempt_id, value === undefined ? answer : value);
      if (result.correct) {
        if (!advanceLock.current) {
          advanceLock.current = true;
          try {
            const advanced = await exerciseService.advance(active.attempt_id);
            await applyAttemptState(advanced);
          } catch (advanceError) {
            setCorrection(result);
            setError(advanceError instanceof Error ? advanceError.message : 'Passage à la question suivante impossible.');
          } finally {
            advanceLock.current = false;
          }
        }
      } else {
        setCorrection(result);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Validation impossible. Réessayez.'); }
    finally { setSubmitting(false); }
  }, [active, answer, applyAttemptState, correction, submitting, batchMode, batchBundle, batchAnswers, batchIndex, activateBatchQuestion, onFullscreenChange, refresh]);

  useEffect(() => {
    if (active && remaining <= 0 && !correction && !submitting && !timeoutLock.current) {
      timeoutLock.current = true;
      void submit('');
    }
    if (!active || correction) timeoutLock.current = false;
  }, [active, remaining, correction, submitting, submit]);

  useAssessmentTimerBeeper({
    active: Boolean(active),
    paused: Boolean(correction),
    questionKey: active ? `${active.attempt_id}:${active.question_number}` : '',
    questionTotalSeconds: Math.max(1, Number(active?.question?.time_limit_seconds || active?.seconds_remaining || 30)),
    questionSecondsRemaining: active ? remaining : null,
    totalSecondsRemaining: null,
    soundEnabled
  });

  const begin = async (exerciseId: string, attemptId?: string | null) => {
    primeTimerAudio();
    const matchedTitle = items.find(item => item.id === exerciseId)?.title;
    if (matchedTitle) setActiveExerciseTitle(matchedTitle);
    setError(''); setCorrection(null); setAnswer(''); timeoutLock.current = false;
    localSaveQueueRef.current = Promise.resolve();
    try {
      if (attemptId) {
        const resumedBatch = await exerciseService.resumeAttemptBatch(attemptId);
        if (resumedBatch && 'completed' in resumedBatch) {
          await deleteWrittenExamDraft(attemptId);
          await refresh();
          return;
        }
        if (resumedBatch) {
          const draft = await loadWrittenExamDraft(attemptId);
          const restoredAnswers = draft?.answers && typeof draft.answers === 'object' ? draft.answers as Record<string, unknown> : {};
          serverClockOffset.current = Date.now() - new Date(resumedBatch.server_now).getTime();
          const estimatedServerNow = Date.now() - serverClockOffset.current;
          const inferredIndex = resumedBatch.questions.findIndex(item => new Date(item.deadline_at).getTime() > estimatedServerNow);
          const fallbackIndex = inferredIndex < 0 ? resumedBatch.questions.length - 1 : inferredIndex;
          const draftIndex = draft?.currentIndex;
          const restoredIndex = Number.isInteger(draftIndex)
            ? Math.min(resumedBatch.questions.length - 1, Math.max(fallbackIndex, Math.max(0, draftIndex as number)))
            : fallbackIndex;
          setBatchMode(true);
          setBatchBundle(resumedBatch);
          setBatchAnswers(restoredAnswers);
          setBatchIndex(restoredIndex);
          onFullscreenChange(true);
          activateBatchQuestion(resumedBatch, restoredIndex, restoredAnswers);
          return;
        }
      } else {
        const startedBatch = await exerciseService.startAttemptBatch(exerciseId);
        setBatchMode(true);
        setBatchBundle(startedBatch);
        setBatchAnswers({});
        setBatchIndex(0);
        onFullscreenChange(true);
        activateBatchQuestion(startedBatch, 0, {});
        localSaveQueueRef.current = Promise.resolve();
        await saveWrittenExamDraft(startedBatch.attempt_id, {}, 0);
        return;
      }

      // Tentative historique créée avant la migration groupée : conserver son ancien parcours.
      const current = await exerciseService.resumeAttempt(attemptId as string);
      setBatchMode(false);
      setBatchBundle(null);
      onFullscreenChange(true);
      if (current.correction?.correct) {
        try {
          const advanced = await exerciseService.advance(current.attempt_id);
          await applyAttemptState(advanced);
          return;
        } catch (advanceError) {
          setError(advanceError instanceof Error ? advanceError.message : 'Passage à la question suivante impossible.');
        }
      }
      await applyAttemptState(current);
    } catch (e) { setError(e instanceof Error ? e.message : 'Démarrage impossible.'); }
  };

  const next = useCallback(async () => {
    if (!active || advanceLock.current) return;
    advanceLock.current = true;
    setSubmitting(true); setError('');
    try {
      const result = await exerciseService.advance(active.attempt_id);
      await applyAttemptState(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Passage à la question suivante impossible.'); }
    finally { advanceLock.current = false; setSubmitting(false); }
  }, [active, applyAttemptState]);

  useEffect(() => {
    if (!active || !correction || correction.correct) return;
    const startedAt = Date.now();
    setCorrectionSeconds(CORRECTION_DISPLAY_SECONDS);
    const timer = window.setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((CORRECTION_DISPLAY_SECONDS * 1000 - (Date.now() - startedAt)) / 1000));
      setCorrectionSeconds(secondsLeft);
      if (secondsLeft === 0) {
        window.clearInterval(timer);
        void next();
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [active?.attempt_id, active?.question_number, correction?.correct, correction?.timed_out, next]);

  const openBestAttempt = async (exerciseId: string) => {
    const completed = results
      .filter(result => result.exercise_id === exerciseId && result.status === 'completed' && result.max_score > 0)
      .sort((a, b) => {
        const ratio = (b.score / b.max_score) - (a.score / a.max_score);
        return ratio || b.score - a.score || new Date(b.completed_at || b.started_at).getTime() - new Date(a.completed_at || a.started_at).getTime();
      });
    if (!completed.length) {
      setError('Aucune tentative terminée ne permet encore de consulter une meilleure performance.');
      return;
    }
    setReviewLoading(true);
    setAttemptReview(null);
    try {
      const detail = await exerciseService.getStudentAttemptDetails(completed[0].id);
      setAttemptReview(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Consultation de la tentative impossible.');
    } finally {
      setReviewLoading(false);
    }
  };

  const renderQuestion = (question: QuizQuestion, customSentence?: string) => {
    if (question.type === 'qcm') {
      return (
        <AssessmentQcmOptions
          options={(question.options || []).map((option) => ({ value: option, label: option }))}
          selectedValue={answer}
          onSelect={updateAnswer}
        />
      );
    }
    if (question.type === 'text') {
      return (
        <QuizClozeInput
          question={question}
          customSentence={customSentence}
          answer={answer}
          onChange={updateAnswer}
          theme="navy"
          onEnterPress={() => void submit()}
        />
      );
    }
    if (question.type === 'reorder') {
      return <QuizReorderList question={question} answer={answer} onChange={setAnswer} theme="navy"/>;
    }
    if (question.type === 'verbes_trous' && question.verbes_trous) {
      return (
        <VerbesTrousQuestion
          definition={question.verbes_trous as any}
          answer={answer}
          onChange={setAnswer}
          onEnterPress={() => void submit()}
        />
      );
    }
    return <p className="text-sm text-rose-700">Type de question non pris en charge.</p>;
  };

  const returnToList = () => {
    onFullscreenChange(false);
    setActive(null);
    setBatchBundle(null);
    setBatchMode(false);
    setCorrection(null);
    setAnswer('');
    setError('');
    timeoutLock.current = false;
    void refresh();
  };

  if (active) {
    const q = active.question;
    const clozeInfo = q.type === 'text' ? parseQuestionClozePrompt(q.question) : null;
    const maxQuestionSecs = Math.max(1, Number(q.time_limit_seconds || active.seconds_remaining || 30));
    const isLastQuestion = active.question_number >= active.question_count;

    return (
      <AssessmentShell
        modeTone="training"
        bannerLabel="MODE ENTRAÎNEMENT • Exercice autonome sans note officielle"
        bannerMobileLabel="MODE ENTRAÎNEMENT"
        onExit={returnToList}
        exitLabel="Mes exercices"
        kicker="Entraînement · Exercice"
        title={activeExerciseTitle}
        questionIndex={active.question_number - 1}
        totalQuestions={active.question_count}
        questionSecondsRemaining={remaining}
        questionTotalSeconds={maxQuestionSecs}
        totalSecondsRemaining={null}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        zIndexClass="z-[100]"
        alerts={
          error ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 sm:text-sm">
              {error}
            </div>
          ) : null
        }
        footerAction={
          !correction ? (
            <button
              type="button"
              disabled={submitting || remaining <= 0}
              onClick={() => void submit()}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] disabled:opacity-45 sm:w-auto"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>
                {batchMode
                  ? isLastQuestion ? 'Remettre l’exercice' : 'Enregistrer et continuer'
                  : q.type === 'verbes_trous'
                    ? isLastQuestion ? 'Corriger et terminer' : 'Corriger et continuer'
                    : isLastQuestion ? 'Valider et terminer' : 'Valider la réponse'}
              </span>
            </button>
          ) : correction.correct ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void next()}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#2fa36b] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#248556] disabled:opacity-50 sm:w-auto"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{isLastQuestion ? 'Terminer l’exercice' : 'Continuer vers la question suivante'}</span>
            </button>
          ) : null
        }
        modals={
          <AssessmentCorrectionModal
            isOpen={Boolean(correction && !correction.correct)}
            isCorrect={false}
            isTimeout={Boolean(correction?.timed_out)}
            questionNumber={active.question_number}
            questionText={q.question}
            studentAnswer={correctionText((correction?.student_answer ?? answer) || '')}
            expectedAnswer={correctionText(correction?.expected)}
            explanation={correction?.explanation ? correctionText(correction.explanation) : undefined}
            points={correction?.points ?? 0}
            maxPoints={correction?.max_points ?? q.points}
            countdownSeconds={correctionSeconds}
            totalCountdownSeconds={CORRECTION_DISPLAY_SECONDS}
            isLastQuestion={isLastQuestion}
            onContinue={() => void next()}
            disabled={submitting}
          />
        }
      >
        <AssessmentQuestionHeader
          questionNumber={active.question_number}
          type={q.type}
          points={q.points}
          prompt={clozeInfo?.hasBlanks ? clozeInfo.prompt : q.question}
        />

        {correction && !correction.correct ? (
          <div role="status" className="rounded-2xl border border-[#f3c5cc] bg-[#fef2f4] p-4 text-sm text-[#9f1239]">
            <p className="flex items-center gap-2 font-bold">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>Réponse incorrecte · consultez la correction détaillée</span>
            </p>
          </div>
        ) : !correction ? (
          <div key={`${active.attempt_id}-${active.question_number}-${q.id}`}>
            {renderQuestion(q, clozeInfo?.hasBlanks ? clozeInfo.sentence : undefined)}
          </div>
        ) : null}
      </AssessmentShell>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <LearningModuleHeader
        kicker="Entraînement autonome"
        title="Mes exercices"
        description="Les exercices attribués à votre classe. Vous pouvez vous entraîner autant de fois que vous le souhaitez ; ces résultats ne sont pas des notes officielles."
        action={
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#cfe1ec] bg-white px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition-colors hover:bg-[#e6f0f7]"
          >
            <RefreshCw size={14} />
            <span>Actualiser</span>
          </button>
        }
      />

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {loading ? (
        <div className="rounded-[22px] border border-[#d8e6ee] bg-white p-8 text-center text-sm text-[#607f93] shadow-[0_6px_20px_rgba(7,42,63,0.04)]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#2fa36b]" />
          Chargement de vos exercices…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#b9cfdd] bg-white/90 p-8 text-center text-sm text-[#607f93]">
          Aucun exercice n’est actuellement attribué à votre classe.
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          {items.map(item => {
            const exerciseResults = results.filter(result => result.exercise_id === item.id);
            const latestResult = [...exerciseResults].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
            const completed = exerciseResults.filter(result => result.status === 'completed' && result.max_score > 0);
            const bestResult = [...completed].sort((a, b) => (b.score / b.max_score) - (a.score / a.max_score) || b.score - a.score)[0];
            const bestPercent = bestResult ? Math.round((bestResult.score / bestResult.max_score) * 100) : null;
            const bestScore20 = bestResult ? (bestResult.score / bestResult.max_score * 20).toFixed(2).replace(/\.00$/, '') : null;
            const hasActiveAttempt = Boolean(item.active_attempt_id);

            const statusBadge = hasActiveAttempt ? (
              <StatusBadge tone="info" icon={<RotateCcw size={12} />}>
                En cours
              </StatusBadge>
            ) : bestPercent !== null ? (
              <StatusBadge tone="success" icon={<CheckCircle2 size={12} />}>
                {bestPercent} % max
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">
                À faire
              </StatusBadge>
            );

            return (
              <LearningCard key={item.id} active={hasActiveAttempt}>
                <LearningCardHeader
                  kicker={
                    <>
                      {item.category}
                      {item.level ? ` · ${item.level}` : ''}
                    </>
                  }
                  status={statusBadge}
                />

                <div className="min-w-0 space-y-1.5">
                  <h2 className="break-words text-base font-extrabold leading-snug text-[#072a3f] sm:text-lg">
                    {item.title}
                  </h2>
                  {item.description && (
                    <p className="line-clamp-2 break-words text-xs leading-relaxed text-[#46657a] sm:text-[13px]">
                      {item.description}
                    </p>
                  )}
                </div>

                <LearningCardMetrics
                  columns={2}
                  items={[
                    {
                      label: 'Dernière tentative',
                      value: latestResult
                        ? latestResult.status === 'in_progress'
                          ? 'En cours'
                          : `${latestResult.score} / ${latestResult.max_score}`
                        : '—',
                      hint: latestResult
                        ? new Date(latestResult.started_at).toLocaleDateString()
                        : 'Pas encore commencé'
                    },
                    {
                      label: 'Meilleure note',
                      value: bestResult ? `${bestResult.score} / ${bestResult.max_score}` : '—',
                      hint:
                        bestPercent !== null
                          ? `${bestPercent} % · ${(bestScore20 ?? '0')}/20 · ${completed.length} terminée(s)`
                          : 'Aucun résultat terminé',
                      tone: bestResult ? 'success' : 'default'
                    }
                  ]}
                />

                <LearningCardFooter>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void begin(item.id)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-3.5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#0b3c5d] active:scale-[.99] sm:text-[13px]"
                    >
                      <Play size={15} className="fill-current" />
                      <span>Nouvelle tentative</span>
                    </button>
                    {item.active_attempt_id && (
                      <button
                        type="button"
                        onClick={() => void begin(item.id, item.active_attempt_id)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#2fa36b] px-3.5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#248556] sm:text-[13px]"
                      >
                        <RotateCcw size={15} />
                        <span>Reprendre</span>
                      </button>
                    )}
                    {bestResult && (
                      <button
                        type="button"
                        disabled={reviewLoading}
                        onClick={() => void openBestAttempt(item.id)}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2.5 text-xs font-extrabold text-[#0b3c5d] transition hover:bg-[#e6f0f7] disabled:opacity-45 sm:text-[13px] ${
                          item.active_attempt_id ? 'sm:col-span-2' : ''
                        }`}
                      >
                        <Eye size={15} />
                        <span>Meilleure copie</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryExerciseId(current => (current === item.id ? null : item.id));
                      setAttemptReview(null);
                    }}
                    aria-expanded={historyExerciseId === item.id}
                    className="inline-flex min-h-[40px] w-full items-center justify-between rounded-xl bg-[#f5f9fc] px-3.5 py-2 text-xs font-bold text-[#46657a] transition hover:bg-[#e6f0f7] hover:text-[#072a3f]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <History size={14} />
                      <span>{historyExerciseId === item.id ? 'Masquer l’historique' : 'Historique des tentatives'}</span>
                    </span>
                    <span className="font-extrabold tabular-nums text-[#0b3c5d]">
                      {exerciseResults.length}
                    </span>
                  </button>
                </LearningCardFooter>
              </LearningCard>
            );
          })}
        </div>
      )}
      {historyExerciseId && (() => {
        const selectedExercise = items.find(item => item.id === historyExerciseId);
        const exerciseResults = results.filter(result => result.exercise_id === historyExerciseId).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        const best = exerciseResults.filter(result => result.status === 'completed' && result.max_score > 0).sort((a, b) => (b.score / b.max_score) - (a.score / a.max_score) || b.score - a.score)[0];
        return (
          <section className="overflow-hidden rounded-[22px] border border-[#d8e6ee] bg-white shadow-[0_6px_20px_rgba(7,42,63,0.04)]" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eaf1f6] bg-[#f7fafc] p-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#2fa36b]">Progression personnelle</p>
                <h2 className="break-words font-extrabold text-[#072a3f]">Historique · {selectedExercise?.title || 'Exercice'}</h2>
              </div>
              <button type="button" onClick={() => setHistoryExerciseId(null)} className="min-h-9 rounded-lg border border-[#d8e6ee] bg-white px-3 text-xs font-bold text-[#46657a] hover:bg-[#e6f0f7]">Fermer</button>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              {best && <div className="flex flex-col gap-2 rounded-2xl border border-[#bfe3ce] bg-[#eef9f3] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-[#145c3d]"><Award size={14} /> Votre meilleure tentative</p>
                  <p className="mt-1 text-xs font-semibold tabular-nums text-[#24764e]">{best.score} / {best.max_score} · {Math.round(best.score / best.max_score * 100)} % · {(best.score / best.max_score * 20).toFixed(2).replace(/\.00$/, '')}/20</p>
                </div>
                <button type="button" disabled={reviewLoading} onClick={() => void openBestAttempt(historyExerciseId)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#2fa36b] px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-[#248556] disabled:opacity-50">
                  <Eye size={14} />{reviewLoading ? 'Chargement…' : 'Voir les réponses et corrections'}
                </button>
              </div>}
              {exerciseResults.length === 0 ? (
                <p className="rounded-xl bg-[#f7fafc] p-4 text-sm text-[#607f93]">Aucune tentative enregistrée pour cet exercice.</p>
              ) : (
                <div className="divide-y divide-[#eaf1f6] overflow-hidden rounded-xl border border-[#e5eff5]">
                  {exerciseResults.map((result, index) => (
                    <div key={result.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 bg-white px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#072a3f]">
                          Tentative {exerciseResults.length - index}{best?.id === result.id ? ' · Meilleure' : ''}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#607f93]">
                          <CalendarDays size={12} />
                          {new Date(result.started_at).toLocaleString()}
                          {result.completed_at ? ' · Terminée' : ''}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-sm font-extrabold tabular-nums text-[#072a3f]">
                          {result.status === 'in_progress' ? 'En cours' : `${result.score} / ${result.max_score}`}
                        </p>
                        {result.status === 'completed' && (
                          <p className="text-[11px] tabular-nums text-[#607f93]">
                            {result.max_score > 0 ? Math.round(result.score / result.max_score * 100) : 0} % · {result.max_score > 0 ? (result.score / result.max_score * 20).toFixed(2).replace(/\.00$/, '') : '0'}/20
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })()}
      {attemptReview && (
        <section className="overflow-hidden rounded-[22px] border border-[#bfe3ce] bg-white shadow-[0_12px_32px_rgba(7,42,63,.08)]" aria-live="polite">
          <div className="bg-[#072a3f] p-4 text-white sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#8ed3aa]"><Award size={13} /> Relecture de votre meilleure tentative</p>
                <h2 className="mt-1 text-xl font-black tabular-nums">{attemptReview.score} / {attemptReview.max_score}</h2>
                <p className="mt-1 text-xs text-white/75 tabular-nums">{attemptReview.max_score > 0 ? Math.round(attemptReview.score / attemptReview.max_score * 100) : 0} % · {attemptReview.questions.length} question(s)</p>
              </div>
              <button type="button" onClick={() => setAttemptReview(null)} className="min-h-9 rounded-lg bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20">Fermer</button>
            </div>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            {attemptReview.questions.map((question, index) => {
              const unanswered = !hasSubmittedAnswer(question.answer);
              return (
              <article key={question.question_id} className="overflow-hidden rounded-2xl border border-[#e0eaf0]">
                <div className="flex items-start justify-between gap-3 bg-[#f7fafc] p-3.5 sm:p-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#2fa36b]">Question {index + 1}</p>
                    <h3 className="mt-1 break-words text-sm font-bold leading-relaxed text-[#072a3f]">{question.question}</h3>
                  </div>
                  <StatusBadge tone={question.correct && !unanswered ? 'success' : 'danger'}>
                    {question.points_awarded} / {question.max_points} pt{unanswered ? ' · Non répondu' : question.correct ? ' · Correcte' : ' · Incorrecte'}
                  </StatusBadge>
                </div>
                <div className="space-y-2 p-3.5 sm:p-4">
                  <div className={'rounded-xl border p-3 ' + (question.correct && !unanswered ? 'border-[#bfe3ce] bg-[#eef9f3]' : 'border-rose-200 bg-rose-50')}>
                    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Votre réponse</p>
                    <p className={'break-words text-sm font-semibold ' + (question.correct && !unanswered ? 'text-[#145c3d]' : 'text-rose-800')}>{unanswered ? (question.timed_out ? 'Temps écoulé · aucune réponse' : 'Non répondu') : correctionText(question.answer)}</p>
                  </div>
                  {(!question.correct || unanswered) && <>
                    <div className="rounded-xl border border-[#bfe3ce] bg-[#eef9f3] p-3"><p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-[#145c3d]">Réponse attendue</p><p className="break-words text-sm font-bold text-[#145c3d]">{formatExerciseExpected(question)}</p></div>
                    {question.explanation && <div className="rounded-xl border border-[#d8e6ee] bg-[#f7fafc] p-3"><p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-[#46657a]">Explication</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#072a3f]">{correctionText(question.explanation)}</p></div>}
                  </>}
                </div>
              </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
