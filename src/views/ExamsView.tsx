import React, { useState } from 'react';
import { 
  BookOpen, 
  Plus, 
  Sparkles, 
  Calendar, 
  ListOrdered, 
  Trash2, 
  Edit3, 
  Check, 
  Layers,
  ArrowRight,
  Shuffle
} from 'lucide-react';
import { Exam, ClassRoom, ExamRubric } from '../types';
import { dataService } from '../services/dataService';
import { ZEBU_DEFAULT_RUBRICS } from '../data/seedData';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ExamsViewProps {
  exams: Exam[];
  classes: ClassRoom[];
  onRefresh: () => void;
  onSelectExamForEvaluation: (examId: string) => void;
  onSelectExamForPassOrder?: (examId: string) => void;
}

export const ExamsView: React.FC<ExamsViewProps> = ({
  exams,
  classes,
  onRefresh,
  onSelectExamForEvaluation,
  onSelectExamForPassOrder
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedExamForDetails, setSelectedExamForDetails] = useState<Exam | null>(null);

  // New Exam Form
  const [newTitle, setNewTitle] = useState('');
  const [newClassId, setNewClassId] = useState(classes[0]?.id || '');
  const [newDescription, setNewDescription] = useState('');
  const [newExamDate, setNewExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [useZebuTemplate, setUseZebuTemplate] = useState(true);

  // Rubric Editing inside Details Modal
  const [rubricsDraft, setRubricsDraft] = useState<ExamRubric[]>([]);
  const [editingRubricIndex, setEditingRubricIndex] = useState<number | null>(null);

  // In-app Confirm Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary' | 'success';
    action?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const handleOpenDetails = (exam: Exam) => {
    const full = dataService.getExamById(exam.id);
    if (full) {
      setSelectedExamForDetails(full);
      setRubricsDraft(full.rubrics || []);
      setEditingRubricIndex(null);
    }
  };

  const handleCreateExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newClassId) return;

    dataService.createExam(
      newTitle.trim(),
      newClassId,
      newDescription.trim(),
      newExamDate,
      useZebuTemplate
    );

    setIsCreateModalOpen(false);
    setNewTitle('');
    setNewDescription('');
    onRefresh();
  };

  const handleDeleteExam = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Supprimer l\'examen',
      message: 'Êtes-vous sûr de vouloir supprimer définitivement cet examen et toutes ses rubriques ?',
      confirmLabel: 'Supprimer l\'examen',
      variant: 'danger',
      action: () => {
        dataService.deleteExam(id);
        setSelectedExamForDetails(null);
        onRefresh();
      }
    });
  };

  const handleSaveRubrics = () => {
    if (!selectedExamForDetails) return;
    dataService.updateExamRubrics(selectedExamForDetails.id, rubricsDraft);
    onRefresh();
    handleOpenDetails(selectedExamForDetails);
  };

  const handleAddRubricToDraft = () => {
    const nextPos = rubricsDraft.length + 1;
    const newR: ExamRubric = {
      id: 'temp_' + Date.now(),
      exam_id: selectedExamForDetails?.id || '',
      position: nextPos,
      title: `Nuova rubrica ${nextPos}`,
      question: 'Domanda in italiano…',
      example_sentence: 'Frase modello attesa…',
      points: 1
    };
    setRubricsDraft([...rubricsDraft, newR]);
  };

  const handleRemoveRubricFromDraft = (index: number) => {
    const updated = rubricsDraft.filter((_, i) => i !== index).map((r, i) => ({ ...r, position: i + 1 }));
    setRubricsDraft(updated);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Gestion des Examens & Grilles de Rubriques
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Configurez les épreuves orales, définissez les critères en italien et personnalisez les barèmes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewTitle('Présentation orale — Lo zébu');
            setNewDescription('Évaluation de la description du zébu en 10 rubriques prédéfinies.');
            setUseZebuTemplate(true);
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg shadow-2xs transition-colors self-stretch sm:self-auto min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Créer un examen</span>
        </button>
      </div>

      {/* Grid of Exams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {exams.map((exam) => (
          <div
            key={exam.id}
            className="p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-amber-200 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded">
                  {exam.class_name}
                </span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded font-mono ${
                  exam.status === 'completed'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-emerald-50 text-emerald-800'
                }`}>
                  {exam.status === 'completed' ? 'Terminé' : 'En cours'}
                </span>
              </div>

              <h3 className="font-semibold text-slate-900 text-lg mb-1">
                {exam.title}
              </h3>
              <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                {exam.description || 'Aucune description spécifique.'}
              </p>

              <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 text-xs text-slate-600 mb-4 text-center sm:text-left">
                <div>
                  <span className="text-slate-400 block text-[10px] sm:text-[11px]">Date</span>
                  <span className="font-medium text-slate-800 text-[11px] sm:text-xs">{exam.exam_date}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] sm:text-[11px]">Rubriques</span>
                  <span className="font-semibold text-slate-800 font-mono text-[11px] sm:text-xs">
                    {exam.rubric_count || 10} rubr.
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] sm:text-[11px]">Barème max</span>
                  <span className="font-semibold text-amber-800 font-mono text-[11px] sm:text-xs">
                    {exam.max_score || 10} pts
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleOpenDetails(exam)}
                className="py-2.5 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors text-center min-h-[44px] flex items-center justify-center"
              >
                Rubriques ({exam.rubric_count || 10})
              </button>
              {onSelectExamForPassOrder && (
                <button
                  type="button"
                  onClick={() => onSelectExamForPassOrder(exam.id)}
                  className="flex-1 py-2.5 px-3 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 border border-amber-300/80 rounded-lg transition-colors text-center min-h-[44px] flex items-center justify-center gap-1.5"
                >
                  <Shuffle className="w-3.5 h-3.5 text-amber-900" />
                  <span>Ordre de passage</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onSelectExamForEvaluation(exam.id)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg shadow-xs transition-colors min-h-[44px]"
              >
                <span>Évaluer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Créer Examen */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-1">
              Créer un nouvel examen oral
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Définissez le sujet d'évaluation et choisissez d'appliquer le modèle des 10 rubriques.
            </p>

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Titre de l'examen <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Présentation orale — Lo zébu"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Classe concernée <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newClassId}
                    onChange={(e) => setNewClassId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date de l'épreuve
                  </label>
                  <input
                    type="date"
                    value={newExamDate}
                    onChange={(e) => setNewExamDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Consignes générales (facultatif)
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Ex: Présentation orale fluide de 3 minutes sans notes..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Template Choice */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useZebuTemplate}
                    onChange={(e) => setUseZebuTemplate(e.target.checked)}
                    className="mt-0.5 rounded text-amber-800 focus:ring-amber-800 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-semibold text-amber-950 block">
                      Appliquer le modèle officiel « Lo zébu » (10 rubriques)
                    </span>
                    <span className="text-[11px] text-amber-800/90 block leading-tight">
                      Charge automatiquement les 10 critères standardisés (Identificazione, Nome scientifico, Aspetto fisico, Habitat, ecc.) notés 1 point chacun (Note max : 10).
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex flex-col-reverse xs:flex-row justify-end gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-full xs:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-full xs:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg min-h-[44px]"
                >
                  Créer l'examen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gestion des Rubriques d'un Examen */}
      {selectedExamForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-4 sm:p-6 max-h-[90vh] flex flex-col">
            <div className="flex flex-col xs:flex-row xs:items-start justify-between pb-3 border-b border-slate-100 mb-3 gap-2">
              <div>
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                  Grille d'évaluation en italien
                </span>
                <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 mt-1">
                  {selectedExamForDetails.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Total : {rubricsDraft.length} rubriques · Barème total : {rubricsDraft.reduce((s, r) => s + (Number(r.points) || 1), 0)} points
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteExam(selectedExamForDetails.id)}
                className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1 p-2 rounded hover:bg-rose-50 self-start xs:self-auto min-h-[36px]"
              >
                <Trash2 className="w-4 h-4" />
                <span>Supprimer</span>
              </button>
            </div>

            {/* Rubrics List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {rubricsDraft.map((r, idx) => (
                <div
                  key={r.id || idx}
                  className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-500">
                      Rubrique #{r.position}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <label className="text-[11px] text-slate-500">Points :</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={r.points}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 1;
                            const copy = [...rubricsDraft];
                            copy[idx].points = val;
                            setRubricsDraft(copy);
                          }}
                          className="w-14 px-1.5 py-1 border border-slate-300 rounded font-mono text-center min-h-[32px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveRubricFromDraft(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Supprimer cette rubrique"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-0.5">
                        Titre en italien :
                      </label>
                      <input
                        type="text"
                        value={r.title}
                        onChange={(e) => {
                          const copy = [...rubricsDraft];
                          copy[idx].title = e.target.value;
                          setRubricsDraft(copy);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white min-h-[36px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-0.5">
                        Question / Consigne :
                      </label>
                      <input
                        type="text"
                        value={r.question}
                        onChange={(e) => {
                          const copy = [...rubricsDraft];
                          copy[idx].question = e.target.value;
                          setRubricsDraft(copy);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white min-h-[36px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-0.5">
                        Phrase attendue en italien :
                      </label>
                      <input
                        type="text"
                        value={r.example_sentence}
                        onChange={(e) => {
                          const copy = [...rubricsDraft];
                          copy[idx].example_sentence = e.target.value;
                          setRubricsDraft(copy);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white min-h-[36px]"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddRubricToDraft}
                className="w-full py-2.5 border border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors min-h-[44px]"
              >
                + Ajouter une rubrique personnalisée
              </button>
            </div>

            <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-between pt-3 border-t border-slate-100 mt-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedExamForDetails(null)}
                className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleSaveRubrics}
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg min-h-[44px]"
              >
                Enregistrer les modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => {
          if (confirmDialog.action) confirmDialog.action();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
