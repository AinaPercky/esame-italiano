import React, { useState, useEffect } from 'react';
import { 
  Award, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  User, 
  BookOpen, 
  Printer, 
  ShieldCheck,
  Sparkles,
  School,
  FileCheck2,
  ExternalLink,
  Search,
  ArrowRight,
  RotateCcw,
  Smartphone,
  Check,
  AlertCircle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Exam, Student, Evaluation, ClassRoom, ExamRubric } from '../types';

interface StudentPublicReportViewProps {
  examId?: string;
  studentId?: string;
  lockedStudentId?: string;
  onBackToApp?: () => void;
}

export const StudentPublicReportView: React.FC<StudentPublicReportViewProps> = ({
  examId: initialExamId,
  studentId: initialStudentId,
  lockedStudentId,
  onBackToApp
}) => {
  const allExams = dataService.getExams();
  const studentExams = lockedStudentId
    ? allExams.filter(exam => dataService.getEvaluations(exam.id, undefined, lockedStudentId).length > 0)
    : allExams;
  const allStudents = dataService.getStudents();
  const allClasses = dataService.getClasses();

  // Examen actif
  const [selectedExamId, setSelectedExamId] = useState<string>(() => {
    if (initialExamId && studentExams.some(e => e.id === initialExamId)) {
      return initialExamId;
    }
    return studentExams[0]?.id || '';
  });

  // Élève sélectionné pour consultation
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    if (initialStudentId && allStudents.some(s => s.id === initialStudentId)) {
      return initialStudentId;
    }
    return '';
  });

  // Champ de recherche par adresse e-mail uniquement
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchError, setSearchError] = useState<string | null>(null);

  const currentExam = dataService.getExamById(selectedExamId) || studentExams[0];
  const examClassStudents = currentExam 
    ? allStudents.filter(s => s.class_id === currentExam.class_id)
    : allStudents;

  const effectiveStudentId = lockedStudentId || selectedStudentId;
  const currentStudent = effectiveStudentId ? dataService.getStudentById(effectiveStudentId) : null;
  const evals = currentExam && currentStudent 
    ? dataService.getEvaluations(currentExam.id, undefined, currentStudent.id) 
    : [];
  const evaluation: Evaluation | undefined = evals[0];

  const rubrics: ExamRubric[] = currentExam?.rubrics || [];
  const maxScore = rubrics.reduce((sum, r) => sum + (Number(r.points) || 1), 0) || 10;
  const currentScore = evaluation ? evaluation.total_score : 0;
  const percentage = maxScore > 0 ? Math.round((currentScore / maxScore) * 100) : 0;

  // Recherche de l'élève par adresse e-mail uniquement
  const handleSearchStudent = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchError(null);

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchError('Veuillez saisir votre adresse e-mail.');
      return;
    }

    const found = examClassStudents.find(s => s.email.toLowerCase() === query);

    if (found) {
      setSelectedStudentId(found.id);
      setSearchError(null);
    } else {
      setSearchError(`Aucun élève trouvé avec l’adresse e-mail "${searchQuery}".`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Titre d'appréciation en italien
  const getAppreciation = (score: number, max: number) => {
    const ratio = max > 0 ? score / max : 0;
    if (ratio >= 0.9) return { label: 'Eccellente (90-100%)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (ratio >= 0.8) return { label: 'Ottimo (80-89%)', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
    if (ratio >= 0.7) return { label: 'Molto Bene (70-79%)', color: 'text-blue-700 bg-blue-50 border-blue-200' };
    if (ratio >= 0.6) return { label: 'Bene / Discreto (60-69%)', color: 'text-amber-800 bg-amber-50 border-amber-200' };
    if (ratio >= 0.5) return { label: 'Sufficiente (50-59%)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { label: 'In via di acquisizione (< 50%)', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  };

  const appreciation = getAppreciation(currentScore, maxScore);

  if (lockedStudentId && !currentStudent) {
    return (
      <div className="bg-white p-5 rounded-xl border border-amber-200 text-sm text-slate-700">
        Votre fiche d'examen oral est indisponible. Contactez votre professeur pour vérifier votre compte.
      </div>
    );
  }

  if (lockedStudentId && (!currentExam || !evaluation)) {
    return null;
  }

  // Vue 1 : L'élève a scanné le Code QR commun et doit saisir son adresse e-mail
  if (!currentStudent || (!lockedStudentId && !selectedStudentId)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto w-full pt-6 sm:pt-12 space-y-6">
          
          {/* Header Banner */}
          <div className="text-center space-y-2">
            <img
              src="/percky-lingua-logo.png"
              alt="PerckyLingua"
              className="w-20 h-20 mx-auto rounded-2xl object-contain bg-white shadow-lg"
            />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-wider">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Portail Élève • Consultation Examen Oral</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              PerckyLingua • Esame orale di italiano
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              {currentExam ? `${currentExam.title} (${currentExam.class_name || 'Classe'})` : 'Épreuve orale'}
            </p>
          </div>

          {/* Saisie de l'adresse e-mail */}
          <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-amber-700" />
                <span>Identification de l'élève</span>
              </div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Entrez votre adresse e-mail
              </h2>
              <p className="text-xs text-slate-500">
                Saisissez l'adresse e-mail associée à votre compte pour afficher les détails de votre examen oral.
              </p>
            </div>

            <form onSubmit={handleSearchStudent} className="space-y-3">
              <div className="relative">
                <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (searchError) setSearchError(null);
                  }}
                  placeholder="eleve@exemple.fr"
                  autoFocus
                  className="w-full pl-11 pr-28 py-3.5 bg-slate-50 border-2 border-slate-300 focus:border-amber-700 rounded-xl text-base font-bold text-slate-900 placeholder:text-slate-400 focus:outline-hidden transition-all shadow-inner"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Afficher</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {searchError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{searchError}</span>
                </div>
              )}
            </form>

          </div>

          {onBackToApp && (
            <div className="text-center">
              <button
                onClick={onBackToApp}
                className="text-xs text-slate-400 hover:text-white transition-colors underline cursor-pointer"
              >
                Retour à l'application enseignant
              </button>
            </div>
          )}
        </div>

        <div className="text-center text-[11px] text-slate-500 pt-8 pb-4">
          PerckyLingua • Portail officiel de consultation
        </div>
      </div>
    );
  }

  // Vue 2 : Fiche officielle complète en lecture seule
  return (
    <div className="min-h-screen bg-slate-100 py-6 sm:py-10 px-3 sm:px-6 lg:px-8 text-slate-900">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Top Control Bar (No Print) */}
        <div className="flex items-center justify-between no-print bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-800">
              {lockedStudentId ? 'Votre fiche d’examen oral en lecture seule' : 'Fiche officielle en lecture seule (Consultation Code QR)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!lockedStudentId && (
              <button
                onClick={() => setSelectedStudentId('')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Consulter l’examen par adresse e-mail"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Changer d'élève</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer / PDF</span>
            </button>
            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer"
              >
                <span>Accès Enseignant</span>
              </button>
            )}
          </div>
        </div>

        {/* Official Printable Exam Sheet */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-10 space-y-6 print:shadow-none print:border-0 print:p-0">
          
          {/* Official Banner Header */}
          <div className="border-b-2 border-amber-800 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-900">
                  <span className="inline-block w-3 h-3 rounded-xs bg-emerald-600" />
                  <span className="inline-block w-3 h-3 rounded-xs bg-white border border-slate-300" />
                  <span className="inline-block w-3 h-3 rounded-xs bg-rose-600" />
                  <span>Repubblica Italiana • Lingua e Cultura Italiana</span>
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Scheda di Valutazione Orale
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  {currentExam ? currentExam.title : 'Épreuve Orale'} • {currentExam?.class_name || 'Classe d\'Italien'}
                </p>
              </div>

              {/* Status Stamp */}
              <div className="flex flex-col items-start sm:items-end">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300/80 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Document Certifié</span>
                </span>
                <span className="text-[11px] text-slate-400 mt-1 font-mono">
                  Épreuve du {currentExam?.exam_date || '2026-09-27'}
                </span>
              </div>
            </div>
          </div>

          {/* Student & Animal Presentation Highlight Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Candidate Identity */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>Candidat(e)</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {currentStudent.first_name} {currentStudent.last_name}
              </h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {currentStudent.student_number ? `Matricule : ${currentStudent.student_number}` : 'Matricule non renseigné'}
              </p>
            </div>

            {/* Animal Presented - Custom per student */}
            <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200/90">
              <div className="text-[10px] uppercase font-bold text-amber-800 mb-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>Animal présenté</span>
              </div>
              <h3 className="text-lg font-bold text-amber-950 truncate">
                {evaluation?.presented_animal || 'Animal choisi par l\'élève'}
              </h3>
              <p className="text-xs text-amber-800/80 font-medium mt-0.5">
                Sujet de description orale en italien
              </p>
            </div>

            {/* Speaking Time / Timing */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Temps de parole</span>
              </div>
              <div className="text-lg font-bold text-slate-900 font-mono">
                {evaluation?.duration_used_seconds 
                  ? `${Math.floor(evaluation.duration_used_seconds / 60)}m ${evaluation.duration_used_seconds % 60}s`
                  : '3m 00s (Réglementaire)'}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Sur 3 minutes allouées
              </p>
            </div>
          </div>

          {/* Final Score Showcase Box */}
          <div className="bg-gradient-to-r from-amber-900 to-amber-950 text-white rounded-2xl p-6 shadow-inner flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-xs uppercase font-bold tracking-wider text-amber-300">
                Résultat Global de l'Épreuve Orale
              </div>
              <div className="text-sm text-slate-300">
                Grille officielle sur les 10 compétences de communication
              </div>
              <div className="pt-2">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${appreciation.color}`}>
                  {appreciation.label}
                </span>
              </div>
            </div>

            <div className="flex items-baseline gap-2 bg-black/30 px-6 py-4 rounded-xl border border-white/10 shrink-0">
              <span className="font-display text-4xl sm:text-5xl font-extrabold text-amber-300 font-mono">
                {currentScore}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-slate-400 font-mono">
                / {maxScore}
              </span>
              <span className="text-xs font-semibold text-amber-200 ml-1 font-mono">
                ({percentage}%)
              </span>
            </div>
          </div>

          {/* Detailed Rubric Breakdown */}
          <div className="space-y-3">
            <h3 className="font-display font-bold text-slate-900 text-base flex items-center gap-2 border-b border-slate-200 pb-2">
              <FileCheck2 className="w-4 h-4 text-amber-800" />
              <span>Détail des 10 critères d'évaluation & Remarques</span>
            </h3>

            {rubrics.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {rubrics.map((r, idx) => {
                  const detail = evaluation?.details?.find(d => d.rubric_id === r.id);
                  const isValidated = detail ? detail.is_validated : false;
                  const errorNote = detail?.error_note;

                  return (
                    <div key={r.id} className="p-3.5 hover:bg-slate-50/60 transition-colors space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 font-mono mt-0.5">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-xs sm:text-sm font-bold text-slate-900">
                              {r.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {r.question}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {isValidated ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Validé (+{r.points} pt)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span>0 pt</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Example phrase context */}
                      {r.example_sentence && (
                        <p className="text-[11px] text-slate-500 italic pl-8.5">
                          « {r.example_sentence} »
                        </p>
                      )}

                      {/* Teacher Error / Advice Note */}
                      {errorNote && errorNote.trim().length > 0 && (
                        <div className="ml-8.5 mt-1 p-2 bg-rose-50/80 border border-rose-200/80 rounded-lg text-xs text-rose-900">
                          <span className="font-semibold text-rose-950">Remarque de l'examinateur : </span>
                          <span>{errorNote}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl text-center text-slate-500 text-xs">
                Aucun critère d'évaluation enregistré pour cette épreuve.
              </div>
            )}
          </div>

          {/* Teacher Signature & Official Seal Stamp */}
          <div className="pt-6 border-t-2 border-dashed border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="space-y-1 text-center sm:text-left">
              <p className="font-bold text-slate-800">Examinateur Agréé :</p>
              <p className="font-mono text-slate-600">Prof. Ainapercky (ainapercky@gmail.com)</p>
              <p className="text-[11px] text-slate-400">Épreuve validée et archivée électroniquement</p>
            </div>

            <div className="p-3 border-2 border-slate-300 border-dashed rounded-xl text-center font-mono text-[10px] text-slate-400 max-w-[200px]">
              <span className="block font-bold text-slate-700 uppercase">Sceau d'Examen</span>
              <span>MINISTERO DELL'ISTRUZIONE</span>
            </div>
          </div>

        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-slate-400 no-print pb-8">
          PerckyLingua • Portail d’évaluation de la langue italienne
        </p>
      </div>
    </div>
  );
};
