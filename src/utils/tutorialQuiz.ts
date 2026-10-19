import { Quiz, QuizQuestion } from '../types';
import { calculateQuestionPointsEarned } from './quizAnswerMatcher';

export interface TutorialQuizScore {
  score: number;
  maxScore: number;
  score20: number;
}

/**
 * Construit un quiz de démonstration éphémère. Il n'est jamais ajouté aux listes
 * de quiz du service de données et ses résultats sont calculés uniquement en mémoire.
 */
export function createTutorialQuiz(classId = '', className = 'Entraînement'): Quiz {
  const now = new Date().toISOString();
  const reorderIds = ['tutorial-reorder-1', 'tutorial-reorder-2', 'tutorial-reorder-3', 'tutorial-reorder-4'];
  const questions: QuizQuestion[] = [
    {
      id: 'tutorial-qcm-greeting',
      type: 'qcm',
      question: 'Le matin, quelle formule italienne convient pour dire « Bonjour » ?',
      options: ['Buongiorno', 'Buonanotte', 'Arrivederci', 'Per favore'],
      correct_answer: 'Buongiorno',
      points: 4,
      time_limit_seconds: 60,
      explanation: 'Buongiorno s’utilise pour saluer le matin et pendant la journée.'
    },
    {
      id: 'tutorial-qcm-verb',
      type: 'qcm',
      question: 'Choisissez la phrase correcte avec le verbe essere (« être »).',
      options: ['Io sono studente.', 'Io sei studente.', 'Io è studente.', 'Io siamo studente.'],
      correct_answer: 'Io sono studente.',
      points: 4,
      time_limit_seconds: 60,
      explanation: 'À la première personne du singulier, essere se conjugue sono : io sono.'
    },
    {
      id: 'tutorial-text-translation',
      type: 'text',
      question: 'Saisissez en italien : « Merci beaucoup ».',
      correct_answer: 'Grazie mille / Molte grazie',
      points: 4,
      time_limit_seconds: 60,
      explanation: '« Grazie mille » et « Molte grazie » sont deux façons courantes de remercier.'
    },
    {
      id: 'tutorial-text-cloze',
      type: 'text',
      question: 'Complétez : Io ____ a scuola e tu ____ a casa.',
      answers: ['vado', 'resti'],
      correct_answer: 'vado | resti',
      points: 4,
      time_limit_seconds: 60,
      explanation: 'On dit « io vado » (je vais) et « tu resti » (tu restes). Chaque case vaut deux points.'
    },
    {
      id: 'tutorial-reorder',
      type: 'reorder',
      question: 'Glissez les éléments pour former une phrase correcte : « Demain, je vais au marché. »',
      items: [
        { id: reorderIds[0], text: 'Domani' },
        { id: reorderIds[1], text: 'vado' },
        { id: reorderIds[2], text: 'al' },
        { id: reorderIds[3], text: 'mercato.' }
      ],
      correct_answer: JSON.stringify(reorderIds),
      points: 4,
      time_limit_seconds: 60,
      explanation: 'La phrase complète est « Domani vado al mercato. »'
    }
  ];

  return {
    id: 'tutorial-practice-only',
    title: 'Tutoriel interactif — prise en main du quiz',
    description: 'Entraînement sans note officielle ni enregistrement.',
    category: 'Autre',
    class_id: classId,
    class_ids: classId ? [classId] : [],
    class_name: className,
    created_at: now,
    duration_minutes: 5,
    status: 'launched',
    launched_at: now,
    questions,
    total_points: 20
  };
}

/** Calcule le résultat pédagogique du tutoriel uniquement côté client. */
export function scoreTutorialQuiz(quiz: Quiz, answers: Record<string, string>): TutorialQuizScore {
  const points = (quiz.questions || []).map((question) =>
    calculateQuestionPointsEarned(question, answers[question.id] || '')
  );
  const score = Number(points.reduce((sum, result) => sum + result.awardedPoints, 0).toFixed(2));
  const maxScore = Number(points.reduce((sum, result) => sum + result.maxPoints, 0).toFixed(2));

  return {
    score,
    maxScore,
    score20: maxScore > 0 ? Number(((score / maxScore) * 20).toFixed(2)) : 0
  };
}
