/**
 * Modèles de données pour PerckyLingua
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CEFRLevel = typeof CEFR_LEVELS[number];

export interface ClassRoom {
  id: string;
  name: string;
  created_at: string;
  student_count?: number;
  exam_count?: number;
}

export interface Student {
  id: string;
  class_id: string;
  first_name: string;
  last_name: string;
  gender?: 'homme' | 'femme';
  email: string;
  student_number?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
  validation_status?: 'pending' | 'approved' | 'rejected'; // Statut de validation de l'inscription
  class_name?: string;
  avatar?: string;
}

export interface ExamRubric {
  id: string;
  exam_id: string;
  title: string;
  question: string;
  example_sentence: string;
  points: number;
  position: number;
}

export interface Exam {
  id: string;
  class_id: string;
  title: string;
  description?: string;
  level?: CEFRLevel | null;
  exam_date: string;
  status: 'draft' | 'in_progress' | 'completed';
  created_at: string;
  class_name?: string;
  rubrics?: ExamRubric[];
  rubric_count?: number;
  max_score?: number;
  evaluations_count?: number;
}

export interface EvaluationDetail {
  rubric_id: string;
  is_validated: boolean;
  awarded_points: number;
  error_note?: string;
}

export interface Evaluation {
  id: string;
  exam_id: string;
  student_id: string;
  total_score: number;
  status: 'draft' | 'completed';
  created_at: string;
  updated_at: string;
  details: EvaluationDetail[];
  // Champ historique conservé pour lire les anciennes évaluations ; non utilisé pour les nouveaux examens.
  presented_animal?: string;
  // Gestion du temps de parole (Section 5.3)
  max_duration_seconds?: number;
  duration_used_seconds?: number;
  timer_status?: 'completed' | 'stopped_manually' | 'not_timed';
  // Propriétés enrichies
  student_name?: string;
  student_number?: string | null;
  exam_title?: string;
  exam_date?: string;
  class_name?: string;
  class_id?: string;
  max_score?: number;
  percentage?: number;
  validated_rubrics_count?: number;
  total_rubrics_count?: number;
}

export interface PassOrderItem {
  id: string;
  exam_id: string;
  student_id: string;
  position: number;
  status: 'waiting' | 'current' | 'completed' | 'absent';
  created_at?: string;
  student_name?: string;
  student_number?: string | null;
  is_evaluated?: boolean;
  evaluation_score?: number | null;
}

export interface ExamStatistics {
  exam_id: string;
  exam_title: string;
  max_score: number;
  indicators: {
    total_students: number;
    evaluated_students: number;
    unevaluated_students: number;
    class_average: number;
    min_score: number;
    max_score: number;
    success_rate: number;
  };
  charts: {
    distribution: Array<{ label: string; count: number }>;
    score_frequency: Array<{ score: number; count: number }>;
    rubric_performance: Array<{
      rubric_id: string;
      position: number;
      title: string;
      question: string;
      validated_count: number;
      success_rate: number;
    }>;
    class_exams_comparison: Array<{
      exam_id: string;
      title: string;
      date: string;
      evaluated_count: number;
      average_score: number;
    }>;
  };
}

// =========================================================================
// QUIZ & ÉVALUATIONS JOURNALIÈRES (ESAME)
// =========================================================================

export interface VerbesTrousPhrase {
  id: string | number;
  debut: string;
  fin: string;
  verbe?: string;
  reponses?: string[];
}

export interface QuizQuestion {
  id: string;
  type: 'qcm' | 'text' | 'reorder' | 'verbes_trous'; // QCM, réponse saisie, remise en ordre ou banque de verbes
  question: string;
  options?: string[]; // Pour QCM (ex: 4 options)
  items?: QuizReorderItem[]; // Éléments d'un exercice de remise en ordre, rangés par le professeur dans l'ordre correct
  correct_answer: string; // Pour QCM: l'option exacte ou l'index; Pour texte: mot-clé/réponse acceptée (ou réponses séparées par |)
  answers?: string[]; // Pour questions à trous multiples: liste des réponses pour chaque case vide (ex: ["sta", "sai", "sta"])
  points: number; // Barème pour cette question (ex: 2, 4, 5 points)
  explanation?: string; // Explication pédagogique affichée lors de la correction
  time_limit_seconds?: number; // Temps individuel de réponse; valeur par défaut selon le type si absent
  titre?: string;
  consigne?: string;
  points_par_phrase?: number;
  phrases?: VerbesTrousPhrase[];
  verbes_trous?: { titre?: string; consigne?: string; points_par_phrase?: number; banque: string[]; phrases: VerbesTrousPhrase[] };
}

export interface QuizReorderItem {
  id: string;
  text: string;
}

export const QUIZ_CATEGORIES = [
  'Vocabulaire',
  'Grammaire',
  'Thème',
  'Conjugaison',
  'Fonctions du langage',
  'Compréhension écrite',
  'Compréhension orale',
  'Expression écrite',
  'Expression orale',
  'Culture et civilisation italiennes',
  'Orthographe et prononciation',
  'Autre'
] as const;

export type QuizCategory = typeof QUIZ_CATEGORIES[number];

export function normalizeQuizCategory(value: unknown): QuizCategory {
  if (typeof value !== 'string') return 'Autre';
  const normalized = value.trim().replace(/\s*->\s*/g, ' → ').replace(/\s*→\s*/g, ' → ').replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
  if (normalized === 'thème (traduction fr → it)' || normalized === 'thème (traduction it → fr)') return 'Thème';

  return QUIZ_CATEGORIES.find(category => category.toLocaleLowerCase('fr-FR') === normalized) || 'Autre';
}

export interface Quiz {
  id: string;
  public_id?: string; // UUID unique pour l'accès public via lien partageable
  is_public?: boolean; // Indique si le quiz est publié publiquement
  attendance_mode?: 'legacy' | 'strict_presence';
  presence_window_seconds?: number;
  category?: QuizCategory;
  level?: CEFRLevel | null;
  title: string;
  description?: string;
  class_id: string; // Primary class (backward compatibility)
  class_ids?: string[]; // All classes this quiz belongs to (new feature)
  class_name?: string;
  created_at: string;
  duration_minutes: number; // Temps imparti pour composer (ex: 5, 10, 15 min)
  status: 'draft' | 'launched' | 'closed';
  launched_at?: string; // Timestamp ISO lorsque le professeur lance le quiz
  expires_at?: string; // Ancien champ conservé pour compatibilité; les quiz ne sont plus expirés automatiquement
  questions: QuizQuestion[];
  total_points: number; // Total des points des questions
}

export interface QuizSubmission {
  id: string;
  quiz_id: string;
  quiz_title: string;
  student_id: string;
  student_name: string;
  student_number?: string | null;
  class_id: string;
  class_name?: string;
  started_at: string;
  submitted_at?: string;
  answers: Record<string, string>; // question_id -> réponse de l'élève
  score: number; // Points obtenus
  max_score: number; // Total points du quiz
  score_20: number; // Note normalisée sur 20
  status: 'completed' | 'timeout' | 'missed'; // 'missed' = non fait avant la clôture (note = 0)
  feedback?: Record<string, { correct: boolean; points: number; expected: string; studentAnswer: string }>;
  date: string; // YYYY-MM-DD
  attempt_number?: number;
  launch_id?: string;
  attendance_status?: 'unknown' | 'present' | 'absent';
  retry_grant_id?: string;
  is_counted?: boolean;
}

export type QuizPresenceStatus = 'pending' | 'present' | 'absent' | 'completed' | 'timeout' | 'retry_authorized';

export interface QuizLaunch {
  id: string;
  quiz_id: string;
  launched_at: string;
  closed_at?: string | null;
  /** Deprecated launch-level field; presence initialization is per participant. */
  presence_deadline_at?: string | null;
  status: 'launched' | 'closed';
}

export interface QuizParticipant {
  id: string;
  launch_id: string;
  quiz_id: string;
  student_id: string;
  class_id: string;
  presence_status: QuizPresenceStatus;
  presence_confirmed_at?: string | null;
  /** Server-calculated deadline for this student's 10-second initialization window. */
  presence_deadline_at?: string | null;
  attendance_locked_at?: string | null;
  final_status?: string | null;
  final_score?: number | null;
}

export interface QuizRetryGrant {
  id: string;
  quiz_id: string;
  student_id: string;
  reason: string;
  launch_id?: string | null;
  created_at: string;
  used_at?: string | null;
  max_attempts: number;
}

export interface DailyGrade {
  student_id: string;
  student_name: string;
  student_number?: string | null;
  class_id: string;
  class_name?: string;
  date: string; // YYYY-MM-DD
  quizzes_count: number;
  average_score_20: number; // Total des points obtenus / total possible, ramené sur 20
  submissions: QuizSubmission[];
}


// =========================================================================
// MODULE EXERCICES (distinct des quiz notés)
// =========================================================================
export type ExerciseStatus = 'draft' | 'published' | 'archived';

export interface ExerciseDefinition {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  level?: CEFRLevel | null;
  status: ExerciseStatus;
  created_at: string;
  updated_at?: string;
  current_version_id?: string | null;
  current_version_number?: number;
  questions: QuizQuestion[];
  class_ids: string[];
}

export interface StudentExerciseItem {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  level?: CEFRLevel | null;
  assigned_at: string;
  attempt_count: number;
  active_attempt_id?: string | null;
}

export interface ExerciseAttemptQuestion {
  attempt_id: string;
  question: QuizQuestion;
  question_number: number;
  question_count: number;
  deadline_at: string;
  seconds_remaining: number;
  server_now: string;
  correction?: ExerciseCorrection;
}

export interface ExerciseCorrection {
  correct: boolean;
  points: number;
  max_points: number;
  expected: unknown;
  explanation?: string | null;
  timed_out: boolean;
  question_id: string;
  student_answer?: unknown;
}


export interface ExerciseAttemptReviewQuestion {
  question_id: string;
  question: string;
  type: string;
  points: number;
  answer: unknown;
  correct: boolean;
  points_awarded: number;
  max_points: number;
  timed_out: boolean;
  expected: unknown;
  explanation?: string | null;
  options?: string[];
  items?: QuizReorderItem[];
  verbes_trous?: QuizQuestion['verbes_trous'];
}

export interface ExerciseAttemptReview {
  attempt_id: string;
  exercise_id: string;
  score: number;
  max_score: number;
  status: 'in_progress' | 'completed';
  started_at: string;
  completed_at?: string | null;
  questions: ExerciseAttemptReviewQuestion[];
}

export interface ExerciseAttemptResult {
  id: string;
  exercise_id: string;
  score: number;
  max_score: number;
  status: 'in_progress' | 'completed';
  started_at: string;
  completed_at?: string | null;
  answers?: Record<string, unknown>;
}
