import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MessageSquareText,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import type { StudentOralExamSession } from '../types';
import { supabaseService } from '../services/supabaseService';
import {
  calculateOralClassAverage,
  normalizeOralScoreTo20
} from '../utils/oralExamProgress';
import {
  LearningCard,
  LearningCardHeader,
  LearningModuleHeader,
  StatusBadge
} from '../components/LearningCard';

const formatDate = (value?: string) => {
  if (!value) return 'Date non renseignée';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

const formatScore = (score: number | null) =>
  score === null ? '—' : score.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const StudentOralExamsView: React.FC = () => {
  const [sessions, setSessions] = useState<StudentOralExamSession[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await supabaseService.getStudentOralExamSessions();
      setSessions(result);
      setSelectedSessionId(null);
      setSelectedClassId(current => (
        current && result.some(item => item.class.id === current)
          ? current
          : result[0]?.class.id || ''
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Chargement des sessions orales impossible.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const classes = useMemo(() => {
    const seen = new Set<string>();
    return sessions.reduce((result, session) => {
      if (!seen.has(session.class.id)) {
        seen.add(session.class.id);
        result.push(session.class);
      }
      return result;
    }, [] as Array<{ id: string; name: string }>);
  }, [sessions]);

  const classSessions = useMemo(
    () => sessions.filter(session => session.class.id === selectedClassId),
    [sessions, selectedClassId]
  );

  const selectedSession = useMemo(
    () => classSessions.find(session => session.evaluation.id === selectedSessionId) || null,
    [classSessions, selectedSessionId]
  );

  const average = useMemo(() => calculateOralClassAverage(
    classSessions.map(session => ({
      classId: session.class.id,
      score: Number(session.evaluation.total_score),
      maxScore: Number(session.evaluation.max_score)
    })),
    selectedClassId
  ), [classSessions, selectedClassId]);

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-[#d8e6ee] bg-white text-sm font-semibold text-[#46657a]">
        <Loader2 className="h-5 w-5 animate-spin text-[#0b3c5d]" />
        Chargement de vos sessions orales…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-6">
        <div className="flex items-start gap-3 text-rose-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-bold">Impossible de charger vos examens oraux</h2>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
            <button type="button" onClick={() => void loadSessions()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0b3c5d]">
              <RefreshCw className="h-4 w-4" /> Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="space-y-5">
        <LearningModuleHeader
          kicker="SUIVI DE PROGRESSION"
          title="Mes examens oraux"
          description="Retrouvez vos différentes sessions et suivez votre progression orale."
        />
        <div className="rounded-2xl border border-dashed border-[#c8dce8] bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f0f7] text-[#0b3c5d]">
            <Award className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-display text-lg font-extrabold text-[#072a3f]">Aucune session terminée</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#607f93]">
            Vos résultats apparaîtront ici après la validation de votre première évaluation orale par votre professeur.
          </p>
          <button type="button" onClick={() => void loadSessions()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#d8e6ee] bg-[#f7fafc] px-4 py-2 text-xs font-bold text-[#0b3c5d] hover:bg-[#e6f0f7]">
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
        </div>
      </div>
    );
  }

  if (selectedSession) {
    const rubrics = selectedSession.exam.rubrics || [];
    const maxScore = Number(selectedSession.evaluation.max_score) || rubrics.reduce((sum, rubric) => sum + Number(rubric.points || 0), 0);
    const normalizedScore = normalizeOralScoreTo20(Number(selectedSession.evaluation.total_score), maxScore);

    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setSelectedSessionId(null)} className="inline-flex items-center gap-2 rounded-xl border border-[#d8e6ee] bg-white px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition-colors hover:bg-[#f2f7fa]">
          <ArrowLeft className="h-4 w-4" /> Retour aux sessions
        </button>

        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#2fa36b]">{selectedSession.class.name} · Session orale</p>
          <h1 className="font-display text-2xl font-black tracking-tight text-[#072a3f]">{selectedSession.exam.title}</h1>
          <p className="text-sm text-[#607f93]">{formatDate(selectedSession.exam.exam_date)}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#607f93]">Note de la session</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#072a3f]">{formatScore(normalizedScore)}<span className="ml-1 text-sm font-bold text-[#607f93]">/ 20</span></p>
            <p className="mt-1 text-xs text-[#607f93]">Note normalisée</p>
          </div>
          <div className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#607f93]">Barème initial</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#072a3f]">{selectedSession.evaluation.total_score}<span className="ml-1 text-sm font-bold text-[#607f93]">/ {maxScore || '—'}</span></p>
            <p className="mt-1 text-xs text-[#607f93]">Résultat enregistré</p>
          </div>
          <div className="rounded-2xl border border-[#d8e6ee] bg-white p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#607f93]">Temps de parole</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#072a3f]">
              {selectedSession.evaluation.duration_used_seconds == null
                ? '—'
                : `${Math.floor(selectedSession.evaluation.duration_used_seconds / 60)}m ${selectedSession.evaluation.duration_used_seconds % 60}s`}
            </p>
            <p className="mt-1 text-xs text-[#607f93]">
              Prévu : {selectedSession.evaluation.max_duration_seconds
                ? `${Math.floor(selectedSession.evaluation.max_duration_seconds / 60)}m ${selectedSession.evaluation.max_duration_seconds % 60}s`
                : 'non renseigné'}
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-[#d8e6ee] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-[#e5eff5] pb-3">
            <FileText className="h-4 w-4 text-[#0b3c5d]" />
            <h2 className="font-display text-base font-extrabold text-[#072a3f]">Détail de l'évaluation</h2>
          </div>
          {rubrics.length > 0 ? (
            <div className="mt-3 divide-y divide-[#edf3f7]">
              {rubrics.map((rubric, index) => {
                const detail = selectedSession.evaluation.details?.find(item => item.rubric_id === rubric.id);
                return (
                  <article key={rubric.id} className="py-4 first:pt-1 last:pb-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#6b8799]">Critère {index + 1}</p>
                        <h3 className="mt-0.5 font-bold text-[#072a3f]">{rubric.title}</h3>
                        {rubric.question && <p className="mt-1 text-sm leading-relaxed text-[#46657a]">{rubric.question}</p>}
                      </div>
                      <StatusBadge tone={detail?.is_validated ? 'success' : 'neutral'}>
                        {detail?.awarded_points ?? 0} / {rubric.points} pts
                      </StatusBadge>
                    </div>
                    {detail?.error_note && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#f7fafc] p-3 text-xs leading-relaxed text-[#46657a]">
                        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-[#0b3c5d]" />
                        <span>{detail.error_note}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-[#607f93]">Aucun critère détaillé n'est disponible pour cette session.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <LearningModuleHeader
        kicker="SUIVI DE PROGRESSION"
        title="Mes examens oraux"
        description="Chaque session constitue une note indépendante. Votre moyenne est calculée séparément pour chaque classe."
        action={
          <button type="button" onClick={() => void loadSessions()} className="inline-flex items-center gap-2 rounded-xl border border-[#d8e6ee] bg-white px-3 py-2 text-xs font-bold text-[#0b3c5d] hover:bg-[#f2f7fa]">
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
        }
      />

      {classes.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Choisir une classe">
          {classes.map(classroom => (
            <button key={classroom.id} type="button" onClick={() => { setSelectedClassId(classroom.id); setSelectedSessionId(null); }} className={`rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${selectedClassId === classroom.id ? 'border-[#0b3c5d] bg-[#0b3c5d] text-white' : 'border-[#d8e6ee] bg-white text-[#46657a] hover:bg-[#f2f7fa]'}`}>
              {classroom.name}
            </button>
          ))}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#0b3c5d] bg-[#072a3f] p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9fc7df]">Moyenne de la classe · {classes.find(item => item.id === selectedClassId)?.name}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-black tabular-nums text-white">{formatScore(average.average)}</span>
              <span className="text-base font-bold text-[#b7d0e0]">/ 20</span>
            </div>
            <p className="mt-1 text-xs text-[#c3d8e5]">Moyenne des sessions terminées, avec un poids égal pour chacune</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-56">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#9fc7df]">Sessions</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{average.sessionCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#9fc7df]">Classe</p>
              <p className="mt-1 truncate text-sm font-extrabold">{classes.find(item => item.id === selectedClassId)?.name || '—'}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#072a3f]">Historique des sessions</h2>
          <p className="text-xs text-[#607f93]">Sélectionnez une session pour consulter son évaluation détaillée.</p>
        </div>
        <StatusBadge tone="info"><TrendingUp className="h-3 w-3" /> {classSessions.length} résultat(s)</StatusBadge>
      </div>

      {classSessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#c8dce8] bg-white p-8 text-center text-sm text-[#607f93]">
          Aucune session terminée pour cette classe.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {classSessions.map((session, index) => {
            const maxScore = Number(session.evaluation.max_score) || (session.exam.rubrics || []).reduce((sum, rubric) => sum + Number(rubric.points || 0), 0);
            const normalizedScore = normalizeOralScoreTo20(Number(session.evaluation.total_score), maxScore);
            return (
              <LearningCard key={session.evaluation.id} asButton onClick={() => setSelectedSessionId(session.evaluation.id)} ariaLabel={`Consulter la session ${session.exam.title}`} className="min-h-48">
                <div className="flex h-full flex-col gap-3">
                  <LearningCardHeader
                    kicker={`Session ${classSessions.length - index}`}
                    icon={<Award className="h-4 w-4" />}
                    status={<StatusBadge tone="success"><CheckCircle2 className="h-3 w-3" /> Terminée</StatusBadge>}
                  />
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 font-display text-base font-extrabold text-[#072a3f]">{session.exam.title}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[#607f93]">
                      <CalendarDays className="h-3.5 w-3.5" /> {formatDate(session.exam.exam_date)}
                    </p>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-[#eaf1f6] pt-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#607f93]">Note sur 20</p>
                      <p className="text-2xl font-black tabular-nums text-[#0b3c5d]">{formatScore(normalizedScore)}<span className="ml-1 text-xs font-bold text-[#607f93]">/ 20</span></p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0b3c5d]">Détails <ArrowRight className="h-3.5 w-3.5" /></span>
                  </div>
                </div>
              </LearningCard>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-[#718b9b]">
        <Clock3 className="h-3.5 w-3.5" />
        Seules les sessions dont l'évaluation est terminée sont prises en compte.
      </div>
    </div>
  );
};
