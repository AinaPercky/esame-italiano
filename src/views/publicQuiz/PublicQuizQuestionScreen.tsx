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
    normal: 'border-slate-200 bg-white text-slate-700',
    warning: 'border-amber-300 bg-amber-50 text-amber-800',
    danger: 'border-rose-300 bg-rose-50 text-rose-700'
  };

  const primaryLabel = !isValidated
    ? 'Valider'
    : isLastQuestion
      ? 'Terminer le quiz'
      : 'Question suivante';

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200/70 bg-[#f4f7f7]/95 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-700">
                Question {questionIndex + 1} sur {totalQuestions}
              </p>
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${timerClasses[timeTone]}`}>
                <Clock3 className="h-4 w-4" />
                <span className="font-mono">{formatQuizTime(timeLeft)}</span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-emerald-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-slate-200/70 ring-1 ring-slate-200 sm:p-8">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-900">
              {question.type === 'qcm' ? <Check className="h-5 w-5" /> : <TextCursorInput className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {question.type === 'qcm' ? 'Choix unique' : 'Réponse écrite'}
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold leading-snug text-slate-900">
                {question.question}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {question.points} point{question.points > 1 ? 's' : ''}
              </p>
            </div>
          </div>

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
                    className={`flex min-h-12 w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left text-[16px] transition-all ${
                      selected
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-950 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-slate-50'
                    } ${isValidated ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                      selected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'
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
                className="h-14 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 text-[16px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700 disabled:cursor-default disabled:bg-slate-100"
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
        <div className="mx-auto flex w-full max-w-[720px] gap-3">
          {canGoBack && (
            <button
              type="button"
              onClick={onPrevious}
              className="inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Précédent</span>
            </button>
          )}

          <button
            type="button"
            onClick={isValidated ? onNext : onValidate}
            className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-800 px-6 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-900"
          >
            {!isValidated ? <CheckCircle2 className="h-5 w-5" /> : isLastQuestion ? <Send className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
            {primaryLabel}
          </button>
        </div>
      </div>
    </>
  );
};
