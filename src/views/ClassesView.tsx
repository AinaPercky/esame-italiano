import React, { useState } from 'react';
import { AlertCircle, School, Plus, Edit2, Trash2, Users, BookOpen } from 'lucide-react';
import { ClassRoom } from '../types';

interface ClassesViewProps {
  classes: ClassRoom[];
  onCreateClass: (name: string, enrollmentMode: 'direct' | 'approval') => void;
  onUpdateClass: (id: string, name: string, enrollmentMode: 'direct' | 'approval') => void;
  onDeleteClass: (id: string) => Promise<void>;
  onSelectClassStudents: (classId: string) => void;
}

export const ClassesView: React.FC<ClassesViewProps> = ({
  classes,
  onCreateClass,
  onUpdateClass,
  onDeleteClass,
  onSelectClassStudents
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [enrollmentModeInput, setEnrollmentModeInput] = useState<'direct' | 'approval'>('approval');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classNameInput.trim()) return;

    if (editingClass) {
      onUpdateClass(editingClass.id, classNameInput.trim(), enrollmentModeInput);
    } else {
      onCreateClass(classNameInput.trim(), enrollmentModeInput);
    }

    setClassNameInput('');
    setEditingClass(null);
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    setEditingClass(null);
    setClassNameInput('');
    setEnrollmentModeInput('approval');
    setIsModalOpen(true);
  };

  const openEditModal = (cls: ClassRoom) => {
    setEditingClass(cls);
    setClassNameInput(cls.name);
    setEnrollmentModeInput(cls.enrollment_mode || 'approval');
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-5 sm:space-y-7 max-w-5xl mx-auto w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#072a3f] tracking-tight">
            Gestion des Classes
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Créez et organisez vos groupes d'élèves pour les sessions d'examens oraux.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#072a3f] hover:bg-[#0b3c5d] active:bg-[#072a3f] rounded-xl transition-colors self-stretch sm:self-auto shadow-xs min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle classe</span>
        </button>
      </div>

      {/* Grid of Classes */}
      {classes.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#b7d3e4] bg-white/80 px-5 py-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f0f7] text-[#0b3c5d]"><School className="h-7 w-7" /></div>
          <h3 className="text-lg font-bold text-[#072a3f]">Aucune classe pour le moment</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Créez votre premier groupe pour organiser vos élèves et vos examens.</p>
          <button type="button" onClick={openCreateModal} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0b3c5d]"><Plus className="h-4 w-4" />Créer une classe</button>
        </div>
      ) : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {classes.map((cls) => (
          <div
            key={cls.id}
            className="p-5 sm:p-6 bg-white border border-slate-200 rounded-[22px] shadow-sm hover:border-[#b7d3e4] hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="p-3 bg-[#e6f0f7] text-[#0b3c5d] rounded-2xl">
                  <School className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(cls)}
                    className="p-2 text-slate-400 hover:text-slate-700 active:bg-slate-100 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
                    title="Modifier le nom"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(cls.id)}
                    className="p-2 text-slate-400 hover:text-[#0b3c5d] active:bg-[#e6f0f7] rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
                    title="Supprimer la classe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-slate-900 text-lg mb-1">
                {cls.name}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Créée le {new Date(cls.created_at).toLocaleDateString('fr-FR')}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs py-3 border-y border-slate-100 mb-4">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="font-mono font-semibold text-slate-800">
                    {cls.student_count || 0}
                  </span>
                  <span>élèves</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  <span className="font-mono font-semibold text-slate-800">
                    {cls.exam_count || 0}
                  </span>
                  <span>examen(s)</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectClassStudents(cls.id)}
              className="w-full text-center text-xs font-semibold text-amber-900 bg-[#e6f0f7] hover:bg-[#d7e8f3] active:bg-[#b7d3e4] py-2.5 rounded-lg transition-colors min-h-[44px] flex items-center justify-center"
            >
              Voir les élèves de la classe &rarr;
            </button>
          </div>
        ))}
      </div>}

      {/* Modal Créer / Modifier */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-1">
              {editingClass ? 'Modifier la classe' : 'Créer une nouvelle classe'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Indiquez l'intitulé de la classe (ex: Classe A1 - Débutants, Seconde LV3, etc.)
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom de la classe <span className="text-[#0b3c5d]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Classe A1 - Débutants"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3c5d]/20 focus:border-[#0b3c5d] min-h-[44px]"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Mode d'inscription</label>
                <select value={enrollmentModeInput} onChange={e => setEnrollmentModeInput(e.target.value as 'direct' | 'approval')} className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="approval">Avec validation administrative</option>
                  <option value="direct">Inscription directe</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">Ce réglage concerne les nouvelles inscriptions.</p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#072a3f] hover:bg-[#0b3c5d] active:bg-[#072a3f] rounded-xl min-h-[44px]"
                >
                  {editingClass ? 'Enregistrer' : 'Créer la classe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Suppression Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-sm w-full p-5 sm:p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[#e6f0f7] text-[#0b3c5d] flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-900 text-base mb-2">
              Supprimer cette classe ?
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Cette action supprimera définitivement la classe, ses élèves, leurs photos et notes, les résultats de quiz, ainsi que les examens et données associés. Les comptes d’élèves enregistrés dans ce navigateur seront aussi supprimés.
            </p>
            {deleteError && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-[#b7d3e4] bg-[#e6f0f7] p-3 text-left text-xs text-[#072a3f]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row justify-center gap-2 sm:gap-3">
              <button
                type="button"
                disabled={isDeletingClass}
                onClick={() => {
                  setConfirmDeleteId(null);
                  setDeleteError(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeletingClass}
                onClick={async () => {
                  setIsDeletingClass(true);
                  setDeleteError(null);
                  try {
                    await onDeleteClass(confirmDeleteId);
                    setConfirmDeleteId(null);
                  } catch (error) {
                    console.error('Erreur lors de la suppression de la classe :', error);
                    setDeleteError(error instanceof Error ? error.message : 'La suppression de la classe a échoué. Réessayez.');
                  } finally {
                    setIsDeletingClass(false);
                  }
                }}
                className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#0b3c5d] hover:bg-[#072a3f] active:bg-[#072a3f] disabled:cursor-wait disabled:opacity-60 rounded-lg min-h-[44px]"
              >
                {isDeletingClass ? 'Suppression en cours…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
