import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { Quiz } from '../../types';
import { QuizFeedbackEntry } from './publicQuizUtils';

interface PublicQuizResultScreenProps {
  quiz: Quiz;
  score: number;
  maxScore: number;
  score20: number;
  feedback: Record<string, QuizFeedbackEntry>;
  onRetry: () => void;
  onBackToList: () => void;
}

function getEncouragementMessage(percentage: number): string {
  if (percentage >= 90) return 'Excellent travail, vous maîtrisez très bien ce quiz.';
  if (percentage >= 70) return 'Très bon résultat, continuez comme ça.';
  if (percentage >= 50) return 'Bon effort, quelques révisions feront la différence.';
  return 'Ne vous découragez pas, refaire le quiz vous aidera à progresser.';
}

export const PublicQuizResultScreen: React.FC<PublicQuizResultScreenProps> = ({
  quiz,
  score,
  maxScore,
  score20,
  feedback,
  onRetry,
  onBackToList
}) => {
  const [openQuestions, setOpenQuestions] = useState<Record<string, boolean>>({});
  const percentage = useMemo(() => {
    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }, [maxScore, score]);
  const circumference = 2 * Math.PI * 52;
  const progressOffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="rounded-[28px] bg-white shadow-xl shadow-slate-200/70 ring-1 ring-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-800 px-6 py-8 text-white sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
              <Trophy className="h-3.5 w-3.5" />
              Résultat
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold">Quiz terminé</h1>
            <p className="mt-2 text-sm sm:text-base text-emerald-50/90">{getEncouragementMessage(percentage)}</p>
          </div>

          <div className="mx-auto sm:mx-0">
            <div className="relative flex h-32 w-32 items-center justify-center">
              <svg className="-rotate-90" width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
                <circle cx="66" cy="66" r="52" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
                <circle
                  cx="66"
                  cy="66"
                  r="52"
                  fill="none"
                  stroke="#86efac"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={progressOffset}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute text-center">
                <div className="text-3xl font-bold">{percentage}%</div>
                <div className="text-xs uppercase tracking-wide text-emerald-50/80">Réussite</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 sm:px-8 sm:py-8 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Score</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{score} / {maxScore}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note sur 20</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{score20} / 20</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questions</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{(quiz.questions || []).length}</div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-2xl font-bold text-slate-900">Correction détaillée</h2>
          {(quiz.questions || []).map((question, index) => {
            const itemFeedback = feedback[question.id];
            if (!itemFeedback) return null;
            const isOpen = Boolean(openQuestions[question.id]);

            return (
              <div key={question.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenQuestions((prev) => ({ ...prev, [question.id]: !prev[question.id] }))}
                  className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5">
                      {itemFeedback.correct ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-rose-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-500">Question {index + 1}</p>
                      <p className="text-base font-semibold text-slate-900">{question.question}</p>
                    </div>
                  </div>
                  <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-700 animate-fade-in">
                    <p>
                      <span className="font-semibold">Votre réponse :</span>{' '}
                      {itemFeedback.studentAnswer || '(aucune réponse)'}
                    </p>
                    <p className="mt-2">
                      <span className="font-semibold">Bonne réponse :</span> {itemFeedback.expected}
                    </p>
                    <p className={`mt-2 font-semibold ${itemFeedback.correct ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {itemFeedback.correct ? 'Réponse juste' : 'Réponse fausse'} • {itemFeedback.points} / {question.points} pt
                    </p>
                    {question.explanation && (
                      <p className="mt-2">
                        <span className="font-semibold">Explication :</span> {question.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-800 px-5 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            <RotateCcw className="h-4 w-4" />
            Refaire le quiz
          </button>
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la liste des quiz
          </button>
        </div>
      </div>
    </div>
  );
};
