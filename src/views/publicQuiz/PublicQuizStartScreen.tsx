import React from 'react';
import { BookOpen, Clock3, ListChecks, Medal, PlayCircle, UserRound } from 'lucide-react';
import { Quiz } from '../../types';
import { formatQuizDuration, getQuizTotalTimeSeconds } from '../../utils/quizTiming';

interface PublicQuizStartScreenProps {
  quiz: Quiz;
  description: string;
  studentName: string;
  onStudentNameChange: (value: string) => void;
  onStart: () => void;
  onBackToList: () => void;
}

export const PublicQuizStartScreen: React.FC<PublicQuizStartScreenProps> = ({
  quiz,
  description,
  studentName,
  onStudentNameChange,
  onStart,
  onBackToList
}) => {
  const questionsCount = (quiz.questions || []).length;
  const canStart = studentName.trim().length > 0;

  return (
    <div className="rounded-[28px] bg-white shadow-xl shadow-slate-200/70 ring-1 ring-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-br from-[#072a3f] via-[#0b3c5d] to-[#072a3f] px-6 py-8 text-white sm:px-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
          <BookOpen className="h-3.5 w-3.5" />
          Quiz public
        </div>
        <h1 className="mt-4 font-display text-3xl sm:text-4xl font-bold leading-tight">{quiz.title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm text-sky-50/90 sm:text-base">{description}</p>
        )}
      </div>

      <div className="px-6 py-6 sm:px-8 sm:py-8 space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <Clock3 className="h-4 w-4" />
              Durée
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900">{formatQuizDuration(getQuizTotalTimeSeconds(quiz))}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <Medal className="h-4 w-4" />
              Barème
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900">{quiz.total_points || 20} pts</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <ListChecks className="h-4 w-4" />
              Questions
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900">{questionsCount}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <UserRound className="h-4 w-4" />
              Réponses
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900">1 par écran</div>
          </div>
        </div>

          <div className="rounded-2xl bg-[#e6f0f7]/45 p-5 ring-1 ring-[#d5e4ed] space-y-3">
          <label htmlFor="public-quiz-student-name" className="block text-sm font-semibold text-slate-800">
            Nom de l’étudiant
          </label>
          <input
            id="public-quiz-student-name"
            type="text"
            value={studentName}
            onChange={(e) => onStudentNameChange(e.target.value)}
            placeholder="Ex. Giulia Rossi"
            className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-[16px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700"
          />
          <p className="text-sm text-slate-500">
            Ce nom reste sur votre appareil pour reprendre le quiz si la page est rechargée.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBackToList}
            className="h-12 rounded-2xl bg-[#e6f0f7] px-5 text-sm font-semibold text-[#072a3f] hover:bg-[#d5e4ed]"
          >
            Retour à la liste des quiz
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#072a3f] px-6 text-base font-semibold text-white shadow-lg shadow-[#072a3f]/20 transition hover:bg-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlayCircle className="h-5 w-5" />
            Commencer
          </button>
        </div>
      </div>
    </div>
  );
};
