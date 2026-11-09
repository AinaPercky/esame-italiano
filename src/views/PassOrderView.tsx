import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shuffle, 
  UserCheck, 
  UserX, 
  Play, 
  RotateCcw, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  Mic,
  Users,
  PlusCircle,
  Sparkles
} from 'lucide-react';
import { ClassRoom, Exam, PassOrderItem, Student } from '../types';
import { dataService } from '../services/dataService';

interface PassOrderViewProps {
  classes: ClassRoom[];
  exams: Exam[];
  selectedExamId?: string;
  onEvaluateStudent: (examId: string, studentId: string) => void;
}

export const PassOrderView: React.FC<PassOrderViewProps> = ({
  classes,
  exams,
  selectedExamId: initialExamId,
  onEvaluateStudent
}) => {
  // 1. Classe sélectionnée
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialExamId) {
      const e = exams.find(x => x.id === initialExamId);
      if (e) return e.class_id;
    }
    return classes[0]?.id || '';
  });

  // 2. Examens disponibles pour cette classe
  const classExams = useMemo(() => {
    if (!selectedClassId) return exams;
    return exams.filter(e => e.class_id === selectedClassId);
  }, [exams, selectedClassId]);

  // 3. Examen actif sélectionné
  const [examId, setExamId] = useState<string>(() => {
    if (initialExamId && exams.some(e => e.id === initialExamId)) {
      return initialExamId;
    }
    return classExams[0]?.id || exams[0]?.id || '';
  });

  // Synchronisation lors du changement d'initialExamId
  useEffect(() => {
    if (initialExamId && initialExamId !== examId) {
      setExamId(initialExamId);
      const targetExam = exams.find(e => e.id === initialExamId);
      if (targetExam && targetExam.class_id !== selectedClassId) {
        setSelectedClassId(targetExam.class_id);
      }
    }
  }, [initialExamId]);

  // Synchronisation si la classe change et que l'examen actuel n'appartient pas à la classe
  useEffect(() => {
    if (classExams.length > 0) {
      if (!classExams.some(e => e.id === examId)) {
        setExamId(classExams[0].id);
      }
    } else {
      setExamId('');
    }
  }, [classExams, examId]);

  // 4. Ordre de passage de l'examen actuel
  const [passOrder, setPassOrder] = useState<PassOrderItem[]>([]);
  const [isConfirmShuffleOpen, setIsConfirmShuffleOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

  const refreshPassOrder = () => {
    if (examId) {
      setPassOrder(dataService.getPassOrder(examId));
    } else {
      setPassOrder([]);
    }
  };

  useEffect(() => {
    refreshPassOrder();
  }, [examId, exams, classes]);

  // Abonnement aux changements du dataService pour mise à jour instantanée
  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      refreshPassOrder();
    });
    return unsub;
  }, [examId]);

  const currentExam = exams.find(e => e.id === examId);
  const currentClass = classes.find(c => c.id === (currentExam?.class_id || selectedClassId));

  const handleExamChange = (newExamId: string) => {
    setExamId(newExamId);
    const targetExam = exams.find(e => e.id === newExamId);
    if (targetExam && targetExam.class_id !== selectedClassId) {
      setSelectedClassId(targetExam.class_id);
    }
    setPassOrder(dataService.getPassOrder(newExamId));
  };

  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    const matchingExams = exams.filter(e => e.class_id === newClassId);
    if (matchingExams.length > 0) {
      setExamId(matchingExams[0].id);
      setPassOrder(dataService.getPassOrder(matchingExams[0].id));
    } else {
      setExamId('');
      setPassOrder([]);
    }
  };

  const handleCreateDefaultExam = async () => {
    if (!selectedClassId) return;
    try {
      const newExam = await dataService.createExam(
        'Nouvel examen oral',
        selectedClassId,
        'Épreuve orale à configurer par l’enseignant.',
        new Date().toISOString().split('T')[0]
      );
      setExamId(newExam.id);
      setPassOrder(dataService.getPassOrder(newExam.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "La création de l'examen a échoué.");
    }
  };

  const handleShuffle = () => {
    if (!examId) return;
    const newOrder = dataService.randomizePassOrder(examId);
    setPassOrder(newOrder);
    setIsConfirmShuffleOpen(false);
  };

  const handleResetOriginal = () => {
    if (!examId) return;
    const newOrder = dataService.resetPassOrderToOriginal(examId);
    setPassOrder(newOrder);
    setIsConfirmResetOpen(false);
  };

  const handleStatusChange = (studentId: string, status: 'waiting' | 'current' | 'completed' | 'absent') => {
    if (!examId) return;
    dataService.updatePassOrderStatus(examId, studentId, status);
    setPassOrder(dataService.getPassOrder(examId));
  };

  const waitingCount = passOrder.filter(p => p.status === 'waiting' || p.status === 'current').length;
  const completedCount = passOrder.filter(p => p.status === 'completed').length;
  const absentCount = passOrder.filter(p => p.status === 'absent').length;

  const nextStudent = passOrder.find(p => p.status === 'waiting' || p.status === 'current');

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-16">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Ordre de Passage des Élèves</span>
            {passOrder.length > 0 && (
              <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full">
                {passOrder.length} candidat(s)
              </span>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Tirage au sort aléatoire et équitable. Suivez le passage des candidats en temps réel.
          </p>
        </div>

        {/* Barre de filtres Classe + Examen + Tirage */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* 1. Sélection de la Classe */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 min-h-[44px]">
            <Users className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-400 leading-tight">Classe</span>
              <select
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                aria-label="Sélectionner la classe"
                className="text-xs sm:text-sm font-semibold text-slate-800 bg-transparent border-0 p-0 focus:ring-0 cursor-pointer"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Sélection de l'Examen */}
          {classExams.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 min-h-[44px]">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400 leading-tight">Épreuve</span>
                <select
                  value={examId}
                  onChange={(e) => handleExamChange(e.target.value)}
                  aria-label="Sélectionner l'examen"
                  className="text-xs sm:text-sm font-semibold text-slate-800 bg-transparent border-0 p-0 focus:ring-0 cursor-pointer max-w-[200px] truncate"
                >
                  {classExams.map(e => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 3. Bouton Réinitialiser l'ordre des élèves selon l'ordre d'origine */}
          {passOrder.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (completedCount > 0) {
                  setIsConfirmResetOpen(true);
                } else {
                  handleResetOriginal();
                }
              }}
              title="Réinitialiser l'ordre de passage selon la liste d'origine"
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-center text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 sm:w-auto sm:text-sm"
            >
              <RotateCcw className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Réinitialiser l'ordre d'origine</span>
            </button>
          )}

          {/* 4. Bouton Tirage au sort */}
          {passOrder.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (completedCount > 0) {
                  setIsConfirmShuffleOpen(true);
                } else {
                  handleShuffle();
                }
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-800 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-900 active:bg-amber-950 sm:w-auto sm:text-sm"
            >
              <Shuffle className="w-4 h-4 shrink-0" />
              <span>Mélanger les élèves</span>
            </button>
          )}
        </div>
      </div>

      {/* État : Classe sans aucun examen */}
      {classExams.length === 0 && (
        <div className="p-8 bg-white border border-dashed border-amber-300 rounded-xl text-center space-y-4">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-800">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Aucun examen créé pour {currentClass?.name || 'cette classe'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Pour organiser l'ordre de passage, créez un examen oral puis configurez ses rubriques.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateDefaultExam}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Créer un examen oral</span>
          </button>
        </div>
      )}

      {/* État : Examen sans élèves */}
      {classExams.length > 0 && passOrder.length === 0 && (
        <div className="p-8 bg-white border border-dashed border-slate-300 rounded-xl text-center space-y-3">
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">
            Aucun élève trouvé dans la classe {currentClass?.name}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Ajoutez ou importez des élèves dans cette classe depuis l'onglet <strong>Élèves & Classes</strong> pour générer l'ordre de passage.
          </p>
        </div>
      )}

      {/* Spotlight: Prochain élève à passer */}
      {nextStudent && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-xs">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping" />
              Prochain candidat attendu (Ordre #{nextStudent.position})
            </span>
            <div className="text-lg sm:text-xl font-bold text-slate-900 font-display">
              {nextStudent.student_name}
            </div>
            <div className="text-xs text-slate-600">
              {nextStudent.student_number ? `Identifiant : ${nextStudent.student_number}` : 'Sans matricule'} · En attente de passage
            </div>
          </div>

          <button
            type="button"
            onClick={() => onEvaluateStudent(examId, nextStudent.student_id)}
            className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg shadow-xs transition-colors min-h-[44px] w-full sm:w-auto cursor-pointer"
          >
            <Mic className="w-4 h-4 text-amber-200" />
            <span>Évaluer cet élève</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Chips */}
      {passOrder.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
          <div className="p-2.5 sm:p-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <span className="text-[11px] sm:text-xs text-slate-500 block mb-0.5">En attente</span>
            <span className="font-mono text-lg sm:text-xl font-bold text-amber-800">{waitingCount}</span>
          </div>
          <div className="p-2.5 sm:p-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <span className="text-[11px] sm:text-xs text-slate-500 block mb-0.5">Déjà passés</span>
            <span className="font-mono text-lg sm:text-xl font-bold text-emerald-800">{completedCount}</span>
          </div>
          <div className="p-2.5 sm:p-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <span className="text-[11px] sm:text-xs text-slate-500 block mb-0.5">Absents (non évalués)</span>
            <span className="font-mono text-lg sm:text-xl font-bold text-rose-700">{absentCount}</span>
          </div>
        </div>
      )}

      {/* Règle d'épreuve : Les élèves absents ne participent pas à l'évaluation orale */}
      {absentCount > 0 && (
        <div className="px-3.5 py-2.5 bg-rose-50/80 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
          <span className="font-semibold">Règle de l'épreuve :</span>
          <span>Les {absentCount} élève(s) absent(s) ne participent pas à l'évaluation orale.</span>
        </div>
      )}

      {/* Mobile Card List (< sm) */}
      <div className="block sm:hidden space-y-2.5">
        {passOrder.map((item) => (
          <div
            key={item.id}
            className={`p-3.5 bg-white border rounded-lg shadow-2xs transition-colors ${
              item.status === 'completed'
                ? 'border-emerald-200 bg-emerald-50/20'
                : item.status === 'absent'
                  ? 'border-rose-200 bg-rose-50/20'
                  : 'border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center font-mono font-bold text-xs bg-slate-100 text-slate-700 rounded px-2 py-1 min-w-[28px]">
                  #{item.position}
                </span>
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">
                    {item.student_name}
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">
                    {item.student_number || 'Sans matricule'}
                  </span>
                </div>
              </div>

              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium font-mono ${
                item.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : item.status === 'absent'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
              }`}>
                {item.status === 'completed' ? 'Évalué' : item.status === 'absent' ? 'Absent' : 'En attente'}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <div className="text-xs">
                {item.evaluation_score !== null && item.evaluation_score !== undefined ? (
                  <span className="font-mono font-bold text-amber-900 text-sm">
                    Note : {item.evaluation_score} / 10
                  </span>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">Pas encore noté</span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {item.status !== 'waiting' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(item.student_id, 'waiting')}
                    className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded min-h-[36px] inline-flex items-center gap-1 cursor-pointer"
                    title="Réinitialiser cet élève (remettre en attente)"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>Réinit.</span>
                  </button>
                )}

                {item.status !== 'absent' ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(item.student_id, 'absent')}
                    className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded min-h-[36px]"
                  >
                    Absent
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(item.student_id, 'waiting')}
                    className="px-2.5 py-1.5 text-xs text-amber-800 hover:bg-amber-50 rounded min-h-[36px]"
                  >
                    Présent
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onEvaluateStudent(examId, item.student_id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded shadow-xs min-h-[36px]"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Noter</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop / Tablet Table View (>= sm) */}
      {passOrder.length > 0 && (
        <div className="hidden sm:block bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-16 text-center">Ordre</th>
                  <th className="py-3 px-4">Élève</th>
                  <th className="py-3 px-4">Identifiant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-center">Note</th>
                  <th className="py-3 px-4 text-right">Actions rapides</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {passOrder.map((item) => (
                  <tr 
                    key={item.id} 
                    className={`transition-colors ${
                      item.status === 'completed' 
                        ? 'bg-slate-50/50' 
                        : item.status === 'absent' 
                          ? 'bg-rose-50/20' 
                          : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                      #{item.position}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900 block">
                        {item.student_name}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">
                      {item.student_number || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        item.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'absent'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.status === 'completed' ? 'Évalué' : item.status === 'absent' ? 'Absent' : 'En attente'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-semibold">
                      {item.evaluation_score !== null && item.evaluation_score !== undefined ? (
                        <span className="text-amber-900">{item.evaluation_score} / 10</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEvaluateStudent(examId, item.student_id)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-amber-800 hover:bg-amber-900 rounded min-h-[32px] inline-flex items-center cursor-pointer"
                        >
                          Évaluer
                        </button>
                        {item.status !== 'waiting' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(item.student_id, 'waiting')}
                            className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded min-h-[32px] inline-flex items-center gap-1 cursor-pointer"
                            title="Réinitialiser le statut de cet élève (remettre en attente)"
                          >
                            <RotateCcw className="w-3 h-3 text-slate-500" />
                            <span>Réinitialiser</span>
                          </button>
                        )}
                        {item.status !== 'absent' ? (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(item.student_id, 'absent')}
                            className="px-2 py-1 text-xs text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded min-h-[32px] inline-flex items-center cursor-pointer"
                            title="Marquer absent"
                          >
                            Absent
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(item.student_id, 'waiting')}
                            className="px-2 py-1 text-xs text-slate-500 hover:text-amber-800 hover:bg-amber-50 rounded min-h-[32px] inline-flex items-center cursor-pointer"
                            title="Remettre en attente"
                          >
                            Présent
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal when exam is already started */}
      {isConfirmShuffleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-900 text-base mb-2">
              L'épreuve est déjà commencée !
            </h3>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              Certains élèves ont déjà été évalués ({completedCount} note(s) enregistrée(s)). 
              Voulez-vous vraiment remélanger l'ordre de passage ? Le statut et les notes existantes seront conservés.
            </p>
            <div className="flex flex-col-reverse xs:flex-row justify-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmShuffleOpen(false)}
                className="w-full xs:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleShuffle}
                className="w-full xs:w-auto px-4 py-2.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg min-h-[44px] cursor-pointer"
              >
                Confirmer le nouveau tirage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal when resetting pass order */}
      {isConfirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center mx-auto mb-4">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-900 text-base mb-2">
              Réinitialiser selon l'ordre d'origine ?
            </h3>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              Voulez-vous réinitialiser l'ordre de passage selon la liste d'origine des élèves ? 
              Les statuts et les notes déjà enregistrées seront conservés.
            </p>
            <div className="flex flex-col-reverse xs:flex-row justify-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmResetOpen(false)}
                className="w-full xs:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg min-h-[44px] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleResetOriginal}
                className="w-full xs:w-auto px-4 py-2.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg min-h-[44px] cursor-pointer"
              >
                Confirmer l'ordre d'origine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
