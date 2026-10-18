import React, { useState, useEffect, useMemo } from 'react';
import { 
  Check, 
  X, 
  Save, 
  RotateCcw, 
  ArrowRight, 
  Mic, 
  Award, 
  Clock, 
  Sparkles, 
  Info, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2, 
  Timer,
  Shuffle,
  AlertCircle,
  UserX,
  QrCode
} from 'lucide-react';
import { ClassRoom, Exam, Student, ExamRubric, Evaluation } from '../types';
import { dataService } from '../services/dataService';
import { SpeechTimer } from '../components/SpeechTimer';
import { StudentQRCodeModal } from '../components/StudentQRCodeModal';

const ANIMAL_SUGGESTIONS = [
  'Il lupo',
  'L\'aquila',
  'Il delfino',
  'Il leone',
  'La tigre',
  'Il cavallo',
  'La volpe',
  'Il panda',
  'L\'elefante',
  'Il gatto',
  'Il cane',
  'Il pinguino',
  'L\'orso',
  'Il cervo'
];

interface OralEvaluationViewProps {
  classes: ClassRoom[];
  exams: Exam[];
  students: Student[];
  initialExamId?: string;
  initialStudentId?: string;
  onEvaluationSaved: () => void;
  onNavigateToPassOrder: (examId: string) => void;
}

export const OralEvaluationView: React.FC<OralEvaluationViewProps> = ({
  classes,
  exams,
  students,
  initialExamId,
  initialStudentId,
  onEvaluationSaved,
  onNavigateToPassOrder
}) => {
  // 1. Sélection de la classe
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialExamId) {
      const e = exams.find(x => x.id === initialExamId);
      if (e) return e.class_id;
    }
    return classes[0]?.id || '';
  });

  // 2. Sélection de l'examen
  const availableExams = useMemo(() => {
    return exams.filter(e => e.class_id === selectedClassId);
  }, [exams, selectedClassId]);

  const [selectedExamId, setSelectedExamId] = useState<string>(() => {
    if (initialExamId && exams.some(e => e.id === initialExamId && e.class_id === selectedClassId)) {
      return initialExamId;
    }
    const matching = exams.filter(e => e.class_id === selectedClassId);
    return matching[0]?.id || '';
  });

  // 3. Ordre de passage officiel et élèves classés selon cet ordre
  const classStudents = useMemo(() => {
    return students.filter(s => s.class_id === selectedClassId);
  }, [students, selectedClassId]);

  const passOrderItems = useMemo(() => {
    return selectedExamId ? dataService.getPassOrder(selectedExamId) : [];
  }, [selectedExamId]);

  // Identifier les élèves absents (exclus de l'épreuve orale)
  const absentStudents = useMemo(() => {
    return classStudents.filter(s => {
      const po = passOrderItems.find(p => p.student_id === s.id);
      return po?.status === 'absent';
    });
  }, [classStudents, passOrderItems]);

  // Candidats participant à l'épreuve orale (excluant strictement les absents)
  const orderedStudents = useMemo(() => {
    const participating = classStudents.filter(s => {
      const po = passOrderItems.find(p => p.student_id === s.id);
      return po?.status !== 'absent';
    });

    return participating.sort((a, b) => {
      const poA = passOrderItems.find(po => po.student_id === a.id);
      const poB = passOrderItems.find(po => po.student_id === b.id);
      const posA = poA ? poA.position : 9999;
      const posB = poB ? poB.position : 9999;
      return posA - posB;
    });
  }, [classStudents, passOrderItems]);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    if (initialStudentId) {
      const isAbsent = passOrderItems.find(p => p.student_id === initialStudentId)?.status === 'absent';
      if (!isAbsent && classStudents.some(s => s.id === initialStudentId)) {
        return initialStudentId;
      }
    }
    return orderedStudents[0]?.id || '';
  });

  // State pour les rubriques cochées { [rubric_id]: boolean }
  const [validatedRubrics, setValidatedRubrics] = useState<Record<string, boolean>>({});
  // Formulaire de saisie d'erreur par rubrique { [rubric_id]: string }
  const [errorNotes, setErrorNotes] = useState<Record<string, string>>({});
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  // Animal présenté par cet élève
  const [presentedAnimal, setPresentedAnimal] = useState<string>('Il lupo');
  const [isQRModalOpen, setIsQRModalOpen] = useState<boolean>(false);

  // Gestion du temps de parole (Section 5.3)
  const [initialElapsedSeconds, setInitialElapsedSeconds] = useState<number>(0);
  const [timingData, setTimingData] = useState<{
    durationUsedSeconds: number;
    maxDurationSeconds: number;
    timerStatus: 'completed' | 'stopped_manually' | 'not_timed';
    isExpired: boolean;
  }>({
    durationUsedSeconds: 0,
    maxDurationSeconds: 180,
    timerStatus: 'not_timed',
    isExpired: false
  });

  // Synchronisation lors de la réception de props initiales (navigation depuis ordre de passage)
  useEffect(() => {
    if (initialExamId && initialExamId !== selectedExamId) {
      setSelectedExamId(initialExamId);
      const ex = exams.find(e => e.id === initialExamId);
      if (ex && ex.class_id !== selectedClassId) {
        setSelectedClassId(ex.class_id);
      }
    }
  }, [initialExamId, exams]);

  useEffect(() => {
    if (initialStudentId && initialStudentId !== selectedStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  // Synchronisation lors du changement d'examen
  useEffect(() => {
    if (availableExams.length > 0 && !availableExams.some(e => e.id === selectedExamId)) {
      setSelectedExamId(availableExams[0].id);
    }
  }, [availableExams, selectedExamId]);

  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    const matching = exams.filter(e => e.class_id === newClassId);
    if (matching.length > 0) {
      setSelectedExamId(matching[0].id);
    } else {
      setSelectedExamId('');
    }
  };

  const handleCreateExamForClass = () => {
    if (!selectedClassId) return;
    const targetClass = classes.find(c => c.id === selectedClassId);
    const className = targetClass ? targetClass.name : 'Classe';
    const newExam = dataService.createExam(
      `Présentation orale — Gli Animali (Sujet libre)`,
      selectedClassId,
      `Épreuve orale de description d'un animal au choix en italien (${className}).`,
      new Date().toISOString().split('T')[0],
      true
    );
    setSelectedExamId(newExam.id);
    onEvaluationSaved();
  };

  // Synchronisation de l'élève lors du changement de classe, examen ou ordre de passage
  useEffect(() => {
    if (orderedStudents.length === 0) return;
    const exists = orderedStudents.some(s => s.id === selectedStudentId);
    if (!exists) {
      // Trouver de préférence le premier candidat en attente selon l'ordre de passage
      const firstWaiting = orderedStudents.find(s => {
        const isEval = dataService.getEvaluations(selectedExamId, undefined, s.id).length > 0;
        const po = passOrderItems.find(p => p.student_id === s.id);
        return !isEval && po?.status !== 'absent';
      });
      setSelectedStudentId(firstWaiting?.id || orderedStudents[0].id);
    }
  }, [orderedStudents, selectedStudentId, selectedExamId, passOrderItems]);

  // Chargement de l'évaluation existante pour cet élève et cet examen
  const currentExam = selectedExamId ? dataService.getExamById(selectedExamId) : undefined;
  const rubrics: ExamRubric[] = currentExam?.rubrics || [];

  useEffect(() => {
    if (!selectedExamId || !selectedStudentId) return;

    const evals = dataService.getEvaluations(selectedExamId, undefined, selectedStudentId);
    const existing = evals[0];

    const studentIndex = students.findIndex(s => s.id === selectedStudentId);
    const fallbackSuggestedAnimal = ANIMAL_SUGGESTIONS[(studentIndex >= 0 ? studentIndex : 0) % ANIMAL_SUGGESTIONS.length];

    if (existing && existing.details) {
      const vMap: Record<string, boolean> = {};
      const eMap: Record<string, string> = {};
      existing.details.forEach(d => {
        const note = d.error_note || '';
        eMap[d.rubric_id] = note;
        // Règle : si une erreur est renseignée, la rubrique n'est PAS validée
        vMap[d.rubric_id] = note.trim().length > 0 ? false : Boolean(d.is_validated);
      });
      setValidatedRubrics(vMap);
      setErrorNotes(eMap);
      setPresentedAnimal(existing.presented_animal || fallbackSuggestedAnimal);
      setIsSaved(true);
      const usedSecs = existing.duration_used_seconds || 0;
      setInitialElapsedSeconds(usedSecs);
      setTimingData({
        durationUsedSeconds: usedSecs,
        maxDurationSeconds: existing.max_duration_seconds || 180,
        timerStatus: existing.timer_status || (usedSecs > 0 ? 'stopped_manually' : 'not_timed'),
        isExpired: usedSecs >= (existing.max_duration_seconds || 180)
      });
    } else {
      // Nouvelle évaluation : tout décoché par défaut et formulaires d'erreurs vierges
      const vMap: Record<string, boolean> = {};
      const eMap: Record<string, string> = {};
      rubrics.forEach(r => {
        vMap[r.id] = false;
        eMap[r.id] = '';
      });
      setValidatedRubrics(vMap);
      setErrorNotes(eMap);
      setPresentedAnimal(fallbackSuggestedAnimal);
      setIsSaved(false);
      setInitialElapsedSeconds(0);
      setTimingData({
        durationUsedSeconds: 0,
        maxDurationSeconds: 180,
        timerStatus: 'not_timed',
        isExpired: false
      });
    }
    setSaveSuccessMessage(null);
  }, [selectedExamId, selectedStudentId]);

  // Saisie d'une erreur dans le formulaire de la rubrique
  // RÈGLE DEMANDÉE : Dès que ce formulaire est rempli, la rubrique n'est PAS validée (décochée)
  const handleErrorNoteChange = (rubricId: string, text: string) => {
    setErrorNotes(prev => ({
      ...prev,
      [rubricId]: text
    }));
    setIsSaved(false);
    setSaveSuccessMessage(null);

    if (text.trim().length > 0) {
      // Dès qu'une erreur est présente, la rubrique est immédiatement non-validée
      setValidatedRubrics(prev => ({
        ...prev,
        [rubricId]: false
      }));
    }
  };

  // Effacer l'erreur d'une rubrique
  const handleClearError = (rubricId: string) => {
    setErrorNotes(prev => ({
      ...prev,
      [rubricId]: ''
    }));
    setIsSaved(false);
    setSaveSuccessMessage(null);
  };

  // Toggle une rubrique (cocher / décocher)
  const handleToggleRubric = (rubricId: string) => {
    const willBeChecked = !validatedRubrics[rubricId];

    if (willBeChecked) {
      // Si l'enseignant valide manuellement cette rubrique, l'erreur est réinitialisée
      if (errorNotes[rubricId]?.trim()) {
        setErrorNotes(prev => ({
          ...prev,
          [rubricId]: ''
        }));
      }
    }

    setValidatedRubrics(prev => ({
      ...prev,
      [rubricId]: willBeChecked
    }));
    setIsSaved(false);
    setSaveSuccessMessage(null);
  };

  // Actions de masse
  const handleValidateAll = () => {
    const vMap: Record<string, boolean> = {};
    const eMap: Record<string, string> = {};
    rubrics.forEach(r => {
      vMap[r.id] = true;
      eMap[r.id] = '';
    });
    setValidatedRubrics(vMap);
    setErrorNotes(eMap);
    setIsSaved(false);
  };

  const handleResetAll = () => {
    const vMap: Record<string, boolean> = {};
    rubrics.forEach(r => {
      vMap[r.id] = false;
    });
    setValidatedRubrics(vMap);
    setIsSaved(false);
  };

  const handleClearAllErrors = () => {
    const eMap: Record<string, string> = {};
    rubrics.forEach(r => {
      eMap[r.id] = '';
    });
    setErrorNotes(eMap);
    setIsSaved(false);
  };

  // CALCUL AUTOMATIQUE DE LA NOTE (Section 5.1)
  // RÈGLE : Une rubrique avec erreur saisie n'est JAMAIS validée (0 point)
  const totalRubricsCount = rubrics.length;
  let liveScore = 0;
  let validatedCount = 0;
  let errorsCount = 0;

  rubrics.forEach(r => {
    const hasError = Boolean(errorNotes[r.id]?.trim());
    if (hasError) {
      errorsCount++;
    }
    const isVal = !hasError && Boolean(validatedRubrics[r.id]);
    if (isVal) {
      liveScore += Number(r.points) || 1;
      validatedCount++;
    }
  });

  const maxScore = rubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);
  const remainingCount = totalRubricsCount - validatedCount;
  const percentage = maxScore > 0 ? Math.round((liveScore / maxScore) * 100) : 0;

  // Enregistrement de l'évaluation (Section 5.2 & 5.3)
  const handleSaveEvaluation = () => {
    if (!selectedExamId || !selectedStudentId) return;

    dataService.saveEvaluation(
      selectedExamId, 
      selectedStudentId, 
      validatedRubrics, 
      {
        duration_used_seconds: timingData.durationUsedSeconds,
        max_duration_seconds: timingData.maxDurationSeconds,
        timer_status: timingData.timerStatus
      },
      errorNotes,
      presentedAnimal
    );
    setIsSaved(true);
    const m = Math.floor(timingData.durationUsedSeconds / 60);
    const s = timingData.durationUsedSeconds % 60;
    const timeFormatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    setSaveSuccessMessage(`Évaluation enregistrée : ${liveScore} / ${maxScore} points (${percentage} %) · Animal : « ${presentedAnimal} » · Temps : ${timeFormatted}`);
    onEvaluationSaved();

    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 4500);
  };

  // Calcul de l'index de l'élève actuel dans l'ordre de passage
  const currentStudentIndex = orderedStudents.findIndex(s => s.id === selectedStudentId);
  const currentStudent = orderedStudents.find(s => s.id === selectedStudentId) || orderedStudents[0];
  const currentPassOrderItem = passOrderItems.find(po => po.student_id === currentStudent?.id);

  // Passer à l'élève suivant selon l'ordre officiel de passage
  const handleNextStudent = () => {
    if (orderedStudents.length === 0) return;
    if (currentStudentIndex >= 0 && currentStudentIndex < orderedStudents.length - 1) {
      setSelectedStudentId(orderedStudents[currentStudentIndex + 1].id);
    } else {
      // Trouver le prochain élève en attente de passage
      const nextWaiting = orderedStudents.find(s => {
        const isEval = dataService.getEvaluations(selectedExamId, undefined, s.id).length > 0;
        return !isEval && s.id !== selectedStudentId;
      });
      if (nextWaiting) {
        setSelectedStudentId(nextWaiting.id);
      } else {
        setSaveSuccessMessage("Tous les élèves de la liste ont été passés en revue selon l'ordre de passage officiel !");
        setTimeout(() => setSaveSuccessMessage(null), 4000);
      }
    }
  };

  // Revenir à l'élève précédent selon l'ordre officiel de passage
  const handlePreviousStudent = () => {
    if (orderedStudents.length === 0) return;
    if (currentStudentIndex > 0) {
      setSelectedStudentId(orderedStudents[currentStudentIndex - 1].id);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-36 sm:pb-28">
      {/* Bannière de rappel Ordre de passage officiel */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
        <div className="flex items-center gap-2.5 text-xs text-amber-950 font-medium">
          <span className="p-1.5 bg-amber-200/80 rounded-md text-amber-900 shrink-0">
            <Shuffle className="w-3.5 h-3.5" />
          </span>
          <span>
            <strong>Classement par ordre de passage :</strong> Les candidats sont classés selon l'ordre de tirage officiel ({orderedStudents.length} élèves).
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNavigateToPassOrder(selectedExamId)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:text-amber-800 bg-white hover:bg-amber-100/60 border border-amber-200/80 px-2.5 py-1.5 rounded-lg shadow-2xs transition-colors self-start sm:self-auto shrink-0 min-h-[36px]"
        >
          <span>Gérer l'ordre de passage</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 1. Zone de Sélection (Classe -> Examen -> Élève selon l'ordre) */}
      <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-amber-800" />
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Session d'Évaluation Orale en Direct
            </h2>
          </div>
          <button
            onClick={() => onNavigateToPassOrder(selectedExamId)}
            className="text-xs font-semibold text-amber-900 hover:text-amber-800 flex items-center gap-1 self-start xs:self-auto min-h-[32px]"
          >
            <span>Voir tirage complet</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-1">
          {/* Sélection Classe */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              1. Classe :
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => handleClassChange(e.target.value)}
              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Sélection Examen */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              2. Examen oral :
            </label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 min-h-[44px]"
            >
              {availableExams.length === 0 ? (
                <option value="">Aucun examen disponible</option>
              ) : (
                availableExams.map(e => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))
              )}
            </select>
          </div>

          {/* Sélection Élève - Strictement classé selon l'ordre de passage (Participants uniquement) */}
          <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-600">
                3. Candidat ({orderedStudents.length} participant{orderedStudents.length > 1 ? 's' : ''}) :
              </label>
              <div className="flex items-center gap-1.5">
                {absentStudents.length > 0 && (
                  <span className="text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-mono" title={`${absentStudents.length} élève(s) absent(s) exclu(s) de l'examen`}>
                    {absentStudents.length} absent{absentStudents.length > 1 ? 's' : ''} exclu{absentStudents.length > 1 ? 's' : ''}
                  </span>
                )}
                {currentPassOrderItem && orderedStudents.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full font-mono">
                    #{currentPassOrderItem.position}
                  </span>
                )}
              </div>
            </div>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={orderedStudents.length === 0}
              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 font-semibold text-slate-900 min-h-[44px] disabled:opacity-50"
            >
              {orderedStudents.length === 0 ? (
                <option value="">
                  {classStudents.length === 0 ? 'Aucun élève dans cette classe' : 'Tous les élèves sont absents (aucun participant)'}
                </option>
              ) : (
                orderedStudents.map((s, idx) => {
                  const po = passOrderItems.find(p => p.student_id === s.id);
                  const isEval = dataService.getEvaluations(selectedExamId, undefined, s.id).length > 0;
                  const evalItem = isEval ? dataService.getEvaluations(selectedExamId, undefined, s.id)[0] : null;
                  const orderNum = po?.position ?? (idx + 1);
                  return (
                    <option key={s.id} value={s.id}>
                      #{orderNum} — {s.first_name} {s.last_name} {isEval ? `✓ (Noté : ${evalItem?.total_score}/${maxScore})` : '⏳ (En attente)'}
                    </option>
                  );
                })
              )}
            </select>
          </div>
        </div>
      </div>

      {/* État : Classe sans aucun examen */}
      {availableExams.length === 0 && (
        <div className="p-8 bg-white border border-dashed border-amber-300 rounded-xl text-center space-y-4 shadow-2xs">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-800">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Aucun examen d'évaluation pour cette classe
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Pour évaluer les {classStudents.length} élève(s) de cette classe, générez l'épreuve orale « Lo zébu » avec la grille des 10 critères en 1 clic.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateExamForClass}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Créer l'examen oral « Lo zébu »</span>
          </button>
        </div>
      )}

      {/* État : Classe sans élèves */}
      {availableExams.length > 0 && classStudents.length === 0 && (
        <div className="p-8 bg-white border border-dashed border-slate-300 rounded-xl text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">
            Aucun élève dans cette classe
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Rendez-vous dans l'onglet <strong>Élèves & Classes</strong> pour ajouter ou importer des candidats.
          </p>
        </div>
      )}

      {/* État : Tous les élèves de la classe sont absents */}
      {availableExams.length > 0 && classStudents.length > 0 && orderedStudents.length === 0 && (
        <div className="p-8 bg-white border border-dashed border-rose-300 rounded-xl text-center space-y-4 shadow-2xs">
          <div className="w-12 h-12 bg-rose-50 text-rose-700 rounded-full flex items-center justify-center mx-auto">
            <UserX className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="font-semibold text-slate-900 text-base">
              Tous les élèves sont marqués absents ({classStudents.length} absent{classStudents.length > 1 ? 's' : ''})
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Les élèves absents sont exclus de l'évaluation orale. Rendez-vous dans l'Ordre de passage pour marquer un élève présent si nécessaire.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToPassOrder(selectedExamId)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Shuffle className="w-4 h-4" />
            <span>Gérer les présences dans l'Ordre de passage</span>
          </button>
        </div>
      )}

      {/* 2. Candidate Spotlight & Subject Visual Card */}
      {currentStudent && currentExam && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-amber-50">
              <img 
                src="/src/assets/images/zebu_study_illustration_1790527533886.webp" 
                alt="Illustration du sujet d'examen oral" 
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[10px] sm:text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  Passage #{currentPassOrderItem?.position || (currentStudentIndex + 1)} sur {orderedStudents.length}
                </span>
                {isSaved ? (
                  <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Évaluation enregistrée ({liveScore}/{maxScore} pts)</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>En attente de notation</span>
                  </span>
                )}
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                {currentStudent.first_name} {currentStudent.last_name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentExam.title} · {currentStudent.student_number ? `Matricule : ${currentStudent.student_number}` : 'Sans matricule'} · {currentExam.class_name}
              </p>

              {/* Navigation rapide entre candidats selon l'ordre de passage */}
              <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handlePreviousStudent}
                  disabled={currentStudentIndex <= 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded-md transition-colors min-h-[34px]"
                  title="Candidat précédent dans l'ordre de passage"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Précédent</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextStudent}
                  disabled={currentStudentIndex >= orderedStudents.length - 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 disabled:pointer-events-none rounded-md transition-colors min-h-[34px]"
                  title="Candidat suivant dans l'ordre de passage"
                >
                  <span>Suivant dans l'ordre</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Live Score Display Card (Section 5.1) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:px-5 flex items-center gap-6 justify-between sm:justify-end">
            <div className="text-left sm:text-right">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Note en temps réel
              </span>
              <div className="flex items-baseline gap-1 font-mono font-bold text-2xl sm:text-3xl text-amber-900">
                <span>{liveScore}</span>
                <span className="text-slate-400 font-normal text-base">/{maxScore}</span>
              </div>
            </div>

            <div className="border-l border-slate-200 pl-4 space-y-0.5 text-xs">
              <div className="text-slate-600">
                Validées : <strong className="font-mono text-emerald-700">{validatedCount}</strong> / {totalRubricsCount}
              </div>
              <div className="text-slate-600">
                Restantes : <strong className="font-mono text-slate-500">{remainingCount}</strong>
              </div>
              <div className="text-slate-600">
                Réussite : <strong className="font-mono text-amber-800">{percentage}%</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chronomètre de Parole (3 minutes / 180s - Section 5.3) */}
      <SpeechTimer
        key={`timer_${selectedExamId}_${selectedStudentId}`}
        maxSeconds={180}
        initialElapsedSeconds={initialElapsedSeconds}
        onTimeChange={setTimingData}
      />

      {/* 2.1 Saisie de l'animal présenté & Code QR élève */}
      {currentStudent && currentExam && (
        <div className="bg-amber-50/75 border border-amber-200/90 rounded-xl p-4 sm:p-5 space-y-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-800 shrink-0" />
                <h4 className="text-xs sm:text-sm font-bold text-amber-950 uppercase tracking-wide">
                  Animal présenté par {currentStudent.first_name} :
                </h4>
              </div>
              <p className="text-xs text-amber-800/85 mt-0.5">
                Chaque élève présente un animal différent en italien. Ce titre figurera sur sa fiche et son Code QR.
              </p>
            </div>

            <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
              <input
                type="text"
                value={presentedAnimal}
                onChange={(e) => {
                  setPresentedAnimal(e.target.value);
                  setIsSaved(false);
                }}
                placeholder="ex: Il lupo, L'aquila, Il leone..."
                className="w-full min-w-0 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-800/30 sm:w-60 sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setIsQRModalOpen(true)}
                className="inline-flex min-h-11 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-amber-800 px-3 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-amber-900 sm:w-auto"
                title="Afficher et imprimer le Code QR de cet élève"
              >
                <QrCode className="w-3.5 h-3.5 text-amber-200" />
                <span>Code QR</span>
              </button>
            </div>
          </div>

          {/* Suggestions de choix rapides */}
          <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-amber-900/70 uppercase mr-1">
              Choix rapides :
            </span>
            {ANIMAL_SUGGESTIONS.map(animal => (
              <button
                key={animal}
                type="button"
                onClick={() => {
                  setPresentedAnimal(animal);
                  setIsSaved(false);
                }}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                  presentedAnimal === animal
                    ? 'bg-amber-800 text-white font-semibold shadow-2xs'
                    : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-200'
                }`}
              >
                {animal}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Banner */}
      {saveSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-900 text-xs font-semibold flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>{saveSuccessMessage}</span>
          </div>
          <button
            onClick={handleNextStudent}
            className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-800 text-white rounded text-xs hover:bg-emerald-900"
          >
            <span>Passer à l'élève suivant</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. The 10 Rubrics Assessment Checklist (Heart of App) */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/75">
          <div>
            <h4 className="font-semibold text-slate-900 text-sm">
              Grille d'évaluation orale en 10 rubriques
            </h4>
            <p className="text-xs text-slate-500">
              Cochez les rubriques maîtrisées par l'élève en italien pendant son élocution. 1 clic par critère.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs flex-wrap">
            <button
              onClick={handleValidateAll}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded font-medium transition-colors cursor-pointer"
            >
              Tout valider
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={handleResetAll}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded font-medium transition-colors cursor-pointer"
            >
              Tout décocher
            </button>
            {errorsCount > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <button
                  onClick={handleClearAllErrors}
                  className="px-2.5 py-1 text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded font-medium transition-colors cursor-pointer"
                  title="Effacer le texte d'erreur sur toutes les rubriques"
                >
                  Effacer les {errorsCount} erreur(s)
                </button>
              </>
            )}
          </div>
        </div>

        {/* Rubrics Checklist Items */}
        <div className="divide-y divide-slate-100">
          {rubrics.map((rubric) => {
            const hasError = Boolean(errorNotes[rubric.id]?.trim());
            // Si une erreur est saisie, la rubrique n'est PAS validée
            const isChecked = !hasError && Boolean(validatedRubrics[rubric.id]);
            const pts = Number(rubric.points) || 1;

            return (
              <div
                key={rubric.id}
                onClick={() => handleToggleRubric(rubric.id)}
                className={`p-4 transition-colors select-none cursor-pointer ${
                  hasError 
                    ? 'bg-rose-50/30 hover:bg-rose-50/50 border-l-4 border-l-rose-500' 
                    : isChecked 
                      ? 'bg-amber-50/40 hover:bg-amber-50/60 border-l-4 border-l-amber-700' 
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1">
                    {/* Big Checkbox Affordance */}
                    <div className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                      isChecked 
                        ? 'bg-amber-800 border-amber-800 text-white shadow-2xs' 
                        : hasError
                          ? 'border-rose-400 bg-rose-100 text-rose-700'
                          : 'border-slate-300 bg-white hover:border-amber-700'
                    }`}>
                      {isChecked ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : hasError ? (
                        <X className="w-4 h-4 stroke-[3]" />
                      ) : null}
                    </div>

                    {/* Rubric Content */}
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-slate-400">
                          #{rubric.position}
                        </span>
                        <span className={`text-sm font-semibold transition-colors ${
                          hasError 
                            ? 'text-rose-950 font-bold'
                            : isChecked 
                              ? 'text-amber-950 font-bold' 
                              : 'text-slate-900'
                        }`}>
                          {rubric.title}
                        </span>
                        {hasError && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.2 rounded-full font-mono">
                            Non validée (erreur saisie)
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600">
                        <span className="text-slate-500 font-medium">Domanda : </span>
                        <span className="italic">{rubric.question}</span>
                      </div>

                      <div className="text-xs text-slate-700">
                        <span className="text-slate-500 font-medium">Phrase attendue : </span>
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                          {rubric.example_sentence}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Points Badge */}
                  <div className="shrink-0 text-right">
                    <span className={`font-mono text-xs font-semibold px-2 py-1 rounded inline-block transition-colors ${
                      isChecked 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : hasError
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isChecked ? `+${pts} pt` : `0 pt`}
                    </span>
                  </div>
                </div>

                {/* Formulaire de saisie d'erreur de l'utilisateur pour cette rubrique */}
                <div 
                  className="mt-3 pt-2.5 border-t border-slate-200/80 cursor-default" 
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                      <AlertCircle className={`w-3.5 h-3.5 ${hasError ? 'text-rose-600' : 'text-slate-400'}`} />
                      <span>Saisie d'erreur (si ce champ est rempli, la rubrique n'est pas validée) :</span>
                    </label>
                    {hasError ? (
                      <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1 self-start sm:self-auto">
                        <X className="w-3 h-3 stroke-[3]" />
                        <span>Erreur notée → 0 point</span>
                      </span>
                    ) : isChecked ? (
                      <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full self-start sm:self-auto">
                        ✓ Aucune erreur · Validée (+{pts} pt)
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={errorNotes[rubric.id] || ''}
                        onChange={(e) => handleErrorNoteChange(rubric.id, e.target.value)}
                        placeholder="Saisir l'erreur commise (ex: oubli de l'auxiliaire, accord grammatical incorrect, vocabulaire erroné...)"
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border transition-all focus:outline-none ${
                          hasError
                            ? 'border-rose-400 bg-rose-50/70 text-rose-950 font-medium placeholder-rose-300 focus:ring-2 focus:ring-rose-500/20'
                            : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 hover:border-slate-400 focus:border-amber-800 focus:ring-2 focus:ring-amber-800/10'
                        }`}
                      />
                    </div>
                    {hasError && (
                      <button
                        type="button"
                        onClick={() => handleClearError(rubric.id)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-lg shrink-0 transition-colors cursor-pointer"
                        title="Effacer cette erreur pour autoriser la validation de la rubrique"
                      >
                        Effacer
                      </button>
                    )}
                  </div>
                  {hasError && (
                    <p className="text-[10px] text-rose-700 mt-1 font-medium flex items-center gap-1">
                      <span>⚠️ Rubrique non validée en raison de l'erreur saisie.</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky Bottom Action Bar for Speed during Real Oral Exam */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 sm:px-8 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:py-3 shadow-lg no-print">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="font-display font-bold text-slate-900 text-sm hidden md:flex items-center gap-1.5 truncate max-w-[200px]">
              <span className="text-xs text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded font-mono font-semibold shrink-0">
                #{currentPassOrderItem?.position || (currentStudentIndex + 1)}
              </span>
              <span className="truncate">
                {currentStudent ? `${currentStudent.first_name} ${currentStudent.last_name}` : 'Évaluation'}
              </span>
            </div>
            <div className="flex items-baseline gap-1 font-mono font-bold text-lg sm:text-xl text-amber-900 shrink-0">
              <span>{liveScore}</span>
              <span className="text-slate-400 font-normal text-xs sm:text-sm">/{maxScore} pts</span>
            </div>
            <span className="text-[11px] sm:text-xs text-slate-500 hidden sm:inline font-mono">
              ({validatedCount}/{totalRubricsCount})
            </span>
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 bg-slate-100 rounded text-[11px] sm:text-xs font-mono text-slate-700">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
              <span>
                {Math.floor(timingData.durationUsedSeconds / 60).toString().padStart(2, '0')}:{(timingData.durationUsedSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={handlePreviousStudent}
              disabled={currentStudentIndex <= 0}
              className="inline-flex items-center justify-center p-2 sm:px-2.5 sm:py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors min-h-[44px]"
              title="Candidat précédent dans l'ordre"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden lg:inline">Précédent</span>
            </button>

            <button
              onClick={handleSaveEvaluation}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg shadow-sm transition-all min-h-[44px]"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{isSaved ? 'Mettre à jour' : 'Enregistrer'}</span>
            </button>

            <button
              onClick={handleNextStudent}
              className="inline-flex items-center justify-center gap-1 px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
              title="Candidat suivant selon l'ordre"
            >
              <span className="hidden xs:inline">Suivant</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Code QR de l'Élève */}
      {currentStudent && currentExam && (
        <StudentQRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          student={currentStudent}
          exam={currentExam}
          evaluation={dataService.getEvaluations(selectedExamId, undefined, selectedStudentId)[0]}
        />
      )}
    </div>
  );
};
