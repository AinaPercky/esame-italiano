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
import { ClassAssignmentPicker } from '../components/ClassAssignmentPicker';
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
  const [newClassIds, setNewClassIds] = useState<string[]>(classes[0]?.id ? [classes[0].id] : []);
  const [newExamGlobal, setNewExamGlobal] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newExamDate, setNewExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [newExamLevel, setNewExamLevel] = useState<CEFRLevel | ''>('');
  const [newDurationSeconds, setNewDurationSeconds] = useState(180);
  const [durationDraftSeconds, setDurationDraftSeconds] = useState(180);

  // Rubric Editing inside Details Modal
  const [rubricsDraft, setRubricsDraft] = useState<ExamRubric[]>([]);
  const [detailClassIds, setDetailClassIds] = useState<string[]>([]);
  const [detailExamGlobal, setDetailExamGlobal] = useState(false);
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
      setDetailClassIds(full.class_ids?.length ? full.class_ids : [full.class_id]);
      setDetailExamGlobal(Boolean(full.is_global));
      setDurationDraftSeconds(Number(full.duration_seconds) || 180);
      setEditingRubricIndex(null);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || (!newExamGlobal && newClassIds.length === 0)) return;

    try {
      await dataService.createExam(newTitle.trim(), newClassId || newClassIds[0] || classes[0]?.id || '', newDescription.trim(), newExamDate, false, newExamLevel || null, newDurationSeconds, newClassIds, newExamGlobal);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewExamLevel('');
      setNewClassIds(classes[0]?.id ? [classes[0].id] : []);
      setNewExamGlobal(false);
      setNewDurationSeconds(180);
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
    if (!detailExamGlobal && detailClassIds.length === 0) {
      window.alert('Sélectionnez au moins une classe ou choisissez « Toutes les classes ».');
      return;
    }
    try {
      await dataService.updateExam(selectedExamForDetails.id, {
        duration_seconds: durationDraftSeconds,
        class_ids: detailExamGlobal ? [] : detailClassIds,
        is_global: detailExamGlobal
      });
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
    setEditingRubricIndex(rubricsDraft.length);
  };

  const handleRemoveRubricFromDraft = (index: number) => {
    const updated = rubricsDraft.filter((_, i) => i !== index);
    setRubricsDraft(updated);
    if (editingRubricIndex !== null) setEditingRubricIndex(updated.length ? Math.min(editingRubricIndex, updated.length - 1) : null);
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
            setNewClassIds(classes[0]?.id ? [classes[0].id] : []);
            setNewExamGlobal(false);
            setNewDurationSeconds(180);
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
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${exam.is_global ? 'bg-[#eaf7ef] text-[#267447]' : 'bg-[#e6f0f7] text-[#0b3c5d]'}`}>
                    {exam.is_global ? 'Toutes les classes' : `${exam.class_ids?.length || 1} classe${(exam.class_ids?.length || 1) > 1 ? 's' : ''}`}
                  </span>
                  {exam.level ? <span>{exam.level}</span> : null}
                </span>
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
              <p className="flex items-start gap-1.5 pt-0.5 text-[11px] leading-relaxed text-slate-500">
                <span className="shrink-0 font-semibold text-[#0b3c5d]">Diffusion :</span>
                <span className="line-clamp-1">{exam.is_global ? 'Toutes les classes actuelles et futures' : (exam.class_name || 'Classe non renseignée')}</span>
              </p>
            </div>

            <LearningCardMetrics
              columns={3}
              items={[
                { label: 'Date', value: exam.exam_date },
                { label: 'Durée / candidat', value: `${Math.floor((Number(exam.duration_seconds) || 180) / 60)} min` },
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
                <div className="sm:col-span-2">
        <ClassAssignmentPicker
                  classes={classes}
                  selectedClassIds={newClassIds}
                  isGlobal={newExamGlobal}
                  onSelectedClassIdsChange={setNewClassIds}
                  onGlobalChange={setNewExamGlobal}
/>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Durée maximale par étudiant (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  step="1"
                  required
                  value={Math.floor(newDurationSeconds / 60)}
                  onChange={(e) => setNewDurationSeconds(Math.max(1, Math.min(120, Number(e.target.value) || 1)) * 60)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm min-h-[44px]"
                />
                <p className="mt-1 text-[11px] text-slate-500">Le compte à rebours sera réinitialisé pour chaque candidat. Valeur par défaut : 3 minutes.</p>
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
                  disabled={!newTitle.trim() || (!newExamGlobal && newClassIds.length === 0)}
                  className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#072a3f] hover:bg-[#0b3c5d] active:bg-[#072a3f] rounded-xl min-h-[44px] disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="my-auto flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-[24px] bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                  Grille d’évaluation en italien
                </span>
                <h3 className="mt-2 break-words font-display text-base font-bold text-[#072a3f] sm:text-lg">
                  {selectedExamForDetails.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {rubricsDraft.length} rubriques · Barème total : {rubricsDraft.reduce((s, r) => s + (Number(r.points) || 1), 0)} points
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteExam(selectedExamForDetails.id)}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Supprimer</span>
              </button>
            </div>

            <div className="shrink-0 space-y-3 border-b border-slate-100 py-3">
              <ClassAssignmentPicker
                classes={classes}
                selectedClassIds={detailClassIds}
                isGlobal={detailExamGlobal}
                onSelectedClassIdsChange={setDetailClassIds}
                onGlobalChange={setDetailExamGlobal}
                compact
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600">
                  <span>Niveau (CECRL)</span>
                  <select
                    value={selectedExamForDetails.level || ''}
                    onChange={(e) => {
                      const level = e.target.value as CEFRLevel | '';
                      void dataService.updateExam(selectedExamForDetails.id, { level: level || null })
                        .then(() => {
                          setSelectedExamForDetails(previous => previous ? { ...previous, level: level || null } : previous);
                          onRefresh();
                        })
                        .catch(error => window.alert(error instanceof Error ? error.message : 'Modification impossible.'));
                    }}
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                  >
                    <option value="">Non défini</option>
                    {CEFR_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600">
                  <span>Durée par candidat</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      step="1"
                      value={Math.floor(durationDraftSeconds / 60)}
                      onChange={(e) => setDurationDraftSeconds(Math.max(1, Math.min(120, Number(e.target.value) || 1)) * 60)}
                      className="min-h-9 w-16 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                    />
                    <span className="text-[11px] text-slate-500">min</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Rubric editor: list + focused form */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-3 lg:flex-row">
              <aside className="flex min-h-0 flex-col lg:w-[34%] lg:shrink-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-[#072a3f]">Rubriques de l’épreuve</h4>
                    <p className="text-[11px] text-slate-500">Sélectionnez une rubrique pour la modifier.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRubricToDraft}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#072a3f] px-3 text-xs font-bold text-white transition hover:bg-[#0b3c5d]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </button>
                </div>
                <div className="flex min-h-0 gap-2 overflow-x-auto pb-2 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1">
                  {rubricsDraft.map((r, idx) => (
                    <button
                      key={r.id || idx}
                      type="button"
                      onClick={() => setEditingRubricIndex(idx)}
                      aria-pressed={editingRubricIndex === idx}
                      className={`min-w-[210px] rounded-xl border p-3 text-left transition lg:min-w-0 ${editingRubricIndex === idx ? 'border-[#0b3c5d] bg-[#eef5f9] ring-1 ring-[#0b3c5d]/10' : 'border-slate-200 bg-white hover:border-[#b7d3e4] hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Rubrique {idx + 1}</span>
                        <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-[#0b3c5d]">{Number(r.points) || 0} pt{Number(r.points) === 1 ? '' : 's'}</span>
                      </div>
                      <p className="mt-1 truncate text-xs font-bold text-[#072a3f]">{r.title || 'Sans titre'}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{r.question || 'Aucune consigne renseignée'}</p>
                    </button>
                  ))}
                  {rubricsDraft.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center">
                      <ListOrdered className="mx-auto h-6 w-6 text-slate-400" />
                      <p className="mt-2 text-xs font-semibold text-slate-600">Aucune rubrique</p>
                      <p className="mt-1 text-[11px] text-slate-500">Ajoutez votre première rubrique pour construire la grille.</p>
                    </div>
                  )}
                </div>
              </aside>

              <section className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-[#f8fafc] p-3 sm:p-4">
                {editingRubricIndex !== null && rubricsDraft[editingRubricIndex] ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e6f0f7] text-[#0b3c5d]"><Edit3 className="h-4 w-4" /></span>
                        <div>
                          <h4 className="text-sm font-bold text-[#072a3f]">Modifier la rubrique</h4>
                          <p className="text-[11px] text-slate-500">Rubrique {editingRubricIndex + 1} sur {rubricsDraft.length}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={editingRubricIndex === 0} onClick={() => setEditingRubricIndex(i => i === null ? null : i - 1)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-35" title="Rubrique précédente">←</button>
                        <button type="button" disabled={editingRubricIndex >= rubricsDraft.length - 1} onClick={() => setEditingRubricIndex(i => i === null ? null : i + 1)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-35" title="Rubrique suivante">→</button>
                        <button type="button" onClick={() => {
                          const index = editingRubricIndex;
                          handleRemoveRubricFromDraft(index);
                          setEditingRubricIndex(rubricsDraft.length <= 1 ? null : Math.max(0, index - 1));
                        }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-3.5 w-3.5" /><span>Supprimer</span>
                        </button>
                      </div>
                    </div>
                    {(() => {
                      const r = rubricsDraft[editingRubricIndex];
                      const update = (patch: Partial<ExamRubric>) => setRubricsDraft(current => current.map((item, index) => index === editingRubricIndex ? { ...item, ...patch } : item));
                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                            <label className="block text-xs font-semibold text-slate-700">
                              Titre de la rubrique <span className="text-rose-500">*</span>
                              <input type="text" value={r.title} onChange={e => update({ title: e.target.value })} placeholder="Ex. Presentarsi" className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/10" />
                            </label>
                            <label className="block text-xs font-semibold text-slate-700">
                              Barème
                              <span className="mt-1.5 flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-2">
                                <input type="number" min="0" step="0.5" value={r.points} onChange={e => update({ points: Math.max(0, Number(e.target.value) || 0) })} className="w-full border-0 bg-transparent text-sm font-bold text-[#072a3f] outline-none" />
                                <span className="text-xs text-slate-400">pts</span>
                              </span>
                            </label>
                          </div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Question / Consigne
                            <textarea rows={3} value={r.question} onChange={e => update({ question: e.target.value })} placeholder="Décrivez ce que le candidat doit faire…" className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal leading-relaxed text-slate-800 outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/10" />
                          </label>
                          <label className="block text-xs font-semibold text-slate-700">
                            Exemple de réponse attendue (italien)
                            <textarea rows={3} value={r.example_sentence} onChange={e => update({ example_sentence: e.target.value })} placeholder="Ex. Vorrei visitare Roma perché…" className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal leading-relaxed text-slate-800 outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/10" />
                          </label>
                          <p className="rounded-lg border border-[#d8e6ee] bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                            Conseil : formulez une consigne observable et un exemple adapté au niveau CECRL de l’examen.
                          </p>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
                    <ListOrdered className="h-8 w-8 text-slate-300" />
                    <h4 className="mt-3 text-sm font-bold text-[#072a3f]">Aucune rubrique sélectionnée</h4>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">Choisissez une rubrique dans la liste ou ajoutez-en une nouvelle pour modifier ses informations.</p>
                    <button type="button" onClick={handleAddRubricToDraft} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#072a3f] px-4 text-xs font-bold text-white hover:bg-[#0b3c5d]"><Plus className="h-4 w-4" /> Ajouter une rubrique</button>
                  </div>
                )}
              </section>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-2 text-xs">
              <span className="text-slate-500">{rubricsDraft.length} rubrique(s) · Total : <strong className="text-[#072a3f]">{rubricsDraft.reduce((s, r) => s + (Number(r.points) || 0), 0)} points</strong></span>
              <span className="text-[10px] text-slate-400">Les changements ne sont pas enregistrés avant validation.</span>
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
                disabled={!detailExamGlobal && detailClassIds.length === 0}
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#072a3f] hover:bg-[#0b3c5d] active:bg-[#072a3f] rounded-xl min-h-[44px] disabled:cursor-not-allowed disabled:opacity-40"
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
