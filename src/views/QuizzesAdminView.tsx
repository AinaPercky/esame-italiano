import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
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
  Trophy,
  Share2,
  Lock,
  Copy,
  Download,
  Upload,
  FileCode,
  Globe,
  RotateCcw,
  QrCode,
  ExternalLink,
  ShieldCheck,
  Search,
  SlidersHorizontal
} from 'lucide-react';
import { Quiz, QuizQuestion, ClassRoom, Student, QuizSubmission, DailyGrade, QUIZ_CATEGORIES, QuizCategory } from '../types';
import { dataService } from '../services/dataService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ClassLeaderboard } from '../components/ClassLeaderboard';
import { QuizAnalyticsDashboard } from '../components/QuizAnalyticsDashboard';
import { DEFAULT_QCM_TIME_SECONDS, DEFAULT_TEXT_TIME_SECONDS, formatQuizDuration, getQuestionTimeSeconds, getQuizTotalTimeSeconds } from '../utils/quizTiming';
import { createQuizReorderItem } from '../utils/quizReorder';
import quizImportTemplate from '../data/quiz-import-template.jsonc?raw';
import { parseJsonWithComments } from '../utils/parseJsonWithComments';

interface QuizzesAdminViewProps {
  classes: ClassRoom[];
  students: Student[];
  onRefresh?: () => void;
}

const normalizeQuizSearchText = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

const normalizeQuizCategory = (value: unknown): QuizCategory =>
  typeof value === 'string' && QUIZ_CATEGORIES.includes(value as QuizCategory)
    ? value as QuizCategory
    : 'Autre';

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
  const [quizSearchTerm, setQuizSearchTerm] = useState('');
  const [quizStatusFilter, setQuizStatusFilter] = useState<'all' | Quiz['status']>('all');
  const [quizVisibilityFilter, setQuizVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [quizCategoryFilter, setQuizCategoryFilter] = useState<'all' | QuizCategory>('all');
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [minQuestionCount, setMinQuestionCount] = useState('');
  const [maxQuestionCount, setMaxQuestionCount] = useState('');
  const [minSubmissionCount, setMinSubmissionCount] = useState('');
  const [maxSubmissionCount, setMaxSubmissionCount] = useState('');

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
  // Public Quiz State
  const [publicLinkCopied, setPublicLinkCopied] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');


  // Form State
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizCategory, setQuizCategory] = useState<QuizCategory | ''>('');
  const [selectedQuizClassIds, setSelectedQuizClassIds] = useState<string[]>(classes[0] ? [classes[0].id] : []);
  const [quizDuration, setQuizDuration] = useState(10);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  // JSON Export / Import in Quiz Editor modal
  const [isEditorExportOpen, setIsEditorExportOpen] = useState(false);
  const [isEditorImportOpen, setIsEditorImportOpen] = useState(false);
  const [editorJsonInput, setEditorJsonInput] = useState('');
  const [editorJsonError, setEditorJsonError] = useState<string | null>(null);
  const [editorExportCopied, setEditorExportCopied] = useState(false);

  // Helpers pour les questions de type text (mono-trou ou multi-trous ex: 4 verbes)
  const getQuestionBlankAnswers = (q: QuizQuestion): string[] => {
    if (Array.isArray(q.answers) && q.answers.length > 0) {
      return q.answers;
    }
    const raw = (q.correct_answer || '').trim();
    if (raw.includes('|')) {
      const parts = raw.split(/\s*\|\s*/).filter(Boolean);
      if (parts.length > 1) return parts;
    }
    return [raw];
  };

  const handleUpdateBlankAnswer = (qIdx: number, blankIdx: number, val: string) => {
    const blanks = [...getQuestionBlankAnswers(questions[qIdx])];
    while (blanks.length <= blankIdx) blanks.push('');
    blanks[blankIdx] = val;
    const updated = [...questions];
    updated[qIdx] = {
      ...updated[qIdx],
      answers: blanks.length > 1 ? blanks : undefined,
      correct_answer: blanks.join(' | ')
    };
    setQuestions(updated);
  };

  const handleAddBlank = (qIdx: number) => {
    const blanks = [...getQuestionBlankAnswers(questions[qIdx])];
    blanks.push('');
    const updated = [...questions];
    updated[qIdx] = {
      ...updated[qIdx],
      answers: blanks,
      correct_answer: blanks.join(' | ')
    };
    setQuestions(updated);
  };

  const handleRemoveBlank = (qIdx: number, blankIdx: number) => {
    const blanks = getQuestionBlankAnswers(questions[qIdx]).filter((_, i) => i !== blankIdx);
    const updated = [...questions];
    if (blanks.length <= 1) {
      updated[qIdx] = {
        ...updated[qIdx],
        answers: undefined,
        correct_answer: blanks[0] || ''
      };
    } else {
      updated[qIdx] = {
        ...updated[qIdx],
        answers: blanks,
        correct_answer: blanks.join(' | ')
      };
    }
    setQuestions(updated);
  };

  const handleAutoDetectBlanks = (qIdx: number) => {
    const q = questions[qIdx];
    const matches = Array.from((q.question || '').matchAll(/(_{2,}|\[_+\]|\[\s*\]|\[\d+\]|\.{3,}|\((?:_{2,}|\.{2,}|\s*)\)|\[(?:\.{2,}|\s*)\])/g));
    if (matches.length > 0) {
      const currentBlanks = getQuestionBlankAnswers(q);
      const newBlanks = Array.from({ length: matches.length }, (_, i) => currentBlanks[i] || '');
      const updated = [...questions];
      updated[qIdx] = {
        ...updated[qIdx],
        answers: newBlanks,
        correct_answer: newBlanks.join(' | ')
      };
      setQuestions(updated);
    }
  };

  // Génération du JSON complet pour le quiz en cours d'édition
  const getCurrentQuizJsonString = (): string => {
    const exportData = {
      title: quizTitle || 'Sans titre',
      description: quizDescription || '',
      category: quizCategory || 'Autre',
      duration_minutes: quizDuration || 10,
      questions: questions.map((q) => {
        const item: any = {
          type: q.type,
          question: q.question,
          points: Number(q.points) || 1,
          time_limit_seconds: q.time_limit_seconds || (q.type === 'text' ? DEFAULT_TEXT_TIME_SECONDS : DEFAULT_QCM_TIME_SECONDS)
        };
        if (q.type === 'qcm') {
          item.options = q.options || ['', '', '', ''];
          item.correct_answer = q.correct_answer || '';
        } else if (q.type === 'reorder') {
          item.items = q.items || [];
          item.correct_answer = q.correct_answer || '';
        } else {
          item.correct_answer = q.correct_answer || '';
          if (Array.isArray(q.answers) && q.answers.length > 0) {
            item.answers = q.answers;
          }
        }
        if (q.explanation) {
          item.explanation = q.explanation;
        }
        return item;
      })
    };
    return JSON.stringify(exportData, null, 2);
  };

  const handleDownloadEditorJson = () => {
    const jsonStr = getCurrentQuizJsonString();
    const slug = (quizTitle || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'quiz'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyEditorJson = async () => {
    try {
      await navigator.clipboard.writeText(getCurrentQuizJsonString());
      setEditorExportCopied(true);
      setTimeout(() => setEditorExportCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const normalizeImportedQuestion = (q: any, i: number): QuizQuestion => {
    const type: QuizQuestion['type'] = q.type === 'text' ? 'text' : q.type === 'reorder' ? 'reorder' : 'qcm';
    const sourceItems = type === 'reorder'
      ? (Array.isArray(q.items) ? q.items : String(q.correct_answer || '').split(/\s*(?:→|->|⟶)\s*/).filter(Boolean))
      : [];
    const items = sourceItems.map((item: unknown) => {
      if (item && typeof item === 'object' && 'id' in item && 'text' in item) {
        const record = item as { id: unknown; text: unknown };
        return { id: String(record.id), text: String(record.text) };
      }
      return createQuizReorderItem(String(item ?? ''));
    });

    let textAnswers: string[] | undefined = undefined;
    let correctAnswer = q.correct_answer || '';

    if (type === 'text') {
      if (Array.isArray(q.answers) && q.answers.length > 0) {
        const mapped = q.answers.map((a: any) => Array.isArray(a) ? a.map(String).join(' / ') : String(a || '').trim());
        textAnswers = mapped;
        correctAnswer = mapped.join(' | ');
      } else if (Array.isArray(q.correct_answer) && q.correct_answer.length > 0) {
        const arr = q.correct_answer as any[];
        const mapped = arr.map((a: any) => Array.isArray(a) ? a.map(String).join(' / ') : String(a || '').trim());
        textAnswers = mapped;
        correctAnswer = mapped.join(' | ');
      } else if (typeof q.correct_answer === 'string' && q.correct_answer.includes('|')) {
        textAnswers = q.correct_answer.split(/\s*\|\s*/).filter(Boolean);
      }
    }

    return {
      id: `q_imported_${Date.now()}_${i}`,
      type,
      question: q.question || '',
      options: type === 'qcm' ? (q.options || ['', '', '', '']) : undefined,
      items: type === 'reorder' ? items : undefined,
      answers: type === 'text' && textAnswers && textAnswers.length > 1 ? textAnswers : undefined,
      correct_answer: type === 'reorder' ? JSON.stringify(items.map((item: { id: string }) => item.id)) : correctAnswer,
      points: Number(q.points) || 1,
      explanation: q.explanation || '',
      time_limit_seconds: Number(q.time_limit_seconds) || (type === 'text' ? DEFAULT_TEXT_TIME_SECONDS : DEFAULT_QCM_TIME_SECONDS)
    };
  };

  const handleApplyJsonToCurrentQuiz = () => {
    setEditorJsonError(null);
    try {
      if (!editorJsonInput.trim()) {
        throw new Error('Veuillez coller du code JSON.');
      }
      const parsed = parseJsonWithComments<any>(editorJsonInput);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Le code JSON fourni n\'est pas un objet valide.');
      }
      if (!parsed.title && !Array.isArray(parsed.questions)) {
        throw new Error('Le JSON doit comporter au moins un titre ("title") ou une liste de questions ("questions").');
      }

      if (parsed.title) {
        setQuizTitle(String(parsed.title));
      }
      if (typeof parsed.description === 'string') {
        setQuizDescription(parsed.description);
      }
      if (typeof parsed.category === 'string') {
        setQuizCategory(normalizeQuizCategory(parsed.category));
      }
      if (parsed.duration_minutes) {
        setQuizDuration(Number(parsed.duration_minutes) || 10);
      }

      if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        const importedQuestions: QuizQuestion[] = parsed.questions.map((q: any, i: number) => normalizeImportedQuestion(q, i));
        setQuestions(importedQuestions);
      }

      setIsEditorImportOpen(false);
      setEditorJsonInput('');
    } catch (err: any) {
      setEditorJsonError(err.message || 'Erreur lors du traitement du JSON.');
    }
  };

  // Modal Partage & QR Code
  const [sharingQuiz, setSharingQuiz] = useState<Quiz | null>(null);
  const [sharingQrUrl, setSharingQrUrl] = useState<string>('');
  const [shareLinkCopied, setShareLinkCopied] = useState<boolean>(false);

  // Vue détail / Suivi en direct d'un quiz
  const [activeTrackingQuizId, setActiveTrackingQuizId] = useState<string | null>(null);
  const [activeAnalyticsQuizId, setActiveAnalyticsQuizId] = useState<string | null>(null);
  const [analyticsClassId, setAnalyticsClassId] = useState<string>('');

  // Génération automatique du QR code lorsque sharingQuiz est ouvert
  useEffect(() => {
    if (sharingQuiz && sharingQuiz.is_public && sharingQuiz.public_id) {
      const baseUrl = window.location.origin + window.location.pathname;
      const publicUrl = `${baseUrl}?view=public-quiz&id=${sharingQuiz.public_id}`;

      QRCode.toDataURL(publicUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'H'
      })
        .then(url => setSharingQrUrl(url))
        .catch(err => console.error('Erreur génération QR code partage:', err));
    } else {
      setSharingQrUrl('');
    }
  }, [sharingQuiz]);

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
      const parsed = parseJsonWithComments<any>(rawJsonInput);
      if (!parsed.title || !Array.isArray(parsed.questions)) {
        setJsonImportError('Format JSON invalide : le JSON doit contenir au moins "title" et un tableau "questions".');
        return;
      }

      const importedQuestions: QuizQuestion[] = parsed.questions.map((q: any, i: number) => normalizeImportedQuestion(q, i));

      dataService.createQuiz({
        title: parsed.title,
        description: parsed.description || '',
        category: normalizeQuizCategory(parsed.category),
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

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setPublicLinkCopied(true);
      setTimeout(() => setPublicLinkCopied(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadQR = (qrData: string, filename: string) => {
    if (!qrData) return;
    const link = document.createElement('a');
    link.href = qrData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    // Rafraîchit l’état des quiz en direct et les compteurs des quiz publics temporisés.
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
    setQuizCategory('');
    setSelectedQuizClassIds(selectedClassId ? [selectedClassId] : (classes[0] ? [classes[0].id] : []));
    setQuizDuration(1);
    setQuestions([
      {
        id: `q_${Date.now()}_1`,
        type: 'qcm',
        question: '',
        options: ['', '', '', ''],
        correct_answer: '',
        points: 5,
        explanation: '',
        time_limit_seconds: DEFAULT_QCM_TIME_SECONDS
      }
    ]);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setQuizTitle(quiz.title);
    setQuizDescription(quiz.description || '');
    setQuizCategory(normalizeQuizCategory(quiz.category));
    const initialClassIds = quiz.class_ids && quiz.class_ids.length > 0 ? quiz.class_ids : (quiz.class_id ? [quiz.class_id] : []);
    setSelectedQuizClassIds(initialClassIds.length > 0 ? initialClassIds : (selectedClassId ? [selectedClassId] : []));
    const normalizedQuestions: QuizQuestion[] = quiz.questions
      ? JSON.parse(JSON.stringify(quiz.questions)).map((question: QuizQuestion) => ({
          ...question,
          time_limit_seconds: getQuestionTimeSeconds(question)
        }))
      : [];
    setQuizDuration(Math.max(1, Math.ceil(getQuizTotalTimeSeconds({ ...quiz, questions: normalizedQuestions }) / 60)));
    setQuestions(normalizedQuestions);
    setIsEditorOpen(true);
  };

  const handleAddQuestion = (type: 'qcm' | 'text' | 'reorder') => {
    const newQ: QuizQuestion = {
      id: `q_${Date.now()}_${questions.length + 1}`,
      type,
      question: '',
      options: type === 'qcm' ? ['', '', '', ''] : undefined,
      items: type === 'reorder' ? Array.from({ length: 5 }, () => createQuizReorderItem()) : undefined,
      correct_answer: '',
      points: 5,
      explanation: '',
      time_limit_seconds: type === 'text' ? DEFAULT_TEXT_TIME_SECONDS : DEFAULT_QCM_TIME_SECONDS
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
    if (!quizCategory) {
      setFormError('Veuillez sélectionner une catégorie pour le quiz.');
      return;
    }
    if (selectedQuizClassIds.length === 0) {
      setFormError('Veuillez sélectionner au moins une classe pour ce quiz.');
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
      if (q.type === 'reorder') {
        const items = q.items || [];
        if (items.length < 2 || items.some((item) => !item.text.trim())) {
          setFormError(`La question réarrangement #${i + 1} doit contenir au moins deux éléments, tous renseignés.`);
          return;
        }
        const distinctItems = new Set(items.map((item) => item.text.trim().toLocaleLowerCase()));
        if (distinctItems.size !== items.length) {
          setFormError(`Les éléments de la question réarrangement #${i + 1} doivent être distincts.`);
          return;
        }
      } else if (q.type === 'text' && Array.isArray(q.answers) && q.answers.length > 0) {
        if (q.answers.some(a => !a.trim())) {
          setFormError(`Veuillez renseigner toutes les cases vides de la question #${i + 1}.`);
          return;
        }
      } else if (!q.correct_answer.trim()) {
        setFormError(`Veuillez renseigner la bonne réponse pour la question #${i + 1}.`);
        return;
      }
    }

    const primaryClassId = selectedQuizClassIds[0] || selectedClassId || classes[0]?.id || '';
    const normalizedQuestions = questions.map((question) => {
      let finalCorrectAnswer = question.correct_answer;
      if (question.type === 'reorder') {
        finalCorrectAnswer = JSON.stringify((question.items || []).map((item) => item.id));
      } else if (question.type === 'text') {
        if (Array.isArray(question.answers) && question.answers.length > 0) {
          finalCorrectAnswer = question.answers.join(' | ');
        }
      }
      return {
        ...question,
        correct_answer: finalCorrectAnswer,
        answers: question.type === 'text' && Array.isArray(question.answers) && question.answers.length > 1 ? question.answers : undefined,
        time_limit_seconds: getQuestionTimeSeconds(question)
      };
    });

    if (editingQuiz) {
      dataService.updateQuiz(editingQuiz.id, {
        title: quizTitle,
        description: quizDescription,
        category: quizCategory,
        class_id: primaryClassId,
        class_ids: selectedQuizClassIds,
        duration_minutes: Math.max(1, Math.ceil(getQuizTotalTimeSeconds({ duration_minutes: quizDuration, questions: normalizedQuestions }) / 60)),
        questions: normalizedQuestions,
        is_public: editingQuiz.is_public || false // Keep existing public status when editing
      });
    } else {
      dataService.createQuiz({
        title: quizTitle,
        description: quizDescription,
        category: quizCategory,
        class_id: primaryClassId,
        class_ids: selectedQuizClassIds,
        duration_minutes: Math.max(1, Math.ceil(getQuizTotalTimeSeconds({ duration_minutes: quizDuration, questions: normalizedQuestions }) / 60)),
        questions: normalizedQuestions
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

  const handleLaunchQuiz = (quizId: string, isRelaunch = false) => {
    const quiz = quizzes.find(item => item.id === quizId);
    const targetClassIds = quiz?.class_ids?.length ? quiz.class_ids : (quiz?.class_id ? [quiz.class_id] : []);
    const targetLabel = classes.length > 0 && targetClassIds.length === classes.length
      ? 'toutes les classes'
      : targetClassIds.length > 1 ? 'les classes sélectionnées' : 'la classe ciblée';
    const accessRule = 'jusqu’à sa clôture manuelle par le professeur.';
    setConfirmDialog({
      isOpen: true,
      title: isRelaunch ? 'Relancer le Quiz en Direct' : 'Lancer le Quiz en Direct',
      message: isRelaunch
        ? `Relancer ce quiz pour ${targetLabel} ? Il restera accessible ${accessRule} Les élèves qui l'ont déjà soumis ne pourront pas le refaire.`
        : `Lancer ce quiz pour ${targetLabel} ? Il restera accessible ${accessRule} Chaque élève ne pourra le soumettre qu'une seule fois.`,
      confirmLabel: isRelaunch ? 'Relancer le quiz' : 'Lancer le quiz',
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
      message: 'Clôturer ce quiz immédiatement ? Tout élève qui ne l’a pas soumis recevra la note de 0/20.',
      confirmLabel: 'Clôturer maintenant',
      variant: 'warning',
      action: () => {
        dataService.closeQuiz(quizId);
        loadData();
        if (onRefresh) onRefresh();
      }
    });
  };

  const trackingQuiz = activeTrackingQuizId 
    ? quizzes.find(q => q.id === activeTrackingQuizId) 
    : null;

  const trackingSubmissions = trackingQuiz 
    ? submissions.filter(s => s.quiz_id === trackingQuiz.id) 
    : [];

  const trackingClassIds = trackingQuiz
    ? (trackingQuiz.class_ids?.length ? trackingQuiz.class_ids : [trackingQuiz.class_id])
    : [];
  const classStudents = trackingQuiz
    ? students.filter(s => trackingClassIds.includes(s.class_id))
    : students.filter(s => s.class_id === selectedClassId);
  const trackingClassNames = classes
    .filter(c => trackingClassIds.includes(c.id))
    .map(c => c.name)
    .join(', ');
  const trackingClassLabel = classes.length > 0 && trackingClassIds.length === classes.length
    ? 'Toutes les classes'
    : trackingClassNames || 'Classe';

  const submissionCountByQuiz = new Map<string, number>();
  submissions.forEach(submission => {
    submissionCountByQuiz.set(
      submission.quiz_id,
      (submissionCountByQuiz.get(submission.quiz_id) || 0) + 1
    );
  });
  const searchTerms = normalizeQuizSearchText(quizSearchTerm).trim().split(/\s+/).filter(Boolean);
  const filteredQuizzes = quizzes.filter(quiz => {
    if (quizStatusFilter !== 'all' && quiz.status !== quizStatusFilter) return false;
    if (quizVisibilityFilter === 'public' && !quiz.is_public) return false;
    if (quizVisibilityFilter === 'private' && quiz.is_public) return false;
    if (quizCategoryFilter !== 'all' && (quiz.category || 'Autre') !== quizCategoryFilter) return false;

    const questionCount = quiz.questions?.length || 0;
    const submissionCount = submissionCountByQuiz.get(quiz.id) || 0;
    if (minQuestionCount !== '' && questionCount < Number(minQuestionCount)) return false;
    if (maxQuestionCount !== '' && questionCount > Number(maxQuestionCount)) return false;
    if (minSubmissionCount !== '' && submissionCount < Number(minSubmissionCount)) return false;
    if (maxSubmissionCount !== '' && submissionCount > Number(maxSubmissionCount)) return false;

    const createdDate = quiz.created_at?.slice(0, 10) || '';
    if (createdAfter && (!createdDate || createdDate < createdAfter)) return false;
    if (createdBefore && (!createdDate || createdDate > createdBefore)) return false;

    if (searchTerms.length > 0) {
      const quizClassIds = quiz.class_ids?.length ? quiz.class_ids : [quiz.class_id];
      const classNames = quizClassIds
        .map(id => classes.find(classroom => classroom.id === id)?.name || '')
        .join(' ');
      const statusLabel = quiz.status === 'draft'
        ? 'brouillon draft'
        : quiz.status === 'launched'
        ? 'en direct lancé actif live'
        : 'clôturé fermé closed';
      const visibilityLabel = quiz.is_public ? 'public lien partagé' : 'privé classe';
      const questionText = (quiz.questions || [])
        .map(question => `${question.question || ''} ${question.type || ''}`)
        .join(' ');
      const searchableText = normalizeQuizSearchText([
        quiz.title,
        quiz.description || '',
        quiz.category || 'Autre',
        classNames,
        statusLabel,
        visibilityLabel,
        createdDate,
        questionText
      ].join(' '));
      if (!searchTerms.every(term => searchableText.includes(term))) return false;
    }

    return true;
  });

  const resetQuizFilters = () => {
    setSelectedClassId('');
    setQuizSearchTerm('');
    setQuizStatusFilter('all');
    setQuizVisibilityFilter('all');
    setQuizCategoryFilter('all');
    setCreatedAfter('');
    setCreatedBefore('');
    setMinQuestionCount('');
    setMaxQuestionCount('');
    setMinSubmissionCount('');
    setMaxSubmissionCount('');
  };

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
              Tous les quiz restent ouverts jusqu’à leur clôture manuelle par le professeur, qu’ils soient publics ou privés. Notes cumulées journalières calculées automatiquement.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAnalyticsClassId(selectedClassId || classes[0]?.id || '');
              setActiveAnalyticsQuizId('all');
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-800 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-900 sm:text-sm"
          >
            <BarChart3 className="h-4 w-4" />
            <span>Analyse de classe</span>
          </button>
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

      {/* Recherche multicritère et filtres des quiz */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="relative block md:col-span-1">
            <span className="sr-only">Rechercher un quiz</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={quizSearchTerm}
              onChange={event => setQuizSearchTerm(event.target.value)}
              placeholder="Titre, classe, question, statut…"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Statut</span>
            <select
              value={quizStatusFilter}
              onChange={event => setQuizStatusFilter(event.target.value as 'all' | Quiz['status'])}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillons</option>
              <option value="launched">En direct</option>
              <option value="closed">Clôturés</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Accès</span>
            <select
              value={quizVisibilityFilter}
              onChange={event => setQuizVisibilityFilter(event.target.value as 'all' | 'public' | 'private')}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Publics et privés</option>
              <option value="public">Publics</option>
              <option value="private">Privés</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Catégorie</span>
            <select
              value={quizCategoryFilter}
              onChange={event => setQuizCategoryFilter(event.target.value as 'all' | QuizCategory)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Toutes les catégories</option>
              {QUIZ_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
        </div>

        <p className="text-[11px] text-slate-400">
          La recherche parcourt les titres, descriptions, classes, questions, catégories, statuts et accès publics ou privés.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500" aria-live="polite">
            {filteredQuizzes.length} quiz affiché{filteredQuizzes.length === 1 ? '' : 's'} sur {quizzes.length}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={isAdvancedFilterOpen}
              onClick={() => setIsAdvancedFilterOpen(open => !open)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${isAdvancedFilterOpen ? 'border-amber-700 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtres avancés
            </button>
            <button
              type="button"
              onClick={resetQuizFilters}
              className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
            >
              Effacer les filtres
            </button>
          </div>
        </div>

        {isAdvancedFilterOpen && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Créé à partir du</span>
              <input type="date" value={createdAfter} onChange={event => setCreatedAfter(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Créé jusqu’au</span>
              <input type="date" value={createdBefore} onChange={event => setCreatedBefore(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Questions minimum</span>
              <input type="number" min="0" step="1" value={minQuestionCount} onChange={event => setMinQuestionCount(event.target.value)} placeholder="Sans minimum" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Questions maximum</span>
              <input type="number" min="0" step="1" value={maxQuestionCount} onChange={event => setMaxQuestionCount(event.target.value)} placeholder="Sans maximum" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Soumissions minimum</span>
              <input type="number" min="0" step="1" value={minSubmissionCount} onChange={event => setMinSubmissionCount(event.target.value)} placeholder="Sans minimum" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Soumissions maximum</span>
              <input type="number" min="0" step="1" value={maxSubmissionCount} onChange={event => setMaxSubmissionCount(event.target.value)} placeholder="Sans maximum" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500" />
            </label>
          </div>
        )}
      </div>

      {/* Main Quizzes List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: List of Quizzes */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-800" />
              <span>Liste des Quiz ({filteredQuizzes.length} / {quizzes.length})</span>
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
          ) : filteredQuizzes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
              <Search className="mx-auto h-9 w-9 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-800">Aucun quiz ne correspond à ces critères</h3>
              <p className="mx-auto max-w-sm text-xs text-slate-500">Modifiez la recherche ou effacez les filtres pour retrouver vos quiz.</p>
              <button type="button" onClick={resetQuizFilters} className="rounded-xl bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900">
                Effacer les filtres
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuizzes.map((quiz) => {
                const isLive = quiz.status === 'launched';
                const isClosed = quiz.status === 'closed';
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
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                            {quiz.category || 'Autre'}
                          </span>
                          {quiz.class_ids && quiz.class_ids.length > 1 ? (
                            quiz.class_ids.map(cid => {
                              const c = classes.find(item => item.id === cid);
                              return (
                                <span key={cid} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                                  {c?.name || 'Classe'}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                              {quiz.class_name || 'Classe'}
                            </span>
                          )}

                          {isLive && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-emerald-600" />
                              <span title="Le quiz reste accessible jusqu’à sa clôture manuelle.">EN DIRECT • jusqu’à clôture</span>
                            </span>
                          )}

                          {isClosed && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                              Clôturé
                            </span>
                          )}

                          {quiz.status === 'draft' && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                              Brouillon
                            </span>
                          )}

                          {quiz.is_public ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Globe className="w-3 h-3 text-indigo-600" />
                              <span>Public (Lien actif)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Privé</span>
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
                        <div>Temps total : {formatQuizDuration(getQuizTotalTimeSeconds(quiz))}</div>
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
                          onClick={() => {
                            setAnalyticsClassId(quiz.class_ids?.[0] || quiz.class_id || selectedClassId || classes[0]?.id || '');
                            setActiveAnalyticsQuizId(quiz.id);
                          }}
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Lancer le quiz jusqu’à sa clôture manuelle"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Lancer</span>
                          </button>
                        )}

                        {isClosed && (
                          <button
                            type="button"
                            onClick={() => handleLaunchQuiz(quiz.id, true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Relancer ce quiz jusqu’à sa clôture manuelle; les élèves ayant déjà soumis ne pourront pas le refaire"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Relancer</span>
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

                        {/* Public Quiz Controls (accessible for any quiz status) */}
                        <div className="flex items-center gap-1.5">
                          {!quiz.is_public ? (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = dataService.updateQuiz(quiz.id, { is_public: true });
                                loadData();
                                if (onRefresh) onRefresh();
                                setSharingQuiz(updated);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs"
                              title="Rendre ce quiz accessible publiquement via un lien direct sans connexion"
                            >
                              <Globe className="w-3.5 h-3.5" />
                              <span>Publier</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setSharingQuiz(quiz)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                                title="Voir le lien public et télécharger le QR Code"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>Partager & QR</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  dataService.updateQuiz(quiz.id, { is_public: false });
                                  loadData();
                                  if (onRefresh) onRefresh();
                                  if (sharingQuiz?.id === quiz.id) {
                                    setSharingQuiz(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                                title="Rendre ce quiz privé (dépublier le lien)"
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-500" />
                                <span>Rendre Privé</span>
                              </button>
                            </>
                          )}
                        </div>

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
                <p>{trackingClassIds.length > 1 ? 'Classes' : 'Classe'} : <strong>{trackingClassLabel}</strong></p>
                <p>Disponibilité : <strong>jusqu’à la clôture manuelle du professeur</strong></p>
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
              <span className="text-[11px] text-slate-400 font-mono">Points obtenus / points possibles × 20</span>
            </div>

            <p className="text-xs text-slate-500">
              La note journalière est calculée en divisant le total des points obtenus par le total des points possibles, puis en multipliant par 20.
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
            <div className="sticky top-0 bg-white px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between z-10 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-5 h-5 text-amber-800 shrink-0" />
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 truncate">
                  {editingQuiz ? 'Modifier le Quiz' : 'Créer un Nouveau Quiz'}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditorExportOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
                  title="Exporter ce quiz au format JSON"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Exporter JSON</span>
                  <span className="sm:hidden">Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorJsonError(null);
                    setEditorJsonInput('');
                    setIsEditorImportOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-xl border border-amber-300 transition-colors cursor-pointer"
                  title="Importer ou remplacer le contenu par un JSON"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-800" />
                  <span className="hidden sm:inline">Importer JSON</span>
                  <span className="sm:hidden">Import</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* SOUS-MODALE EXPORT JSON */}
            {isEditorExportOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
                <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-amber-800" />
                      <h3 className="font-bold text-sm text-slate-900">Exportation JSON du Quiz</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditorExportOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <p className="text-xs text-slate-600">
                      Voici le code JSON du quiz dans son état actuel. Vous pouvez le copier ou le télécharger pour le sauvegarder ou le réimporter plus tard.
                    </p>
                    <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-72 select-all border border-slate-800">
                      {getCurrentQuizJsonString()}
                    </pre>
                  </div>
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditorExportOpen(false)}
                      className="px-3 py-1.5 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-white cursor-pointer"
                    >
                      Fermer
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyEditorJson}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl shadow-2xs cursor-pointer"
                      >
                        {editorExportCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copié !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-600" />
                            <span>Copier le JSON</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadEditorJson}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-200" />
                        <span>Télécharger .json</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SOUS-MODALE IMPORT JSON DANS L'ÉDITEUR */}
            {isEditorImportOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
                <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-amber-800" />
                      <h3 className="font-bold text-sm text-slate-900">Importer / Remplacer par un JSON</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditorImportOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <p className="text-xs text-slate-600">
                      Chargez un fichier <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">.json</code> ou collez son contenu ci-dessous. Le titre, les consignes et les questions du quiz en cours d'édition seront actualisés directement dans cette fenêtre.
                    </p>

                    {editorJsonError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>{editorJsonError}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl shadow-2xs cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                        <span>Charger un fichier .json</span>
                        <input
                          type="file"
                          accept=".json,.jsonc"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const content = ev.target?.result as string;
                              if (content) setEditorJsonInput(content);
                            };
                            reader.readAsText(file);
                          }}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditorJsonInput(quizImportTemplate)}
                        className="text-xs font-bold text-amber-800 hover:underline cursor-pointer"
                      >
                        Utiliser le modèle type
                      </button>
                    </div>

                    <textarea
                      rows={9}
                      value={editorJsonInput}
                      onChange={(e) => setEditorJsonInput(e.target.value)}
                      placeholder="Collez votre code JSON ici..."
                      className="w-full bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-3 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditorImportOpen(false)}
                      className="px-3 py-1.5 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-white cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyJsonToCurrentQuiz}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-amber-300" />
                      <span>Appliquer au quiz en cours</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                  <label className="text-xs font-bold text-slate-700">Catégorie *</label>
                  <select
                    required
                    value={quizCategory}
                    onChange={(e) => setQuizCategory(e.target.value as QuizCategory | '')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="" disabled>Sélectionner une catégorie</option>
                    {QUIZ_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Classes cibles (multi-classes supportées) *</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedQuizClassIds(classes.map(c => c.id))}
                        className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 underline cursor-pointer"
                      >
                        Toutes les classes
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedQuizClassIds([])}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 underline cursor-pointer"
                      >
                        Désélectionner
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    {classes.map(c => {
                      const isSelected = selectedQuizClassIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedQuizClassIds(selectedQuizClassIds.filter(id => id !== c.id));
                            } else {
                              setSelectedQuizClassIds([...selectedQuizClassIds, c.id]);
                            }
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-600 text-white shadow-xs font-semibold'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                            isSelected ? 'bg-amber-700 text-white' : 'border border-slate-300'
                          }`}>
                            {isSelected ? '✓' : ''}
                          </span>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                  {selectedQuizClassIds.length === 0 && (
                    <p className="text-[11px] text-rose-500">Sélectionnez au moins une classe pour le quiz.</p>
                  )}
                </div>

                <div className="sm:col-span-2 rounded-xl border border-[#d5e4ed] bg-[#e6f0f7]/60 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#072a3f]">Temps total du quiz</p>
                      <p className="mt-0.5 text-[11px] text-slate-600">Somme des temps individuels des questions; modifiez chaque valeur directement dans sa question.</p>
                    </div>
                    <span className="rounded-lg bg-white px-3 py-1.5 font-mono text-sm font-extrabold text-[#072a3f] shadow-xs">
                      {formatQuizDuration(questions.reduce((sum, question) => sum + getQuestionTimeSeconds(question), 0))}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-medium text-slate-500">Valeurs initiales : {DEFAULT_QCM_TIME_SECONDS} s par QCM et {DEFAULT_TEXT_TIME_SECONDS} s par réponse saisie.</p>
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Questions du Quiz ({questions.length})</h3>
                    <p className="text-[11px] text-slate-500">Ajoutez des QCM, des réponses saisies ou des éléments à remettre en ordre.</p>
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
                    <button
                      type="button"
                      onClick={() => handleAddQuestion('reorder')}
                      className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      + Réarranger
                    </button>
                  </div>
                </div>

                {questions.map((q, idx) => (
                  <div key={q.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-800 text-white font-mono font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          {q.type === 'qcm' ? 'QCM (Choix Multiple)' : q.type === 'text' ? 'Réponse Saisie (Texte)' : 'Réarranger les éléments'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <label className="flex items-center gap-1 text-xs">
                          <span className="text-slate-500 font-bold">Temps :</span>
                          <input
                            type="number"
                            min="1"
                            max="600"
                            aria-label={`Temps de réponse pour la question ${idx + 1} (secondes)`}
                            value={q.time_limit_seconds ?? getQuestionTimeSeconds(q)}
                            onChange={(e) => {
                              const updated = [...questions];
                              updated[idx] = { ...updated[idx], time_limit_seconds: Math.max(1, Number(e.target.value) || 1) };
                              setQuestions(updated);
                            }}
                            className="w-16 bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-center font-bold"
                          />
                          <span className="text-slate-400">s</span>
                        </label>
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

                    {/* Text Expected Answers (Mono-trou ou Multi-trous ex: 4 verbes à conjuguer) */}
                    {q.type === 'text' && (() => {
                      const blankAnswers = getQuestionBlankAnswers(q);
                      const isMultiBlank = blankAnswers.length > 1;
                      const matches = Array.from((q.question || '').matchAll(/(_{2,}|\[_+\]|\[\s*\]|\[\d+\]|\.{3,}|\((?:_{2,}|\.{2,}|\s*)\)|\[(?:\.{2,}|\s*)\])/g));
                      const detectedCount = matches.length;

                      return (
                        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-950">
                                  {isMultiBlank 
                                    ? `Réponses pour les ${blankAnswers.length} cases vides (ex: 4 verbes)` 
                                    : 'Réponse correcte attendue'}
                                </span>
                                <span className="text-[10px] bg-blue-200 text-blue-900 font-extrabold px-2 py-0.5 rounded-full font-mono">
                                  {blankAnswers.length} case{blankAnswers.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              <p className="text-[11px] text-blue-800 mt-0.5">
                                {isMultiBlank 
                                  ? 'Renseignez la réponse attendue pour chaque case vide. L’élève valide si chaque case correspond (insensible à la casse).' 
                                  : 'Renseignez la réponse attendue (insensible à la casse). Séparez d’éventuelles variantes par un slash "/" (ex: "cuocio / io cuocio").'}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {detectedCount > 1 && detectedCount !== blankAnswers.length && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoDetectBlanks(idx)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs rounded-lg shadow-2xs transition-colors cursor-pointer"
                                  title="Créer automatiquement une case pour chaque trou détecté dans l'énoncé"
                                >
                                  <span>⚡ Détecter {detectedCount} trous</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleAddBlank(idx)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-300 font-bold text-xs rounded-lg shadow-2xs transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ Ajouter une case (Verbe {blankAnswers.length + 1})</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2.5">
                            {blankAnswers.map((blankAns, bIdx) => (
                              <div key={bIdx} className="bg-white/95 border border-blue-200 rounded-xl p-2.5 space-y-1.5 shadow-2xs">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 shrink-0 rounded-lg text-[10px] font-bold flex items-center justify-center font-mono bg-blue-800 text-white shadow-2xs">
                                      {bIdx + 1}
                                    </span>
                                    <span className="text-xs font-bold text-slate-800">
                                      {isMultiBlank ? `Case / Verbe ${bIdx + 1}` : 'Réponse attendue'}
                                    </span>
                                  </div>
                                  {isMultiBlank && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveBlank(idx, bIdx)}
                                      title={`Supprimer la case ${bIdx + 1}`}
                                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>

                                <div className="relative">
                                  <input
                                    type="text"
                                    required
                                    placeholder={isMultiBlank ? `Réponse attendue pour la case ${bIdx + 1} (ex: parlo ou parlo / io parlo)` : "Réponse principale ou variantes séparées par / (ex: cuocio / io cuocio)"}
                                    value={blankAns}
                                    onChange={(e) => handleUpdateBlankAnswer(idx, bIdx, e.target.value)}
                                    className="w-full bg-white border border-blue-200 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-blue-300"
                                  />
                                </div>
                                <p className="text-[10px] text-slate-500">
                                  {isMultiBlank 
                                    ? `Pour accepter des variantes sur cette case (ex: avec ou sans pronom), séparez-les par un slash "/" (ex: "vado / io vado").`
                                    : `Vous pouvez ajouter d'autres réponses acceptées séparées par un slash (ex: "cuocio / io cuocio").`}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {q.type === 'reorder' && (
                      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-bold text-emerald-950">Éléments dans l’ordre correct</p>
                            <p className="text-[10px] text-emerald-800">Cet ordre sert de référence; l’ordre sera mélangé pour l’élève.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...questions];
                              updated[idx] = { ...updated[idx], items: [...(updated[idx].items || []), createQuizReorderItem()] };
                              setQuestions(updated);
                            }}
                            className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-900"
                          >
                            + Ajouter un élément
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(q.items || []).map((item, itemIndex) => (
                            <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-100 bg-white p-2">
                              <span className="w-6 shrink-0 text-center font-mono text-xs font-extrabold text-emerald-800">{itemIndex + 1}</span>
                              <input
                                type="text"
                                required
                                aria-label={`Élément ${itemIndex + 1} de la question ${idx + 1}`}
                                value={item.text}
                                onChange={(e) => {
                                  const updated = [...questions];
                                  const items = [...(updated[idx].items || [])];
                                  items[itemIndex] = { ...items[itemIndex], text: e.target.value };
                                  updated[idx] = { ...updated[idx], items };
                                  setQuestions(updated);
                                }}
                                placeholder={`Étape ${itemIndex + 1}`}
                                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-2 text-xs text-slate-900"
                              />
                              <button
                                type="button"
                                aria-label={`Monter l’élément ${itemIndex + 1}`}
                                disabled={itemIndex === 0}
                                onClick={() => {
                                  const updated = [...questions];
                                  const items = [...(updated[idx].items || [])];
                                  [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
                                  updated[idx] = { ...updated[idx], items };
                                  setQuestions(updated);
                                }}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-30"
                              >↑</button>
                              <button
                                type="button"
                                aria-label={`Descendre l’élément ${itemIndex + 1}`}
                                disabled={itemIndex === (q.items || []).length - 1}
                                onClick={() => {
                                  const updated = [...questions];
                                  const items = [...(updated[idx].items || [])];
                                  [items[itemIndex], items[itemIndex + 1]] = [items[itemIndex + 1], items[itemIndex]];
                                  updated[idx] = { ...updated[idx], items };
                                  setQuestions(updated);
                                }}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-30"
                              >↓</button>
                              <button
                                type="button"
                                aria-label={`Supprimer l’élément ${itemIndex + 1}`}
                                disabled={(q.items || []).length <= 2}
                                onClick={() => {
                                  const updated = [...questions];
                                  updated[idx] = { ...updated[idx], items: (updated[idx].items || []).filter((_, current) => current !== itemIndex) };
                                  setQuestions(updated);
                                }}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-rose-600 disabled:opacity-30"
                              >×</button>
                            </div>
                          ))}
                        </div>
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
                        const templateStr = quizImportTemplate;
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
                      onClick={() => setRawJsonInput(quizImportTemplate)}
                      className="text-[11px] text-amber-800 hover:text-amber-900 font-bold underline cursor-pointer"
                    >
                      Utiliser ce modèle
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Le modèle intègre les trois types <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">qcm</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">text</code> (mono-trou avec variantes par <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">/</code> et multi-trous ex: 4 verbes via <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">answers</code> ou <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">|</code>) et <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">reorder</code>. Les commentaires de documentation sont acceptés.
                </p>
                <pre className="bg-slate-900 text-slate-200 p-3 rounded-xl text-[10px] font-mono overflow-x-auto max-h-48 select-all">
{quizImportTemplate}
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

      {activeAnalyticsQuizId && (
        <QuizAnalyticsDashboard
          initialClassId={analyticsClassId}
          initialQuizId={activeAnalyticsQuizId}
          classes={classes}
          students={students}
          quizzes={dataService.getQuizzes()}
          submissions={submissions}
          onClose={() => setActiveAnalyticsQuizId(null)}
        />
      )}

      {/* Modal Partage & QR Code du Quiz Public */}
      {sharingQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Partage & QR Code du Quiz Public</h3>
                  <p className="text-xs text-indigo-200 truncate max-w-xs">{sharingQuiz.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSharingQuiz(null)}
                className="p-1.5 text-indigo-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Publication Status Banner */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${sharingQuiz.is_public ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      Statut : {sharingQuiz.is_public ? 'Publié (Accessible par lien)' : 'Privé (Lien désactivé)'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {sharingQuiz.is_public 
                        ? 'Tout le monde avec le lien ou le QR code peut composer sans compte' 
                        : 'Seuls les élèves de la classe connectés peuvent y accéder'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const newStatus = !sharingQuiz.is_public;
                    const updated = dataService.updateQuiz(sharingQuiz.id, { is_public: newStatus });
                    setSharingQuiz(updated);
                    loadData();
                    if (onRefresh) onRefresh();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    sharingQuiz.is_public
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                  }`}
                >
                  {sharingQuiz.is_public ? 'Rendre Privé' : 'Activer le lien'}
                </button>
              </div>

              {sharingQuiz.is_public ? (
                <>
                  {/* Shareable Link Input with Copy button */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Lien direct unique pour les participants :</span>
                      {publicLinkCopied && (
                        <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Lien copié !
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}${window.location.pathname}?view=public-quiz&id=${sharingQuiz.public_id}`}
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 select-all focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}?view=public-quiz&id=${sharingQuiz.public_id}`;
                          handleCopyLink(url);
                        }}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copier</span>
                      </button>
                    </div>
                  </div>

                  {/* QR Code Presentation */}
                  <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs shrink-0 flex items-center justify-center">
                      {sharingQrUrl ? (
                        <img
                          src={sharingQrUrl}
                          alt="QR Code Quiz Public"
                          className="w-36 h-36 object-contain rounded-lg"
                        />
                      ) : (
                        <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-400">
                          Génération QR...
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 text-center sm:text-left">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-slate-800">
                          QR Code à projeter ou imprimer
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Les participants scannent simplement ce QR code avec leur smartphone pour lancer l'évaluation instantanément.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                        <button
                          type="button"
                          onClick={() => handleDownloadQR(sharingQrUrl, `QRCode_Quiz_${sharingQuiz.title.replace(/\s+/g, '_')}.png`)}
                          disabled={!sharingQrUrl}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Télécharger le QR (.PNG)</span>
                        </button>
                        <a
                          href={`${window.location.origin}${window.location.pathname}?view=public-quiz&id=${sharingQuiz.public_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Tester le quiz</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Confidentialité garantie :</strong> Les réponses et scores des participants au quiz public sont calculés en temps réel côté client et <u>ne sont jamais enregistrés en base de données</u>.
                    </span>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center space-y-3">
                  <Lock className="w-10 h-10 text-slate-400 mx-auto" />
                  <div className="font-bold text-slate-800 text-sm">Ce quiz est actuellement privé</div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Activez la publication pour générer un lien partageable et un QR code utilisable par tous les participants.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = dataService.updateQuiz(sharingQuiz.id, { is_public: true });
                      setSharingQuiz(updated);
                      loadData();
                      if (onRefresh) onRefresh();
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Activer la publication
                  </button>
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSharingQuiz(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
