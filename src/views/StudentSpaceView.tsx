import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Clock, 
  Award, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  User, 
  TrendingUp, 
  LogOut, 
  Play, 
  Save, 
  Sparkles, 
  Calendar, 
  HelpCircle, 
  ArrowRight, 
  ShieldCheck, 
  FileText,
  RotateCcw,
  Check,
  Trophy,
  FastForward,
  ChevronRight,
  Lock,
  ImagePlus,
  Trash2,
  Loader2
} from 'lucide-react';
import { AuthUser, authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { Quiz, QuizQuestion, QuizSubmission, DailyGrade, Student, Exam, ClassRoom } from '../types';
import { StudentPublicReportView } from './StudentPublicReportView';
import { ClassLeaderboard } from '../components/ClassLeaderboard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StudentAvatar } from '../components/StudentAvatar';
import { PhotoUploadInput } from '../components/PhotoUploadInput';
import { compressAvatarImage } from '../utils/avatarImage';
import studentHeroPhoto from '../assets/images/hero_italian_oral_exam_1790527515781.jpg';

const STUDENT_TABS = [
  { id: 'quizzes', label: 'Quiz du professeur', shortLabel: 'Quiz', icon: BookOpen },
  { id: 'daily_grades', label: 'Notes journalières', shortLabel: 'Notes', icon: TrendingUp },
  { id: 'leaderboard', label: 'Classement de classe', shortLabel: 'Classe', icon: Trophy },
  { id: 'oral_exam', label: 'Examen oral', shortLabel: 'Oral', icon: Award }
] as const;

interface StudentSpaceViewProps {
  currentUser: AuthUser;
  onLogout: () => void;
}

export const StudentSpaceView: React.FC<StudentSpaceViewProps> = ({
  currentUser,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'quizzes' | 'daily_grades' | 'leaderboard' | 'oral_exam' | 'profile'>('quizzes');
  const [classDailyGrades, setClassDailyGrades] = useState<DailyGrade[]>([]);
  const [classesList, setClassesList] = useState<ClassRoom[]>([]);
  const [classStudentsList, setClassStudentsList] = useState<Student[]>([]);
  const [timeoutNotice, setTimeoutNotice] = useState<boolean>(false);
  const [antiCheatNotice, setAntiCheatNotice] = useState<boolean>(false);
  
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

  // Quiz en cours de composition - Défilement Question par Question
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [questionSecondsRemaining, setQuestionSecondsRemaining] = useState<number>(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [skippedQuestions, setSkippedQuestions] = useState<Record<string, boolean>>({});
  const [quizSecondsRemaining, setQuizSecondsRemaining] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<QuizSubmission | null>(null);

  // Correction & Explication si la réponse est fausse (affichée 8 secondes, suspend les chronomètres)
  const [incorrectFeedback, setIncorrectFeedback] = useState<{
    isOpen: boolean;
    questionNumber: number;
    questionText: string;
    studentAnswer: string;
    correctAnswer: string;
    explanation?: string;
    countdown: number; // 8 secondes par défaut
    pendingNextAnswers: Record<string, string>;
    isTimeoutOrSkip: boolean;
  } | null>(null);

  // Profile edit form
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editFirstName, setEditFirstName] = useState<string>(currentUser.name.split(' ')[0] || '');
  const [editLastName, setEditLastName] = useState<string>(currentUser.name.split(' ').slice(1).join(' ') || '');
  const [editStudentNumber, setEditStudentNumber] = useState<string>(currentUser.student_number || '1');
  const [editAvatar, setEditAvatar] = useState<string>(currentUser.avatar || '');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Données de l'élève
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [mySubmissions, setMySubmissions] = useState<QuizSubmission[]>([]);
  const [dailyGrades, setDailyGrades] = useState<DailyGrade[]>([]);
  const [studentRecord, setStudentRecord] = useState<Student | null>(null);

  useEffect(() => {
    if (studentRecord?.avatar_url) setEditAvatar(studentRecord.avatar_url);
  }, [studentRecord?.avatar_url]);

  const getStudentQueryInfo = () => {
    const stId = studentRecord?.id || currentUser.student_id || `student_${currentUser.id}`;
    const stName = studentRecord
      ? `${studentRecord.first_name} ${studentRecord.last_name}`
      : currentUser.name;
    const stNum = studentRecord?.student_number || currentUser.student_number || '1';
    const classId = studentRecord?.class_id || currentUser.class_id || '';
    return { stId, stName, stNum, classId };
  };

  const hasCompletedQuiz = (quizId: string) => {
    const { stId, stName, stNum, classId } = getStudentQueryInfo();
    const liveSubs = dataService.getStudentSubmissions(stId, stName, stNum, classId);
    const allQuizSubs = dataService.getQuizSubmissions(quizId);

    const matchedBySubs = liveSubs.some(s => s.quiz_id === quizId);
    const matchedByQuizSubs = allQuizSubs.some(s => s.student_id === stId);

    return matchedBySubs || matchedByQuizSubs || mySubmissions.some(s => s.quiz_id === quizId);
  };

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    try {
      if (supabaseService.isConfigured()) {
        await dataService.syncStudentsFromCloud();
      }
      loadData();
    } catch (e) {
      console.warn('Check status error:', e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const loadData = () => {
    // Synchroniser avec dataService
    const stList = dataService.getStudents();
    const st = stList.find(student => student.email.toLowerCase() === currentUser.email.toLowerCase())
      || stList.find(student => student.id === currentUser.student_id);
    setStudentRecord(st || null);

    const allCls = dataService.getClasses();
    setClassesList(allCls);
    setClassStudentsList(stList);

    const classId = st?.class_id || currentUser.class_id;

    const { stId, stName, stNum, classId: studentClassId } = getStudentQueryInfo();
    let subs: QuizSubmission[] = [];
    if (stId) {
      subs = dataService.getStudentSubmissions(stId, stName, stNum, studentClassId);
      const dgs = dataService.getStudentDailyGrades(stId);
      setMySubmissions(subs);
      setDailyGrades(dgs);
    }

    // Charger les notes journalières de toute la classe pour le leaderboard
    const allClassDg = dataService.getDailyGrades(classId);
    setClassDailyGrades(allClassDg);

    // RÈGLE : Les quizs non lancés (draft) ne doivent pas être affichés dans l'interface de l'élève (sauf s'ils ont déjà été soumis)
    const rawQList = dataService.getQuizzes(classId);
    const qList = rawQList.filter(q => q.status === 'launched' || subs.some(s => s.quiz_id === q.id));
    setQuizzes(qList);
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(loadData);
    const interval = setInterval(loadData, 10000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [currentUser]);

  // Système anti-triche : si l'élève quitte la fenêtre / change d'onglet pendant le quiz
  useEffect(() => {
    if (!activeQuiz) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleSubmitQuiz(true);
        setAntiCheatNotice(true);
      }
    };

    const handleBlur = () => {
      handleSubmitQuiz(true);
      setAntiCheatNotice(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [activeQuiz, quizAnswers]);

  // Temps alloué pour chaque question en secondes
  const getTimePerQuestion = (quiz: Quiz) => {
    const qCount = Math.max(1, quiz.questions?.length || 1);
    const totalSecs = (quiz.duration_minutes || 10) * 60;
    // Répartit le temps total par question (ex: 10 min pour 5 questions = 120s / question) avec un minimum de 20s
    return Math.max(20, Math.floor(totalSecs / qCount));
  };

  // 1. Chronomètre du temps total du Quiz (en pause pendant l'affichage de l'explication)
  useEffect(() => {
    if (!activeQuiz || quizSecondsRemaining <= 0 || incorrectFeedback?.isOpen) return;

    const timer = setInterval(() => {
      setQuizSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Soumission automatique si le temps total expire
          handleSubmitQuiz(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeQuiz, quizSecondsRemaining, incorrectFeedback?.isOpen]);

  // 2. Chronomètre dédié par Question (en pause pendant l'affichage de l'explication)
  useEffect(() => {
    if (!activeQuiz || questionSecondsRemaining <= 0 || incorrectFeedback?.isOpen) return;

    const qTimer = setInterval(() => {
      setQuestionSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(qTimer);
          // Le temps pour cette question est écoulé :
          handleQuestionTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(qTimer);
  }, [activeQuiz, questionSecondsRemaining, currentQuestionIndex, incorrectFeedback?.isOpen]);

  // 3. Décompte de la fenêtre d'explication pédagogique (8 secondes)
  useEffect(() => {
    if (!incorrectFeedback || !incorrectFeedback.isOpen) return;

    const fbTimer = setInterval(() => {
      setIncorrectFeedback(prev => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(fbTimer);
          // 8 secondes écoulées -> fermer l'explication et passer à la question suivante
          const pending = prev.pendingNextAnswers;
          advanceToNextQuestion(pending);
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    return () => clearInterval(fbTimer);
  }, [incorrectFeedback?.isOpen]);

  const handleStartQuiz = (quiz: Quiz) => {
    // RÈGLE STRICTE : Une fois le quiz fait, l'élève ne peut plus le recommencer
    const { stId, stName, stNum, classId } = getStudentQueryInfo();
    const freshSubs = dataService.getStudentSubmissions(stId, stName, stNum, classId);
    const alreadySubmitted = mySubmissions.some(s => s.quiz_id === quiz.id) || freshSubs.some(s => s.quiz_id === quiz.id);

    if (alreadySubmitted) {
      setConfirmDialog({
        isOpen: true,
        title: 'Quiz déjà effectué',
        message: 'Vous avez déjà passé et soumis cette évaluation. Conformément au règlement officiel, vous ne pouvez pas recommencer ce quiz.',
        confirmLabel: 'J\'ai compris',
        variant: 'primary',
        action: () => {}
      });
      return;
    }

    setActiveQuiz(quiz);
    setQuizAnswers({});
    setSkippedQuestions({});
    setIncorrectFeedback(null);
    setCurrentQuestionIndex(0);
    const totalSecs = (quiz.duration_minutes || 10) * 60;
    setQuizSecondsRemaining(totalSecs);
    const perQSecs = getTimePerQuestion(quiz);
    setQuestionSecondsRemaining(perQSecs);
    setLastSubmissionResult(null);
  };

  // Fonction utilitaire pour tester si une réponse est correcte
  const isAnswerCorrect = (q: QuizQuestion, studentAns: string) => {
    const sAns = (studentAns || '').trim();
    const expected = (q.correct_answer || '').trim();
    if (!sAns) return false;

    if (q.type === 'qcm') {
      return sAns.toLowerCase() === expected.toLowerCase();
    } else {
      const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const normStudent = normalize(sAns);
      const normExpected = normalize(expected);
      return normStudent === normExpected || normStudent.includes(normExpected) || normExpected.includes(normStudent);
    }
  };

  // Passage à la question suivante ou soumission finale
  const advanceToNextQuestion = (updatedAnswers: Record<string, string>) => {
    if (!activeQuiz) return;
    const questions = activeQuiz.questions || [];
    if (currentQuestionIndex >= questions.length - 1) {
      handleSubmitQuiz(false, updatedAnswers);
      return;
    }
    setCurrentQuestionIndex(prev => Math.min(prev + 1, questions.length - 1));
    const perQSecs = getTimePerQuestion(activeQuiz);
    setQuestionSecondsRemaining(perQSecs);
  };

  // Traiter la réponse de la question : si fausse, afficher l'explication pendant 8s
  const processQuestionProgression = (
    updatedAnswers: Record<string, string>,
    isTimeoutOrSkip: boolean = false
  ) => {
    if (!activeQuiz) return;
    const currentQ = activeQuiz.questions[currentQuestionIndex];
    if (!currentQ) return;

    const studentAns = updatedAnswers[currentQ.id] || '';
    const correct = isAnswerCorrect(currentQ, studentAns);

    if (correct) {
      // Bonne réponse : passage direct et fluide à la question suivante
      advanceToNextQuestion(updatedAnswers);
    } else {
      // Réponse FAUSSE (ou temps écoulé / skippé) :
      // Afficher la correction et l'explication pendant 8 secondes (temps hors chronomètre quiz)
      setIncorrectFeedback({
        isOpen: true,
        questionNumber: currentQuestionIndex + 1,
        questionText: currentQ.question,
        studentAnswer: studentAns,
        correctAnswer: currentQ.correct_answer,
        explanation: currentQ.explanation,
        countdown: 8,
        pendingNextAnswers: updatedAnswers,
        isTimeoutOrSkip
      });
    }
  };

  // Si le temps de la question est écoulé -> note 0 pour cette question et on analyse
  const handleQuestionTimeExpired = () => {
    if (!activeQuiz) return;
    const currentQ = activeQuiz.questions[currentQuestionIndex];
    if (!currentQ) return;

    const currentAns = quizAnswers[currentQ.id] || '';
    const updated = { ...quizAnswers, [currentQ.id]: currentAns };
    setQuizAnswers(updated);

    processQuestionProgression(updated, true);
  };

  // L'élève valide sa réponse pour la question courante et passe à la suite
  const handleAnswerAndNext = () => {
    if (!activeQuiz) return;
    processQuestionProgression(quizAnswers, false);
  };

  // L'élève skippe la question (ne connaît pas la réponse -> note 0)
  const handleSkipQuestion = () => {
    if (!activeQuiz) return;
    const currentQ = activeQuiz.questions[currentQuestionIndex];
    if (!currentQ) return;

    // Skipper = réponse vide explicite, marquée comme skippée (0 pt)
    const updatedAnswers = { ...quizAnswers, [currentQ.id]: '' };
    setQuizAnswers(updatedAnswers);
    setSkippedQuestions(prev => ({ ...prev, [currentQ.id]: true }));

    processQuestionProgression(updatedAnswers, true);
  };

  // Bouton pour fermer immédiatement l'explication et avancer sans attendre la fin des 8s
  const handleSkipExplanation = () => {
    if (!incorrectFeedback) return;
    const pending = incorrectFeedback.pendingNextAnswers;
    setIncorrectFeedback(null);
    advanceToNextQuestion(pending);
  };

  const handleSubmitQuiz = (isAutoTimeout = false, customAnswers?: Record<string, string>) => {
    if (!activeQuiz) return;
    setIsSubmitting(true);

    const answersToSubmit = customAnswers || quizAnswers;

    const { stId, stName, stNum } = getStudentQueryInfo();
    const clId = activeQuiz.class_id;

    const result = dataService.submitQuiz(
      activeQuiz.id,
      stId,
      stName,
      stNum,
      clId,
      answersToSubmit,
      isAutoTimeout
    );

    setIsSubmitting(false);
    setActiveQuiz(null);
    setCurrentQuestionIndex(0);
    setLastSubmissionResult(result);
    loadData();

    if (isAutoTimeout) {
      setTimeoutNotice(true);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrorMsg(null);
    setIsSavingProfile(true);

    try {
      const studentId = studentRecord?.id || currentUser.student_id || '';
      let savedAvatar = editAvatar;
      const cloudAvatar = studentRecord?.avatar_url || '';
      const avatarIsNewUpload = editAvatar.startsWith('data:image/jpeg;base64,');
      const avatarChanged = avatarIsNewUpload || editAvatar !== cloudAvatar;

      if (avatarChanged) {
        savedAvatar = (await supabaseService.saveStudentAvatar(
          studentId,
          editAvatar || null
        )) || '';
      }

      if (!studentRecord) throw new Error('Fiche élève indisponible. Vérifiez les droits de lecture Supabase puis rechargez la page.');
      await dataService.updateStudent(studentRecord.id, {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        student_number: editStudentNumber.trim(),
        avatar_url: savedAvatar || null
      });
      const ok = authService.updateStudentProfile(studentId, {
        firstName: editFirstName,
        lastName: editLastName,
        studentNumber: editStudentNumber,
        avatar: savedAvatar
      });
      if (!ok) throw new Error('Impossible de mettre à jour la session élève.');

      setProfileSuccessMsg(
        avatarChanged
          ? savedAvatar
            ? 'Profil mis à jour. Photo enregistrée sur Supabase.'
            : 'Profil mis à jour. Photo supprimée de Supabase.'
          : 'Profil étudiant mis à jour.'
      );
      setTimeout(() => setProfileSuccessMsg(null), 3000);
      loadData();
    } catch (error) {
      console.error('Erreur sauvegarde profil étudiant:', error);
      setProfileErrorMsg(error instanceof Error ? error.message : 'Impossible d’enregistrer le profil. Réessayez.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileErrorMsg('Veuillez sélectionner un fichier image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileErrorMsg('La photo doit peser moins de 5 Mo.');
      return;
    }

    setProfileErrorMsg(null);
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = async () => {
      try {
        setEditAvatar(await compressAvatarImage(image));
      } catch (error) {
        setProfileErrorMsg(error instanceof Error ? error.message : 'Impossible de traiter cette image. Essayez un autre fichier.');
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      setProfileErrorMsg('Impossible de lire cette image. Essayez un autre fichier.');
    };
    image.src = imageUrl;
  };

  // Calcul du temps restant sur la session d'1 heure du quiz lancé par le prof
  const getRemainingLaunchTime = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return null;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  };

  // Formatage chronomètre mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const cumulativeSubmissions = dailyGrades
    .flatMap(grade => grade.submissions)
    .filter(submission =>
      Number.isFinite(submission.score) && Number.isFinite(submission.max_score) && submission.max_score > 0
    );
  const cumulativeMaxScore = cumulativeSubmissions.reduce((total, submission) => total + submission.max_score, 0);
  const cumulativeScore = cumulativeSubmissions.reduce((total, submission) => total + submission.score, 0);
  const cumulativeGrade = cumulativeMaxScore > 0
    ? Number(((cumulativeScore / cumulativeMaxScore) * 20).toFixed(2))
    : null;
  const greetingName = studentRecord?.first_name || currentUser.name.trim().split(/\s+/)[0] || currentUser.name;

  // Vérification de la validation de l'inscription par le professeur
  if (studentRecord && studentRecord.validation_status === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-amber-200 shadow-xl p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-700">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              Inscription en attente
            </span>
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Compte en attente de validation
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Bonjour <strong>{currentUser.name}</strong>, votre inscription a bien été enregistrée. Votre professeur doit approuver votre compte avant que vous puissiez accéder à vos quiz, notes et évaluations.
            </p>
          </div>
          <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200 text-left text-xs text-amber-900 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5 text-amber-800">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              <span>Détails de votre inscription :</span>
            </div>
            <div>Classe : <strong>{studentRecord.class_name || currentUser.class_name || 'Non spécifiée'}</strong></div>
            <div>Email : <strong>{currentUser.email}</strong></div>
            <div>Numéro : <strong>{studentRecord.student_number || 'Non renseigné'}</strong></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={isCheckingStatus}
              className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isCheckingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" /> : null}
              <span>{isCheckingStatus ? 'Vérification...' : 'Vérifier en ligne'}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (studentRecord && studentRecord.validation_status === 'rejected') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-xl p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center mx-auto text-rose-700">
            <XCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
              Inscription refusée
            </span>
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Accès non autorisé
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Bonjour <strong>{currentUser.name}</strong>, votre demande d'inscription a été refusée par l'enseignant. Veuillez contacter votre professeur si vous pensez qu'il s'agit d'une erreur.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Retour à la page de connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="student-space min-h-svh flex flex-col text-slate-900">
      <header className="student-topbar sticky top-0 z-20 px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <img src="/percky-lingua-logo.png" alt="" className="h-9 w-9 shrink-0 object-contain sm:h-11 sm:w-11" />
            <div className="min-w-0">
              <div className="font-display truncate text-base font-bold tracking-tight text-slate-900 sm:text-xl">PerckyLingua</div>
              <p className="hidden text-[9px] font-bold tracking-[0.16em] text-slate-500 sm:block">APPRENDRE · PROGRESSER · RÉUSSIR</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="student-avatar-ring student-header-avatar student-header-avatar-button"
              onClick={() => {
                setActiveTab('profile');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              title={`Accéder au profil de ${currentUser.name}`}
              aria-label={`Accéder au profil de ${currentUser.name}`}
            >
              <StudentAvatar
                name={currentUser.name}
                src={studentRecord?.avatar_url || currentUser.avatar}
                className="h-8 w-8 border-2 border-white text-[10px] sm:h-9 sm:w-9 sm:text-xs"
              />
            </button>
            <div className="hidden text-right sm:block">
              <div className="max-w-48 truncate text-xs font-bold text-slate-900">{currentUser.name}</div>
              <div className="text-[11px] text-slate-500">
                N° {currentUser.student_number || '1'} <span aria-hidden="true">·</span> {currentUser.class_name || 'Classe'}
              </div>
            </div>
            <button type="button" onClick={onLogout} className="student-logout" title="Se déconnecter" aria-label="Se déconnecter">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6">
        <section className="student-welcome" aria-labelledby="student-welcome-title">
          <div className="student-welcome-photo" aria-hidden="true">
            <img src={studentHeroPhoto} alt="" />
            <div className="student-welcome-photo-fade" />
            <div className="student-welcome-flag" />
          </div>

          <div className="student-welcome-copy">
            <div className="student-avatar-ring student-welcome-avatar">
              <img
                src="/student-learning-sticker.png"
                alt="Avatar étudiant PerckyLingua"
                className="student-welcome-mascot"
                draggable={false}
              />
            </div>
            <div className="student-welcome-text">
              <div className="student-learning-pill">
                <span className="student-italian-flag" aria-hidden="true"><i /><i /><i /></span>
                <span>APPRENTISSAGE <span aria-hidden="true">·</span> ITALIEN</span>
              </div>
              <h1 id="student-welcome-title">Benvenuto, {greetingName}!</h1>
              <p>Retrouvez les quiz de votre professeur, passez vos évaluations pendant leur disponibilité et suivez vos progrès jour après jour.</p>
              <div className="student-class-meta">
                <span>{currentUser.class_name || studentRecord?.class_name || 'Espace étudiant'}</span>
                <span aria-hidden="true">·</span>
                <span>Numéro {currentUser.student_number || studentRecord?.student_number || '—'}</span>
              </div>
            </div>
          </div>

          <div className="student-daily-grade">
            <div className="student-daily-grade-icon"><Award className="h-6 w-6 sm:h-7 sm:w-7" /></div>
            <div className="student-daily-grade-copy">
              <span className="student-daily-grade-label">Votre note journalière cumulée</span>
              <div className="student-daily-grade-score">
                <strong>{cumulativeGrade ?? '--'}</strong>
                <span>/ 20</span>
              </div>
              <p>{cumulativeSubmissions.length > 0
                ? `${cumulativeSubmissions.length} quiz pris en compte, toutes dates confondues`
                : 'Aucun quiz pris en compte pour le moment'}</p>
            </div>
            <div className="student-daily-grade-trend" aria-hidden="true"><TrendingUp className="h-6 w-6 sm:h-7 sm:w-7" /></div>
          </div>
        </section>

        <nav className="student-tabs" aria-label="Navigation de l’espace étudiant">
          {STUDENT_TABS.map(({ id, label, shortLabel, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              title={label}
              className={`student-tab ${activeTab === id ? 'is-active' : ''}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="student-tab-label-full">{label}</span>
              <span className="student-tab-label-short">{shortLabel}</span>
            </button>
          ))}
        </nav>

        {/* TAB 1: QUIZZES EN DIRECT & HISTORIQUE */}
        {activeTab === 'quizzes' && !activeQuiz && (
          <div className="space-y-6">
            
            {/* Timeout alert banner */}
            {timeoutNotice && (
              <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-start justify-between gap-3 animate-fade-in shadow-xs">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-rose-950 text-sm">
                      ⏰ Temps imparti écoulé !
                    </h3>
                    <p className="text-xs text-rose-800">
                      Votre réponse n'a pas pu être validée avant la fin du chronomètre dédié au quiz. Votre note pour ce quiz a été fixée à <strong>0 / 20</strong> selon le règlement officiel.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTimeoutNotice(false)}
                  className="text-rose-400 hover:text-rose-600 p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Anti-cheat violation alert banner */}
            {antiCheatNotice && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start justify-between gap-3 animate-fade-in shadow-xs">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-amber-950 text-sm">
                      🛡️ Alerte Anti-Triche • Fenêtre quittée
                    </h3>
                    <p className="text-xs text-amber-900">
                      Vous avez quitté la fenêtre ou l'onglet d'évaluation en cours. Conformément au règlement anti-triche, votre quiz a été automatiquement soumis et verrouillé.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAntiCheatNotice(false)}
                  className="text-amber-500 hover:text-amber-700 p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Last submission instant feedback alert */}
            {lastSubmissionResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start justify-between gap-3 animate-fade-in shadow-xs">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-emerald-950 text-sm">
                      Quiz validé et corrigé avec succès !
                    </h3>
                    <p className="text-xs text-emerald-800">
                      Votre note obtenue : <strong className="text-base font-mono font-extrabold">{lastSubmissionResult.score_20} / 20</strong> ({lastSubmissionResult.score}/{lastSubmissionResult.max_score} pts). Ces points sont pris en compte dans votre note journalière pondérée.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLastSubmissionResult(null)}
                  className="text-xs text-emerald-700 hover:text-emerald-950 font-bold"
                >
                  Fermer
                </button>
              </div>
            )}

            {/* Quizzes List */}
            <div className="space-y-4">
              <h2 className="student-section-title">
                <BookOpen className="w-4 h-4 text-amber-800" />
                <span>Quiz assignés à votre classe</span>
              </h2>

              {quizzes.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 text-xs">
                  Aucun quiz n'a encore été créé pour votre classe par le professeur.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {quizzes.map(quiz => {
                    const done = hasCompletedQuiz(quiz.id);
                    const { stId, stName, stNum, classId } = getStudentQueryInfo();
                    const sub = mySubmissions.find(s => s.quiz_id === quiz.id) || dataService.getStudentSubmissions(stId, stName, stNum, classId).find(s => s.quiz_id === quiz.id);
                    const isCompleted = done || (sub && (sub.status === 'completed' || sub.status === 'timeout' || sub.status === 'missed'));
                    const isMissed = sub && sub.status === 'missed';
                    const isLive = quiz.status === 'launched' && !isCompleted;
                    const remaining1h = isLive ? getRemainingLaunchTime(quiz.expires_at) : null;

                    return (
                      <div
                        key={quiz.id}
                        className={`student-quiz-card ${isLive && !done && !isCompleted ? 'is-live' : ''}`}
                      >
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isLive && !done && !isCompleted && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                                  <span>EN DIRECT • {remaining1h || 'Fermeture imminente'}</span>
                                </span>
                              )}

                              {isCompleted && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Effectué • {sub?.score_20 ?? '—'}/20</span>
                                </span>
                              )}

                              {isMissed && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Délai d'1h expiré (Note: 0/20)</span>
                                </span>
                              )}

                              {quiz.status === 'draft' && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                  En attente de lancement par le professeur
                                </span>
                              )}
                            </div>

                            <h3 className="student-quiz-title">{quiz.title}</h3>
                            {quiz.description && (
                              <p className="student-quiz-description">{quiz.description}</p>
                            )}
                          </div>

                          <div className="student-quiz-meta">
                            <div>{quiz.questions?.length || 0} questions</div>
                            <div>{quiz.duration_minutes || 10} min</div>
                          </div>
                        </div>

                        {/* Card Action footer */}
                        <div className="student-quiz-footer">
                          <div className="student-quiz-points">
                            Barème : <strong>{quiz.total_points || 20} pts</strong>
                          </div>

                          {isLive && !mySubmissions.some(s => s.quiz_id === quiz.id) && !done && (
                            <button
                              type="button"
                              onClick={() => handleStartQuiz(quiz)}
                              className="student-quiz-start"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Commencer le Quiz ({quiz.duration_minutes}m)</span>
                            </button>
                          )}

                          {isCompleted && (
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Note définitive : {sub?.score_20 ?? '—'} / 20</span>
                              </span>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200" title="Règlement : un quiz ne peut être passé qu'une seule fois">
                                <Lock className="w-3 h-3 text-slate-400" />
                                <span>Verrouillé (Tentative unique)</span>
                              </span>
                            </div>
                          )}

                          {isMissed && (
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="text-xs font-mono font-bold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-300 flex items-center gap-1.5 shadow-2xs">
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Note définitive : 0 / 20</span>
                              </span>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                <Lock className="w-3 h-3 text-slate-400" />
                                <span>Session fermée</span>
                              </span>
                            </div>
                          )}

                          {quiz.status === 'draft' && (
                            <span className="text-xs text-slate-400 italic">
                              Bientôt disponible
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ACTIVE TEST MODE (L'élève passe le quiz question par question) */}
        {activeQuiz && (() => {
          const questions = activeQuiz.questions || [];
          const totalQuestions = questions.length;
          const safeIndex = Math.min(Math.max(0, currentQuestionIndex), Math.max(0, totalQuestions - 1));
          const currentQ = questions[safeIndex];
          const currentAnswer = currentQ ? (quizAnswers[currentQ.id] || '') : '';
          const maxQSecs = getTimePerQuestion(activeQuiz);
          const qProgressPercent = Math.max(0, Math.min(100, (questionSecondsRemaining / maxQSecs) * 100));
          const totalProgressPercent = Math.round((safeIndex / Math.max(1, totalQuestions)) * 100);

          return (
            <div className="fixed inset-0 z-40 flex min-h-0 flex-col overflow-hidden bg-slate-950 animate-fade-in select-none">
              
              {/* Anti-Screenshot Watermark Banner */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-rose-950 px-4 py-2.5 text-rose-100 shadow-inner sm:px-6">
                <span className="flex min-w-0 items-center gap-2 truncate font-bold">
                  <ShieldCheck className="w-4 h-4 text-rose-300" />
                  <span>MODE SÉCURISÉ ANTI-TRICHE • Capture d'écran strictement interdite</span>
                </span>
                <span className="truncate opacity-90">
                  {currentUser.name} • {currentUser.student_number || 'N°1'} • Session officielle
                </span>
              </div>
              
              {/* Quiz Header Bar with Global & Question Timers */}
              <div className="shrink-0 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white shadow-lg sm:px-6 sm:py-4">
                <div className="mx-auto max-w-7xl space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-amber-300 sm:text-[11px]">
                        Évaluation en cours • {activeQuiz.class_name || 'Classe'}
                      </span>
                      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                        {safeIndex + 1}/{totalQuestions}
                      </span>
                    </div>
                    <h2 className="truncate font-display text-base font-extrabold text-white sm:text-xl">
                      {activeQuiz.title}
                    </h2>
                  </div>

                  {/* Dual Timers Badge */}
                  <div className="flex shrink-0 items-center gap-2 self-start sm:gap-3 sm:self-auto">
                    {/* Per-Question Countdown Timer */}
                    <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-mono font-extrabold text-sm border-2 shadow-xs transition-colors ${
                      questionSecondsRemaining <= 10 
                        ? 'bg-rose-50 border-rose-400 text-rose-700 animate-pulse' 
                        : 'bg-amber-50 border-amber-300 text-amber-950'
                    }`}>
                      <Clock className={`w-4 h-4 ${questionSecondsRemaining <= 10 ? 'text-rose-600 animate-spin' : 'text-amber-800'}`} />
                      <div className="flex flex-col text-left">
                        <span className="text-[9px] uppercase font-bold text-slate-500 font-sans leading-none">Temps Question</span>
                        <span className="leading-tight">{formatTime(questionSecondsRemaining)}</span>
                      </div>
                    </div>

                    {/* Global Quiz Countdown Timer */}
                    <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-white sm:px-3.5">
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] uppercase font-bold text-slate-400 font-sans leading-none">Total Quiz</span>
                        <span className="font-bold leading-tight">{formatTime(quizSecondsRemaining)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress bar per question (Chrono de la question en cours) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300 sm:text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      <span>Temps de la question {currentQuestionIndex + 1}</span>
                    </span>
                    <span className="font-mono font-bold text-amber-300">
                      {questionSecondsRemaining}s restantes
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700 sm:h-2.5">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        qProgressPercent <= 25 
                          ? 'bg-rose-600 animate-pulse' 
                          : qProgressPercent <= 50 
                            ? 'bg-orange-500' 
                            : 'bg-emerald-600'
                      }`}
                      style={{ width: `${qProgressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Stepper Dots (Questions progress) */}
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                  {questions.map((q, idx) => {
                    const isPassed = idx < currentQuestionIndex;
                    const isCurrent = idx === currentQuestionIndex;
                    const isAnswered = Boolean(quizAnswers[q.id]);
                    const isSkipped = Boolean(skippedQuestions[q.id]);

                    return (
                      <div
                        key={q.id}
                        className={`h-2 rounded-full transition-all flex-1 min-w-[20px] ${
                          isCurrent
                            ? 'bg-amber-800 ring-2 ring-amber-400 scale-105'
                            : isPassed
                              ? isSkipped
                                ? 'bg-slate-300'
                                : isAnswered
                                  ? 'bg-emerald-500'
                                  : 'bg-slate-300'
                              : 'bg-slate-200'
                        }`}
                        title={`Question #${idx + 1}`}
                      />
                    );
                  })}
                </div>
                </div>
              </div>

              {/* Single Active Question Card */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100 px-3 py-4 sm:px-6 sm:py-8">
              <div className="mx-auto max-w-4xl">
              {currentQ ? (
                <div className="space-y-5 animate-fade-in sm:space-y-6">
                  <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl sm:space-y-5 sm:p-8">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-800 font-mono text-sm font-extrabold text-white shadow-xs sm:h-12 sm:w-12 sm:text-base">
                          {currentQuestionIndex + 1}
                        </span>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 sm:text-[11px]">
                            Question #{currentQuestionIndex + 1} • {currentQ.points} points
                          </span>
                          <h3 className="mt-1 font-display text-lg font-bold leading-snug text-slate-900 sm:text-2xl">
                            {currentQ.question}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <div className="pl-0 pt-3 text-xs italic text-slate-500 sm:pl-16">
                      {currentQ.type === 'qcm' 
                        ? '👉 Sélectionnez la bonne réponse parmi les choix proposés ci-dessous :' 
                        : '👉 Saisissez votre réponse au clavier dans le champ ci-dessous :'}
                    </div>

                    {/* QCM Options */}
                    {currentQ.type === 'qcm' && (
                      <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 sm:pl-16">
                        {(currentQ.options || []).map((opt, optIdx) => {
                          const isSelected = currentAnswer === opt;
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => setQuizAnswers({ ...quizAnswers, [currentQ.id]: opt })}
                              className={`flex min-h-[60px] items-center justify-between rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-all cursor-pointer shadow-xs sm:min-h-[72px] ${
                                isSelected
                                  ? 'bg-amber-800 text-white border-amber-900 shadow-md ring-2 ring-amber-400 scale-[1.01]'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-amber-400 hover:bg-amber-50/50'
                              }`}
                            >
                              <span className="pr-3 leading-snug">{opt}</span>
                              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isSelected ? 'border-white bg-white text-amber-900' : 'border-slate-300'
                              }`}>
                                {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-amber-900" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Text input */}
                    {currentQ.type === 'text' && (
                      <div className="pt-4 sm:pl-16">
                        <input
                          type="text"
                          autoFocus
                          value={currentAnswer}
                          onChange={(e) => setQuizAnswers({ ...quizAnswers, [currentQ.id]: e.target.value })}
                          placeholder="Saisissez votre réponse ici..."
                          className="w-full rounded-2xl border-2 border-slate-300 bg-slate-50 px-5 py-4 text-base font-semibold text-slate-900 shadow-inner focus:border-amber-700 focus:bg-white focus:outline-hidden sm:text-lg"
                        />
                      </div>
                    )}
                  </div>

                  {/* Navigation and Actions Footer */}
                  <div className="sticky bottom-0 -mx-3 flex flex-col gap-3 border-t border-slate-200 bg-slate-100/95 px-3 py-3 backdrop-blur sm:-mx-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-0">
                    {/* Skip button rule reminder */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSkipQuestion}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200 sm:text-sm"
                        title="Passer cette question (note : 0 pour cette question)"
                      >
                        <FastForward className="w-4 h-4 text-slate-500" />
                        <span>Passer cette question (Note : 0)</span>
                      </button>
                    </div>

                    {/* Next / Submit Button */}
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: 'Quitter le quiz',
                            message: 'Voulez-vous vraiment quitter ce quiz en cours ?\nVos réponses déjà passées seront comptabilisées.',
                            confirmLabel: 'Quitter et enregistrer',
                            variant: 'warning',
                            action: () => {
                              handleSubmitQuiz(false);
                            }
                          });
                        }}
                        className="px-2 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 sm:px-4"
                      >
                        Abandonner
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleAnswerAndNext}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-800 px-4 py-3.5 text-xs font-extrabold text-white shadow-md transition-transform hover:bg-amber-900 active:scale-95 sm:flex-none sm:px-6 sm:text-sm"
                      >
                        {currentQuestionIndex + 1 === totalQuestions ? (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Valider et Terminer le Quiz</span>
                          </>
                        ) : (
                          <>
                            <span>Valider et Question Suivante</span>
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* MODAL CORRECTION & EXPLICATION EN CAS DE MAUVAISE RÉPONSE (8 SECONDES) */}
              {incorrectFeedback && incorrectFeedback.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
                  <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border-2 border-rose-300 overflow-hidden transform animate-scale-in flex flex-col">
                    
                    {/* Header with Red Warning & Countdown Badge */}
                    <div className="bg-gradient-to-r from-rose-700 via-rose-800 to-rose-900 text-white p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shrink-0">
                          <XCircle className="w-6 h-6 text-rose-200" />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-200 block">
                            Correction Pédagogique
                          </span>
                          <h3 className="font-display font-extrabold text-base text-white">
                            {incorrectFeedback.isTimeoutOrSkip ? 'Question Non Validée ou Passée' : 'Réponse Incorrecte !'}
                          </h3>
                        </div>
                      </div>

                      {/* 8s Countdown Badge (temps non décompté du quiz) */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/30 rounded-xl border border-white/20 text-white font-mono font-black text-sm">
                        <Clock className="w-4 h-4 text-amber-300 animate-spin" />
                        <span>{incorrectFeedback.countdown}s</span>
                      </div>
                    </div>

                    {/* Progress Bar of 8 seconds */}
                    <div className="w-full bg-rose-100 h-2 overflow-hidden">
                      <div 
                        className="bg-amber-400 h-full transition-all duration-1000 ease-linear"
                        style={{ width: `${(incorrectFeedback.countdown / 8) * 100}%` }}
                      />
                    </div>

                    {/* Body: Question, Wrong Answer, Expected Answer & Explanation */}
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                      {/* Question Recall */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Question #{incorrectFeedback.questionNumber}
                        </span>
                        <p className="text-xs sm:text-sm font-semibold text-slate-800">
                          {incorrectFeedback.questionText}
                        </p>
                      </div>

                      {/* Answers Comparison */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* Student Answer */}
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                          <div className="text-[10px] uppercase font-bold text-rose-700 flex items-center gap-1 mb-1">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Votre réponse</span>
                          </div>
                          <div className="font-semibold text-rose-950 truncate">
                            {incorrectFeedback.studentAnswer ? `« ${incorrectFeedback.studentAnswer} »` : '(Aucune réponse saisie)'}
                          </div>
                          <span className="text-[10px] text-rose-600 font-bold block mt-1">
                            0 point
                          </span>
                        </div>

                        {/* Expected Correct Answer */}
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300">
                          <div className="text-[10px] uppercase font-bold text-emerald-700 flex items-center gap-1 mb-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Bonne réponse</span>
                          </div>
                          <div className="font-bold text-emerald-950 truncate">
                            « {incorrectFeedback.correctAnswer} »
                          </div>
                          <span className="text-[10px] text-emerald-700 font-bold block mt-1">
                            Réponse attendue
                          </span>
                        </div>
                      </div>

                      {/* Pedagogical Explanation Box */}
                      {incorrectFeedback.explanation && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-300/80 space-y-1.5 shadow-2xs">
                          <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Explication & Règle :</span>
                          </div>
                          <p className="text-xs text-amber-950 leading-relaxed font-medium">
                            {incorrectFeedback.explanation}
                          </p>
                        </div>
                      )}

                      <div className="text-[11px] text-slate-400 text-center italic">
                        Ce temps de pause pédagogique n'est pas décompté de votre temps de quiz.
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-mono">
                        Passage automatique dans {incorrectFeedback.countdown}s...
                      </span>

                      <button
                        type="button"
                        onClick={handleSkipExplanation}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        <span>Continuer tout de suite</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                </div>
              )}

              </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 2: NOTES JOURNALIÈRES */}
        {activeTab === 'daily_grades' && (
          <div className="student-content-panel space-y-6">
            <div>
              <h2 className="font-display font-bold text-xl text-slate-900">
                Notes Journalières Cumulées
              </h2>
              <p className="text-xs text-slate-500">
                La note journalière est calculée à partir du total des points obtenus sur le total des points possibles, puis ramenée sur 20.
              </p>
            </div>

            {dailyGrades.length === 0 ? (
              <div className="p-8 bg-slate-50 rounded-2xl text-center text-xs text-slate-400">
                Aucune note journalière enregistrée pour le moment.
              </div>
            ) : (
              <div className="space-y-4">
                {dailyGrades.map((dg, idx) => (
                  <div key={idx} className="student-grade-row">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <Calendar className="w-4 h-4 text-amber-800" />
                        <span>Date : {dg.date}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-mono">Moyenne :</span>
                        <span className="px-3 py-1 rounded-xl font-mono font-extrabold text-sm bg-amber-100 text-amber-900 border border-amber-300">
                          {dg.average_score_20} / 20
                        </span>
                      </div>
                    </div>

                    {/* Breakdown of submissions that formed this daily grade */}
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Quiz inclus dans cette journée ({dg.submissions.length}) :
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {dg.submissions.map((sub, sIdx) => (
                          <div key={sIdx} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800 truncate pr-2">{sub.quiz_title}</span>
                            <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                              sub.score_20 >= 10 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {sub.score_20}/20
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: LEADERBOARD CLASSE */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            <ClassLeaderboard
              dailyGrades={classDailyGrades}
              classes={classesList}
              students={classStudentsList}
              currentStudentId={studentRecord?.id || currentUser.student_id}
              initialClassId={studentRecord?.class_id || currentUser.class_id}
              isStudentView={true}
            />
          </div>
        )}

        {/* TAB 3: EXAMEN ORAL OFFICIEL (GRILLE DE RUBRIQUES) */}
        {activeTab === 'oral_exam' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-500">
              Consultation de votre note d'examen oral et de votre fiche personnelle.
            </div>
            {studentRecord?.id ? (
              <StudentPublicReportView
                studentId={studentRecord.id}
                lockedStudentId={studentRecord.id}
              />
            ) : (
              <div className="bg-white p-5 rounded-xl border border-amber-200 text-sm text-slate-700">
                Votre compte n'est pas associé à une fiche élève unique. Contactez votre professeur pour vérifier votre numéro d'étudiant.
              </div>
            )}
          </div>
        )}

        {/* Profil et identifiants, accessible via l’avatar de l’en-tête */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs max-w-xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900">
                  Mes Identifiants Étudiant
                </h2>
                <p className="text-xs text-slate-500">
                  Vérifiez ou mettez à jour votre nom, prénom et numéro d’étudiant.
                </p>
              </div>
            </div>

            {profileSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            {profileErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>{profileErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Prénom</label>
                  <input
                    type="text"
                    required
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Nom</label>
                  <input
                    type="text"
                    required
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Numéro d’étudiant (ex. : 1, 2, 3)</label>
                <input
                  type="text"
                  required
                  value={editStudentNumber}
                  onChange={(e) => setEditStudentNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Adresse Email</label>
                <input
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500 font-mono cursor-not-allowed"
                />
                <span className="text-[10px] text-slate-400">L'email sert d'identifiant de connexion unique.</span>
              </div>

              {/* Téléchargement / Remplacement de photo de profil */}
              <PhotoUploadInput
                value={editAvatar}
                name={`${editFirstName} ${editLastName}`.trim() || 'Mon Profil'}
                onChange={(photo) => setEditAvatar(photo)}
                onRemove={() => setEditAvatar('')}
                label="Photo de profil"
                helperText="Glissez une image ou cliquez pour télécharger/remplacer votre photo (formats JPG, PNG, WebP acceptés)."
              />

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                >
                  {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{isSavingProfile ? 'Enregistrement sur Supabase...' : 'Enregistrer mes identifiants'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

      <footer className="student-footer">
        PerckyLingua • Apprendre et progresser en italien
      </footer>

      {/* In-App Confirm Dialog */}
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
