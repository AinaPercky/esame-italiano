import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, 
  Smartphone, 
  Copy, 
  Check, 
  Download, 
  Printer, 
  ExternalLink, 
  Eye, 
  Sparkles, 
  Award, 
  BookOpen, 
  User, 
  School, 
  CheckCircle2, 
  FileCheck2, 
  Info,
  ChevronRight,
  Search,
  Filter,
  ArrowRight,
  Tv,
  Maximize2,
  X
} from 'lucide-react';
import { ClassRoom, Exam, Student, Evaluation } from '../types';
import { dataService } from '../services/dataService';
import { ClassQRCodesModal } from '../components/ClassQRCodesModal';
import { StudentPublicReportView } from './StudentPublicReportView';

interface QRCodePortalViewProps {
  classes: ClassRoom[];
  exams: Exam[];
  students: Student[];
  initialExamId?: string;
  initialStudentId?: string;
  onNavigateToEvaluation?: (examId: string, studentId: string) => void;
}

export const QRCodePortalView: React.FC<QRCodePortalViewProps> = ({
  classes,
  exams,
  students,
  initialExamId,
  initialStudentId,
  onNavigateToEvaluation
}) => {
  // Mode d'affichage : 'common' (Code QR unique commun à toute la classe) ou 'individual' (Codes QR par élève)
  const [activeMode, setActiveMode] = useState<'common' | 'individual'>('common');

  // 1. Classe sélectionnée
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialExamId) {
      const e = exams.find(x => x.id === initialExamId);
      if (e) return e.class_id;
    }
    return classes[0]?.id || '';
  });

  // 2. Examens disponibles
  const availableExams = useMemo(() => {
    return exams.filter(e => e.class_id === selectedClassId);
  }, [exams, selectedClassId]);

  const [selectedExamId, setSelectedExamId] = useState<string>(() => {
    if (initialExamId && exams.some(e => e.id === initialExamId && e.class_id === selectedClassId)) {
      return initialExamId;
    }
    const matching = exams.filter(e => e.class_id === selectedClassId);
    return matching[0]?.id || exams[0]?.id || '';
  });

  // 3. Élèves de la classe
  const classStudents = useMemo(() => {
    return students.filter(s => s.class_id === selectedClassId);
  }, [students, selectedClassId]);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    if (initialStudentId && students.some(s => s.id === initialStudentId && s.class_id === selectedClassId)) {
      return initialStudentId;
    }
    const matching = students.filter(s => s.class_id === selectedClassId);
    return matching[0]?.id || '';
  });

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [commonQrDataUrl, setCommonQrDataUrl] = useState<string>('');
  const [individualQrDataUrl, setIndividualQrDataUrl] = useState<string>('');
  const [isClassQRModalOpen, setIsClassQRModalOpen] = useState<boolean>(false);
  const [isProjectorModalOpen, setIsProjectorModalOpen] = useState<boolean>(false);
  const [previewStudentId, setPreviewStudentId] = useState<string | null>(null);
  const [previewCommonPortal, setPreviewCommonPortal] = useState<boolean>(false);

  // Synchronisation si la classe change
  useEffect(() => {
    if (availableExams.length > 0 && !availableExams.some(e => e.id === selectedExamId)) {
      setSelectedExamId(availableExams[0].id);
    }
  }, [availableExams, selectedExamId]);

  // Synchronisation élève
  useEffect(() => {
    if (classStudents.length > 0 && !classStudents.some(s => s.id === selectedStudentId)) {
      setSelectedStudentId(classStudents[0].id);
    }
  }, [classStudents, selectedStudentId]);

  const currentExam = exams.find(e => e.id === selectedExamId) || exams[0];
  const currentStudent = students.find(s => s.id === selectedStudentId) || classStudents[0];
  const currentEval = currentExam && currentStudent 
    ? dataService.getEvaluations(currentExam.id, undefined, currentStudent.id)[0] 
    : undefined;

  // Base URL
  const baseUrl = window.location.origin + window.location.pathname;

  // 1. URL DU CODE QR COMMUN (Un seul QR pour toute la classe)
  const commonPortalUrl = currentExam
    ? `${baseUrl}?view=student-portal&exam=${encodeURIComponent(currentExam.id)}`
    : `${baseUrl}?view=student-portal`;

  // 2. URL DU CODE QR INDIVIDUEL (Pré-rempli pour cet élève précis)
  const individualStudentUrl = currentExam && currentStudent
    ? `${baseUrl}?view=student&exam=${encodeURIComponent(currentExam.id)}&student=${encodeURIComponent(currentStudent.id)}`
    : '';

  // Générer le Code QR Commun
  useEffect(() => {
    if (!commonPortalUrl) return;

    QRCode.toDataURL(commonPortalUrl, {
      width: 480,
      margin: 2,
      color: {
        dark: '#78350f', // Ambre foncé élégant
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then(url => setCommonQrDataUrl(url))
      .catch(err => console.error('Erreur QR Commun:', err));
  }, [commonPortalUrl]);

  // Générer le Code QR Individuel
  useEffect(() => {
    if (!individualStudentUrl) return;

    QRCode.toDataURL(individualStudentUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then(url => setIndividualQrDataUrl(url))
      .catch(err => console.error('Erreur QR Individuel:', err));
  }, [individualStudentUrl]);

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadQR = (qrData: string, filename: string) => {
    if (!qrData) return;
    const link = document.createElement('a');
    link.href = qrData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredStudents = classStudents.filter(s => {
    const full = `${s.first_name} ${s.last_name} ${s.student_number || ''}`.toLowerCase();
    return full.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-amber-100 text-amber-900 shadow-2xs">
              <QrCode className="w-6 h-6" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
                Codes QR & Consultation Élèves
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Code QR commun à projeter ou codes individuels pour la consultation instantanée en lecture seule.
              </p>
            </div>
          </div>
        </div>

        {/* Tab switcher: Common QR vs Individual QRs */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveMode('common')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMode === 'common'
                ? 'bg-amber-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⭐ Code QR Commun (1 pour tous)
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('individual')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMode === 'individual'
                ? 'bg-amber-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Codes QR Individuels
          </button>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Class selector */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <School className="w-3.5 h-3.5 text-amber-700" />
            <span>1. Sélectionner la classe</span>
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({students.filter(s => s.class_id === c.id).length} élèves)
              </option>
            ))}
          </select>
        </div>

        {/* Exam selector */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-amber-700" />
            <span>2. Sélectionner l'épreuve orale</span>
          </label>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            disabled={availableExams.length === 0}
          >
            {availableExams.map(ex => (
              <option key={ex.id} value={ex.id}>
                {ex.title} ({ex.exam_date})
              </option>
            ))}
            {availableExams.length === 0 && (
              <option value="">Aucun examen dans cette classe</option>
            )}
          </select>
        </div>
      </div>

      {/* MODE 1: LE CODE QR COMMUN POUR TOUTE LA CLASSE */}
      {activeMode === 'common' && currentExam && (
        <div className="bg-gradient-to-br from-amber-900 via-amber-950 to-slate-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-amber-800/40 relative overflow-hidden">
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Column: Big QR Code */}
            <div className="lg:col-span-5 flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-white rounded-2xl shadow-2xl border-4 border-amber-300/40 inline-block">
                {commonQrDataUrl ? (
                  <img
                    src={commonQrDataUrl}
                    alt="Code QR Commun de la Classe"
                    className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
                  />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center text-slate-400">
                    Génération du Code QR...
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono font-bold text-amber-200 uppercase tracking-wider">
                  Code QR Unique & Actif
                </span>
              </div>
            </div>

            {/* Right Column: Workflow Explanation & Action Buttons */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/20 text-amber-300 rounded-full text-xs font-bold uppercase tracking-wider border border-amber-400/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>1 Seul Code QR pour tous les élèves</span>
                </div>
                
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  À projeter au tableau ou afficher dans la salle
                </h2>
                
                <p className="text-sm text-slate-300 leading-relaxed">
                  Après avoir scanné ce <strong>Code QR commun</strong> avec leur smartphone, chaque élève saisit simplement son <strong>numéro d'élève / matricule</strong> (ou clique sur son nom) pour afficher instantanément tous les détails de son examen oral en lecture seule.
                </p>
              </div>

              {/* 3 Step Workflow Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10 space-y-1">
                  <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center font-mono">
                    1
                  </div>
                  <h3 className="font-bold text-xs text-amber-200">L'élève scanne</h3>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    Avec la caméra de son smartphone ou tablette.
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10 space-y-1">
                  <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center font-mono">
                    2
                  </div>
                  <h3 className="font-bold text-xs text-amber-200">Saisie du numéro</h3>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    L'élève tape son matricule (ex: STU-001) ou son nom.
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10 space-y-1">
                  <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center font-mono">
                    3
                  </div>
                  <h3 className="font-bold text-xs text-amber-200">Détails affichés</h3>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    Animal, 10 critères, remarques et note /20 en lecture seule.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProjectorModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Mode Projection Plein Écran</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadQR(commonQrDataUrl, `QRCode_Commun_${currentExam.title.replace(/\s+/g, '_')}.png`)}
                  className="inline-flex items-center gap-1.5 px-4 py-3 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl border border-white/20 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-300" />
                  <span>Télécharger PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyLink(commonPortalUrl)}
                  className="inline-flex items-center gap-1.5 px-4 py-3 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl border border-white/20 transition-colors cursor-pointer"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Lien copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-300" />
                      <span>Copier le lien</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewCommonPortal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-3 bg-white/10 hover:bg-white/20 text-amber-200 font-bold text-xs rounded-xl border border-amber-400/30 transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Tester le portail élève</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODE 2: LES CODES QR INDIVIDUELS */}
      {activeMode === 'individual' && currentExam && currentStudent && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Individual QR Card */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-md flex flex-col items-center text-center space-y-4">
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-bold uppercase tracking-wider font-mono">
              <User className="w-3.5 h-3.5" />
              <span>Badge Individuel</span>
            </span>

            <h2 className="font-display text-xl font-bold text-slate-900">
              {currentStudent.first_name} {currentStudent.last_name}
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              {currentStudent.student_number || 'Sans matricule'} • {currentExam.class_name || 'Classe'}
            </p>

            <div className="p-3 bg-white border-2 border-dashed border-amber-300 rounded-2xl">
              <img
                src={individualQrDataUrl}
                alt="Code QR Individuel"
                className="w-56 h-56 object-contain"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 w-full pt-2">
              <button
                type="button"
                onClick={() => handleCopyLink(individualStudentUrl)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copier le lien</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadQR(individualQrDataUrl, `QRCode_${currentStudent.first_name}_${currentStudent.last_name}.png`)}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Télécharger</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPreviewStudentId(currentStudent.id)}
              className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span>Voir la fiche de cet élève</span>
            </button>
          </div>

          {/* Student Roster Switcher */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">
                Sélectionner un élève de la classe ({classStudents.length})
              </h3>
              <button
                type="button"
                onClick={() => setIsClassQRModalOpen(true)}
                className="text-xs font-bold text-amber-900 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer toute la classe</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
              {filteredStudents.map(st => {
                const isSelected = st.id === selectedStudentId;
                const ev = currentExam ? dataService.getEvaluations(currentExam.id, undefined, st.id)[0] : undefined;

                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStudentId(st.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'border-amber-800 bg-amber-50/90 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-xs text-slate-900 truncate">
                        {st.first_name} {st.last_name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {st.student_number || 'Sans matricule'}
                      </div>
                    </div>
                    {ev ? (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-mono">
                        {ev.total_score}/10
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">En attente</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Projector Fullscreen Modal */}
      {isProjectorModalOpen && currentExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-white p-6">
          <button
            onClick={() => setIsProjectorModalOpen(false)}
            className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="max-w-2xl w-full text-center space-y-6">
            <div className="space-y-2">
              <span className="inline-block px-4 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-sm font-bold uppercase tracking-widest">
                Esame Orale di Lingua Italiana
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-black text-white">
                Scannez le Code QR avec votre smartphone
              </h2>
              <p className="text-slate-400 text-sm sm:text-base">
                Puis saisissez votre <strong>numéro d'élève / matricule</strong> pour consulter vos résultats et remarques.
              </p>
            </div>

            <div className="p-6 bg-white rounded-3xl inline-block shadow-2xl border-4 border-amber-400">
              <img
                src={commonQrDataUrl}
                alt="Projection Code QR"
                className="w-72 h-72 sm:w-96 sm:h-96 object-contain"
              />
            </div>

            <div className="text-amber-300 font-mono text-sm">
              {currentExam.title} • {currentExam.class_name || 'Classe'}
            </div>
          </div>
        </div>
      )}

      {/* Class QR Codes Modal */}
      {currentExam && (
        <ClassQRCodesModal
          isOpen={isClassQRModalOpen}
          onClose={() => setIsClassQRModalOpen(false)}
          exam={currentExam}
          students={classStudents}
        />
      )}

      {/* Read-Only Modal Preview of Student */}
      {previewStudentId && currentExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-6 overflow-y-auto">
          <div className="bg-slate-100 rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto relative border border-slate-300 shadow-2xl">
            <div className="sticky top-0 bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between z-10">
              <span className="text-xs font-bold flex items-center gap-1.5 text-amber-300">
                <Eye className="w-4 h-4" />
                <span>Aperçu de la fiche élève en lecture seule</span>
              </span>
              <button
                onClick={() => setPreviewStudentId(null)}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Fermer l'aperçu
              </button>
            </div>
            <StudentPublicReportView
              examId={currentExam.id}
              studentId={previewStudentId}
              onBackToApp={() => setPreviewStudentId(null)}
            />
          </div>
        </div>
      )}

      {/* Common Portal Preview */}
      {previewCommonPortal && currentExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-6 overflow-y-auto">
          <div className="bg-slate-100 rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto relative border border-slate-300 shadow-2xl">
            <div className="sticky top-0 bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between z-10">
              <span className="text-xs font-bold flex items-center gap-1.5 text-amber-300">
                <Smartphone className="w-4 h-4" />
                <span>Aperçu du portail élève avec saisie du numéro</span>
              </span>
              <button
                onClick={() => setPreviewCommonPortal(false)}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Fermer l'aperçu
              </button>
            </div>
            <StudentPublicReportView
              examId={currentExam.id}
              onBackToApp={() => setPreviewCommonPortal(false)}
            />
          </div>
        </div>
      )}

    </div>
  );
};
