import React, { useState } from 'react';
import { AlertCircle, School, Plus, Edit2, Trash2, Users, BookOpen } from 'lucide-react';
import { ClassRoom } from '../types';

interface ClassesViewProps {
  classes: ClassRoom[];
  onCreateClass: (name: string) => void;
  onUpdateClass: (id: string, name: string) => void;
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classNameInput.trim()) return;

    if (editingClass) {
      onUpdateClass(editingClass.id, classNameInput.trim());
    } else {
      onCreateClass(classNameInput.trim());
    }

    setClassNameInput('');
    setEditingClass(null);
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    setEditingClass(null);
    setClassNameInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (cls: ClassRoom) => {
    setEditingClass(cls);
    setClassNameInput(cls.name);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Gestion des Classes
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Créez et organisez vos groupes d'élèves pour les sessions d'examens oraux.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg transition-colors self-stretch sm:self-auto shadow-xs min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle classe</span>
        </button>
      </div>

      {/* Grid of Classes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {classes.map((cls) => (
          <div
            key={cls.id}
            className="p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-amber-200 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="p-2.5 bg-amber-50 text-amber-900 rounded-lg">
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
                    className="p-2 text-slate-400 hover:text-rose-600 active:bg-rose-50 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
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
              className="w-full text-center text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 py-2.5 rounded-lg transition-colors min-h-[44px] flex items-center justify-center"
            >
              Voir les élèves de la classe &rarr;
            </button>
          </div>
        ))}
      </div>

      {/* Modal Créer / Modifier */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-1">
              {editingClass ? 'Modifier la classe' : 'Créer une nouvelle classe'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Indiquez l'intitulé de la classe (ex: Classe A1 - Débutants, Seconde LV3, etc.)
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom de la classe <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Classe A1 - Débutants"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
                  autoFocus
                />
              </div>

              <div className="flex flex-col-reverse xs:flex-row justify-end gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full xs:w-auto px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-full xs:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg min-h-[44px]"
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
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 sm:p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-900 text-base mb-2">
              Supprimer cette classe ?
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Cette action supprimera définitivement la classe, ses élèves, leurs photos et notes, les résultats de quiz, ainsi que les examens et données associés. Les comptes d’élèves enregistrés dans ce navigateur seront aussi supprimés.
            </p>
            {deleteError && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex flex-col-reverse xs:flex-row justify-center gap-2 sm:gap-3">
              <button
                type="button"
                disabled={isDeletingClass}
                onClick={() => {
                  setConfirmDeleteId(null);
                  setDeleteError(null);
                }}
                className="w-full xs:w-auto px-4 py-2.5 text-xs sm:text-sm text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
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
                className="w-full xs:w-auto px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:cursor-wait disabled:opacity-60 rounded-lg min-h-[44px]"
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
