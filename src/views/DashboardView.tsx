import React, { useState } from 'react';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  GraduationCap, 
  TrendingUp, 
  BarChart3, 
  Layers,
  ArrowRight,
  Filter,
  Shuffle,
  Mic,
  School,
  Sparkles,
  BookOpen,
  Award,
  QrCode,
  UserCheck
} from 'lucide-react';
import { Exam, ClassRoom, Student } from '../types';
import { dataService } from '../services/dataService';
import heroImage from '../assets/images/hero_italian_oral_exam_1790527515781.jpg';

interface DashboardViewProps {
  exams: Exam[];
  classes: ClassRoom[];
  students?: Student[];
  onRefresh?: () => void;
  onNavigateToEvaluation: (examId?: string) => void;
  onNavigateToPassOrder: (examId?: string) => void;
  onNavigateToResults: () => void;
  onSelectTab?: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  exams, 
  classes, 
  students = [],
  onRefresh,
  onNavigateToEvaluation,
  onNavigateToPassOrder,
  onNavigateToResults,
  onSelectTab 
}) => {
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id || '');

  const stats = selectedExamId ? dataService.getStatistics(selectedExamId) : null;
  const currentExam = exams.find(e => e.id === selectedExamId);

  const pendingStudents = students.filter(s => s.validation_status === 'pending');

  const handleQuickApproveAll = async () => {
    if (pendingStudents.length === 0) return;
    try {
      const ids = pendingStudents.map(s => s.id);
      await dataService.bulkUpdateStudentValidationStatus(ids, 'approved');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la validation.');
    }
  };

  const navigate = (tab: string) => {
    if (onSelectTab) {
      onSelectTab(tab);
    }
  };

  return (
    <div className="teacher-dashboard mx-auto w-full max-w-6xl space-y-5 sm:space-y-7">
      {/* Alerte Inscriptions d'élèves en attente d'activation */}
      {pendingStudents.length > 0 && (
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm animate-fade-in sm:p-5 md:flex-row md:items-center">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <UserCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  {pendingStudents.length} inscription{pendingStudents.length > 1 ? 's' : ''} d'élève{pendingStudents.length > 1 ? 's' : ''} en attente d'activation
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-600 text-white animate-pulse">
                  Action requise
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {pendingStudents.map(s => `${s.first_name} ${s.last_name}`).slice(0, 3).join(', ')}
                {pendingStudents.length > 3 ? ` et ${pendingStudents.length - 3} autre(s)` : ''} — activez leurs accès pour leur permettre de participer aux cours et quiz.
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 self-start sm:flex-row md:w-auto md:self-center">
            <button
              type="button"
              onClick={handleQuickApproveAll}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#2fa36b] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800 sm:flex-none"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Activer tous ({pendingStudents.length})</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('students')}
              className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-[#072a3f] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] sm:flex-none"
            >
              <span>Examiner dans l'annuaire</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {/* Hero Banner with Editorial Style */}
      <div className="relative overflow-hidden rounded-[28px] border border-[#d8e6ee] bg-white shadow-[0_16px_40px_rgba(7,42,63,.07)]">
        <div className="grid grid-cols-1 md:grid-cols-12 items-center">
          <div className="p-5 sm:p-6 md:col-span-7 md:p-8">
            <span className="mb-3 inline-flex rounded-full border border-[#d1e1ec] bg-[#e6f0f7] px-3 py-1 text-xs font-semibold text-[#0b3c5d]">
              PerckyLingua • Imparare l’italiano insieme
            </span>
            <h1 className="mb-2 max-w-xl font-display text-2xl font-bold tracking-tight text-[#072a3f] sm:text-3xl md:text-[2.5rem] md:leading-[1.08]">
              Espace Professeur — Gestion et Évaluation
            </h1>
            <p className="mb-5 max-w-2xl text-sm leading-relaxed text-[#46657a] sm:mb-6">
              Organisez vos classes et élèves, créez et importez des quiz, gérez l'ordre de passage et évaluez vos examens oraux d'italien en temps réel.
            </p>
            <div className="flex flex-col flex-wrap items-stretch gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => onNavigateToPassOrder(selectedExamId)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cfe1ec] bg-[#e6f0f7] px-4 py-2.5 text-xs font-bold text-[#072a3f] shadow-sm transition-colors hover:bg-[#d7e8f3] sm:text-sm"
              >
                <Shuffle className="w-4 h-4 text-amber-900" />
                <span>1. Ordre de passage</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateToEvaluation(selectedExamId)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] sm:text-sm"
              >
                <Mic className="h-4 w-4 text-emerald-300" />
                <span>2. Évaluer les élèves</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onNavigateToResults}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d8e6ee] bg-white px-4 py-2.5 text-xs font-semibold text-[#315267] transition-colors hover:bg-[#f3f8fb] sm:text-sm"
              >
                <span>3. Résultats</span>
              </button>
            </div>
          </div>
          <div className="relative h-44 overflow-hidden border-t border-[#d8e6ee] bg-[#e6f0f7] md:col-span-5 md:h-full md:border-l md:border-t-0 sm:h-56">
            <img 
              src={heroImage}
              alt="Classe d'examen oral d'italien" 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/20 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Regrouped Teacher Space Modules (Classes/Students, Quizzes, Oral Exams) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Modules de l'Espace Professeur</h2>
            <p className="text-xs text-slate-500">Accédez rapidement à tous les outils regroupés par catégorie</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Module 1: Classes & Étudiants */}
          <div className="flex flex-col justify-between rounded-[22px] border border-[#d8e6ee] bg-white p-5 shadow-[0_8px_24px_rgba(7,42,63,.045)] transition-all hover:-translate-y-0.5 hover:border-[#b7d3e4]">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e6f0f7] font-bold text-[#0b3c5d]">
                <School className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">1. Classes & Étudiants</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Création et gestion des classes, inscription et suivi des élèves, listes nominatives.
                </p>
              </div>
              <div className="space-y-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => navigate('classes')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <School className="w-3.5 h-3.5 text-blue-600" /> Gestion des Classes
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('students')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-blue-600" /> Gestion des Élèves
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>{classes.length} classe(s) active(s)</span>
              <button 
                type="button"
                onClick={() => navigate('classes')}
                className="text-blue-600 hover:underline font-semibold"
              >
                Gérer &rarr;
              </button>
            </div>
          </div>

          {/* Module 2: Quiz & QCM */}
          <div className="flex flex-col justify-between rounded-[22px] border border-[#d8e6ee] bg-white p-5 shadow-[0_8px_24px_rgba(7,42,63,.045)] transition-all hover:-translate-y-0.5 hover:border-[#b7d3e4]">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e6f0f7] font-bold text-[#0b3c5d]">
                <Sparkles className="h-5 w-5 text-[#0b3c5d]" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">2. Quiz & QCM</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Quiz en direct, temps imparti chronométré, import/export complet au format JSON et notation automatique.
                </p>
              </div>
              <div className="space-y-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => navigate('quizzes')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50/50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" /> Quiz en Direct & Notes
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Import JSON disponible</span>
              <button 
                type="button"
                onClick={() => navigate('quizzes')}
                className="text-amber-800 hover:underline font-semibold"
              >
                Ouvrir &rarr;
              </button>
            </div>
          </div>

          {/* Module 3: Examens Oraux */}
          <div className="flex flex-col justify-between rounded-[22px] border border-[#d8e6ee] bg-white p-5 shadow-[0_8px_24px_rgba(7,42,63,.045)] transition-all hover:-translate-y-0.5 hover:border-[#b7d3e4]">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 font-bold text-emerald-700">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">3. Examens Oraux</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Configuration des rubriques, ordre de passage, évaluation orale en direct, fiches de résultats et codes QR.
                </p>
              </div>
              <div className="space-y-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => navigate('exams')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> Examens & Rubriques
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('pass-order')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Shuffle className="w-3.5 h-3.5 text-emerald-600" /> Ordre de Passage
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('evaluation')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Mic className="w-3.5 h-3.5 text-emerald-600" /> Évaluation Orale
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('results')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Award className="w-3.5 h-3.5 text-emerald-600" /> Résultats & Fiches
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('qrcode')}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md flex items-center justify-between group transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" /> Codes QR Élèves
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>{exams.length} examen(s) configuré(s)</span>
              <button 
                type="button"
                onClick={() => navigate('exams')}
                className="text-emerald-700 hover:underline font-semibold"
              >
                Gérer &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white rounded-lg border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
          <Filter className="w-4 h-4 text-slate-500" />
          <span>Sélectionner l'examen à analyser :</span>
        </div>
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="w-full sm:w-80 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
        >
          {exams.map(e => (
            <option key={e.id} value={e.id}>
              {e.title} ({e.class_name || 'Classe'})
            </option>
          ))}
        </select>
      </div>

      {stats ? (
        <>
          {/* Key Indicators Cards (Section 8.1) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Total Élèves</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {stats.indicators.total_students}
              </div>
              <span className="text-xs text-slate-500">Inscrits en classe</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between text-emerald-700 mb-1">
                <span className="text-xs font-medium">Évalués</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-800">
                {stats.indicators.evaluated_students}
              </div>
              <span className="text-xs text-slate-500">Notes enregistrées</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between text-amber-700 mb-1">
                <span className="text-xs font-medium">En attente</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-800">
                {stats.indicators.unevaluated_students}
              </div>
              <span className="text-xs text-slate-500">Reste à passer</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Moyenne Classe</span>
                <GraduationCap className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {stats.indicators.class_average}
                <span className="text-sm font-normal text-slate-400">/{stats.max_score}</span>
              </div>
              <span className="text-xs text-slate-500">Calculée sur évalués</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Min / Max</span>
                <TrendingUp className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {stats.indicators.min_score} <span className="text-slate-400 font-normal">/</span> {stats.indicators.max_score}
              </div>
              <span className="text-xs text-slate-500">Écart de notes</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Taux Réussite</span>
                <BarChart3 className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {stats.indicators.success_rate}%
              </div>
              <span className="text-xs text-slate-500">Note &ge; 50%</span>
            </div>
          </div>

          {/* Interactive Visual Charts Grid (Section 8.2) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Graphique 1: Distribution des notes par tranche */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-800" />
                  Distribution des notes par tranche
                </h3>
                <span className="text-xs text-slate-500">Effectif d'élèves</span>
              </div>
              
              <div className="space-y-3 pt-2">
                {stats.charts.distribution.map((bucket, i) => {
                  const maxCount = Math.max(...stats.charts.distribution.map(b => b.count), 1);
                  const pct = Math.round((bucket.count / maxCount) * 100);
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-slate-700">
                        <span>{bucket.label}</span>
                        <span className="font-mono">{bucket.count} élève(s)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div 
                          className="bg-amber-700 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${bucket.count > 0 ? Math.max(pct, 8) : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Graphique 2: Fréquence des notes (0 à 10) */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-800" />
                  Répartition par note exacte (0 à 10)
                </h3>
                <span className="text-xs text-slate-500">Histogramme</span>
              </div>

              <div className="overflow-x-auto pb-1">
                <div className="flex items-end justify-between gap-1 sm:gap-1.5 h-44 min-w-[260px] pt-6 pb-2 border-b border-slate-200">
                  {stats.charts.score_frequency.map((sf) => {
                  const maxFreq = Math.max(...stats.charts.score_frequency.map(s => s.count), 1);
                  const heightPct = sf.count > 0 ? (sf.count / maxFreq) * 100 : 0;
                  return (
                    <div key={sf.score} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {sf.count > 0 && (
                        <span className="text-[10px] font-mono font-semibold text-slate-700 mb-1">
                          {sf.count}
                        </span>
                      )}
                      <div 
                        className={`w-full rounded-t-sm transition-all duration-300 ${
                          sf.count > 0 ? 'bg-amber-800 group-hover:bg-amber-700' : 'bg-slate-100'
                        }`}
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                      <span className="text-[11px] font-mono text-slate-500 mt-2">
                        {sf.score}
                      </span>
                    </div>
                  );
                })}
                </div>
              </div>
              <div className="text-center text-xs text-slate-500 mt-2">Note obtenue (/10)</div>
            </div>
          </div>

          {/* Graphique 3: Performance par rubrique en italien */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  Performance par rubrique en italien (% de validation)
                </h3>
                <p className="text-xs text-slate-500">
                  Identifie les compétences linguistiques acquises et les axes de révision prioritaires.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500 self-start sm:self-auto">
                Taux de réussite
              </span>
            </div>

            <div className="space-y-3">
              {stats.charts.rubric_performance.map((rubric) => (
                <div key={rubric.rubric_id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {rubric.position}. {rubric.title} 
                      <span className="text-slate-400 font-normal italic ml-2">({rubric.question})</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-700">
                      {rubric.success_rate}% ({rubric.validated_count} élève(s))
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        rubric.success_rate >= 80 
                          ? 'bg-emerald-600' 
                          : rubric.success_rate >= 50 
                            ? 'bg-amber-600' 
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.max(rubric.success_rate, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Graphique 4: Comparaison des examens de la classe */}
          {stats.charts.class_exams_comparison.length > 1 && (
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
              <h3 className="font-semibold text-slate-900 text-sm mb-3">
                Comparaison des examens de la même classe
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {stats.charts.class_exams_comparison.map((ex) => (
                  <div key={ex.exam_id} className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/50">
                    <div className="text-xs text-slate-500 mb-0.5">{ex.date}</div>
                    <div className="font-semibold text-slate-900 text-sm mb-2">{ex.title}</div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-600">Moyenne :</span>
                      <span className="text-lg font-bold font-mono text-amber-800">{ex.average_score} / 10</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-12 text-center bg-white rounded-lg border border-slate-200">
          <p className="text-slate-500">Aucune donnée disponible pour cet examen.</p>
        </div>
      )}
    </div>
  );
};
