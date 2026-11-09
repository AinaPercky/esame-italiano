import React, { useState } from 'react';
import {
  Award,
  Search,
  Download,
  Printer,
  Eye,
  Edit3,
  Check,
  X,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Calendar,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  QrCode,
  Sparkles
} from 'lucide-react';
import { Evaluation, ClassRoom, Exam, Student } from '../types';
import { dataService } from '../services/dataService';
import { exportResultsToCSV, exportResultsToPDF, exportSingleStudentSheetPDF } from '../utils/exportUtils';
import { StudentQRCodeModal } from '../components/StudentQRCodeModal';
import { ClassQRCodesModal } from '../components/ClassQRCodesModal';

interface ResultsViewProps {
  evaluations: Evaluation[];
  classes: ClassRoom[];
  exams: Exam[];
  students: Student[];
  initialStudentSheetId?: string | null;
  onEditEvaluation: (examId: string, studentId: string) => void;
  onCloseStudentSheetModal?: () => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  evaluations,
  classes,
  exams,
  students,
  initialStudentSheetId,
  onEditEvaluation,
  onCloseStudentSheetModal
}) => {
  // Search & Filters (Section 7.1)
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [scoreRangeFilter, setScoreRangeFilter] = useState(''); // 'all', 'high' (8-10), 'mid' (5-7), 'low' (0-4)

  // Sorting (Section 7.2)
  const [sortField, setSortField] = useState<'name' | 'score' | 'date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fiche Individuelle Modal (Section 7.3)
  const [activeStudentId, setActiveStudentId] = useState<string | null>(initialStudentSheetId || null);

  // Modales Codes QR
  const [isClassQRModalOpen, setIsClassQRModalOpen] = useState<boolean>(false);
  const [qrModalStudent, setQrModalStudent] = useState<{ student: Student; exam: Exam; evaluation?: Evaluation } | null>(null);

  const toggleSort = (field: 'name' | 'score' | 'date') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'score' ? 'desc' : 'asc');
    }
  };

  // Filter evaluations
  const filtered = evaluations.filter(ev => {
    const student = students.find(s => s.id === ev.student_id);
    const fullName = `${student?.first_name || ''} ${student?.last_name || ''}`.toLowerCase();

    if (searchTerm && !fullName.includes(searchTerm.toLowerCase())) return false;
    if (classFilter && ev.class_id !== classFilter) return false;
    if (examFilter && ev.exam_id !== examFilter) return false;

    if (scoreRangeFilter === 'high' && ev.total_score < 8) return false;
    if (scoreRangeFilter === 'mid' && (ev.total_score < 5 || ev.total_score >= 8)) return false;
    if (scoreRangeFilter === 'low' && ev.total_score >= 5) return false;

    return true;
  });

  // Sort evaluations
  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'name') {
      const nameA = a.student_name || '';
      const nameB = b.student_name || '';
      comparison = nameA.localeCompare(nameB);
    } else if (sortField === 'score') {
      comparison = a.total_score - b.total_score;
    } else if (sortField === 'date') {
      comparison = (a.exam_date || '').localeCompare(b.exam_date || '');
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Notification de succès pour l'export
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Export CSV optimisé (Section 9 & hors ligne)
  const handleExportCSV = () => {
    if (sorted.length === 0) return;
    const selectedClass = classes.find(c => c.id === classFilter);
    const selectedExam = exams.find(e => e.id === examFilter);
    exportResultsToCSV(sorted, students, {
      className: selectedClass?.name,
      examTitle: selectedExam?.title
    });
    showToast(`✓ Fichier CSV téléchargé (${sorted.length} note(s) exportée(s) pour Excel / tableur)`);
  };

  // Export PDF officiel complet (hors ligne A4 paysage)
  const handleExportPDF = () => {
    if (sorted.length === 0) return;
    const selectedClass = classes.find(c => c.id === classFilter);
    const selectedExam = exams.find(e => e.id === examFilter);
    exportResultsToPDF(sorted, students, {
      className: selectedClass?.name,
      examTitle: selectedExam?.title
    });
    showToast(`✓ Relevé de notes PDF généré et téléchargé (${sorted.length} élève(s))`);
  };

  // Détails de l'élève actif pour la fiche individuelle
  const selectedStudentData = activeStudentId ? dataService.getStudentById(activeStudentId) : null;
  const selectedStudentExamEval = selectedStudentData?.evaluations[0] || null;
  const currentExamObj = selectedStudentExamEval ? dataService.getExamById(selectedStudentExamEval.exam_id) : null;

  // Export PDF de la fiche individuelle
  const handleExportSingleStudentPDF = () => {
    if (!selectedStudentData || !selectedStudentExamEval) return;
    exportSingleStudentSheetPDF(selectedStudentData, selectedStudentExamEval, currentExamObj);
    showToast(`✓ Fiche individuelle PDF de ${selectedStudentData.first_name} ${selectedStudentData.last_name} téléchargée`);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto min-w-0 w-full">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Consultation des Résultats & Fiches Individuelles
          </h2>
          <p className="text-sm text-slate-500">
            {evaluations.length} évaluation(s) enregistrée(s). Consultez le détail par élève ou exportez les résultats hors ligne.
          </p>
        </div>

        {/* Boutons d'exportation CSV, PDF et Codes QR */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* Bouton Codes QR de la Classe */}
          <button
            type="button"
            onClick={() => setIsClassQRModalOpen(true)}
            disabled={students.length === 0}
            title="Générer et imprimer les badges Codes QR pour toute la classe"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-slate-100 border border-slate-300 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-all min-h-[44px] cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-slate-800 shrink-0" />
            <span className="flex items-center gap-1.5">
              <span>Codes QR Classe</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-900 font-mono font-bold">
                {students.length}
              </span>
            </span>
          </button>

          {/* Bouton Exporter CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={sorted.length === 0}
            title="Télécharger les notes au format CSV (compatible Excel, LibreOffice et Pronote pour consultation hors ligne)"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-all min-h-[44px] cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="flex items-center gap-1.5">
              <span>Exporter CSV</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-800 font-mono font-bold">
                {sorted.length}
              </span>
            </span>
          </button>

          {/* Bouton Exporter PDF */}
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={sorted.length === 0}
            title="Générer un relevé officiel complet au format PDF avec statistiques pour archivage ou consultation hors ligne"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-950 active:bg-slate-950 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-all min-h-[44px] cursor-pointer"
          >
            <FileText className="w-4 h-4 text-amber-200 shrink-0" />
            <span className="flex items-center gap-1.5">
              <span>Télécharger PDF</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/80 text-amber-100 font-mono font-bold">
                {sorted.length}
              </span>
            </span>
          </button>

          {/* Bouton Impression directe */}
          <button
            type="button"
            onClick={() => window.print()}
            title="Imprimer directement ou ouvrir l'aperçu d'impression"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors min-h-[44px] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Imprimer</span>
          </button>
        </div>
      </div>

      {/* Toast de confirmation de téléchargement */}
      {toastMessage && (
        <div className="flex items-center justify-between gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs shadow-xs no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-sm font-bold px-1.5 py-0.5 rounded cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Filter Bar (Section 7.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-sm min-w-0 no-print">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par élève..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-800"
          />
        </div>

        {/* Classe */}
        <div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
          >
            <option value="">Toutes les classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Examen */}
        <div>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
          >
            <option value="">Tous les examens</option>
            {exams.map(e => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </div>

        {/* Tranche de notes */}
        <div>
          <select
            value={scoreRangeFilter}
            onChange={(e) => setScoreRangeFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
          >
            <option value="">Toutes les notes</option>
            <option value="high">Très bon : 8 à 10 points</option>
            <option value="mid">Moyen : 5 à 7 points</option>
            <option value="low">À renforcer : 0 à 4 points</option>
          </select>
        </div>
      </div>

      {/* Main Results: Desktop Table + Mobile Cards */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-w-0">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto touch-scroll">
          <table className="w-full min-w-[900px] text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-600 select-none">
                <th
                  onClick={() => toggleSort('name')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Élève</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4">Classe & Examen</th>
                <th
                  onClick={() => toggleSort('score')}
                  className="py-3 px-4 text-center cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Note</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Note Max</th>
                <th className="py-3 px-4 text-center">Pourcentage</th>
                <th className="py-3 px-4 text-center">Temps de parole</th>
                <th
                  onClick={() => toggleSort('date')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right no-print">Fiche</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length > 0 ? (
                sorted.map((ev) => {
                  const usedSecs = ev.duration_used_seconds || 0;
                  const m = Math.floor(usedSecs / 60);
                  const s = usedSecs % 60;
                  const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                  return (
                    <tr
                      key={ev.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setActiveStudentId(ev.student_id)}
                    >
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900 block">
                          {ev.student_name}
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          {ev.student_number || 'Sans matricule'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-medium text-slate-800">
                          {ev.exam_title}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ev.class_name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-base">
                        <span className={
                          ev.total_score >= 8
                            ? 'text-emerald-700'
                            : ev.total_score >= 5
                              ? 'text-slate-800'
                              : 'text-slate-700'
                        }>
                          {ev.total_score}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
                        /{ev.max_score || 10}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block font-mono text-xs font-semibold px-2 py-0.5 rounded ${
                          (ev.percentage || 0) >= 80
                            ? 'bg-emerald-50 text-emerald-800'
                            : (ev.percentage || 0) >= 50
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-slate-100 text-slate-800'
                        }`}>
                          {ev.percentage} %
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-xs">
                        <div className="text-slate-800 font-semibold">{timeStr} <span className="text-slate-400 font-normal">/ 03:00</span></div>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-sans ${
                          ev.timer_status === 'completed'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {ev.timer_status === 'completed' ? '3 min atteintes' : 'Arrêté manuellement'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {ev.exam_date || '—'}
                      </td>
                      <td className="py-3 px-4 text-right no-print" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const st = students.find(s => s.id === ev.student_id);
                              const ex = exams.find(e => e.id === ev.exam_id);
                              if (st && ex) {
                                setQrModalStudent({ student: st, exam: ex, evaluation: ev });
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-100 border border-slate-200 rounded transition-colors cursor-pointer"
                            title="Afficher le Code QR personnel de cet élève"
                          >
                            <QrCode className="w-3.5 h-3.5 text-slate-800" />
                            <span className="hidden xl:inline">Code QR</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveStudentId(ev.student_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Détail</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                    Aucun résultat ne correspond aux filtres appliqués.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (< md) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {sorted.length > 0 ? (
            sorted.map((ev) => {
              const usedSecs = ev.duration_used_seconds || 0;
              const m = Math.floor(usedSecs / 60);
              const s = usedSecs % 60;
              const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

              return (
                <div
                  key={ev.id}
                  className="p-4 space-y-2.5 active:bg-slate-50 transition-colors"
                  onClick={() => setActiveStudentId(ev.student_id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 text-base">
                        {ev.student_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ev.class_name} · {ev.student_number || 'Sans matricule'}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1 font-mono font-bold text-xl text-slate-900">
                        <span>{ev.total_score}</span>
                        <span className="text-slate-400 text-xs font-normal">/{ev.max_score || 10}</span>
                      </div>
                      <span className={`inline-block font-mono text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                        (ev.percentage || 0) >= 80
                          ? 'bg-emerald-50 text-emerald-800'
                          : (ev.percentage || 0) >= 50
                            ? 'bg-slate-100 text-slate-800'
                            : 'bg-slate-100 text-slate-800'
                      }`}>
                        {ev.percentage} %
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span>⏱️ {timeStr}</span>
                      <span className="text-slate-400 font-normal">/ 03:00</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-sans">
                      {ev.exam_date}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveStudentId(ev.student_id);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-100 active:bg-slate-200 rounded-lg min-h-[44px] transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Consulter la fiche individuelle</span>
                  </button>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              Aucun résultat ne correspond aux filtres appliqués.
            </div>
          )}
        </div>
      </div>

      {/* Modal Fiche Individuelle de l'Élève (Section 7.3) */}
      {activeStudentId && selectedStudentData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            {/* Header Fiche */}
            <div className="flex flex-col xs:flex-row xs:items-start justify-between pb-3 sm:pb-4 border-b border-slate-200 mb-3 sm:mb-4 gap-2">
              <div>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                  Fiche Individuelle d'Évaluation
                </span>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                  {selectedStudentData.first_name} {selectedStudentData.last_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Classe : {selectedStudentData.class_name} · Identifiant : {selectedStudentData.student_number || 'N/A'}
                </p>
              </div>

              <div className="text-left xs:text-right bg-slate-50 xs:bg-transparent p-2.5 xs:p-0 rounded-lg border xs:border-0 border-slate-100">
                <span className="text-xs text-slate-400 block">Note finale</span>
                <div className="font-mono text-2xl sm:text-3xl font-bold text-slate-900">
                  {selectedStudentExamEval ? `${selectedStudentExamEval.total_score} / ${selectedStudentExamEval.max_score || 10}` : 'Non noté'}
                </div>
                {selectedStudentExamEval && (
                  <span className="text-xs font-medium text-slate-600 font-mono">
                    {selectedStudentExamEval.percentage} % de réussite
                  </span>
                )}
              </div>
            </div>

            {/* Exam info */}
            {selectedStudentExamEval && currentExamObj ? (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-400 block">Épreuve</span>
                    <span className="font-semibold text-slate-800">{selectedStudentExamEval.exam_title}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Rubriques validées</span>
                    <span className="font-mono font-semibold text-emerald-800">
                      {selectedStudentExamEval.validated_rubrics_count} / {selectedStudentExamEval.total_rubrics_count}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Temps de parole</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {Math.floor((selectedStudentExamEval.duration_used_seconds || 0) / 60)}m {((selectedStudentExamEval.duration_used_seconds || 0) % 60).toString().padStart(2, '0' )}s / durée prévue
                    </span>
                  </div>
                </div>

                {/* Encadré détaillé du Temps de Parole (Section 5.3) */}
                <div className="p-3 bg-slate-100/50 border border-slate-200/70 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-950 flex items-center gap-1.5">
                      <span>⏱️ Analyse du Temps de Parole (3 minutes / 180s)</span>
                    </span>
                    <span className="font-mono font-medium text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      Statut : {selectedStudentExamEval.timer_status === 'completed' ? 'Terminé (3 min écoulées)' : 'Arrêté manuellement'}
                    </span>
                  </div>
                  <div className="text-slate-600 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div>Durée maximale autorisée : <strong className="font-mono">{selectedStudentExamEval.max_duration_seconds || 180}s (3 min)</strong></div>
                    <div>Durée réellement utilisée : <strong className="font-mono">{selectedStudentExamEval.duration_used_seconds || 0}s</strong></div>
                    <div className="text-slate-500 italic">* Note et durée strictement indépendantes</div>
                  </div>
                </div>

                {/* Rubrics breakdown table (Section 7.3) */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
                    Détail des 10 rubriques de l'épreuve :
                  </h4>

                  <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                        <tr>
                          <th className="p-2.5 w-10 text-center">#</th>
                          <th className="p-2.5">Rubrique en italien</th>
                          <th className="p-2.5 text-center">Validée</th>
                          <th className="p-2.5 text-right">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentExamObj.rubrics?.map((r) => {
                          const detail = selectedStudentExamEval.details.find(d => d.rubric_id === r.id);
                          const isValidated = detail ? detail.is_validated : false;
                          const pts = isValidated ? (Number(r.points) || 1) : 0;

                          return (
                            <tr key={r.id} className={isValidated ? 'bg-emerald-50/20' : 'bg-slate-50/30'}>
                              <td className="p-2.5 text-center font-mono text-slate-400 font-semibold">
                                {r.position}
                              </td>
                              <td className="p-2.5">
                                <div className="font-semibold text-slate-900">{r.title}</div>
                                <div className="text-[11px] text-slate-500 italic">{r.question}</div>
                                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                                  Phrase attendue : {r.example_sentence}
                                </div>
                                {detail?.error_note && (
                                  <div className="mt-1.5 p-1.5 bg-slate-100 border border-slate-200 rounded text-[11px] text-slate-800 flex items-start gap-1 font-sans">
                                    <span className="font-bold shrink-0">⚠️ Erreur saisie :</span>
                                    <span className="italic">{detail.error_note}</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                {isValidated ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                    <Check className="w-4 h-4 stroke-[3]" />
                                    <span>Oui</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-600 font-semibold">
                                    <X className="w-4 h-4 stroke-[2]" />
                                    <span>Non</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-mono font-semibold">
                                <span className={isValidated ? 'text-emerald-800' : 'text-slate-400'}>
                                  {pts} pt
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Historique complet de l'élève */}
                {selectedStudentData.evaluations.length > 1 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
                      Historique des autres épreuves :
                    </h4>
                    <div className="space-y-1">
                      {selectedStudentData.evaluations.slice(1).map(other => (
                        <div key={other.id} className="p-2 bg-slate-50 rounded border border-slate-200 text-xs flex justify-between">
                          <span>{other.exam_title} ({other.exam_date})</span>
                          <strong className="font-mono text-slate-900">{other.total_score} / 10</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">
                Aucune évaluation enregistrée pour le moment pour cet élève.
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-between pt-4 sm:pt-5 border-t border-slate-200 mt-4 sm:mt-5 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setActiveStudentId(null);
                  if (onCloseStudentSheetModal) onCloseStudentSheetModal();
                }}
                className="w-full xs:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
              >
                Fermer
              </button>

              <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2">
                {selectedStudentExamEval && currentExamObj && (
                  <button
                    type="button"
                    onClick={() => {
                      setQrModalStudent({
                        student: selectedStudentData,
                        exam: currentExamObj,
                        evaluation: selectedStudentExamEval
                      });
                    }}
                    className="w-full xs:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-950 bg-slate-100 border border-slate-300 hover:bg-slate-100 active:bg-slate-200 rounded-lg min-h-[44px] cursor-pointer"
                    title="Afficher et générer le Code QR de cette évaluation"
                  >
                    <QrCode className="w-4 h-4 text-slate-800" />
                    <span>Code QR Élève</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportSingleStudentPDF}
                  className="w-full xs:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg min-h-[44px] cursor-pointer"
                  title="Télécharger cette fiche individuelle au format PDF pour consultation hors ligne"
                >
                  <Download className="w-4 h-4 text-slate-800" />
                  <span>Télécharger fiche (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full xs:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg min-h-[44px] cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Imprimer</span>
                </button>
                {selectedStudentExamEval && (
                  <button
                    type="button"
                    onClick={() => {
                      onEditEvaluation(selectedStudentExamEval.exam_id, activeStudentId!);
                      setActiveStudentId(null);
                    }}
                    className="w-full xs:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-950 hover:bg-slate-950 active:bg-slate-950 rounded-lg shadow-xs min-h-[44px]"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Modifier l'évaluation</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Planche de Codes QR pour toute la classe */}
      {exams.length > 0 && (
        <ClassQRCodesModal
          isOpen={isClassQRModalOpen}
          onClose={() => setIsClassQRModalOpen(false)}
          exam={exams.find(e => e.id === examFilter) || exams[0]}
          students={classFilter ? students.filter(s => s.class_id === classFilter) : students}
        />
      )}

      {/* Modal Code QR Individuel */}
      {qrModalStudent && (
        <StudentQRCodeModal
          isOpen={Boolean(qrModalStudent)}
          onClose={() => setQrModalStudent(null)}
          student={qrModalStudent.student}
          exam={qrModalStudent.exam}
          evaluation={qrModalStudent.evaluation}
        />
      )}
    </div>
  );
};
