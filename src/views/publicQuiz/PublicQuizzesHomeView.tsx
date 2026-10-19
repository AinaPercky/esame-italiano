import React, { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen, Clock, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { Quiz } from '../../types';
import { getPublicQuizDescription } from './publicQuizConfig';

interface PublicQuizzesHomeViewProps {
  onOpenQuiz: (publicId: string) => void;
  onBackToApp: () => void;
}

type QuizMeta = {
  quiz: Quiz;
  level: string;
  theme: string;
  questionsCount: number;
};

function extractLevel(text: string): string {
  const t = (text || '').toUpperCase();
  const match = t.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  if (match?.[1]) return match[1];
  const match2 = t.match(/\bNIVEAU\s*[:\-]\s*(A1|A2|B1|B2|C1|C2)\b/);
  if (match2?.[1]) return match2[1];
  return 'Non renseigné';
}

function extractTheme(text: string): string {
  const t = (text || '').trim();
  const match = t.match(/(?:th[èe]me|theme)\s*[:\-]\s*([^\n\r,;]+)/i);
  if (match?.[1]) return match[1].trim();
  const tag = t.match(/#([a-zA-ZÀ-ÿ0-9_-]{3,30})/);
  if (tag?.[1]) return tag[1].trim();
  return 'Général';
}

function formatDuration(minutes: number): string {
  const m = Math.max(0, Number(minutes) || 0);
  if (m <= 1) return `${m} min`;
  return `${m} min`;
}

export const PublicQuizzesHomeView: React.FC<PublicQuizzesHomeViewProps> = ({
  onOpenQuiz,
  onBackToApp
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [query, setQuery] = useState<string>('');
  const [selectedTheme, setSelectedTheme] = useState<string>('Tous');
  const [selectedLevel, setSelectedLevel] = useState<string>('Tous');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Use local state — public quizzes are synced during initFromCloud()
        const local = dataService.getQuizzes().filter(q => Boolean(q.is_public));
        if (!active) return;
        setQuizzes(local);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Impossible de charger la liste des quiz publics.');
        setQuizzes([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const metas = useMemo<QuizMeta[]>(() => {
    return (quizzes || []).filter(q => Boolean(q.public_id) && Boolean(q.is_public)).map(q => {
      const cleanDescription = getPublicQuizDescription(q);
      const text = `${q.title || ''}\n${cleanDescription || ''}`;
      return {
        quiz: {
          ...q,
          description: cleanDescription
        },
        level: extractLevel(text),
        theme: extractTheme(text),
        questionsCount: (q.questions || []).length
      };
    });
  }, [quizzes]);

  const themes = useMemo<string[]>(() => {
    const set = new Set<string>();
    metas.forEach(m => set.add(m.theme));
    return ['Tous', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))];
  }, [metas]);

  const levels = useMemo<string[]>(() => {
    const set = new Set<string>();
    metas.forEach(m => set.add(m.level));
    return ['Tous', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))];
  }, [metas]);

  const filtered = useMemo<QuizMeta[]>(() => {
    const q = (query || '').trim().toLowerCase();
    return metas.filter(m => {
      if (selectedTheme !== 'Tous' && m.theme !== selectedTheme) return false;
      if (selectedLevel !== 'Tous' && m.level !== selectedLevel) return false;
      if (!q) return true;
      const hay = `${m.quiz.title || ''}\n${m.quiz.description || ''}\n${m.quiz.category || 'Autre'}`.toLowerCase();
      return hay.includes(q);
    });
  }, [metas, query, selectedTheme, selectedLevel]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[720px] px-4 py-8">
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-6 py-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-emerald-600/10 text-emerald-800 flex items-center justify-center">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="font-serif text-2xl leading-tight">Quiz publics d’italien</h1>
                <p className="text-slate-600 text-sm">Choisissez un quiz, puis commencez quand vous êtes prêt.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher un quiz…"
                  className="w-full h-12 rounded-2xl pl-10 pr-4 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600 text-[16px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={selectedTheme}
                  onChange={(e) => setSelectedTheme(e.target.value)}
                  className="w-full h-12 rounded-2xl px-4 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600 text-[16px]"
                >
                  {themes.map(t => (
                    <option key={t} value={t}>{t === 'Tous' ? 'Tous les thèmes' : t}</option>
                  ))}
                </select>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="w-full h-12 rounded-2xl px-4 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600 text-[16px]"
                >
                  {levels.map(l => (
                    <option key={l} value={l}>{l === 'Tous' ? 'Tous les niveaux' : l}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            {loading ? (
              <div className="text-slate-600">Chargement…</div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold">Impossible de charger les quiz</div>
                    <div className="text-sm opacity-90">{error}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => window.location.reload()}
                    className="h-12 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                  >
                    Réessayer
                  </button>
                  <button
                    onClick={onBackToApp}
                    className="h-12 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold"
                  >
                    Retour à l’application
                  </button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
                Aucun quiz ne correspond à votre recherche.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filtered.map(({ quiz, level, theme, questionsCount }) => (
                  <button
                    key={quiz.public_id}
                    onClick={() => onOpenQuiz(String(quiz.public_id))}
                    className="text-left rounded-3xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors p-5 focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 text-xs font-semibold">
                            {quiz.category || 'Autre'}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 text-emerald-800 px-3 py-1 text-xs font-semibold">
                            <Sparkles className="h-3.5 w-3.5" />
                            Public
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold">
                            {level}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold">
                            {theme}
                          </span>
                        </div>
                        <h2 className="mt-3 font-serif text-xl leading-snug break-words">{quiz.title}</h2>
                        {quiz.description && (
                          <p className="mt-2 text-slate-600 text-sm break-words">{quiz.description}</p>
                        )}
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            {formatDuration(quiz.duration_minutes)}
                          </span>
                          <span>•</span>
                          <span>{questionsCount} question{questionsCount > 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span>Barème : {quiz.total_points || 20} pts</span>
                        </div>
                      </div>
                      <div className="shrink-0 h-11 w-11 rounded-2xl bg-emerald-700 text-white flex items-center justify-center">
                        <ArrowRight className="h-5 w-5" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-5 border-t border-slate-100 bg-white">
            <button
              onClick={onBackToApp}
              className="h-12 w-full rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold"
            >
              Retour à l’application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
