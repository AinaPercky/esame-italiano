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
  ShieldCheck, 
  FileText,
  RotateCcw,
  Check,
  Trophy,
  ChevronRight,
  Lock,
  ImagePlus,
  Trash2,
  Loader2,
  School
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
import {
  isTimerBeepEnabled,
  playTimerBeep,
  primeTimerAudio,
  setTimerBeepEnabled,
  useAssessmentTimerBeeper
} from '../utils/timerAudio';
import { shuffleArray, shuffleQuizQuestions } from '../utils/quizQuestionOrder';
import { CORRECTION_DISPLAY_SECONDS, formatQuizDuration, getQuestionTimeSeconds, getQuizTotalTimeSeconds } from '../utils/quizTiming';
import { formatCorrectReorderAnswer, formatReorderAnswer } from '../utils/quizReorder';
import { isQuestionAnswerCorrect, calculateQuestionPointsEarned, formatTextAnswerForDisplay, formatCorrectTextAnswerForDisplay } from '../utils/quizAnswerMatcher';
import { parseVerbesTrousAnswers } from '../utils/verbesTrous';
import { createTutorialQuiz, scoreTutorialQuiz } from '../utils/tutorialQuiz';
import type { TutorialQuizScore } from '../utils/tutorialQuiz';
import { getPresenceInitializationRemainingSeconds, QUIZ_PRESENCE_INITIALIZATION_SECONDS } from '../utils/quizPresence';
import { canStudentStartQuiz } from '../utils/quizRetryAvailability';
import { QuizReorderList } from '../components/QuizReorderList';
import { QuizClozeInput, parseQuestionClozePrompt } from '../components/QuizClozeInput';
import { VerbesTrousQuestion } from '../components/verbesTrous/VerbesTrousQuestion';
import {
  AssessmentCorrectionModal,
  AssessmentQcmOptions,
  AssessmentQuestionHeader,
  AssessmentShell
} from '../components/AssessmentRunner';
import { LessonsStudentView } from './LessonsStudentView';
import { StudentWrittenExamsView } from './StudentWrittenExamsView';
import { ExercisesStudentView } from './ExercisesStudentView';
import { StudentClassesView } from './StudentClassesView';
import { enrollmentService } from '../services/enrollmentService';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  LearningModuleHeader,
  StatusBadge
} from '../components/LearningCard';
import studentHeroPhoto from '../assets/images/hero_italian_oral_exam_1790527515781.webp';

const STUDENT_TABS = [
  { id: 'classes', label: 'Mes classes', shortLabel: 'Classes', icon: School },
  { id: 'quizzes', label: 'Quiz du professeur', shortLabel: 'Quiz', icon: BookOpen },
  { id: 'exercises', label: 'Exercices', shortLabel: 'Exercices', icon: CheckCircle2 },
  { id: 'lessons', label: 'Leçons de cours', shortLabel: 'Leçons', icon: Sparkles },
  { id: 'daily_grades', label: 'Notes journalières', shortLabel: 'Notes', icon: TrendingUp },
  { id: 'leaderboard', label: 'Classement de classe', shortLabel: 'Classe', icon: Trophy },
  { id: 'oral_exam', label: 'Examen oral', shortLabel: 'Oral', icon: Award },
  { id: 'written_exams', label: 'Examens écrits', shortLabel: 'Écrit', icon: FileText }
] as const;

interface StudentSpaceViewProps {
  currentUser: AuthUser;
  onLogout: () => void;
}

interface PresenceInitializationState {
  quiz: Quiz;
  phase: 'confirming' | 'initializing' | 'validating';
  launchId?: string;
  deadlineAt?: string;
  retryAuthorized?: boolean;
}

export const StudentSpaceView: React.FC<StudentSpaceViewProps> = ({
  currentUser,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'classes' | 'quizzes' | 'exercises' | 'lessons' | 'daily_grades' | 'leaderboard' | 'oral_exam' | 'written_exams' | 'profile'>('quizzes');
  const [isWrittenExamFullscreen, setIsWrittenExamFullscreen] = useState(false);
  const [isExerciseFullscreen, setIsExerciseFullscreen] = useState(false);
  const isStandaloneModule = isWrittenExamFullscreen || isExerciseFullscreen;
  const [classDailyGrades, setClassDailyGrades] = useState<DailyGrade[]>([]);
  const [classesList, setClassesList] = useState<ClassRoom[]>([]);
  const [classStudentsList, setClassStudentsList] = useState<Student[]>([]);
  const [activeEnrollmentClassIds, setActiveEnrollmentClassIds] = useState<string[]>([]);
  const [classEnrollmentsLoaded, setClassEnrollmentsLoaded] = useState(false);
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
  const [presenceInitialization, setPresenceInitialization] = useState<PresenceInitializationState | null>(null);
  const [presenceInitSecondsRemaining, setPresenceInitSecondsRemaining] = useState(QUIZ_PRESENCE_INITIALIZATION_SECONDS);
  const [presenceStartError, setPresenceStartError] = useState<string | null>(null);
  const [retryAuthorizedQuizIds, setRetryAuthorizedQuizIds] = useState<Set<string>>(() => new Set());
  const [isRetryAttempt, setIsRetryAttempt] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [questionSecondsRemaining, setQuestionSecondsRemaining] = useState<number>(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const quizAnswersRef = useRef<Record<string, string>>({});
  quizAnswersRef.current = quizAnswers;
  const [quizSecondsRemaining, setQuizSecondsRemaining] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isTimerBeepEnabled());
  const quizSubmissionLockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [quizSubmissionError, setQuizSubmissionError] = useState<string | null>(null);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<QuizSubmission | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [tutorialResult, setTutorialResult] = useState<TutorialQuizScore | null>(null);
  const [incompletePhraseConfirmation, setIncompletePhraseConfirmation] = useState<number | null>(null);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setTimerBeepEnabled(next);
    if (next) {
      primeTimerAudio();
      playTimerBeep(true);
    }
  };

  // Correction & Explication si la réponse est fausse (affichée 13 secondes, suspend les chronomètres)
  const [incorrectFeedback, setIncorrectFeedback] = useState<{
    isOpen: boolean;
    questionNumber: number;
    questionText: string;
    studentAnswer: string;
    correctAnswer: string;
    explanation?: string;
    countdown: number; // 13 secondes par défaut
    pendingNextAnswers: Record<string, string>;
    isTimeout: boolean;
    points?: number;
    maxPoints?: number;
  } | null>(null);

  // Profile edit form
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editFirstName, setEditFirstName] = useState<string>(currentUser.name.split(' ')[0] || '');
  const [editLastName, setEditLastName] = useState<string>(currentUser.name.split(' ').slice(1).join(' ') || '');
  const [editStudentNumber, setEditStudentNumber] = useState<string>(currentUser.student_number || '1');
  const [editGender, setEditGender] = useState<'homme' | 'femme'>(currentUser.gender || 'homme');
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

  useEffect(() => {
    let cancelled = false;
    const studentId = currentUser.student_id || studentRecord?.id;
    if (!studentId) {
      setActiveEnrollmentClassIds([]);
      setClassEnrollmentsLoaded(true);
      return;
    }
    setClassEnrollmentsLoaded(false);
    enrollmentService.listMyEnrollments(studentId)
      .then(items => { if (!cancelled) setActiveEnrollmentClassIds(items.filter(item => item.status === 'active').map(item => item.class_id)); })
      .catch(error => { console.warn('Chargement des inscriptions impossible :', error); if (!cancelled) setActiveEnrollmentClassIds([]); })
      .finally(() => { if (!cancelled) setClassEnrollmentsLoaded(true); });
    return () => { cancelled = true; };
  }, [currentUser.student_id, studentRecord?.id]);

  useEffect(() => {
    setEditGender(studentRecord?.gender || currentUser.gender || 'homme');
  }, [currentUser.gender, studentRecord?.gender]);

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
    const liveSubs = dataService.getStudentSubmissions(stId, stName, stNum);
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

  const updateQuizAnswer = (questionId: string, answer: string) => {
    const updatedAnswers = { ...quizAnswersRef.current, [questionId]: answer };
    quizAnswersRef.current = updatedAnswers;
    setQuizAnswers(updatedAnswers);
    if (activeQuiz) { try { localStorage.setItem('student_quiz_draft_' + getStudentQueryInfo().stId + '_' + activeQuiz.id, JSON.stringify(updatedAnswers)); } catch { /* stockage local indisponible */ } }
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
      subs = dataService.getStudentSubmissions(stId, stName, stNum);
      const dgs = dataService.getStudentDailyGrades(stId);
      setMySubmissions(subs);
      setDailyGrades(dgs);
    }

    // Charger les notes journalières de toute la classe pour le leaderboard
    const allClassDg = dataService.getDailyGrades(classId);
    setClassDailyGrades(allClassDg);

    // RÈGLE : Les quizs non lancés (draft) ne doivent pas être affichés dans l'interface de l'élève (sauf s'ils ont déjà été soumis)
    const quizClassIds = classEnrollmentsLoaded ? activeEnrollmentClassIds : (classId ? [classId] : []);
    const rawQList = dataService.getQuizzes(quizClassIds);
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
  }, [currentUser, activeEnrollmentClassIds, classEnrollmentsLoaded]);

  // Inclure aussi les quiz déjà soumis : une seconde chance peut rouvrir un quiz clôturé.
  const strictPresenceQuizIdsKey = quizzes
    .filter(quiz => !quiz.is_public)
    .map(quiz => quiz.id)
    .sort()
    .join('|');

  useEffect(() => {
    const quizIds = strictPresenceQuizIdsKey ? strictPresenceQuizIdsKey.split('|') : [];
    if (!supabaseService.isConfigured() || quizIds.length === 0) {
      setRetryAuthorizedQuizIds(new Set());
      return;
    }

    let cancelled = false;
    const refreshRetryAuthorizations = async () => {
      const resolvedAuthorizations = new Map<string, boolean>();
      await Promise.all(quizIds.map(async quizId => {
        try {
          const active = await supabaseService.getStudentActiveLaunch(quizId);
          resolvedAuthorizations.set(quizId, active?.participant.presence_status === 'retry_authorized');
        } catch (error) {
          console.warn('Vérification de seconde chance indisponible:', error);
        }
      }));
      if (!cancelled) setRetryAuthorizedQuizIds(previous => {
        const next = new Set(previous);
        resolvedAuthorizations.forEach((isAuthorized, quizId) => {
          if (isAuthorized) next.add(quizId);
          else next.delete(quizId);
        });
        return next;
      });
    };

    void refreshRetryAuthorizations();
    const interval = window.setInterval(() => void refreshRetryAuthorizations(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [strictPresenceQuizIdsKey]);

  useEffect(() => {
    if (!supabaseService.isConfigured()) return;
    let cancelled = false;
    let checking = false;
    let signedOut = false;

    const verifyRosterEntry = async () => {
      const studentId = currentUser.student_id || studentRecord?.id;
      if (!studentId || checking || signedOut) return;
      checking = true;
      try {
        const isActive = await supabaseService.isStudentRosterEntryActive(studentId);
        if (!isActive && !cancelled) {
          signedOut = true;
          try {
            await supabaseService.signOutStudent();
          } catch (error) {
            console.warn('Déconnexion après suppression de la fiche étudiant :', error);
          }
          if (!cancelled) onLogout();
        }
      } catch (error) {
        // Une panne réseau ne doit pas déconnecter un élève dont la fiche existe toujours.
        console.warn('Vérification périodique de la fiche étudiant indisponible :', error);
      } finally {
        checking = false;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) void verifyRosterEntry();
    };

    void verifyRosterEntry();
    const interval = window.setInterval(verifyRosterEntry, 15000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser.student_id, onLogout, studentRecord?.id]);

  // Anti-triche : les événements blur sont particulièrement imprécis sur iOS,
  // notamment lors de l'ouverture du clavier; ils ne sont donc jamais utilisés sur mobile.
  useEffect(() => {
    if (!activeQuiz) return;

    const gracePeriodMs = 2000;
    const debounceMs = 1500;
    const startedAt = Date.now();
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let violationTimer: number | null = null;

    const clearViolationTimer = () => {
      if (violationTimer !== null) {
        window.clearTimeout(violationTimer);
        violationTimer = null;
      }
    };

    const scheduleViolationCheck = () => {
      clearViolationTimer();
      const graceRemainingMs = Math.max(0, gracePeriodMs - (Date.now() - startedAt));
      violationTimer = window.setTimeout(() => {
        violationTimer = null;
        const actuallyAway = document.hidden || (!isMobileDevice && !document.hasFocus());
        if (actuallyAway) {
          setAntiCheatNotice(true);
          void handleSubmitQuiz(true);
        }
      }, graceRemainingMs + debounceMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) scheduleViolationCheck();
      else clearViolationTimer();
    };

    const handleBlur = () => {
      // Sur téléphone, le clavier, les notifications et l’interface du navigateur peuvent produire blur.
      if (!isMobileDevice) scheduleViolationCheck();
    };

    const handleFocus = () => clearViolationTimer();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      clearViolationTimer();
    };
  }, [activeQuiz, isPracticeMode]);

  // 1. Chronomètre du temps total du Quiz (en pause pendant l'affichage de l'explication)
  useEffect(() => {
    if (!activeQuiz || quizSecondsRemaining <= 0 || incorrectFeedback?.isOpen) return;

    const timer = setInterval(() => {
      setQuizSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // En entraînement, le résultat reste local; un quiz officiel est soumis normalement.
          if (isPracticeMode) {
          finishTutorialQuiz(quizAnswersRef.current);
          } else {
            handleSubmitQuiz(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeQuiz, quizSecondsRemaining, incorrectFeedback?.isOpen, isPracticeMode]);

  const activeQuestionMaxSeconds = activeQuiz
    ? getQuestionTimeSeconds(activeQuiz.questions[currentQuestionIndex])
    : 30;

  useAssessmentTimerBeeper({
    active: Boolean(activeQuiz),
    paused: Boolean(incorrectFeedback?.isOpen),
    questionKey: activeQuiz ? `${activeQuiz.id}:${currentQuestionIndex}` : '',
    questionTotalSeconds: activeQuestionMaxSeconds,
    questionSecondsRemaining: activeQuiz ? questionSecondsRemaining : null,
    totalSecondsRemaining: activeQuiz ? quizSecondsRemaining : null,
    soundEnabled
  });

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
  }, [activeQuiz, questionSecondsRemaining, currentQuestionIndex, incorrectFeedback?.isOpen, isPracticeMode]);

  // 3. Décompte de la fenêtre d'explication pédagogique (13 secondes)
  useEffect(() => {
    if (!incorrectFeedback || !incorrectFeedback.isOpen) return;

    const fbTimer = setInterval(() => {
      setIncorrectFeedback(prev => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(fbTimer);
          // 13 secondes écoulées -> fermer l'explication et passer à la question suivante
          const pending = prev.pendingNextAnswers;
          advanceToNextQuestion(pending);
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    return () => clearInterval(fbTimer);
  }, [incorrectFeedback?.isOpen]);

  const startQuizSession = (quiz: Quiz, practiceMode: boolean, retryAttempt = false) => {
    primeTimerAudio();
    setIsRetryAttempt(retryAttempt);
    quizSubmissionLockRef.current = false;
    setIsSubmitting(false);
    setIsPracticeMode(practiceMode);
    setTutorialResult(null);
    setTimeoutNotice(false);
    setAntiCheatNotice(false);
    let restoredAnswers: Record<string, string> = {};
    if (!practiceMode) { try { const saved = localStorage.getItem('student_quiz_draft_' + getStudentQueryInfo().stId + '_' + quiz.id); if (saved) { const parsed = JSON.parse(saved); if (parsed && typeof parsed === 'object') restoredAnswers = parsed; } } catch { /* ignorer un brouillon illisible */ } }
    quizAnswersRef.current = restoredAnswers;
    setQuizAnswers(restoredAnswers);
    setIncompletePhraseConfirmation(null);
    setIncorrectFeedback(null);
    setCurrentQuestionIndex(0);
    const randomizedQuiz = {
      ...quiz,
      questions: shuffleQuizQuestions(quiz.questions || []).map((question) => question.type === 'reorder'
        ? { ...question, items: shuffleArray(question.items || []) }
        : question)
    };
    const totalSecs = getQuizTotalTimeSeconds(randomizedQuiz);
    const firstQuestionSeconds = getQuestionTimeSeconds(randomizedQuiz.questions[0]);
    setActiveQuiz(randomizedQuiz);
    setQuizSecondsRemaining(totalSecs);
    setQuestionSecondsRemaining(firstQuestionSeconds);
    setLastSubmissionResult(null);
    setQuizSubmissionError(null);
  };

  useEffect(() => {
    if (!presenceInitialization || presenceInitialization.phase !== 'initializing' || !presenceInitialization.deadlineAt || !presenceInitialization.launchId) return;

    let timer: number | undefined;
    let validationStarted = false;
    const { quiz, launchId, deadlineAt } = presenceInitialization;
    const checkLaunchAndStart = async () => {
      if (validationStarted) return;
      validationStarted = true;
      setPresenceInitialization(current => current ? { ...current, phase: 'validating' } : current);
      try {
        const active = await supabaseService.getStudentActiveLaunch(quiz.id);
        if (!active || active.launch.id !== launchId || !['present', 'retry_authorized'].includes(active.participant.presence_status)) {
          throw new Error('Le professeur a clôturé ce quiz pendant l’initialisation. Vous ne pouvez plus le commencer.');
        }
        setPresenceStartError(null);
        setPresenceInitialization(null);
        startQuizSession(quiz, false, presenceInitialization.retryAuthorized === true);
      } catch (error) {
        setPresenceInitialization(null);
        setPresenceStartError(error instanceof Error ? error.message : 'Impossible de démarrer ce quiz.');
      }
    };

    const tick = () => {
      const secondsRemaining = getPresenceInitializationRemainingSeconds(deadlineAt);
      setPresenceInitSecondsRemaining(secondsRemaining);
      if (secondsRemaining === 0) {
        if (timer !== undefined) window.clearTimeout(timer);
        void checkLaunchAndStart();
        return;
      }
      timer = window.setTimeout(tick, 200);
    };

    tick();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [presenceInitialization]);

  const handleStartQuiz = async (quiz: Quiz) => {
    // Un nouvel essai n'est possible qu'avec une autorisation serveur explicite.
    const { stId, stName, stNum, classId } = getStudentQueryInfo();
    const freshSubs = dataService.getStudentSubmissions(stId, stName, stNum, classId);
    const alreadySubmitted = mySubmissions.some(s => s.quiz_id === quiz.id) || freshSubs.some(s => s.quiz_id === quiz.id);
    const strictPresence = quiz.attendance_mode === 'strict_presence' && !quiz.is_public && supabaseService.isConfigured();
    // Les quiz historiques peuvent aussi recevoir une autorisation individuelle
    // liée à un lancement de présence. Ne vérifier cette voie que si l'élève a
    // déjà une soumission : les autres quiz legacy gardent leur parcours inchangé.
    let authorizedLegacyRetry = false;
    if (!strictPresence && alreadySubmitted && !quiz.is_public && supabaseService.isConfigured()) {
      try {
        const active = await supabaseService.getStudentActiveLaunch(quiz.id);
        authorizedLegacyRetry = active?.participant.presence_status === 'retry_authorized';
      } catch (error) {
        console.warn('Vérification de seconde chance legacy indisponible:', error);
      }
    }
    const usePresenceRetryFlow = strictPresence || authorizedLegacyRetry;
    setPresenceStartError(null);

    if (usePresenceRetryFlow) {
      primeTimerAudio();
      setPresenceInitSecondsRemaining(QUIZ_PRESENCE_INITIALIZATION_SECONDS);
      setPresenceInitialization({ quiz, phase: 'confirming' });
      try {
        const activeLaunch = await supabaseService.getStudentActiveLaunch(quiz.id);
        if (!activeLaunch) throw new Error('Ce quiz a été clôturé ou vous n’êtes pas inscrit au lancement actif.');
        const retryAuthorized = activeLaunch.participant.presence_status === 'retry_authorized';
        if (alreadySubmitted && !retryAuthorized) {
          setPresenceInitialization(null);
          setConfirmDialog({
            isOpen: true,
            title: 'Quiz déjà effectué',
            message: 'Vous avez déjà passé cette évaluation. Une nouvelle tentative est possible uniquement si le professeur vous accorde une seconde chance.',
            confirmLabel: 'J\'ai compris',
            variant: 'primary',
            action: () => {}
          });
          return;
        }
        const participant = await supabaseService.confirmQuizPresence(activeLaunch.launch.id);
        if (!participant.presence_deadline_at || !Number.isFinite(Date.parse(participant.presence_deadline_at))) {
          throw new Error('La migration « délai par élève » n’est pas encore appliquée dans Supabase.');
        }
        setPresenceInitSecondsRemaining(getPresenceInitializationRemainingSeconds(participant.presence_deadline_at));
        setPresenceInitialization({
          quiz,
          phase: 'initializing',
          launchId: activeLaunch.launch.id,
          deadlineAt: participant.presence_deadline_at,
          retryAuthorized
        });
      } catch (error) {
        setPresenceInitialization(null);
        setPresenceStartError(error instanceof Error ? error.message : 'Votre présence n’a pas pu être confirmée.');
      }
      return;
    }

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

    startQuizSession(quiz, false);
  };

  const handleStartTutorial = () => {
    const { classId } = getStudentQueryInfo();
    const className = classesList.find((classRoom) => classRoom.id === classId)?.name || 'Entraînement';
    startQuizSession(createTutorialQuiz(classId, className), true);
  };

  const handleExitTutorial = () => {
    if (!isPracticeMode) return;
    setActiveQuiz(null);
    setIsPracticeMode(false);
    setCurrentQuestionIndex(0);
    quizAnswersRef.current = {};
    setQuizAnswers({});
    setQuestionSecondsRemaining(0);
    setQuizSecondsRemaining(0);
    setIncorrectFeedback(null);
    setQuizSubmissionError(null);
    setIsSubmitting(false);
    quizSubmissionLockRef.current = false;
  };

  // Fonction utilitaire pour tester si une réponse est correcte
  const isAnswerCorrect = (q: QuizQuestion, studentAns: string) => {
    return isQuestionAnswerCorrect(q, studentAns);
  };

  // Passage à la question suivante ou soumission finale
  const advanceToNextQuestion = (updatedAnswers: Record<string, string>) => {
    if (!activeQuiz) return;
    const questions = activeQuiz.questions || [];
    if (currentQuestionIndex >= questions.length - 1) {
      if (isPracticeMode) {
        finishTutorialQuiz(updatedAnswers);
      } else {
        void handleSubmitQuiz(false, updatedAnswers);
      }
      return;
    }
    const nextIndex = Math.min(currentQuestionIndex + 1, questions.length - 1);
    setCurrentQuestionIndex(nextIndex);
    setQuestionSecondsRemaining(getQuestionTimeSeconds(questions[nextIndex]));
  };

  const handleCloseCorrection = () => {
    if (!incorrectFeedback) return;
    const pendingAnswers = incorrectFeedback.pendingNextAnswers;
    setIncorrectFeedback(null);
    advanceToNextQuestion(pendingAnswers);
  };

  // Traiter la réponse de la question : si fausse, afficher l'explication pendant 13s
  const processQuestionProgression = (
    updatedAnswers: Record<string, string>,
    isTimeout: boolean = false
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
      // Réponse fausse ou temps écoulé :
      // Afficher la correction et l'explication pendant 13 secondes (temps hors chronomètre quiz)
      setIncorrectFeedback({
        isOpen: true,
        questionNumber: currentQuestionIndex + 1,
        questionText: currentQ.question,
        studentAnswer: currentQ.type === 'reorder'
          ? formatReorderAnswer(currentQ, studentAns)
          : currentQ.type === 'text'
          ? formatTextAnswerForDisplay(currentQ, studentAns)
          : currentQ.type === 'verbes_trous' && currentQ.verbes_trous
          ? currentQ.verbes_trous.phrases.map((phrase) => { const response = parseVerbesTrousAnswers(studentAns)[String(phrase.id)]; return `${phrase.debut || ''}__[${response?.verbe_choisi || '—'}]__ ${response?.texte_saisi || '—'}${phrase.fin || ''}`; }).join('\n')
          : studentAns,
        correctAnswer: currentQ.type === 'reorder'
          ? formatCorrectReorderAnswer(currentQ)
          : currentQ.type === 'text'
          ? formatCorrectTextAnswerForDisplay(currentQ)
          : currentQ.type === 'verbes_trous' && currentQ.verbes_trous
          ? currentQ.verbes_trous.phrases.map((phrase) => `${phrase.debut || ''}__[${phrase.verbe || ''}]__ ${(phrase.reponses || []).join(' / ')}${phrase.fin || ''}`).join('\n')
          : currentQ.correct_answer,
        explanation: currentQ.explanation,
        countdown: CORRECTION_DISPLAY_SECONDS,
        pendingNextAnswers: updatedAnswers,
        isTimeout,
        points: calculateQuestionPointsEarned(currentQ, studentAns).awardedPoints,
        maxPoints: calculateQuestionPointsEarned(currentQ, studentAns).maxPoints
      });
    }
  };

  // Si le temps de la question est écoulé -> note 0 pour cette question et on analyse
  const handleQuestionTimeExpired = () => {
    if (!activeQuiz) return;
    const currentQ = activeQuiz.questions[currentQuestionIndex];
    if (!currentQ) return;

    const currentAns = quizAnswersRef.current[currentQ.id] || '';
    const updated = { ...quizAnswersRef.current, [currentQ.id]: currentAns };
    quizAnswersRef.current = updated;
    setQuizAnswers(updated);

    processQuestionProgression(updated, true);
  };

  // L'élève valide sa réponse pour la question courante et passe à la suite
  const handleAnswerAndNext = () => {
    if (!activeQuiz) return;
    const currentQ = activeQuiz.questions[currentQuestionIndex];
    if (currentQ?.type === 'verbes_trous' && currentQ.verbes_trous) {
      const response = parseVerbesTrousAnswers(quizAnswersRef.current[currentQ.id] || '');
      const missing = currentQ.verbes_trous.phrases.filter((phrase) => !response[String(phrase.id)]?.verbe_choisi).length;
      if (missing > 0) {
        setIncompletePhraseConfirmation(missing);
        return;
      }
    }
    setIncompletePhraseConfirmation(null);
    processQuestionProgression(quizAnswersRef.current, false);
  };

  const finishTutorialQuiz = (answers: Record<string, string>) => {
    if (!activeQuiz || !isPracticeMode || quizSubmissionLockRef.current) return;
    quizSubmissionLockRef.current = true;
    quizAnswersRef.current = answers;
    setQuizAnswers(answers);
    setTutorialResult(scoreTutorialQuiz(activeQuiz, answers));
    try { localStorage.removeItem('student_quiz_draft_' + getStudentQueryInfo().stId + '_' + activeQuiz.id); } catch { /* stockage local indisponible */ }
    setLastSubmissionResult(null);
    setQuizSubmissionError(null);
    setActiveQuiz(null);
    setCurrentQuestionIndex(0);
    setQuestionSecondsRemaining(0);
    setQuizSecondsRemaining(0);
    setIsPracticeMode(false);
    setIsSubmitting(false);
    setTimeoutNotice(false);
    setAntiCheatNotice(false);
  };

  const handleSubmitQuiz = async (isAutoTimeout = false, customAnswers?: Record<string, string>) => {
    if (!activeQuiz) return;
    if (isPracticeMode) {
      finishTutorialQuiz(customAnswers || quizAnswersRef.current);
      return;
    }
    if (quizSubmissionLockRef.current) return;
    quizSubmissionLockRef.current = true;
    setIsSubmitting(true);
    setQuizSubmissionError(null);

    const answersToSubmit = customAnswers || quizAnswersRef.current;
    quizAnswersRef.current = answersToSubmit;
    setQuizAnswers(answersToSubmit);

    const { stId, stName, stNum } = getStudentQueryInfo();
    const clId = activeQuiz.class_id;

    try {
      const result = await dataService.submitQuiz(
        activeQuiz.id,
        stId,
        stName,
        stNum,
        clId,
        answersToSubmit,
        isAutoTimeout,
        undefined,
        isRetryAttempt
      );

      try { localStorage.removeItem('student_quiz_draft_' + getStudentQueryInfo().stId + '_' + activeQuiz.id); } catch { /* stockage local indisponible */ }
      setActiveQuiz(null);
      setCurrentQuestionIndex(0);
      setLastSubmissionResult(result);
      setIsRetryAttempt(false);
      loadData();

      if (isAutoTimeout) {
        setTimeoutNotice(true);
      }
    } catch (error) {
      setQuizSubmissionError(error instanceof Error
        ? error.message
        : 'Le résultat n’a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.');
    } finally {
      quizSubmissionLockRef.current = false;
      setIsSubmitting(false);
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
      const avatarIsNewUpload = editAvatar.startsWith('data:image/');
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
        gender: editGender,
        avatar_url: savedAvatar || null
      });
      const ok = authService.updateStudentProfile(studentId, {
        firstName: editFirstName,
        lastName: editLastName,
        studentNumber: editStudentNumber,
        gender: editGender,
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
  const studentGender = studentRecord?.gender || currentUser.gender || 'homme';
  const welcomePhoto = studentGender === 'femme' ? '/student-space-welcome-female.webp' : studentHeroPhoto;

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
    <div className={`student-space min-h-svh flex flex-col text-slate-900 ${isStandaloneModule ? "written-exam-fullscreen-active" : ""}`}>
      {!isStandaloneModule && <header className="student-topbar sticky top-0 z-20 px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <img src="/percky-lingua-logo.webp" alt="" className="h-9 w-9 shrink-0 object-contain sm:h-11 sm:w-11" />
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
                className="h-10 w-10 border-2 border-white text-xs sm:h-11 sm:w-11 sm:text-sm"
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
      </header>}

      {/* Main Container */}
      <main className={isStandaloneModule ? "fixed inset-0 z-[100] flex min-h-svh w-full flex-col overflow-y-auto bg-slate-50 p-0" : "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6"}>
        {!isStandaloneModule && <section className="student-welcome" aria-labelledby="student-welcome-title">
          <div className="student-welcome-photo" aria-hidden="true">
            <img src={welcomePhoto} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = studentHeroPhoto; }} />
            <div className="student-welcome-photo-fade" />
            <div className="student-welcome-flag" />
          </div>

          <div className="student-welcome-copy">
            <div className="student-avatar-ring student-welcome-avatar">
              <img
                src="/student-space-welcome-avatar.webp"
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
              <h1 id="student-welcome-title">{studentGender === 'femme' ? 'Benvenuta' : 'Benvenuto'}, {greetingName}!</h1>
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
        </section>}

        {!isStandaloneModule && <nav className="student-tabs" aria-label="Navigation de l’espace étudiant">
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
        </nav>}

        {activeTab === 'classes' && (
          <StudentClassesView studentId={currentUser.student_id || studentRecord?.id || ''} />
        )}

        {activeTab === 'lessons' && (
          <LessonsStudentView
            currentUser={currentUser}
            onOpenQuiz={() => setActiveTab('quizzes')}
          />
        )}

        {activeTab === 'exercises' && <ExercisesStudentView onFullscreenChange={setIsExerciseFullscreen} />}

        {activeTab === 'written_exams' && <StudentWrittenExamsView currentUser={currentUser} onFullscreenChange={setIsWrittenExamFullscreen} />}

        {/* TAB 1: QUIZZES EN DIRECT & HISTORIQUE */}
        {activeTab === 'quizzes' && !activeQuiz && (
          <div className="space-y-6">
            
            {presenceStartError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{presenceStartError}</span>
              </div>
            )}

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
                      {tutorialResult ? '🛡️ Entraînement interrompu • Fenêtre quittée' : '🛡️ Alerte Anti-Triche • Fenêtre quittée'}
                    </h3>
                    <p className="text-xs text-amber-900">
                      {tutorialResult
                        ? 'Vous avez quitté la fenêtre ou l’onglet pendant le tutoriel. L’entraînement a été arrêté avec un résultat local; aucune note officielle n’a été enregistrée.'
                        : 'Vous avez quitté la fenêtre ou l’onglet d’évaluation en cours. Conformément au règlement anti-triche, votre quiz a été automatiquement soumis et verrouillé.'}
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

            {tutorialResult && (
              <div role="status" className="flex flex-col gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">Entraînement terminé · résultat local</span>
                  <h3 className="mt-1 text-sm font-bold text-emerald-950">Votre résultat de démonstration : {tutorialResult.score} / {tutorialResult.maxScore} points ({tutorialResult.score20} / 20).</h3>
                  <p className="mt-1 text-xs text-emerald-900">Ce résultat n’est pas enregistré et n’apparaît ni dans vos notes journalières ni dans le classement. Vous pouvez refaire le tutoriel autant de fois que vous le souhaitez.</p>
                </div>
                <button type="button" onClick={handleStartTutorial} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900">
                  <RotateCcw className="h-3.5 w-3.5" /> Recommencer
                </button>
              </div>
            )}

            <LearningModuleHeader
              kicker="Évaluations & entraînement"
              title="Quiz du professeur"
              description="Passez les quiz pendant leur disponibilité en direct ou testez le format complet avec le tutoriel."
            />

            <LearningCard>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <LearningCardHeader
                    kicker="Entraînement · Essais illimités"
                    status={<StatusBadge tone="info" icon={<Clock className="h-3 w-3" />}>5 questions · ~2 min 15</StatusBadge>}
                  />
                  <h2 className="font-display text-base font-extrabold text-[#072a3f] sm:text-lg">
                    Découvrir comment passer un quiz
                  </h2>
                  <p className="max-w-3xl text-xs leading-relaxed text-[#46657a] sm:text-[13px]">
                    Testez les QCM, la réponse écrite, les phrases à trous et la remise en ordre avec la même interface, les chronomètres, les bips et le contrôle anti-triche. Le résultat reste local et n’affecte pas vos notes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleStartTutorial}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0b3c5d] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#072a3f] whitespace-nowrap sm:text-[13px]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Démarrer le tutoriel</span>
                </button>
              </div>
            </LearningCard>

            {/* Quizzes List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="student-section-title">
                  <BookOpen className="h-5 w-5 text-[#0b3c5d]" />
                  <span>Quiz assignés à votre classe</span>
                </h2>
                {quizzes.length > 0 && (
                  <span className="text-xs font-bold tabular-nums text-[#607f93]">
                    {quizzes.length} quiz
                  </span>
                )}
              </div>

              {quizzes.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#b9cfdd] bg-white/90 p-8 text-center text-xs text-[#607f93] sm:text-sm">
                  Aucun quiz n'a encore été créé pour votre classe par le professeur.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {quizzes.map(quiz => {
                    const done = hasCompletedQuiz(quiz.id);
                    const { stId, stName, stNum } = getStudentQueryInfo();
                    const sub = mySubmissions.find(s => s.quiz_id === quiz.id)
                      || dataService.getStudentSubmissions(stId, stName, stNum).find(s => s.quiz_id === quiz.id);
                    const hasSubmission = done || Boolean(sub);
                    const isCompleted = sub?.status === 'completed';
                    const isTimedOut = sub?.status === 'timeout';
                    const isMissed = sub?.status === 'missed';
                    const hasRetryAuthorization = retryAuthorizedQuizIds.has(quiz.id);
                    const isLive = canStudentStartQuiz(quiz.status, hasSubmission, hasRetryAuthorization);
                    const durationText = formatQuizDuration(getQuizTotalTimeSeconds(quiz));

                    const statusBadge = isLive ? (
                      <StatusBadge
                        tone="live"
                        icon={<Play className="h-3 w-3 fill-current" />}
                        title="Le quiz reste accessible jusqu’à sa clôture manuelle."
                      >
                        {hasRetryAuthorization ? 'Seconde chance' : 'En direct'}
                      </StatusBadge>
                    ) : isCompleted ? (
                      <StatusBadge tone="success" icon={<Check className="h-3 w-3" />}>
                        Quiz soumis
                      </StatusBadge>
                    ) : isTimedOut ? (
                      <StatusBadge tone="warning" icon={<AlertCircle className="h-3 w-3" />}>
                        Clôturé auto
                      </StatusBadge>
                    ) : isMissed ? (
                      <StatusBadge tone="danger" icon={<Clock className="h-3 w-3" />}>
                        Non rendu
                      </StatusBadge>
                    ) : hasSubmission ? (
                      <StatusBadge tone="success" icon={<Check className="h-3 w-3" />}>
                        Enregistré
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral" icon={<Clock className="h-3 w-3" />}>
                        En attente
                      </StatusBadge>
                    );

                    const metrics = [
                      {
                        label: 'Questions',
                        value: `${quiz.questions?.length || 0}`
                      },
                      {
                        label: 'Durée totale',
                        value: durationText
                      },
                      hasSubmission && sub
                        ? {
                            label: hasRetryAuthorization ? 'Précédent' : 'Note',
                            value: `${sub.score_20} / 20`,
                            tone: (sub.score_20 > 0 ? 'success' : 'danger') as 'success' | 'danger'
                          }
                        : {
                            label: 'Barème',
                            value: `${quiz.total_points || 20} pts`
                          }
                    ];

                    return (
                      <LearningCard key={quiz.id} active={isLive}>
                        <LearningCardHeader
                          kicker={
                            <>
                              {quiz.category || 'Autre'}
                              {quiz.level ? ` · ${quiz.level}` : ''}
                            </>
                          }
                          status={statusBadge}
                        />

                        <div className="min-w-0 space-y-1.5">
                          <h3 className="break-words text-base font-extrabold leading-snug text-[#072a3f] sm:text-lg">
                            {quiz.title}
                          </h3>
                          {quiz.description && (
                            <p className="line-clamp-2 break-words text-xs leading-relaxed text-[#46657a] sm:text-[13px]">
                              {quiz.description}
                            </p>
                          )}
                        </div>

                        <LearningCardMetrics items={metrics} columns={3} />

                        <LearningCardFooter>
                          {isLive ? (
                            <>
                              {hasRetryAuthorization && sub && (
                                <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#0b3c5d]">
                                  <RotateCcw className="h-3.5 w-3.5 shrink-0 text-[#2fa36b]" />
                                  <span>Seconde chance accordée · barème {quiz.total_points || 20} pts</span>
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStartQuiz(quiz)}
                                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] active:scale-[.99] sm:text-[13px]"
                              >
                                <Play className="h-4 w-4 fill-current" />
                                <span>
                                  {hasRetryAuthorization ? 'Commencer la seconde chance' : 'Commencer le Quiz'} ({durationText})
                                </span>
                              </button>
                            </>
                          ) : hasSubmission && sub ? (
                            <div className="flex min-h-[40px] items-center justify-between gap-2 rounded-xl bg-[#f5f9fc] px-3 py-2 text-xs font-semibold text-[#46657a]">
                              <span className="flex items-center gap-1.5">
                                {sub.status === 'missed' ? (
                                  <Clock className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 shrink-0 text-[#607f93]" />
                                )}
                                <span>
                                  {sub.status === 'missed'
                                    ? 'Délai dépassé · non rendu'
                                    : 'Tentative verrouillée · note définitive'}
                                </span>
                              </span>
                              <span className="shrink-0 font-bold tabular-nums text-[#072a3f]">
                                {quiz.total_points || 20} pts
                              </span>
                            </div>
                          ) : (
                            <div className="flex min-h-[40px] items-center justify-between gap-2 rounded-xl bg-[#f5f9fc] px-3 py-2 text-xs font-semibold text-[#607f93]">
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span>En attente de lancement par le professeur</span>
                              </span>
                            </div>
                          )}
                        </LearningCardFooter>
                      </LearningCard>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ACTIVE TEST MODE (Interface unifiée PerckyLingua) */}
        {activeQuiz && (() => {
          const questions = activeQuiz.questions || [];
          const totalQuestions = questions.length;
          const safeIndex = Math.min(Math.max(0, currentQuestionIndex), Math.max(0, totalQuestions - 1));
          const currentQ = questions[safeIndex];
          const currentAnswer = currentQ ? (quizAnswers[currentQ.id] || '') : '';
          const maxQSecs = currentQ ? getQuestionTimeSeconds(currentQ) : 1;
          const clozeInfo = currentQ?.type === 'text' ? parseQuestionClozePrompt(currentQ.question) : null;
          const isLastQuestion = safeIndex + 1 === totalQuestions;

          return (
            <AssessmentShell
              modeTone={isPracticeMode ? 'training' : 'official'}
              bannerLabel={
                isPracticeMode
                  ? 'MODE ENTRAÎNEMENT • Résultat non enregistré'
                  : 'MODE SÉCURISÉ ANTI-TRICHE • Capture d’écran strictement interdite'
              }
              bannerMobileLabel={isPracticeMode ? 'MODE ENTRAÎNEMENT' : 'MODE SÉCURISÉ ANTI-TRICHE'}
              bannerRight={
                !isPracticeMode
                  ? `${currentUser.name} • ${currentUser.student_number || 'N°1'} • Session officielle`
                  : undefined
              }
              onExit={isPracticeMode ? handleExitTutorial : undefined}
              exitLabel="Quitter"
              kicker={isPracticeMode ? 'Tutoriel interactif' : `Quiz · ${activeQuiz.class_name || 'Classe'}`}
              title={activeQuiz.title}
              questionIndex={safeIndex}
              totalQuestions={totalQuestions}
              completedMap={questions.map((q) => Boolean(quizAnswers[q.id]))}
              questionSecondsRemaining={questionSecondsRemaining}
              questionTotalSeconds={maxQSecs}
              totalSecondsRemaining={quizSecondsRemaining}
              soundEnabled={soundEnabled}
              onToggleSound={toggleSound}
              zIndexClass="z-[110]"
              alerts={
                quizSubmissionError ? (
                  <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-900 sm:text-sm">
                    {quizSubmissionError} Cliquez sur le bouton de validation pour réessayer.
                  </div>
                ) : null
              }
              footerAction={
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={
                    quizSubmissionError
                      ? () => void handleSubmitQuiz(quizSecondsRemaining <= 0)
                      : handleAnswerAndNext
                  }
                  className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors active:scale-[.99] disabled:opacity-50 sm:w-auto ${
                    isLastQuestion ? 'bg-[#2fa36b] hover:bg-[#248556]' : 'bg-[#072a3f] hover:bg-[#0b3c5d]'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{isPracticeMode ? 'Calcul du résultat local…' : 'Enregistrement du résultat…'}</span>
                    </>
                  ) : quizSubmissionError ? (
                    <span>Réessayer la validation</span>
                  ) : isLastQuestion ? (
                    <>
                      <Save className="h-4 w-4" />
                      <span>
                        {isPracticeMode
                          ? 'Terminer le tutoriel'
                          : currentQ?.type === 'verbes_trous'
                            ? 'Corriger et terminer'
                            : 'Valider et terminer le quiz'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{currentQ?.type === 'verbes_trous' ? 'Corriger et continuer' : 'Valider et continuer'}</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              }
              modals={
                <>
                  {incompletePhraseConfirmation !== null && (
                    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#051e2e]/70 p-4 backdrop-blur-xs">
                      <section role="alertdialog" aria-modal="true" aria-labelledby="student-vt-confirm" className="w-full max-w-sm rounded-2xl border border-[#d8e6ee] bg-white p-5 shadow-2xl">
                        <h2 id="student-vt-confirm" className="text-base font-extrabold text-[#072a3f]">
                          Il reste {incompletePhraseConfirmation} phrase{incompletePhraseConfirmation > 1 ? 's' : ''} sans réponse.
                        </h2>
                        <p className="mt-2 text-sm text-[#46657a]">Corriger quand même ?</p>
                        <div className="mt-5 flex gap-2">
                          <button type="button" onClick={() => setIncompletePhraseConfirmation(null)} className="min-h-11 flex-1 rounded-xl border border-[#d8e6ee] px-3 text-sm font-bold text-[#072a3f] hover:bg-[#f3f8fb]">
                            Continuer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIncompletePhraseConfirmation(null);
                              processQuestionProgression(quizAnswersRef.current, false);
                            }}
                            className="min-h-11 flex-1 rounded-xl bg-[#072a3f] px-3 text-sm font-bold text-white hover:bg-[#0b3c5d]"
                          >
                            Corriger
                          </button>
                        </div>
                      </section>
                    </div>
                  )}

                  <AssessmentCorrectionModal
                    isOpen={Boolean(incorrectFeedback && incorrectFeedback.isOpen)}
                    isCorrect={false}
                    isTimeout={Boolean(incorrectFeedback?.isTimeout)}
                    questionNumber={incorrectFeedback?.questionNumber ?? safeIndex + 1}
                    questionText={incorrectFeedback?.questionText ?? ''}
                    studentAnswer={incorrectFeedback?.studentAnswer ?? ''}
                    expectedAnswer={incorrectFeedback?.correctAnswer ?? ''}
                    explanation={incorrectFeedback?.explanation}
                    points={incorrectFeedback?.points ?? 0}
                    maxPoints={incorrectFeedback?.maxPoints ?? 0}
                    countdownSeconds={incorrectFeedback?.countdown ?? CORRECTION_DISPLAY_SECONDS}
                    totalCountdownSeconds={CORRECTION_DISPLAY_SECONDS}
                    isLastQuestion={isLastQuestion}
                    onContinue={handleCloseCorrection}
                  />
                </>
              }
            >
              {currentQ ? (
                <div key={`${activeQuiz.id}-${safeIndex}-${currentQ.id}`} className="space-y-5">
                  <AssessmentQuestionHeader
                    questionNumber={safeIndex + 1}
                    type={currentQ.type}
                    points={currentQ.points}
                    prompt={clozeInfo?.hasBlanks ? clozeInfo.prompt : currentQ.question}
                  />

                  <div>
                    {currentQ.type === 'qcm' && (
                      <AssessmentQcmOptions
                        options={(currentQ.options || []).map((opt) => ({ value: opt, label: opt }))}
                        selectedValue={currentAnswer}
                        onSelect={(opt) => updateQuizAnswer(currentQ.id, opt)}
                      />
                    )}

                    {currentQ.type === 'reorder' && (
                      <QuizReorderList
                        question={currentQ}
                        answer={currentAnswer}
                        onChange={(newOrderJson) => updateQuizAnswer(currentQ.id, newOrderJson)}
                        theme="navy"
                      />
                    )}

                    {currentQ.type === 'verbes_trous' && currentQ.verbes_trous && (
                      <VerbesTrousQuestion
                        definition={currentQ.verbes_trous}
                        answer={currentAnswer}
                        onChange={(newAnswer) => updateQuizAnswer(currentQ.id, newAnswer)}
                        onEnterPress={handleAnswerAndNext}
                        showCorrection={false}
                      />
                    )}

                    {currentQ.type === 'text' && (
                      <QuizClozeInput
                        question={currentQ}
                        customSentence={clozeInfo?.hasBlanks ? clozeInfo.sentence : undefined}
                        answer={currentAnswer}
                        onChange={(newAnswer) => updateQuizAnswer(currentQ.id, newAnswer)}
                        theme="navy"
                        onEnterPress={handleAnswerAndNext}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </AssessmentShell>
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
                <label htmlFor="student-profile-gender" className="text-xs font-bold text-slate-700">Sexe</label>
                <select
                  id="student-profile-gender"
                  required
                  value={editGender}
                  onChange={e => setEditGender(e.target.value === 'femme' ? 'femme' : 'homme')}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                >
                  <option value="homme">Homme</option>
                  <option value="femme">Femme</option>
                </select>
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
                helperText="Formats JPG, PNG ou WebP acceptés ; la photo est convertie en WebP et compressée automatiquement."
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

      {!isStandaloneModule && <footer className="student-footer">
        PerckyLingua • Apprendre et progresser en italien
      </footer>}

      {presenceInitialization && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4 text-white" role="status" aria-live="polite">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-7 text-center shadow-2xl sm:p-9">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-400/10 text-emerald-300">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            </div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-300">
              {presenceInitialization.phase === 'confirming' ? 'Sécurisation de votre participation' : 'Présence individuelle confirmée'}
            </p>
            <h2 className="mt-2 font-display text-xl font-extrabold sm:text-2xl">
              {presenceInitialization.phase === 'confirming'
                ? 'Confirmation de votre présence…'
                : presenceInitialization.phase === 'validating'
                  ? 'Vérification du lancement…'
                  : 'Initialisation du quiz'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {presenceInitialization.phase === 'initializing'
                ? 'Votre présence est enregistrée. Nous préparons votre session avant d’ouvrir la première question.'
                : 'Le quiz est vérifié côté serveur avant de commencer.'}
            </p>
            {presenceInitialization.phase === 'initializing' && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-xs font-semibold text-slate-300">Ouverture dans</span>
                <div className="mt-1 font-mono text-3xl font-black tabular-nums text-white">{presenceInitSecondsRemaining} s</div>
              </div>
            )}
            <p className="mt-5 text-[11px] leading-relaxed text-slate-400">
              Ces 10 secondes commencent à votre clic sur « Commencer », pas au lancement du professeur. Le quiz reste accessible tant qu’il n’est pas clôturé.
            </p>
          </section>
        </div>
      )}

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
