import { supabaseService } from './supabaseService';
import type {
  ExerciseAttemptQuestion,
  ExerciseCorrection,
  ExerciseDefinition,
  ExerciseAttemptResult,
  ExerciseAttemptReview,
  Quiz,
  QuizQuestion,
  StudentExerciseItem
} from '../types';
import { getQuestionTimeSeconds } from '../utils/quizTiming';

const SCHEMA = 'perckylingua.exercise';
const SCHEMA_VERSION = 1;

function requireClient() {
  const client = supabaseService.getClient();
  if (!client) throw new Error('Supabase est indisponible. Vérifiez la configuration de connexion.');
  return client;
}

function throwIfError(error: any, fallback: string): never {
  throw new Error(error?.message ? fallback + ' : ' + error.message : fallback);
}

function normalizeQuestions(questions: QuizQuestion[], requireTimers = true): QuizQuestion[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Ajoutez au moins une question.');
  }
  return questions.map((question, index) => {
    const id = String(question.id || 'question-' + (index + 1));
    const seconds = Number(question.time_limit_seconds);
    if (requireTimers && (!Number.isInteger(seconds) || seconds <= 0)) {
      throw new Error('La question ' + (index + 1) + ' doit avoir un temps imparti strictement positif.');
    }
    if (!['qcm', 'text', 'reorder', 'verbes_trous'].includes(question.type)) {
      throw new Error('Le type de question de la question ' + (index + 1) + ' n’est pas compatible.');
    }
    return { ...question, id, time_limit_seconds: seconds };
  });
}

export function createExerciseJson(exercise: Pick<ExerciseDefinition, 'title' | 'description' | 'category' | 'level' | 'questions'>) {
  if (!String(exercise.title || '').trim()) throw new Error('Le titre est obligatoire.');
  return {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    metadata: {
      title: exercise.title,
      description: exercise.description || '',
      category: exercise.category || 'Autre',
      level: exercise.level || null
    },
    questions: normalizeQuestions(exercise.questions)
  };
}

export function parseExerciseJson(raw: string): ReturnType<typeof createExerciseJson> {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('JSON invalide : ' + (error instanceof Error ? error.message : 'syntaxe incorrecte'));
  }
  if (parsed?.schema !== SCHEMA || parsed?.schema_version !== SCHEMA_VERSION) {
    throw new Error('Format non reconnu. Attendu : ' + SCHEMA + ' version ' + SCHEMA_VERSION + '.');
  }
  if (!parsed.metadata || !Array.isArray(parsed.questions)) {
    throw new Error('Le fichier doit contenir metadata et questions.');
  }
  const title = String(parsed.metadata.title || '').trim();
  if (!title) throw new Error('Le titre est obligatoire.');
  const questions = normalizeQuestions(parsed.questions);
  return {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    metadata: {
      title,
      description: String(parsed.metadata.description || ''),
      category: String(parsed.metadata.category || 'Autre'),
      level: parsed.metadata.level || null
    },
    questions
  };
}

export function convertQuizToExercise(quiz: Quiz): ReturnType<typeof createExerciseJson> {
  if (!quiz.questions?.length) throw new Error('Ce quiz ne contient aucune question.');
  const questions = quiz.questions.map((question, index) => ({
    ...question,
    id: question.id || 'question-' + (index + 1),
    time_limit_seconds: Number(question.time_limit_seconds) > 0
      ? Number(question.time_limit_seconds)
      : getQuestionTimeSeconds(question)
  }));
  return createExerciseJson({
    title: quiz.title,
    description: quiz.description || '',
    category: quiz.category || 'Autre',
    level: quiz.level || null,
    questions
  });
}

export const exerciseService = {
  async saveDefinition(input: {
    id?: string | null;
    metadata: { title: string; description?: string; category?: string; level?: string | null; status?: string };
    questions: QuizQuestion[];
    classIds: string[];
  }): Promise<string> {
    const client = requireClient();
    const questions = normalizeQuestions(input.questions);
    const { data, error } = await client.rpc('save_exercise_definition', {
      p_exercise_id: input.id || null,
      p_metadata: input.metadata,
      p_content: { questions },
      p_class_ids: input.classIds
    });
    if (error) throwIfError(error, 'Enregistrement de l’exercice impossible');
    return String(data);
  },

  async publishExercise(exerciseId: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.rpc('publish_exercise', { p_exercise_id: exerciseId });
    if (error) throwIfError(error, 'Publication de l’exercice impossible');
  },

  async listTeacherExercises(): Promise<ExerciseDefinition[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('exercises')
      .select('id,title,description,category,level,status,created_at,updated_at,current_version_id,exercise_class_assignments(class_id),exercise_versions!exercises_current_version_fk(id,version_number,content)')
      .order('updated_at', { ascending: false });
    if (error) throwIfError(error, 'Chargement des exercices impossible');
    return (data || []).map((row: any) => {
      const version = Array.isArray(row.exercise_versions) ? row.exercise_versions[0] : row.exercise_versions;
      return {
        ...row,
        questions: version?.content?.questions || [],
        current_version_number: version?.version_number || 0,
        class_ids: (row.exercise_class_assignments || []).map((item: any) => item.class_id)
      };
    });
  },

  async listStudentExercises(): Promise<StudentExerciseItem[]> {
    const client = requireClient();
    const { data, error } = await client.rpc('list_student_exercises');
    if (error) throwIfError(error, 'Chargement des exercices de la classe impossible');
    return (Array.isArray(data) ? data : []) as StudentExerciseItem[];
  },

  async startAttempt(exerciseId: string): Promise<ExerciseAttemptQuestion> {
    const client = requireClient();
    const { data, error } = await client.rpc('start_exercise_attempt', { p_exercise_id: exerciseId });
    if (error) throwIfError(error, 'Démarrage de l’exercice impossible');
    return data as ExerciseAttemptQuestion;
  },

  async resumeAttempt(attemptId: string): Promise<ExerciseAttemptQuestion> {
    const client = requireClient();
    const { data, error } = await client.rpc('get_exercise_current_question', { p_attempt_id: attemptId });
    if (error) throwIfError(error, 'Reprise de l’exercice impossible');
    return data as ExerciseAttemptQuestion;
  },

  async submitAnswer(attemptId: string, answer: unknown): Promise<ExerciseCorrection> {
    const client = requireClient();
    const { data, error } = await client.rpc('submit_exercise_answer', {
      p_attempt_id: attemptId,
      p_answer: answer === undefined ? null : answer
    });
    if (error) throwIfError(error, 'Validation de la réponse impossible');
    return data as ExerciseCorrection;
  },

  async advance(attemptId: string): Promise<ExerciseAttemptQuestion | { completed: true; attempt_id: string }> {
    const client = requireClient();
    const { data, error } = await client.rpc('advance_exercise_attempt', { p_attempt_id: attemptId });
    if (error) throwIfError(error, 'Passage à la question suivante impossible');
    return data as ExerciseAttemptQuestion | { completed: true; attempt_id: string };
  },

  async listStudentResults(): Promise<ExerciseAttemptResult[]> {
    const client = requireClient();
    const { data, error } = await client.rpc('get_student_exercise_results');
    if (error) throwIfError(error, 'Chargement des résultats impossible');
    return (Array.isArray(data) ? data : []) as ExerciseAttemptResult[];
  },

  async getStudentAttemptDetails(attemptId: string): Promise<ExerciseAttemptReview> {
    const client = requireClient();
    const { data, error } = await client.rpc('get_student_exercise_attempt_details', { p_attempt_id: attemptId });
    if (error) throwIfError(error, 'Chargement du détail de la tentative impossible');
    return data as ExerciseAttemptReview;
  },

  async listTeacherAttempts(exerciseId: string): Promise<any[]> {
    const client = requireClient();
    const { data, error } = await client.rpc('get_teacher_exercise_attempts', { p_exercise_id: exerciseId });
    if (error) throwIfError(error, 'Chargement des tentatives impossible');
    return Array.isArray(data) ? data : [];
  }
};
