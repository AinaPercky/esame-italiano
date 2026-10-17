import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Send,
  XCircle
} from 'lucide-react';
import { QuizQuestion } from '../../types';
import { QuizFeedbackEntry, formatQuizTime } from './publicQuizUtils';

interface PublicQuizQuestionScreenProps {
  question: QuizQuestion;
  quizTitle: string;
  questionIndex: number;
  totalQuestions: number;
  totalTimeLeftMs: number;
  totalTimeDurationMs: number;
  questionTimeDurationMs: number;
  answer: string;
  isValidated: boolean;
  canGoBack: boolean;
  progressPercent: number;
  timeLeft: number | null;
  timeTone: 'normal' | 'warning' | 'danger';
  feedback?: QuizFeedbackEntry;
  showCorrection: boolean;
  onAnswerChange: (value: string) => void;
  onValidate: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export const PublicQuizQuestionScreen: React.FC<PublicQuizQuestionScreenProps> = ({
  question,
  quizTitle,
  questionIndex,
  totalQuestions,
  totalTimeLeftMs,
  totalTimeDurationMs,
  questionTimeDurationMs,
  answer,
  isValidated,
  canGoBack,
  progressPercent,
  timeLeft,
  timeTone,
  feedback,
  showCorrection,
  onAnswerChange,
  onValidate,
  onNext,
  onPrevious
}) => {
  const [correctionCountdown, setCorrectionCountdown] = React.useState(8);
  const isLastQuestion = questionIndex === totalQuestions - 1;
  const totalTimeRatio = totalTimeDurationMs > 0 ? totalTimeLeftMs / totalTimeDurationMs : 1;
  const totalTimeRemainingPercent = Math.max(0, Math.min(100, totalTimeRatio * 100));
  const questionTimeRatio = questionTimeDurationMs > 0 ? Math.max(0, Math.min(1, (timeLeft ?? 0) / questionTimeDurationMs)) : 0;
  const questionTimePercent = questionTimeRatio * 100;
  const questionTimeBarTone = questionTimeRatio <= 0.25
    ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,.7)] motion-safe:animate-pulse'
    : questionTimeRatio <= 0.5
      ? 'bg-amber-400'
      : 'bg-[#2fa36b]';
  const totalTimeBarTone = totalTimeRatio <= 0.25
    ? 'bg-rose-600 animate-pulse'
    : totalTimeRatio <= 0.5
      ? 'bg-orange-500'
      : 'bg-[#2fa36b]';
  const timerClasses = {
    normal: 'border-slate-600 bg-slate-800 text-white',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-rose-300 bg-rose-50 text-rose-700'
  };

  const primaryLabel = !isValidated
    ? 'Valider'
    : isLastQuestion
      ? 'Terminer le quiz'
      : 'Question suivante';

  React.useEffect(() => {
    if (!showCorrection || !feedback) return;
    setCorrectionCountdown(8);
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const next = Math.max(0, 8 - Math.floor((Date.now() - startedAt) / 1000));
      setCorrectionCountdown(next);
      if (next === 0) {
        clearInterval(interval);
        onNext();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [question.id, showCorrection, feedback, onNext]);

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-2 border-b border-slate-800 bg-[#072a3f] px-2.5 pb-1.5 pt-1.5 text-white shadow-lg sm:-mx-6 sm:mb-4 sm:px-6 sm:pb-4 sm:pt-5">
        <div className="mx-auto w-full max-w-4xl space-y-1.5 sm:space-y-4">
          <div className="flex items-center justify-between gap-2 sm:items-start sm:gap-3">
            <div className="min-w-0">
              <span className="text-[7px] font-bold uppercase tracking-[.1em] text-emerald-300 sm:text-xs sm:tracking-[.18em]">Quiz public · Italien</span>
              <h1 className="mt-0.5 truncate font-display text-[13px] font-extrabold leading-tight sm:mt-1 sm:text-xl">{quizTitle}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <div className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 ${totalTimeRatio <= 0.25 ? 'border-rose-300 bg-rose-50 text-rose-800' : totalTimeRatio <= 0.5 ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
                <Clock3 className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="flex flex-col text-left">
                  <span className="text-[6px] font-bold uppercase leading-none sm:text-[9px]">Total</span>
                  <span className="font-mono text-[11px] font-extrabold sm:text-sm">{formatQuizTime(totalTimeLeftMs)}</span>
                </span>
              </div>
              <div className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-sm font-bold transition-colors sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 ${timerClasses[timeTone]} ${timeTone === 'danger' ? 'motion-safe:animate-pulse' : ''}`}>
                <Clock3 className={`h-3 w-3 sm:h-4 sm:w-4 ${timeTone === 'danger' ? 'motion-safe:animate-bounce' : ''}`} />
                <span className="flex flex-col text-left">
                  <span className="text-[6px] font-bold uppercase leading-none sm:text-[9px]">Question</span>
                  <span className={`font-mono text-[11px] sm:text-sm ${timeTone === 'danger' ? 'font-black' : ''}`}>{formatQuizTime(timeLeft)}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="hidden space-y-1 sm:block sm:space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-[9px] font-semibold text-slate-300 sm:text-[11px]">
              <span>Temps restant</span>
              <span className="font-mono font-bold text-white">{formatQuizTime(totalTimeLeftMs)}</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-slate-700 sm:h-2.5"
              role="progressbar"
              aria-label="Temps restant pour le quiz"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(totalTimeRemainingPercent)}
            >
              <div className={`h-full rounded-full transition-all duration-1000 ${totalTimeBarTone}`} style={{ width: `${totalTimeRemainingPercent}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-[9px] font-semibold text-slate-200 sm:text-xs">
            <span>Question {questionIndex + 1}/{totalQuestions} · <span className="text-emerald-300">Temps de réponse</span></span>
            <span>{timeLeft !== null ? formatQuizTime(timeLeft) : '—'} <span className="hidden sm:inline">· </span><span className="hidden sm:inline">{Math.round(progressPercent)} %</span></span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-700 sm:h-2.5" role="progressbar" aria-label="Temps restant pour répondre à la question" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(questionTimePercent)}>
            <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${questionTimeBarTone}`} style={{ width: `${questionTimePercent}%` }} />
          </div>
          <div className="hidden gap-1 overflow-x-auto sm:flex sm:gap-1.5" aria-label="Progression du quiz">
            {Array.from({ length: totalQuestions }, (_, index) => (
              <span key={index} className={`h-1 min-w-3 flex-1 rounded-full sm:h-1.5 sm:min-w-4 ${index < questionIndex ? 'bg-[#2fa36b]' : index === questionIndex ? 'bg-white' : 'bg-slate-600'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-4 shadow-xl sm:p-8">
        <div className="space-y-5 sm:space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0b3c5d] font-mono text-sm font-extrabold text-white shadow-sm sm:h-12 sm:w-12">
              {questionIndex + 1}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#0b3c5d] sm:text-[11px]">
                {question.type === 'qcm' ? 'Choix unique' : 'Réponse écrite'} · {question.points} point{question.points > 1 ? 's' : ''}
              </p>
              <h2 className="mt-1 font-display text-lg font-bold leading-snug text-slate-900 sm:text-2xl">{question.question}</h2>
            </div>
          </div>

          <p className="pl-0 text-xs italic text-slate-500 sm:pl-14">
            {question.type === 'qcm' ? 'Sélectionnez la bonne réponse parmi les choix proposés :' : 'Saisissez votre réponse dans le champ ci-dessous :'}
          </p>

          {question.type === 'qcm' ? (
            <div className="space-y-3">
              {(question.options || []).map((option, optionIndex) => {
                const selected = answer === option;
                return (
                  <button
                    key={`${question.id}-${optionIndex}`}
                    type="button"
                    onClick={() => !isValidated && onAnswerChange(option)}
                    disabled={isValidated}
                  className={`flex min-h-14 w-full items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left text-[16px] font-semibold transition-all ${
                    selected
                      ? 'border-[#0b3c5d] bg-[#0b3c5d] text-white shadow-md ring-2 ring-[#e6f0f7]'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-[#2fa36b] hover:bg-[#e6f0f7]/50'
                  } ${isValidated ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    selected ? 'bg-white text-[#0b3c5d]' : 'bg-[#e6f0f7] text-[#0b3c5d]'
                    }`}>
                      {optionIndex + 1}
                    </span>
                    <span className="min-w-0 flex-1">{option}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor={`answer-${question.id}`} className="text-sm font-semibold text-slate-700">
                Votre réponse
              </label>
              <input
                id={`answer-${question.id}`}
                type="text"
                value={answer}
                onChange={(e) => onAnswerChange(e.target.value)}
                disabled={isValidated}
                placeholder="Écrivez votre réponse ici…"
                className="h-14 w-full rounded-2xl border-2 border-slate-300 bg-slate-50 px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2fa36b]/40 focus:border-[#0b3c5d] disabled:cursor-default disabled:bg-slate-100"
              />
            </div>
          )}

        </div>
      </div>

      <div className="h-16 sm:h-24" />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 backdrop-blur sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:pt-3">
        <div className="mx-auto flex w-full max-w-4xl gap-3">
          {canGoBack && (
            <button
              type="button"
              onClick={onPrevious}
              className="inline-flex h-11 min-w-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:h-12"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Précédent</span>
            </button>
          )}

          <button
            type="button"
            onClick={isValidated ? onNext : onValidate}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-[#0b3c5d] active:scale-[.99] sm:h-14 sm:px-6 sm:text-base"
          >
            {!isValidated ? <CheckCircle2 className="h-5 w-5" /> : isLastQuestion ? <Send className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
            {primaryLabel}
          </button>
        </div>
      </div>

      {showCorrection && feedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-fade-in">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-quiz-correction-title"
            className={`flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border-2 bg-white shadow-2xl animate-scale-in ${feedback.correct ? 'border-emerald-300' : 'border-rose-300'}`}
          >
            <div className={`flex items-center justify-between gap-3 p-4 text-white sm:p-5 ${feedback.correct ? 'bg-gradient-to-r from-[#072a3f] to-[#0b3c5d]' : 'bg-gradient-to-r from-rose-700 to-rose-900'}`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                  {feedback.correct ? <CheckCircle2 className="h-6 w-6 text-emerald-200" /> : <XCircle className="h-6 w-6 text-rose-200" />}
                </div>
                <div className="min-w-0">
                  <span className={`block text-[10px] font-extrabold uppercase tracking-widest ${feedback.correct ? 'text-emerald-200' : 'text-rose-200'}`}>Correction pédagogique</span>
                  <h2 id="public-quiz-correction-title" className="truncate font-display text-base font-extrabold sm:text-lg">
                    {feedback.correct ? 'Bonne réponse !' : feedback.studentAnswer ? 'Réponse incorrecte' : 'Question non répondue'}
                  </h2>
                </div>
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/20 bg-black/20 px-3 py-1.5 font-mono text-sm font-black">
                <Clock3 className="h-4 w-4 text-amber-300" />
                <span aria-live="polite">{correctionCountdown}s</span>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden bg-slate-100">
              <div className="h-full bg-[#2fa36b] transition-[width] duration-300" style={{ width: `${(correctionCountdown / 8) * 100}%` }} />
            </div>

            <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="rounded-xl border border-slate-200 bg-[#e6f0f7]/50 p-3">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Question {questionIndex + 1}</span>
                <p className="text-sm font-semibold text-[#072a3f]">{question.question}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className={`rounded-xl border p-3 ${feedback.correct ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                  <span className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase ${feedback.correct ? 'text-emerald-800' : 'text-rose-700'}`}>
                    {feedback.correct ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    Votre réponse
                  </span>
                  <p className="break-words font-semibold text-slate-900">{feedback.studentAnswer || 'Aucune réponse saisie'}</p>
                  <span className="mt-1 block text-xs font-bold text-slate-600">{feedback.points} / {question.points} point{question.points === 1 ? '' : 's'}</span>
                </div>
                {!feedback.correct && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />Bonne réponse</span>
                    <p className="break-words font-bold text-emerald-950">{feedback.expected || '—'}</p>
                  </div>
                )}
              </div>

              {question.explanation && (
                <div className="space-y-1 rounded-2xl border border-[#d5e4ed] bg-[#e6f0f7]/60 p-4">
                  <p className="text-xs font-bold text-[#0b3c5d]">Explication</p>
                  <p className="text-sm leading-relaxed text-[#072a3f]">{question.explanation}</p>
                </div>
              )}
              <p className="text-center text-[11px] italic text-slate-500">Cette pause pédagogique n’est pas décomptée du temps du quiz.</p>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 p-4">
              <span className="text-xs text-slate-500">Passage automatique dans {correctionCountdown}s…</span>
              <button type="button" onClick={onNext} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#0b3c5d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2fa36b]">
                Continuer tout de suite
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
