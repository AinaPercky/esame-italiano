/**
 * Modèles de données pour PerckyLingua
 */

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
  // Animal présenté par l'élève
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

export interface QuizQuestion {
  id: string;
  type: 'qcm' | 'text'; // QCM (Choix Multiple) ou Réponse Saisie (Texte)
  question: string;
  options?: string[]; // Pour QCM (ex: 4 options)
  correct_answer: string; // Pour QCM: l'option exacte ou l'index; Pour texte: mot-clé/réponse acceptée
  points: number; // Barème pour cette question (ex: 2, 4, 5 points)
  explanation?: string; // Explication pédagogique affichée lors de la correction
}

export interface Quiz {
  id: string;
  public_id?: string; // UUID unique pour l'accès public via lien partageable
  is_public?: boolean; // Indique si le quiz est publié publiquement
  title: string;
  description?: string;
  class_id: string; // Primary class (backward compatibility)
  class_ids?: string[]; // All classes this quiz belongs to (new feature)
  class_name?: string;
  created_at: string;
  duration_minutes: number; // Temps imparti pour composer (ex: 5, 10, 15 min)
  status: 'draft' | 'launched' | 'closed';
  launched_at?: string; // Timestamp ISO lorsque le professeur lance le quiz
  expires_at?: string; // Timestamp ISO (1 heure après le lancement)
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
  status: 'completed' | 'timeout' | 'missed'; // 'missed' = non fait dans l'heure (note = 0)
  feedback?: Record<string, { correct: boolean; points: number; expected: string; studentAnswer: string }>;
  date: string; // YYYY-MM-DD
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
