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
import { Exam, ClassRoom, ExamRubric, CEFR_LEVELS, CEFRLevel } from '../types';
import { dataService } from '../services/dataService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  StatusBadge
} from '../components/LearningCard';

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
  const [newExamLevel, setNewExamLevel] = useState<CEFRLevel | ''>('');

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

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newClassId) return;

    try {
      await dataService.createExam(newTitle.trim(), newClassId, newDescription.trim(), newExamDate, false, newExamLevel || null);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewExamLevel('');
      onRefresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "La création de l'examen a échoué.");
    }
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

  const handleSaveRubrics = async () => {
    if (!selectedExamForDetails) return;
    try {
      await dataService.updateExamRubrics(selectedExamForDetails.id, rubricsDraft);
      onRefresh();
      handleOpenDetails(selectedExamForDetails);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "L'enregistrement des rubriques a échoué.");
    }
  };

  const handleAddRubricToDraft = () => {
    const nextPos = Math.max(0, ...rubricsDraft.map(r => Number(r.position) || 0)) + 1;
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
    const updated = rubricsDraft.filter((_, i) => i !== index);
    setRubricsDraft(updated);
  };

  return (
    <div className="space-y-5 sm:space-y-7 max-w-6xl mx-auto w-full min-w-0">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#072a3f] tracking-tight">
            Gestion des Examens & Grilles de Rubriques
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Configurez les épreuves orales, définissez les critères en italien et personnalisez les barèmes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewTitle('');
            setNewDescription('');
            setNewExamLevel('');
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#072a3f] hover:bg-[#0b3c5d] active:bg-[#072a3f] rounded-xl shadow-2xs transition-colors self-stretch sm:self-auto min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Créer un examen</span>
        </button>
      </div>

      {/* Grid of Exams */}
      {exams.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#b7d3e4] bg-white/80 px-5 py-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f0f7] text-[#0b3c5d]"><BookOpen className="h-7 w-7" /></div>
          <h3 className="text-lg font-bold text-[#072a3f]">Aucun examen créé</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Créez une épreuve orale pour configurer ses rubriques et commencer les évaluations.</p>
          <button type="button" onClick={() => { setNewTitle(''); setNewDescription(''); setIsCreateModalOpen(true); }} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0b3c5d]"><Plus className="h-4 w-4" />Créer un examen</button>
        </div>
      ) : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 sm:gap-5">
        {exams.map((exam) => (
          <LearningCard key={exam.id} active={exam.status !== 'completed'}>
            <LearningCardHeader
              kicker={
                <>
                  {exam.class_name}
                  {exam.level ? ` · ${exam.level}` : ''}
                </>
              }
              status={
                <StatusBadge tone={exam.status === 'completed' ? 'neutral' : 'live'}>
                  {exam.status === 'completed' ? 'Terminé' : 'En cours'}
                </StatusBadge>
              }
            />

            <div className="min-w-0 space-y-1.5">
              <h3 className="break-words text-base font-extrabold leading-snug text-[#072a3f] sm:text-lg">
                {exam.title}
              </h3>
              <p className="line-clamp-2 text-xs leading-relaxed text-[#46657a] sm:text-[13px]">
                {exam.description || 'Aucune description spécifique.'}
              </p>
            </div>

            <LearningCardMetrics
              columns={3}
              items={[
                { label: 'Date', value: exam.exam_date },
                { label: 'Rubriques', value: `${exam.rubric_count ?? 0} rubr.` },
                { label: 'Barème max', value: `${exam.max_score ?? 0} pts`, tone: 'accent' }
              ]}
            />

            <LearningCardFooter>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => handleOpenDetails(exam)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#d8e6ee] bg-white px-3.5 py-2 text-xs font-bold text-[#46657a] transition-colors hover:bg-[#f5f9fc] hover:text-[#072a3f]"
                >
                  Rubriques ({exam.rubric_count ?? 0})
                </button>
                {onSelectExamForPassOrder && (
                  <button
                    type="button"
                    onClick={() => onSelectExamForPassOrder(exam.id)}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition-colors hover:bg-[#e6f0f7]"
                  >
                    <Shuffle className="h-3.5 w-3.5 text-[#0b3c5d]" />
                    <span>Ordre de passage</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectExamForEvaluation(exam.id)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#072a3f] px-4 py-2 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#0b3c5d]"
                >
                  <span>Évaluer</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </LearningCardFooter>
          </LearningCard>
        ))}
      </div>}

      {/* Modal Créer Examen */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-lg w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-1">
              Créer un nouvel examen oral
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Définissez librement le sujet et les consignes. Vous pourrez ensuite créer les rubriques adaptées à cet examen.
            </p>

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Titre de l'examen <span className="text-[#0b3c5d]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex. : Presentarsi, Ricette e cucina, La mia città…"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3c5d]/20 focus:border-[#0b3c5d] min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Classe concernée <span className="text-[#0b3c5d]">*</span>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Niveau (CECRL)</label>
                <select
                  value={newExamLevel}
                  onChange={(e) => setNewExamLevel(e.target.value as CEFRLevel | '')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white min-h-[44px]"
                >
                  <option value="">Non défini</option>
                  {CEFR_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
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

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#072a3f] hover:bg-[#0b3c5d] active:bg-[#072a3f] rounded-xl min-h-[44px]"
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
          <div className="bg-white rounded-[24px] shadow-2xl max-w-3xl w-full p-4 sm:p-6 max-h-[90vh] flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-3 border-b border-slate-100 mb-3 gap-2">
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
                <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  Niveau (CECRL)
                  <select
                    value={selectedExamForDetails.level || ''}
                    onChange={(e) => {
                      const level = e.target.value as CEFRLevel | '';
                      dataService.updateExam(selectedExamForDetails.id, { level: level || null });
                      setSelectedExamForDetails(previous => previous ? { ...previous, level: level || null } : previous);
                      onRefresh();
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value="">Non défini</option>
                    {CEFR_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteExam(selectedExamForDetails.id)}
                className="text-xs text-[#0b3c5d] hover:text-[#072a3f] inline-flex items-center gap-1 p-2 rounded hover:bg-[#e6f0f7] self-start sm:self-auto min-h-[36px]"
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
                  className="p-3 sm:p-4 border border-slate-200 rounded-2xl bg-[#f7fafc] space-y-2 text-xs"
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
                        className="text-slate-400 hover:text-[#0b3c5d] p-1.5 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Supprimer cette rubrique"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between pt-3 border-t border-slate-100 mt-3 gap-2">
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
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#072a3f] hover:bg-[#0b3c5d] active:bg-[#072a3f] rounded-xl min-h-[44px]"
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
