import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Upload, 
  Search, 
  Trash2, 
  Edit2, 
  FileText, 
  AlertCircle, 
  CheckCircle,
  FileCode,
  Eye,
  School,
  Loader2,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserX,
  Clock,
  FileDown,
  Image as ImageIcon
} from 'lucide-react';
import { Student, ClassRoom } from '../types';
import { dataService } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { StudentAvatar } from '../components/StudentAvatar';
import { PhotoUploadInput } from '../components/PhotoUploadInput';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { exportStudentBulletinPDF, exportStudentBulletinPNG } from '../utils/exportUtils';

interface StudentsViewProps {
  students: Student[];
  classes: ClassRoom[];
  selectedClassId?: string;
  onRefresh: () => void;
  onViewStudentSheet: (studentId: string) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  classes,
  selectedClassId: initialClassFilter,
  onRefresh,
  onViewStudentSheet
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState(initialClassFilter || '');
  const [validationFilter, setValidationFilter] = useState<'pending' | 'approved' | 'rejected' | ''>('');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [deleteStudentError, setDeleteStudentError] = useState<string | null>(null);

  // Single Form State
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStudentNumber, setFormStudentNumber] = useState('');
  const [formClassId, setFormClassId] = useState(classes[0]?.id || '');
  const [formAvatar, setFormAvatar] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Validation actions state & confirm dialog
  const [validationSuccessMsg, setValidationSuccessMsg] = useState<string | null>(null);
  const [confirmValidationDialog, setConfirmValidationDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'success' | 'danger' | 'warning' | 'primary';
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    variant: 'primary',
    action: () => {}
  });

  const pendingStudents = students.filter(s => s.validation_status === 'pending');
  const pendingCount = pendingStudents.length;
  const approvedCount = students.filter(s => s.validation_status === 'approved' || !s.validation_status).length;
  const rejectedCount = students.filter(s => s.validation_status === 'rejected').length;

  // Synchronisation directe depuis Supabase online à l'ouverture
  React.useEffect(() => {
    if (supabaseService.isConfigured()) {
      dataService.syncStudentsFromCloud().catch(err => {
        console.warn('Sync students from cloud error:', err);
      });
    }
  }, []);

  const handleApproveStudent = (student: Student) => {
    setConfirmValidationDialog({
      isOpen: true,
      title: "Approuver l'inscription",
      message: `Confirmer la validation de l'inscription pour ${student.first_name} ${student.last_name} (${student.email}) ?\nL'élève aura immédiatement accès à son espace, ses quiz et ses résultats.`,
      confirmLabel: "Valider l'inscription",
      variant: 'success',
      action: async () => {
        try {
          await dataService.updateStudentValidationStatus(student.id, 'approved');
          setValidationSuccessMsg(`Inscription de ${student.first_name} ${student.last_name} approuvée avec succès.`);
          setTimeout(() => setValidationSuccessMsg(null), 3500);
          onRefresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Erreur lors de la validation.');
        }
      }
    });
  };

  const handleRejectStudent = (student: Student) => {
    setConfirmValidationDialog({
      isOpen: true,
      title: "Refuser l'inscription",
      message: `Refuser l'inscription de ${student.first_name} ${student.last_name} (${student.email}) ?\nL'élève ne pourra pas accéder à la plateforme.`,
      confirmLabel: "Refuser l'inscription",
      variant: 'danger',
      action: async () => {
        try {
          await dataService.updateStudentValidationStatus(student.id, 'rejected');
          setValidationSuccessMsg(`Inscription de ${student.first_name} ${student.last_name} refusée.`);
          setTimeout(() => setValidationSuccessMsg(null), 3500);
          onRefresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Erreur lors du refus.');
        }
      }
    });
  };

  const handleBulkApprove = () => {
    const pendingList = students.filter(s => s.validation_status === 'pending');
    if (pendingList.length === 0) return;

    setConfirmValidationDialog({
      isOpen: true,
      title: "Activer tous les comptes en attente",
      message: `Confirmer la validation de l'inscription pour les ${pendingList.length} élève(s) en attente ?\nIls pourront tous immédiatement se connecter à leur espace personnel et participer aux quiz.`,
      confirmLabel: `Valider les ${pendingList.length} inscriptions`,
      variant: 'success',
      action: async () => {
        try {
          const ids = pendingList.map(s => s.id);
          await dataService.bulkUpdateStudentValidationStatus(ids, 'approved');
          setValidationSuccessMsg(`${pendingList.length} compte(s) élève(s) activé(s) avec succès !`);
          setTimeout(() => setValidationSuccessMsg(null), 3500);
          onRefresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Erreur lors de la validation groupée.');
        }
      }
    });
  };

  const handleChangePendingStudentClass = async (studentId: string, newClassId: string) => {
    try {
      await dataService.updateStudent(studentId, { class_id: newClassId });
      setValidationSuccessMsg(`Classe de l'élève mise à jour.`);
      setTimeout(() => setValidationSuccessMsg(null), 2500);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la classe.');
    }
  };

  // Import State
  const [importType, setImportType] = useState<'csv' | 'json'>('csv');
  const [importText, setImportText] = useState('');
  const [importTargetClass, setImportTargetClass] = useState(classes[0]?.id || '');
  const [importPreview, setImportPreview] = useState<Array<Record<string, any>> | null>(null);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [importParseError, setImportParseError] = useState<string | null>(null);

  // Filtered Students
  const filteredStudents = students.filter(s => {
    const matchesClass = !classFilter || s.class_id === classFilter;
    const matchesSearch = !searchTerm ||
      s.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.student_number && s.student_number.toLowerCase().includes(searchTerm.toLowerCase()));
    const effectiveStatus = s.validation_status || 'approved';
    const matchesValidationStatus = !validationFilter || effectiveStatus === validationFilter;
    return matchesClass && matchesSearch && matchesValidationStatus;
  });

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormStudentNumber('');
    setFormClassId(classFilter || classes[0]?.id || '');
    setFormAvatar('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormFirstName(student.first_name);
    setFormLastName(student.last_name);
    setFormEmail(student.email);
    setFormStudentNumber(student.student_number || '');
    setFormClassId(student.class_id);
    setFormAvatar(student.avatar_url || student.avatar || '');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleExportBulletin = (student: Student, format: 'pdf' | 'png') => {
    const quizSubmissions = dataService.getQuizSubmissions().filter(submission => submission.student_id === student.id);
    const classQuizzes = dataService.getQuizzes().filter(quiz =>
      quiz.class_id === student.class_id || quiz.class_ids?.includes(student.class_id)
    );
    const bulletin = {
      student: { ...student, class_name: student.class_name || classes.find(item => item.id === student.class_id)?.name || 'Classe inconnue' },
      quizzes: classQuizzes,
      submissions: quizSubmissions
    };
    if (format === 'pdf') exportStudentBulletinPDF(bulletin);
    else exportStudentBulletinPNG(bulletin);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName.trim() || !formLastName.trim() || !formClassId) return;

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingStudent) {
        let finalAvatar = formAvatar;
        if (formAvatar && formAvatar.startsWith('data:image/')) {
          try {
            finalAvatar = (await supabaseService.saveStudentAvatar(editingStudent.id, formAvatar)) || formAvatar;
          } catch (e) {
            console.warn('Erreur téléversement cloud de la photo élève, sauvegarde locale:', e);
          }
        } else if (!formAvatar && (editingStudent.avatar_url || editingStudent.avatar)) {
          try {
            await supabaseService.saveStudentAvatar(editingStudent.id, null);
          } catch (e) {
            console.warn('Erreur suppression photo cloud:', e);
          }
        }

        await dataService.updateStudent(editingStudent.id, {
          first_name: formFirstName.trim(),
          last_name: formLastName.trim(),
          email: formEmail,
          student_number: formStudentNumber.trim() || null,
          class_id: formClassId,
          avatar_url: finalAvatar || null,
          avatar: finalAvatar || undefined
        });
      } else {
        const newStudent = await dataService.createStudent(
          formFirstName.trim(),
          formLastName.trim(),
          formClassId,
          formEmail,
          formStudentNumber.trim() || undefined,
          undefined,
          formAvatar || null
        );

        if (formAvatar && formAvatar.startsWith('data:image/') && newStudent?.id) {
          try {
            const uploadedUrl = await supabaseService.saveStudentAvatar(newStudent.id, formAvatar);
            if (uploadedUrl) {
              await dataService.updateStudent(newStudent.id, {
                avatar_url: uploadedUrl,
                avatar: uploadedUrl
              });
            }
          } catch (e) {
            console.warn('Erreur téléversement cloud de la photo pour nouvel élève:', e);
          }
        }
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Impossible d’enregistrer cet élève.');
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsAddModalOpen(false);
    onRefresh();
  };

  const handleDeleteStudent = async (id: string) => {
    setIsDeletingStudent(true);
    setDeleteStudentError(null);
    try {
      await dataService.deleteStudent(id);
      setConfirmDeleteId(null);
      onRefresh();
    } catch (error) {
      setDeleteStudentError(error instanceof Error ? error.message : 'Impossible de supprimer les données de cet élève.');
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // CSV / JSON parsing for preview
  const handleParseImport = () => {
    setImportSummary(null);
    setImportParseError(null);
    if (!importText.trim()) return;

    if (importType === 'csv') {
      const lines = importText.trim().split('\n');
      if (lines.length < 2) {
        setImportParseError('Le CSV doit contenir au moins une ligne d\'en-tête et une ligne de données.');
        return;
      }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const parsed: Array<Record<string, any>> = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim());
        const row: Record<string, any> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        parsed.push(row);
      }
      setImportPreview(parsed);
    } else {
      try {
        const parsed = JSON.parse(importText);
        if (!Array.isArray(parsed)) {
          setImportParseError('Le JSON doit être une liste (array) d\'élèves.');
          return;
        }
        setImportPreview(parsed);
      } catch (err) {
        setImportParseError('Format JSON invalide : ' + (err as Error).message);
      }
    }
  };

  const handleExecuteImport = async () => {
    if (!importPreview) return;
    setImportParseError(null);
    try {
      const res = await dataService.importStudents(importPreview, importTargetClass);
      setImportSummary(res);
      onRefresh();
    } catch (error) {
      setImportParseError(error instanceof Error ? error.message : 'Impossible d’importer les élèves.');
    }
  };

  const sampleCsv = `nom,prenom,email,classe\nRakoto,Jean,jean.rakoto@example.com,A1\nRabe,Marie,marie.rabe@example.com,A1\nRasoa,Paul,paul.rasoa@example.com,A1`;
  const sampleJson = `[\n  {\n    "nom": "Rakoto",\n    "prenom": "Jean",\n    "email": "jean.rakoto@example.com",\n    "classe": "A1"\n  },\n  {\n    "nom": "Rabe",\n    "prenom": "Marie",\n    "email": "marie.rabe@example.com",\n    "classe": "A1"\n  }\n]`;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Annuaire des Élèves
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            {students.length} élève(s) enregistrés dans vos classes d'italien.
          </p>
        </div>
        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setImportText(sampleCsv);
              setImportPreview(null);
              setImportSummary(null);
              setIsImportModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg shadow-2xs transition-colors min-h-[44px]"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Importer CSV / JSON</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg shadow-2xs transition-colors min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un élève</span>
          </button>
        </div>
      </div>

      {/* SECTION ACTIVATION DES ÉLÈVES INSCRITS */}
      {pendingCount > 0 && (
        <div className="bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 border-2 border-amber-300 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-3.5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                    Activation des élèves inscrits
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-600 text-white animate-pulse">
                    {pendingCount} en attente
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Ces élèves se sont inscrits en ligne et attendent votre validation pour accéder à l'espace étudiant, leurs quiz et leurs notes.
                </p>
              </div>
            </div>

            <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={handleBulkApprove}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-800 active:bg-emerald-900 sm:w-auto"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Activer tous les {pendingCount} élèves</span>
              </button>
            </div>
          </div>

          {/* Cards for each pending student */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {pendingStudents.map(student => (
              <div
                key={student.id}
                className="bg-white border border-amber-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <StudentAvatar
                      name={`${student.first_name} ${student.last_name}`}
                      src={student.avatar_url || student.avatar}
                      className="w-11 h-11 border-2 border-amber-200 shrink-0 text-sm shadow-2xs"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="break-words font-bold text-slate-900 text-sm leading-tight">
                        {student.first_name} {student.last_name}
                      </h4>
                      <p className="break-words text-xs text-slate-500">{student.email}</p>
                      <p className="text-[11px] text-amber-900/80 font-medium mt-0.5">
                        Inscrit le {new Date(student.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <span className="self-start px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 shrink-0 whitespace-nowrap">
                    En attente
                  </span>
                </div>

                {/* Class selector allowing reassignment before activation */}
                <div className="flex items-center gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <School className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="font-semibold text-slate-700 shrink-0">Classe :</span>
                  <select
                    value={student.class_id}
                    onChange={(e) => handleChangePendingStudentClass(student.id, e.target.value)}
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleApproveStudent(student)}
                    className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer min-h-[38px]"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Valider l'accès</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectStudent(student)}
                    className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg border border-rose-200 flex items-center justify-center gap-1 transition-colors cursor-pointer min-h-[38px]"
                  >
                    <UserX className="w-4 h-4" />
                    <span>Refuser</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message when filtered on pending but 0 pending */}
      {validationFilter === 'pending' && pendingCount === 0 && (
        <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-900 text-base">Toutes les inscriptions sont activées !</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Il n'y a actuellement aucun élève en attente de validation. Tous les comptes enregistrés sont approuvés et ont accès à la plateforme.
          </p>
          <button
            type="button"
            onClick={() => setValidationFilter('')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Afficher tous les élèves
          </button>
        </div>
      )}

      {/* Message de succès d'action de validation */}
      {validationSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{validationSuccessMsg}</span>
        </div>
      )}

      {/* Quick filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setValidationFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            validationFilter === ''
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Tous les élèves ({students.length})
        </button>

        <button
          type="button"
          onClick={() => setValidationFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            validationFilter === 'pending'
              ? 'bg-amber-800 text-white shadow-xs'
              : 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>En attente ({pendingCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setValidationFilter('approved')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            validationFilter === 'approved'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-emerald-50 border border-emerald-300 text-emerald-900 hover:bg-emerald-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Approuvés ({approvedCount})</span>
        </button>

        {rejectedCount > 0 && (
          <button
            type="button"
            onClick={() => setValidationFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              validationFilter === 'rejected'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-rose-50 border border-rose-300 text-rose-900 hover:bg-rose-100'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Refusés ({rejectedCount})</span>
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher élève ou identifiant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[40px]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap hidden xs:inline">Classe :</span>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[40px]"
          >
            <option value="">Toutes les classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap hidden xs:inline">Statut :</span>
          <select
            value={validationFilter}
            onChange={(e) => setValidationFilter(e.target.value as '' | 'approved' | 'pending' | 'rejected')}
            className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[40px]"
          >
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvé</option>
            <option value="rejected">Rejeté</option>
          </select>
        </div>
      </div>

      {/* Mobile Card List (< sm) */}
      <div className="block sm:hidden space-y-2.5">
        {filteredStudents.length > 0 ? (
          filteredStudents.map((s) => (
            <div
              key={s.id}
              className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs space-y-2.5"
            >
                <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <StudentAvatar
                    name={`${s.first_name} ${s.last_name}`}
                    src={s.avatar_url || s.avatar}
                    className="w-10 h-10 border border-slate-200 shrink-0 text-xs shadow-2xs mt-0.5"
                  />
                  <div className="min-w-0">
                    <h4 className="break-words font-semibold text-slate-900 text-base">
                      {s.first_name} {s.last_name}
                    </h4>
                    <div className="break-words text-xs text-slate-500">{s.email}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-amber-900 bg-amber-50 px-2 py-0.5 rounded">
                      {s.class_name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {s.student_number || 'Sans matricule'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      s.validation_status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : s.validation_status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : s.validation_status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                    }`}>
                      {s.validation_status === 'pending' ? 'En attente' : s.validation_status === 'approved' ? 'Approuvé' : s.validation_status === 'rejected' ? 'Rejeté' : 'Non défini'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(s)}
                    className="p-2 text-slate-400 hover:text-slate-700 active:bg-slate-100 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
                    title="Modifier"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteStudentError(null); setConfirmDeleteId(s.id); }}
                    className="p-2 text-slate-400 hover:text-rose-600 active:bg-rose-50 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Actions de validation pour mobile */}
              {s.validation_status === 'pending' && (
                <div className="flex items-center gap-2 pt-2 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={() => handleApproveStudent(s)}
                    className="flex-1 py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Valider l'inscription</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectStudent(s)}
                    className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg border border-rose-200 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Refuser</span>
                  </button>
                </div>
              )}

              {s.validation_status === 'rejected' && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleApproveStudent(s)}
                    className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg border border-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Ré-approuver l'inscription</span>
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <span className="text-[11px] text-slate-400">
                  Créé le {new Date(s.created_at).toLocaleDateString('fr-FR')}
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onViewStudentSheet(s.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 rounded-md transition-colors min-h-[38px]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Fiche & notes</span>
                  </button>
                  <button type="button" onClick={() => handleExportBulletin(s, 'pdf')} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 min-h-[38px]" title="Télécharger le bulletin PDF">
                    <FileDown className="w-3.5 h-3.5" /><span>Bulletin PDF</span>
                  </button>
                  <button type="button" onClick={() => handleExportBulletin(s, 'png')} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 min-h-[38px]" title="Télécharger le bulletin PNG">
                    <ImageIcon className="w-3.5 h-3.5" /><span>Bulletin PNG</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-lg border border-slate-200">
            Aucun élève ne correspond à vos critères de recherche.
          </div>
        )}
      </div>

      {/* Desktop Table View (>= sm) */}
      <div className="hidden sm:block bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Élève</th>
                <th className="py-3 px-4">Adresse e-mail</th>
                <th className="py-3 px-4">Matricule</th>
                <th className="py-3 px-4">Classe</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-center">Historique</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <StudentAvatar
                          name={`${s.first_name} ${s.last_name}`}
                          src={s.avatar_url || s.avatar}
                          className="w-9 h-9 border border-slate-200 shrink-0 text-xs shadow-2xs"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">
                            {s.first_name} {s.last_name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Ajouté le {new Date(s.created_at).toLocaleDateString('fr-FR')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{s.email}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {s.student_number || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {s.class_name}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        s.validation_status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : s.validation_status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : s.validation_status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                      }`}>
                        {s.validation_status === 'pending' ? 'En attente' : s.validation_status === 'approved' ? 'Approuvé' : s.validation_status === 'rejected' ? 'Rejeté' : 'Non défini'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => onViewStudentSheet(s.id)}
                        className="inline-flex items-center gap-1 text-xs text-amber-900 hover:text-amber-700 hover:underline font-medium min-h-[32px]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Fiche & Notes</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {/* Validation Actions */}
                        {s.validation_status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveStudent(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                              title="Valider l'inscription"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span className="hidden md:inline">Valider</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectStudent(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 transition-colors cursor-pointer"
                              title="Refuser l'inscription"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span className="hidden md:inline">Refuser</span>
                            </button>
                          </>
                        )}

                        {s.validation_status === 'rejected' && (
                          <button
                            type="button"
                            onClick={() => handleApproveStudent(s)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-300 transition-colors cursor-pointer"
                            title="Ré-approuver l'inscription"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">Ré-approuver</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleExportBulletin(s, 'pdf')}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-bold text-sky-800 transition-colors hover:bg-sky-100"
                          title="Télécharger le bulletin PDF"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline">PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportBulletin(s, 'png')}
                          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-bold text-violet-800 transition-colors hover:bg-violet-100"
                          title="Télécharger le bulletin PNG"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline">PNG</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(s)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 min-h-[36px] min-w-[36px] inline-flex items-center justify-center cursor-pointer"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeleteStudentError(null); setConfirmDeleteId(s.id); }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 min-h-[36px] min-w-[36px] inline-flex items-center justify-center cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                    Aucun élève ne correspond à vos critères de recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajouter / Modifier Élève */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-1">
              {editingStudent ? 'Modifier l\'élève' : 'Ajouter un élève'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Renseignez les informations pour les sessions d'examens oraux.
            </p>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {formError}
                </div>
              )}

              {/* Formulaire de téléchargement / remplacement de photo de profil */}
              <PhotoUploadInput
                value={formAvatar}
                name={`${formFirstName} ${formLastName}`.trim() || 'Élève'}
                onChange={(photo) => setFormAvatar(photo)}
                onRemove={() => setFormAvatar('')}
                label="Photo de profil"
                helperText="Formats JPG, PNG ou WebP acceptés ; la photo est convertie en WebP et compressée automatiquement."
              />

              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prénom <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    placeholder="Jean"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nom <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    placeholder="Rakoto"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adresse e-mail <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="eleve@exemple.fr"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Numéro d'identification / Matricule
                </label>
                <input
                  type="text"
                  value={formStudentNumber}
                  onChange={(e) => setFormStudentNumber(e.target.value)}
                  placeholder="STU-001 (facultatif)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Classe <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formClassId}
                  onChange={(e) => setFormClassId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col-reverse xs:flex-row justify-end gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-full xs:w-auto px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full xs:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 disabled:opacity-50 rounded-lg min-h-[44px] inline-flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingStudent ? 'Enregistrer' : 'Ajouter l\'élève'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Import CSV / JSON (Section 3.2) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Importation d'élèves par lots
                </h3>
                <p className="text-xs text-slate-500">
                  Chaque élève doit avoir une adresse e-mail unique. Les noms et prénoms peuvent être identiques.
                </p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => { setImportType('csv'); setImportText(sampleCsv); setImportPreview(null); }}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors min-h-[36px] ${importType === 'csv' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                >
                  Format CSV
                </button>
                <button
                  type="button"
                  onClick={() => { setImportType('json'); setImportText(sampleJson); setImportPreview(null); }}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors min-h-[36px] ${importType === 'json' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                >
                  Format JSON
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Classe par défaut :
                </label>
                <select
                  value={importTargetClass}
                  onChange={(e) => setImportTargetClass(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Contenu {importType.toUpperCase()} à coller :
                  </label>
                  <button
                    type="button"
                    onClick={() => setImportText(importType === 'csv' ? sampleCsv : sampleJson)}
                    className="text-xs text-amber-800 hover:underline font-medium min-h-[32px] inline-flex items-center"
                  >
                    Charger exemple
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={importText}
                  onChange={(e) => { setImportText(e.target.value); setImportPreview(null); }}
                  className="w-full font-mono text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
                  placeholder={importType === 'csv' ? "nom,prenom,classe\n..." : "[\n  {\"nom\": \"...\"}\n]"}
                />
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleParseImport}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors min-h-[44px]"
                >
                  1. Vérifier et prévisualiser
                </button>
              </div>

              {importParseError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{importParseError}</span>
                </div>
              )}

              {/* Aperçu avant confirmation */}
              {importPreview && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                    <span>Aperçu détecté ({importPreview.length} ligne(s)) :</span>
                  </div>

                  <div className="max-h-40 max-w-full overflow-auto border border-slate-200 rounded-lg text-xs">
                    <table className="w-full min-w-[560px] text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">Prénom</th>
                          <th className="p-2">Nom</th>
                          <th className="p-2">E-mail</th>
                          <th className="p-2">Classe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-2 font-medium">{item.prenom || item.first_name || '—'}</td>
                            <td className="p-2 font-medium">{item.nom || item.last_name || '—'}</td>
                            <td className="p-2">{item.email || item.courriel || item['e-mail'] || '—'}</td>
                            <td className="p-2 text-slate-600">{item.classe || item.class_name || 'Par défaut'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    className="w-full py-3 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg transition-colors min-h-[44px]"
                  >
                    2. Confirmer l'importation ({importPreview.length} élèves)
                  </button>
                </div>
              )}

              {/* Résumé de l'importation */}
              {importSummary && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="font-semibold text-slate-900 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Rapport d'importation terminé :</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-1 font-mono text-center">
                    <div className="p-2 bg-emerald-50 rounded border border-emerald-100">
                      <span className="font-bold text-emerald-800 text-sm block">{importSummary.importedCount}</span>
                      <span className="text-[10px] text-emerald-600">Importés</span>
                    </div>
                    <div className="p-2 bg-amber-50 rounded border border-amber-100">
                      <span className="font-bold text-amber-800 text-sm block">{importSummary.duplicatesCount}</span>
                      <span className="text-[10px] text-amber-600">Doublons</span>
                    </div>
                    <div className="p-2 bg-rose-50 rounded border border-rose-100">
                      <span className="font-bold text-rose-800 text-sm block">{importSummary.errorsCount}</span>
                      <span className="text-[10px] text-rose-600">Erreurs</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Suppression */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6 text-center">
            <h3 className="font-semibold text-slate-900 mb-2">Supprimer cet élève ?</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Sa fiche, ses notes, ses évaluations, son historique de quiz et ses résultats de classement seront définitivement supprimés. Son accès à l'espace étudiant sera révoqué.
            </p>
            {deleteStudentError && (
              <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-left text-xs font-medium text-rose-700">
                {deleteStudentError}
              </p>
            )}
            <div className="flex flex-col-reverse xs:flex-row justify-center gap-2 sm:gap-3">
              <button
                type="button"
                disabled={isDeletingStudent}
                onClick={() => setConfirmDeleteId(null)}
                className="w-full xs:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 rounded-lg min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeletingStudent}
                onClick={() => { void handleDeleteStudent(confirmDeleteId); }}
                className="w-full xs:w-auto px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg min-h-[44px] inline-flex items-center justify-center gap-2"
              >
                {isDeletingStudent && <Loader2 className="w-4 h-4 animate-spin" />}
                {isDeletingStudent ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogue de confirmation d'action de validation */}
      <ConfirmDialog
        isOpen={confirmValidationDialog.isOpen}
        title={confirmValidationDialog.title}
        message={confirmValidationDialog.message}
        confirmLabel={confirmValidationDialog.confirmLabel}
        variant={confirmValidationDialog.variant}
        onConfirm={() => {
          confirmValidationDialog.action();
          setConfirmValidationDialog(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmValidationDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
