import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Play, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Trash2, 
  Edit3, 
  Sparkles, 
  Save, 
  X, 
  Award, 
  Calendar, 
  Flame, 
  ListChecks, 
  Check, 
  RefreshCw,
  HelpCircle,
  Eye,
  StopCircle,
  TrendingUp,
  FileText,
  BarChart3,
  Trophy
} from 'lucide-react';
import { Quiz, QuizQuestion, ClassRoom, Student, QuizSubmission, DailyGrade } from '../types';
import { dataService } from '../services/dataService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ClassLeaderboard } from '../components/ClassLeaderboard';

interface QuizzesAdminViewProps {
  classes: ClassRoom[];
  students: Student[];
  onRefresh?: () => void;
}

export const QuizzesAdminView: React.FC<QuizzesAdminViewProps> = ({
  classes,
  students,
  onRefresh
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [dailyGrades, setDailyGrades] = useState<DailyGrade[]>([]);
  const [activeTab, setActiveTab] = useState<'quizzes' | 'leaderboard'>('quizzes');

  // In-app Confirm Dialog State (remplace window.confirm pour éviter l'erreur de sandbox iframe)
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

  // Modal / Formulaire d'édition de Quiz
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);


  // Form State
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizTargetClassId, setQuizTargetClassId] = useState(classes[0]?.id || '');
  const [quizDuration, setQuizDuration] = useState(10);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  // Vue détail / Suivi en direct d'un quiz
  const [activeTrackingQuizId, setActiveTrackingQuizId] = useState<string | null>(null);
  const [activeAnalyticsQuizId, setActiveAnalyticsQuizId] = useState<string | null>(null);

  // JSON Import Modal State
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [jsonImportSuccess, setJsonImportSuccess] = useState<string | null>(null);

  const handleProcessJsonImport = (e: React.FormEvent) => {
    e.preventDefault();
    setJsonImportError(null);
    setJsonImportSuccess(null);
    try {
      const parsed = JSON.parse(rawJsonInput);
      if (!parsed.title || !Array.isArray(parsed.questions)) {
        setJsonImportError('Format JSON invalide : le JSON doit contenir au moins "title" et un tableau "questions".');
        return;
      }
      
      const importedQuestions: QuizQuestion[] = parsed.questions.map((q: any, i: number) => ({
        id: `q_imported_${Date.now()}_${i}`,
        type: q.type === 'text' ? 'text' : 'qcm',
        question: q.question || '',
        options: q.type === 'text' ? undefined : (q.options || ['', '', '', '']),
        correct_answer: q.correct_answer || '',
        points: Number(q.points) || 5,
        explanation: q.explanation || ''
      }));

      dataService.createQuiz({
        title: parsed.title,
        description: parsed.description || '',
        class_id: selectedClassId || classes[0]?.id || '',
        duration_minutes: Number(parsed.duration_minutes) || 10,
        questions: importedQuestions
      });

      setJsonImportSuccess('Quiz importé avec succès depuis le fichier JSON !');
      setTimeout(() => {
        setIsJsonModalOpen(false);
        setRawJsonInput('');
        setJsonImportSuccess(null);
      }, 1200);

      loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setJsonImportError('Erreur lors du décodage du JSON : ' + err.message);
    }
  };

  const loadData = () => {
    const qList = dataService.getQuizzes(selectedClassId || undefined);
    const subList = dataService.getQuizSubmissions();
    const dgList = dataService.getDailyGrades(selectedClassId || undefined);
    setQuizzes(qList);
    setSubmissions(subList);
    setDailyGrades(dgList);
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(loadData);
    // Interval de rafraîchissement automatique toutes les 15s pour le décompte de 1h
    const timer = setInterval(loadData, 15000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [selectedClassId]);

  const handleOpenCreate = () => {
    setEditingQuiz(null);
    setQuizTitle('');
    setQuizDescription('');
    setQuizTargetClassId(selectedClassId || classes[0]?.id || '');
    setQuizDuration(10);
    setQuestions([
      {
        id: `q_${Date.now()}_1`,
        type: 'qcm',
        question: '',
        options: ['', '', '', ''],
        correct_answer: '',
        points: 5,
        explanation: ''
      }
    ]);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setQuizTitle(quiz.title);
    setQuizDescription(quiz.description || '');
    setQuizTargetClassId(quiz.class_id);
    setQuizDuration(quiz.duration_minutes || 10);
    setQuestions(quiz.questions ? JSON.parse(JSON.stringify(quiz.questions)) : []);
    setIsEditorOpen(true);
  };

  const handleAddQuestion = (type: 'qcm' | 'text') => {
    const newQ: QuizQuestion = {
      id: `q_${Date.now()}_${questions.length + 1}`,
      type,
      question: '',
      options: type === 'qcm' ? ['', '', '', ''] : undefined,
      correct_answer: '',
      points: 5,
      explanation: ''
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleSaveQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!quizTitle.trim()) {
      setFormError('Veuillez renseigner un titre pour le quiz.');
      return;
    }
    if (questions.length === 0) {
      setFormError('Veuillez ajouter au moins une question.');
      return;
    }

    // Validation des questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        setFormError(`La question #${i + 1} n'a pas d'énoncé.`);
        return;
      }
      if (!q.correct_answer.trim()) {
        setFormError(`Veuillez renseigner la bonne réponse pour la question #${i + 1}.`);
        return;
      }
    }

    if (editingQuiz) {
      dataService.updateQuiz(editingQuiz.id, {
        title: quizTitle,
        description: quizDescription,
        class_id: quizTargetClassId,
        duration_minutes: quizDuration,
        questions
      });
    } else {
      dataService.createQuiz({
        title: quizTitle,
        description: quizDescription,
        class_id: quizTargetClassId,
        duration_minutes: quizDuration,
        questions
      });
    }

    setIsEditorOpen(false);
    loadData();
    if (onRefresh) onRefresh();
  };

  const handleDeleteQuiz = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Supprimer le Quiz',
      message: 'Êtes-vous sûr de vouloir supprimer définitivement ce quiz et toutes ses soumissions associées ?',
      confirmLabel: 'Supprimer définitivement',
      variant: 'danger',
      action: () => {
        dataService.deleteQuiz(id);
        loadData();
        if (onRefresh) onRefresh();
      }
    });
  };

  const handleLaunchQuiz = (quizId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Lancer le Quiz en Direct',
      message: 'Lancer ce quiz dès maintenant pour tous les élèves de la classe ?\nIl sera accessible pendant exactement 1 heure pour les élèves.',
      confirmLabel: 'Lancer le Quiz (1h)',
      variant: 'success',
      action: () => {
        dataService.launchQuiz(quizId);
        loadData();
        if (onRefresh) onRefresh();
      }
    });
  };

  const handleCloseQuiz = (quizId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Clôturer le Quiz',
      message: 'Clôturer ce quiz immédiatement ?\nTout élève n\'ayant pas composé dans le temps imparti recevra la note de 0/20.',
      confirmLabel: 'Clôturer maintenant',
      variant: 'warning',
      action: () => {
        dataService.closeQuiz(quizId);
        loadData();
        if (onRefresh) onRefresh();
      }
    });
  };

  // Calcul du temps restant pour un quiz lancé (< 1h)
  const getRemainingLaunchTime = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expiré (1h écoulée)';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  };

  const trackingQuiz = activeTrackingQuizId 
    ? quizzes.find(q => q.id === activeTrackingQuizId) 
    : null;

  const trackingSubmissions = trackingQuiz 
    ? submissions.filter(s => s.quiz_id === trackingQuiz.id) 
    : [];

  const classStudents = students.filter(s => s.class_id === (trackingQuiz?.class_id || selectedClassId));

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-800">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
                Gestion des Quiz & Évaluations Directes
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                PerckyLingua
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Créez des quiz (QCM ou texte), lancez-les en direct avec une fenêtre de 1 heure. Notes cumulées journalières calculées automatiquement.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsJsonModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Importer JSON</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Quiz</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs: Quiz & Leaderboard */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('quizzes')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'quizzes'
              ? 'bg-amber-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Gestion des Quiz ({quizzes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'leaderboard'
              ? 'bg-amber-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-500" />
          <span>Leaderboard en Temps Réel</span>
        </button>
      </div>

      {/* VIEW: LEADERBOARD EN TEMPS RÉEL */}
      {activeTab === 'leaderboard' && (
        <ClassLeaderboard
          dailyGrades={dailyGrades}
          classes={classes}
          students={students}
          initialClassId={selectedClassId}
          isStudentView={false}
        />
      )}

      {/* VIEW: GESTION DES QUIZ */}
      {activeTab === 'quizzes' && (
        <>
          {/* Class Selector & Stats Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Filtrer par classe
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Toutes les classes</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 rounded-xl text-amber-800">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Quiz Total</div>
            <div className="text-xl font-bold font-mono text-slate-900">{quizzes.length}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-800">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Quiz en Direct (Actifs)</div>
            <div className="text-xl font-bold font-mono text-emerald-700">
              {quizzes.filter(q => q.status === 'launched').length}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-xl text-blue-800">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Copies Corrigées</div>
            <div className="text-xl font-bold font-mono text-blue-700">
              {submissions.filter(s => s.status === 'completed').length}
            </div>
          </div>
        </div>
      </div>

      {/* Main Quizzes List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: List of Quizzes */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-800" />
              <span>Liste des Quiz créés ({quizzes.length})</span>
            </h2>
          </div>

          {quizzes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-3">
              <HelpCircle className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">Aucun quiz disponible pour le moment</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Cliquez sur « Nouveau Quiz » pour créer une première évaluation avec des questions de type QCM ou réponse saisie.
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl"
              >
                Créer un premier quiz
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {quizzes.map((quiz) => {
                const isLive = quiz.status === 'launched';
                const isClosed = quiz.status === 'closed';
                const remaining = isLive ? getRemainingLaunchTime(quiz.expires_at) : null;
                const quizSubs = submissions.filter(s => s.quiz_id === quiz.id);

                return (
                  <div
                    key={quiz.id}
                    className={`bg-white rounded-2xl p-5 border transition-all ${
                      isLive 
                        ? 'border-emerald-500 shadow-md ring-2 ring-emerald-500/20' 
                        : 'border-slate-200 shadow-2xs hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                            {quiz.class_name || 'Classe'}
                          </span>

                          {isLive && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-emerald-600" />
                              <span>EN DIRECT • {remaining}</span>
                            </span>
                          )}

                          {isClosed && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                              Clôturé (Notes de 0 appliquées aux retardataires)
                            </span>
                          )}

                          {quiz.status === 'draft' && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                              Brouillon
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-900 text-base">{quiz.title}</h3>
                        {quiz.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">{quiz.description}</p>
                        )}
                      </div>

                      <div className="text-right sm:shrink-0 text-xs font-mono text-slate-500">
                        <div>{quiz.questions?.length || 0} questions</div>
                        <div>Barème : {quiz.total_points || 20} pts</div>
                        <div>Durée élève : {quiz.duration_minutes || 10} min</div>
                      </div>
                    </div>

                    {/* Progress Bar / Submissions count */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span><strong>{quizSubs.length}</strong> élève(s) ayant composé</span>
                        {quizSubs.length > 0 && (
                          <span className="text-slate-400">• Moyenne : <strong>{(quizSubs.reduce((a, b) => a + b.score_20, 0) / quizSubs.length).toFixed(1)}/20</strong></span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveAnalyticsQuizId(quiz.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                          title="Dashboard Data Analysis & Bilan des notions"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>Data Analysis</span>
                        </button>

                        {quiz.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleLaunchQuiz(quiz.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                            title="Lancer le quiz pour la classe pendant 1 heure"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Lancer le Quiz (1h)</span>
                          </button>
                        )}

                        {isLive && (
                          <>
                            <button
                              type="button"
                              onClick={() => setActiveTrackingQuizId(quiz.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Suivre en direct</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCloseQuiz(quiz.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                              title="Clôturer le quiz maintenant"
                            >
                              <StopCircle className="w-3.5 h-3.5" />
                              <span>Clôturer</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(quiz)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Modifier le quiz"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteQuiz(quiz.id)}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Supprimer le quiz"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Live Tracking & Daily Grades Cumulative Overview */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Tracking Panel */}
          {trackingQuiz ? (
            <div className="bg-white rounded-2xl p-5 border border-amber-300 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[11px] font-bold uppercase text-amber-800 tracking-wider">Suivi en temps réel</span>
                  <h3 className="font-bold text-slate-900 text-sm">{trackingQuiz.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTrackingQuizId(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-600 space-y-1">
                <p>Classe : <strong>{trackingQuiz.class_name}</strong></p>
                <p>Temps restant sur la session d'1 heure : <strong className="text-emerald-700 font-mono">{getRemainingLaunchTime(trackingQuiz.expires_at)}</strong></p>
              </div>

              {/* Roster participation checklist */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">Participation des élèves :</div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border rounded-xl">
                  {classStudents.map(st => {
                    const sub = trackingSubmissions.find(s => s.student_id === st.id);
                    return (
                      <div key={st.id} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900">{st.first_name} {st.last_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">N° {st.student_number || '1'}</div>
                        </div>

                        <div>
                          {sub ? (
                            sub.status === 'completed' ? (
                              <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-100 text-emerald-800">
                                {sub.score_20}/20
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded font-mono font-bold bg-rose-100 text-rose-800">
                                0/20 (Non fait)
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-amber-700 font-medium animate-pulse">
                              En attente...
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* Daily Grades Recap Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-800" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Notes Journalières Cumulées ({dailyGrades.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Moyenne des quiz du jour</span>
            </div>

            <p className="text-xs text-slate-500">
              Chaque quiz passé dans la journée est automatiquement cumulé pour former la <strong>note journalière</strong> de l'élève.
            </p>

            {dailyGrades.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                Aucune note journalière enregistrée pour le moment.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1 divide-y divide-slate-100">
                {dailyGrades.map((dg, idx) => (
                  <div key={`${dg.student_id}_${dg.date}_${idx}`} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{dg.student_name}</div>
                      <div className="text-[10px] text-slate-500">
                        {dg.date} • {dg.quizzes_count} quiz passé(s)
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                        dg.average_score_20 >= 14 
                          ? 'bg-emerald-100 text-emerald-900' 
                          : dg.average_score_20 >= 10 
                            ? 'bg-amber-100 text-amber-900' 
                            : 'bg-rose-100 text-rose-900'
                      }`}>
                        {dg.average_score_20} / 20
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </>
  )}

      {/* IN-APP CONFIRM DIALOG */}
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

      {/* MODAL ÉDITEUR DE QUIZ */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
            
            {/* Modal Header */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-800" />
                <h2 className="font-display font-bold text-lg text-slate-900">
                  {editingQuiz ? 'Modifier le Quiz' : 'Créer un Nouveau Quiz'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveQuiz} className="p-6 space-y-6">
              
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-700 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Titre du Quiz *</label>
                  <input
                    type="text"
                    required
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    placeholder="ex: Vocabolario: Gli Animali (Test Rapido)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Classe cible *</label>
                  <select
                    value={quizTargetClassId}
                    onChange={(e) => setQuizTargetClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Durée de composition pour l'élève (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={quizDuration}
                    onChange={(e) => setQuizDuration(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Description / Consignes</label>
                  <textarea
                    rows={2}
                    value={quizDescription}
                    onChange={(e) => setQuizDescription(e.target.value)}
                    placeholder="Consignes à destination des étudiants..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Questions Section */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Questions du Quiz ({questions.length})</h3>
                    <p className="text-[11px] text-slate-500">Ajoutez des questions QCM ou des questions à réponse textuelle saisie.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddQuestion('qcm')}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      + Ajouter QCM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddQuestion('text')}
                      className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      + Ajouter Réponse Saisie
                    </button>
                  </div>
                </div>

                {questions.map((q, idx) => (
                  <div key={q.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-800 text-white font-mono font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          {q.type === 'qcm' ? 'QCM (Choix Multiple)' : 'Réponse Saisie (Texte)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-xs">
                          <label className="text-slate-500 font-bold">Barème :</label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={q.points}
                            onChange={(e) => {
                              const updated = [...questions];
                              updated[idx].points = Number(e.target.value);
                              setQuestions(updated);
                            }}
                            className="w-14 bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-center font-bold"
                          />
                          <span className="text-slate-400">pts</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(idx)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Question Statement */}
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Énoncé de la question..."
                        value={q.question}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[idx].question = e.target.value;
                          setQuestions(updated);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs font-semibold text-slate-900"
                      />
                    </div>

                    {/* Options if QCM */}
                    {q.type === 'qcm' && (
                      <div className="space-y-2 pt-1">
                        <label className="text-[11px] font-bold text-slate-600">Options de réponses (Cochez la bonne réponse) :</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(q.options || ['', '', '', '']).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                              <input
                                type="radio"
                                name={`correct_${q.id}`}
                                checked={q.correct_answer === opt && opt !== ''}
                                onChange={() => {
                                  const updated = [...questions];
                                  updated[idx].correct_answer = opt;
                                  setQuestions(updated);
                                }}
                                className="text-amber-800 focus:ring-amber-500"
                              />
                              <input
                                type="text"
                                placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                value={opt}
                                onChange={(e) => {
                                  const updated = [...questions];
                                  if (!updated[idx].options) updated[idx].options = ['', '', '', ''];
                                  const oldOpt = updated[idx].options![optIdx];
                                  updated[idx].options![optIdx] = e.target.value;
                                  if (updated[idx].correct_answer === oldOpt) {
                                    updated[idx].correct_answer = e.target.value;
                                  }
                                  setQuestions(updated);
                                }}
                                className="w-full text-xs font-medium border-0 focus:ring-0 p-0"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Text Expected Answer if type === 'text' */}
                    {q.type === 'text' && (
                      <div className="space-y-1 pt-1">
                        <label className="text-[11px] font-bold text-slate-600">Réponse attendue ou mot-clé obligatoire :</label>
                        <input
                          type="text"
                          required
                          placeholder="ex: aquila, mare, siamo..."
                          value={q.correct_answer}
                          onChange={(e) => {
                            const updated = [...questions];
                            updated[idx].correct_answer = e.target.value;
                            setQuestions(updated);
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-900"
                        />
                      </div>
                    )}

                    {/* Explanation */}
                    <div>
                      <input
                        type="text"
                        placeholder="Explication pédagogique affichée lors de la correction (optionnel)..."
                        value={q.explanation || ''}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[idx].explanation = e.target.value;
                          setQuestions(updated);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-[11px] text-slate-600 italic"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Enregistrer le Quiz</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL IMPORT JSON & MODÈLE */}
      {isJsonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
            
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-800" />
                <h2 className="font-display font-bold text-lg text-slate-900">
                  Importer un Quiz complet au format JSON
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessJsonImport} className="p-6 space-y-4">
              {jsonImportError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-700 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{jsonImportError}</span>
                </div>
              )}

              {jsonImportSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{jsonImportSuccess}</span>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Modèle du format JSON à suivre :</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const templateStr = JSON.stringify({
                          title: "Vocabolario: Il cibo italiano",
                          description: "Test rapide sur le vocabulaire gastronomique",
                          duration_minutes: 10,
                          questions: [
                            {
                              type: "qcm",
                              question: "Quel est le plat national italien ?",
                              options: ["Pizza", "Pasta", "Risotto", "Polenta"],
                              correct_answer: "Pasta",
                              points: 5,
                              explanation: "La pasta est un incontournable."
                            },
                            {
                              type: "text",
                              question: "Comment dit-on 'bonjour' le matin en italien ?",
                              correct_answer: "Buongiorno",
                              points: 5,
                              explanation: "Buon giorno."
                            }
                          ]
                        }, null, 2);
                        navigator.clipboard.writeText(templateStr);
                        setCopiedSuccess(true);
                        setTimeout(() => setCopiedSuccess(false), 2500);
                      }}
                      className="text-[11px] text-amber-800 hover:text-amber-900 font-bold underline cursor-pointer flex items-center gap-1"
                    >
                      {copiedSuccess ? (
                        <span className="text-emerald-700 font-bold">✓ Modèle copié !</span>
                      ) : (
                        <span>Copier le modèle</span>
                      )}
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const templateStr = JSON.stringify({
                          title: "Vocabolario: Il cibo italiano",
                          description: "Test rapide sur le vocabulaire gastronomique",
                          duration_minutes: 10,
                          questions: [
                            {
                              type: "qcm",
                              question: "Quel est le plat national italien ?",
                              options: ["Pizza", "Pasta", "Risotto", "Polenta"],
                              correct_answer: "Pasta",
                              points: 5,
                              explanation: "La pasta est un incontournable."
                            },
                            {
                              type: "text",
                              question: "Comment dit-on 'bonjour' le matin en italien ?",
                              correct_answer: "Buongiorno",
                              points: 5,
                              explanation: "Buon giorno."
                            }
                          ]
                        }, null, 2);
                        setRawJsonInput(templateStr);
                      }}
                      className="text-[11px] text-amber-800 hover:text-amber-900 font-bold underline cursor-pointer"
                    >
                      Utiliser ce modèle
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Copiez ce modèle ou cliquez sur &quot;Utiliser ce modèle&quot;, remplissez vos questions (types <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">qcm</code> ou <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">text</code>).
                </p>
                <pre className="bg-slate-900 text-slate-200 p-3 rounded-xl text-[10px] font-mono overflow-x-auto max-h-48 select-all">
{JSON.stringify({
  title: "Vocabolario: Il cibo italiano",
  description: "Test rapide sur le vocabulaire gastronomique",
  duration_minutes: 10,
  questions: [
    {
      type: "qcm",
      question: "Quel est le plat national italien ?",
      options: ["Pizza", "Pasta", "Risotto", "Polenta"],
      correct_answer: "Pasta",
      points: 5,
      explanation: "La pasta est un incontournable."
    },
    {
      type: "text",
      question: "Comment dit-on 'bonjour' le matin en italien ?",
      correct_answer: "Buongiorno",
      points: 5,
      explanation: "Buon giorno."
    }
  ]
}, null, 2)}
                </pre>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Collez votre JSON ici *</label>
                <textarea
                  required
                  rows={8}
                  value={rawJsonInput}
                  onChange={(e) => setRawJsonInput(e.target.value)}
                  placeholder="Collez le code JSON complet du quiz ici..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsJsonModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Importer et Créer le Quiz</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL DASHBOARD DATA ANALYSIS QUIZ */}
      {activeAnalyticsQuizId && (() => {
        const aq = quizzes.find(q => q.id === activeAnalyticsQuizId);
        if (!aq) return null;
        const subs = submissions.filter(s => s.quiz_id === aq.id);
        const totalSubs = subs.length;
        const avgScore20 = totalSubs > 0 ? (subs.reduce((a, b) => a + b.score_20, 0) / totalSubs).toFixed(1) : '0';
        const successRate = totalSubs > 0 ? Math.round((subs.filter(s => s.score_20 >= 10).length / totalSubs) * 100) : 0;

        const questionStats = (aq.questions || []).map((q, qIdx) => {
          let correctCount = 0;
          subs.forEach(sub => {
            const fb = sub.feedback?.[q.id];
            if (fb?.correct) {
              correctCount++;
            }
          });
          const qRate = totalSubs > 0 ? Math.round((correctCount / totalSubs) * 100) : 0;
          return {
            ...q,
            index: qIdx + 1,
            correctCount,
            successRate: qRate
          };
        });

        const sortedByDifficulty = [...questionStats].sort((a, b) => a.successRate - b.successRate);
        const weakestQuestion = sortedByDifficulty[0];
        const strongestQuestion = sortedByDifficulty[sortedByDifficulty.length - 1];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
              
              <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display font-bold text-lg text-slate-900">
                        Dashboard Data Analysis : {aq.title}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800">
                        {aq.class_name || 'Classe'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Analyse pédagogique des points forts, notions incomprises et performance des élèves.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAnalyticsQuizId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-bold uppercase text-slate-400">Copies Soumises</div>
                    <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{totalSubs}</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-bold uppercase text-slate-400">Moyenne de la Classe</div>
                    <div className="text-2xl font-bold font-mono text-indigo-700 mt-1">{avgScore20}/20</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-bold uppercase text-slate-400">Taux de Réussite (≥ 10/20)</div>
                    <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{successRate}%</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-bold uppercase text-slate-400">Durée Impartie</div>
                    <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{aq.duration_minutes || 10} min</div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-md space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-300" />
                    <h3 className="font-bold text-sm tracking-wide">Synthèse Pédagogique Intelligente</h3>
                  </div>
                  <p className="text-xs text-indigo-100 leading-relaxed">
                    {totalSubs === 0 ? (
                      "Aucun élève n'a encore soumis ce quiz. Les analyses détaillées s'afficheront dès les premières soumissions."
                    ) : (
                      <>
                        Sur ce deck de quiz, la classe obtient une moyenne de <strong>{avgScore20}/20</strong>. 
                        {weakestQuestion && (
                          <> La notion la plus fragile (taux d'échec élevé) concerne la question #{weakestQuestion.index} <em>(&laquo; {weakestQuestion.question} &raquo;</em>, {weakestQuestion.successRate}% de réussite). Il est fortement conseillé de réexpliquer ce point en classe.</>
                        )}
                        {strongestQuestion && weakestQuestion?.id !== strongestQuestion.id && (
                          <> En revanche, les élèves maîtrisent très bien la question #{strongestQuestion.index} <em>(&laquo; {strongestQuestion.question} &raquo;</em>, {strongestQuestion.successRate}% de réussite).</>
                        )}
                      </>
                    )}
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-700" />
                    <span>Analyse détaillée par question & Notions (Points forts / Points faibles)</span>
                  </h3>

                  <div className="space-y-3">
                    {questionStats.map((qs) => {
                      const isWeak = qs.successRate < 50;
                      const isStrong = qs.successRate >= 75;

                      return (
                        <div key={qs.id} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-2xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                                {qs.index}
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                {qs.question}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isWeak ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                                  🔴 Point faible / Notion non assimilée ({qs.successRate}%)
                                </span>
                              ) : isStrong ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  🟢 Point fort / Bien assimilé ({qs.successRate}%)
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                                  🟡 À consolider ({qs.successRate}%)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                isWeak ? 'bg-rose-500' : isStrong ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${qs.successRate}%` }}
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                            <div>Réponse attendue : <strong className="text-slate-800 font-mono">{qs.correct_answer}</strong></div>
                            <div>Réussite : <strong className="font-mono">{qs.correctCount} / {totalSubs} élève(s)</strong></div>
                          </div>

                          {qs.explanation && (
                            <div className="text-[11px] bg-slate-50 p-2.5 rounded-lg text-slate-600 italic border border-slate-100">
                              <strong>Rappel pédagogique :</strong> {qs.explanation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <h3 className="font-bold text-slate-900 text-sm">Résultats individuels des élèves ({subs.length})</h3>
                  {subs.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                      Aucune copie enregistrée.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                      {subs.map(sub => (
                        <div key={sub.id} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-slate-900">{sub.student_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">Soumis le {new Date(sub.submitted_at || sub.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                              sub.score_20 >= 14 ? 'bg-emerald-100 text-emerald-800' :
                              sub.score_20 >= 10 ? 'bg-blue-100 text-blue-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {sub.score_20}/20 ({sub.score}/{sub.max_score} pts)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-200 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setActiveAnalyticsQuizId(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  Fermer le Dashboard
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
