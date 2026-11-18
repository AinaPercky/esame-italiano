import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  Clock3,
  FileText,
  Loader2,
  MessageSquareText,
  Printer,
  Search,
  UserRound
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { Exam, Student, Evaluation, ExamRubric } from '../types';
import { normalizeOralScoreTo20 } from '../utils/oralExamProgress';
import { StatusBadge } from '../components/LearningCard';

interface StudentPublicReportViewProps {
  examId?: string;
  studentId?: string;
  lockedStudentId?: string;
  onBackToApp?: () => void;
}

const formatDate = (value?: string) => {
  if (!value) return 'Date non renseignée';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

export const StudentPublicReportView: React.FC<StudentPublicReportViewProps> = ({
  examId: initialExamId,
  studentId: initialStudentId,
  lockedStudentId,
  onBackToApp
}) => {
  const isLockedReport = Boolean(lockedStudentId || initialStudentId);
  const [report, setReport] = useState<{ student: Student; exam: Exam; evaluation: Evaluation } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isLockedReport);

  const currentExam = report?.exam;
  const currentStudent = report?.student;
  const evaluation = report?.evaluation;
  const rubrics: ExamRubric[] = currentExam?.rubrics || [];
  const maxScore = Number(evaluation?.max_score) || rubrics.reduce((sum, rubric) => sum + Number(rubric.points || 0), 0) || 10;
  const rawScore = Number(evaluation?.total_score) || 0;
  const normalizedScore = normalizeOralScoreTo20(rawScore, maxScore);

  useEffect(() => {
    const targetStudentId = lockedStudentId || initialStudentId;
    if (!targetStudentId || (!initialExamId && !isLockedReport)) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setSearchError(null);
    const reportRequest = initialExamId
      ? supabaseService.getPublicOralReport(initialExamId, targetStudentId)
      : supabaseService.getPublicOralReport();

    reportRequest
      .then(result => {
        if (cancelled) return;
        setReport(result);
        if (!result) setSearchError('Cette session orale est indisponible.');
      })
      .catch(error => {
        if (!cancelled) {
          setReport(null);
          setSearchError(error instanceof Error ? error.message : 'Chargement de la session impossible.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialExamId, initialStudentId, lockedStudentId, isLockedReport]);

  const handleSearchStudent = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setSearchError(null);
    const query = searchQuery.trim();

    if (!query) {
      setSearchError('Veuillez saisir votre adresse e-mail.');
      return;
    }
    if (!initialExamId) {
      setSearchError('Le lien QR ne précise pas la session à consulter. Demandez un nouveau QR code à votre professeur.');
      return;
    }

    setIsLoading(true);
    setReport(null);
    try {
      const result = await supabaseService.getPublicOralReport(initialExamId, undefined, query);
      if (!result) {
        setSearchError('Aucun résultat correspondant à ces informations pour cette session.');
        return;
      }
      setReport(result);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Consultation de la session impossible.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-[#d8e6ee] bg-white p-6 text-sm font-semibold text-[#46657a]">
        <Loader2 className="h-5 w-5 animate-spin text-[#0b3c5d]" />
        Chargement de la session orale…
      </div>
    );
  }

  if (isLockedReport && !report) {
    return (
      <div className="mx-auto flex min-h-64 max-w-xl items-center gap-3 rounded-2xl border border-amber-200 bg-white p-6 text-sm text-[#46657a]">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
        <span>{searchError || 'Votre session orale est indisponible. Contactez votre professeur pour vérifier votre compte.'}</span>
      </div>
    );
  }

  if (!report || !currentStudent || !currentExam || !evaluation) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-5 rounded-2xl border border-[#d8e6ee] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e6f0f7] text-[#0b3c5d]">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#2fa36b]">PERCKYLINGUA · RÉSULTATS</p>
            <h1 className="font-display text-xl font-black text-[#072a3f]">Consulter une session orale</h1>
            <p className="mt-1 text-xs text-[#607f93]">Accédez au résultat de votre session.</p>
          </div>
        </div>

        <form onSubmit={handleSearchStudent} className="space-y-3">
          <label htmlFor="oral-session-email" className="block text-xs font-bold text-[#24485e]">Adresse e-mail de votre compte</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="oral-session-email"
              type="email"
              value={searchQuery}
              onChange={event => {
                setSearchQuery(event.target.value);
                if (searchError) setSearchError(null);
              }}
              placeholder="eleve@exemple.fr"
              autoComplete="email"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#cbdde8] bg-[#f7fafc] px-3.5 text-sm text-[#072a3f] outline-none transition focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/10"
            />
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-5 text-sm font-bold text-white transition hover:bg-[#0b3c5d]">
              Afficher <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {searchError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {searchError}
            </p>
          )}
        </form>
        {onBackToApp && (
          <button type="button" onClick={onBackToApp} className="text-xs font-semibold text-[#0b3c5d] underline underline-offset-2">
            Retour à l'espace enseignant
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 text-[#072a3f]">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8e6ee] bg-white p-3.5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#2fa36b]">PERCKYLINGUA · SUIVI ORAL</p>
          <p className="text-xs font-bold text-[#24485e]">Résultat individuel de la session</p>
        </div>
        <div className="flex items-center gap-2">
          {!isLockedReport && (
            <button type="button" onClick={() => { setReport(null); setSearchQuery(''); setSearchError(null); }} className="rounded-lg border border-[#d8e6ee] px-3 py-2 text-xs font-bold text-[#46657a] hover:bg-[#f2f7fa]">
              Changer d'élève
            </button>
          )}
          <button type="button" onClick={handlePrint} className="inline-flex items-center gap-1.5 rounded-lg bg-[#072a3f] px-3 py-2 text-xs font-bold text-white hover:bg-[#0b3c5d]">
            <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
          </button>
          {onBackToApp && (
            <button type="button" onClick={onBackToApp} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e6ee] px-3 py-2 text-xs font-bold text-[#46657a] hover:bg-[#f2f7fa]">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </button>
          )}
        </div>
      </div>

      <section className="space-y-5 rounded-2xl border border-[#d8e6ee] bg-white p-5 shadow-sm sm:p-8 print:border-0 print:shadow-none">
        <header className="flex flex-col gap-3 border-b border-[#d8e6ee] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#2fa36b]">{currentExam.class_name || 'Classe'} · Session orale</p>
            <h1 className="mt-1 font-display text-2xl font-black tracking-tight text-[#072a3f]">{currentExam.title}</h1>
            <p className="mt-1 text-sm text-[#607f93]">{formatDate(currentExam.exam_date)}</p>
          </div>
          <StatusBadge tone="success">Évaluation terminée</StatusBadge>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#d8e6ee] bg-[#f7fafc] p-4">
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-[#607f93]">
              <UserRound className="h-3.5 w-3.5" /> Étudiant
            </div>
            <p className="mt-1 text-lg font-extrabold text-[#072a3f]">{currentStudent.first_name} {currentStudent.last_name}</p>
            <p className="mt-1 text-xs text-[#607f93]">{currentStudent.student_number ? `Matricule : ${currentStudent.student_number}` : 'Matricule non renseigné'}</p>
          </div>
          <div className="rounded-xl border border-[#d8e6ee] bg-[#f7fafc] p-4">
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-[#607f93]">
              <Clock3 className="h-3.5 w-3.5" /> Temps de parole
            </div>
            <p className="mt-1 text-lg font-extrabold text-[#072a3f]">
              {evaluation.duration_used_seconds == null ? 'Non renseigné' : `${Math.floor(evaluation.duration_used_seconds / 60)}m ${evaluation.duration_used_seconds % 60}s`}
            </p>
            <p className="mt-1 text-xs text-[#607f93]">
              Durée prévue : {evaluation.max_duration_seconds ? `${Math.floor(evaluation.max_duration_seconds / 60)}m ${evaluation.max_duration_seconds % 60}s` : 'non renseignée'}
            </p>
          </div>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl bg-[#072a3f] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a9c9dc]">Note de cette session</p>
            <p className="mt-1 text-xs text-[#d0e0e9]">Résultat converti sur 20 pour faciliter le suivi entre les sessions.</p>
          </div>
          <p className="shrink-0 text-3xl font-black tabular-nums">{normalizedScore === null ? '—' : normalizedScore.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<span className="ml-1 text-base font-bold text-[#b7d0e0]">/ 20</span></p>
        </section>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5eff5] bg-[#f7fafc] p-3.5">
          <span className="text-xs font-semibold text-[#607f93]">Note sur le barème de la session</span>
          <span className="text-sm font-extrabold tabular-nums text-[#072a3f]">{rawScore} / {maxScore}</span>
        </div>

        <section>
          <div className="flex items-center gap-2 border-b border-[#d8e6ee] pb-3">
            <FileText className="h-4 w-4 text-[#0b3c5d]" />
            <h2 className="font-display text-base font-extrabold text-[#072a3f]">Détail de l'évaluation</h2>
          </div>
          {rubrics.length > 0 ? (
            <div className="divide-y divide-[#edf3f7]">
              {rubrics.map((rubric, index) => {
                const detail = evaluation.details?.find(item => item.rubric_id === rubric.id);
                return (
                  <article key={rubric.id} className="space-y-2 py-4">
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
                      <div className="flex items-start gap-2 rounded-xl bg-[#f7fafc] p-3 text-xs leading-relaxed text-[#46657a]">
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
      </section>
    </div>
  );
};
