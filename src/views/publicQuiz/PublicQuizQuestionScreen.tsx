import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Send,
  TextCursorInput,
  XCircle
} from 'lucide-react';
import { QuizQuestion } from '../../types';
import { QuizFeedbackEntry, formatQuizTime } from './publicQuizUtils';

interface PublicQuizQuestionScreenProps {
  question: QuizQuestion;
  quizTitle: string;
  questionIndex: number;
  totalQuestions: number;
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
  const isLastQuestion = questionIndex === totalQuestions - 1;
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

  return (
    <>
      <div className="-mx-4 -mt-4 mb-4 border-b border-slate-800 bg-[#072a3f] px-4 pb-4 pt-4 text-white shadow-lg sm:-mx-6 sm:px-6 sm:pt-5">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-300 sm:text-xs">Quiz public · Italien</span>
              <h1 className="mt-1 truncate font-display text-base font-extrabold sm:text-xl">{quizTitle}</h1>
            </div>
            <div className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${timerClasses[timeTone]}`}>
              <Clock3 className="h-4 w-4" />
              <span className="font-mono">{formatQuizTime(timeLeft)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
            <span>Question {questionIndex + 1} sur {totalQuestions}</span>
            <span>{Math.round(progressPercent)} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-[#2fa36b] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto" aria-label="Progression du quiz">
            {Array.from({ length: totalQuestions }, (_, index) => (
              <span key={index} className={`h-1.5 min-w-4 flex-1 rounded-full ${index < questionIndex ? 'bg-[#2fa36b]' : index === questionIndex ? 'bg-white' : 'bg-slate-600'}`} />
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

          {showCorrection && feedback && (
            <div className={`rounded-2xl border p-4 text-sm animate-fade-in ${
              feedback.correct
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : 'border-rose-200 bg-rose-50 text-rose-950'
            }`}>
              <div className="flex items-start gap-3">
                {feedback.correct ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                )}
                <div className="min-w-0 space-y-2">
                  <p className="font-semibold">
                    {feedback.correct ? 'Bonne réponse.' : 'Réponse incorrecte.'}
                  </p>
                  {!feedback.correct && (
                    <p>
                      <span className="font-semibold">Bonne réponse :</span> {feedback.expected}
                    </p>
                  )}
                  {question.explanation && (
                    <p>
                      <span className="font-semibold">Explication :</span> {question.explanation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-28 sm:h-24" />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl gap-3">
          {canGoBack && (
            <button
              type="button"
              onClick={onPrevious}
              className="inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Précédent</span>
            </button>
          )}

          <button
            type="button"
            onClick={isValidated ? onNext : onValidate}
            className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-6 text-base font-extrabold text-white shadow-md transition hover:bg-[#0b3c5d] active:scale-[.99]"
          >
            {!isValidated ? <CheckCircle2 className="h-5 w-5" /> : isLastQuestion ? <Send className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
            {primaryLabel}
          </button>
        </div>
      </div>
    </>
  );
};
