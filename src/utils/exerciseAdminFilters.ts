import type { CEFRLevel, ClassRoom, ExerciseDefinition, ExerciseStatus, Quiz } from '../types';

export type ExerciseSortOption = 'updated_desc' | 'title_asc' | 'questions_desc' | 'classes_desc';

export interface ExerciseCatalogFilters {
  search: string;
  status: 'all' | ExerciseStatus;
  classId: 'all' | 'unassigned' | string;
  level: 'all' | 'none' | CEFRLevel;
  category: 'all' | string;
  minQuestions: string;
  maxQuestions: string;
  sortBy: ExerciseSortOption;
}

export const DEFAULT_EXERCISE_CATALOG_FILTERS: ExerciseCatalogFilters = {
  search: '',
  status: 'all',
  classId: 'all',
  level: 'all',
  category: 'all',
  minQuestions: '',
  maxQuestions: '',
  sortBy: 'updated_desc'
};

export type QuizConversionSortOption = 'created_desc' | 'title_asc' | 'questions_desc' | 'duration_desc';

export interface QuizConversionFilters {
  search: string;
  status: 'all' | Quiz['status'];
  visibility: 'all' | 'public' | 'private';
  classId: 'all' | string;
  category: 'all' | string;
  level: 'all' | 'none' | CEFRLevel;
  minQuestions: string;
  maxQuestions: string;
  sortBy: QuizConversionSortOption;
}

export const DEFAULT_QUIZ_CONVERSION_FILTERS: QuizConversionFilters = {
  search: '',
  status: 'all',
  visibility: 'all',
  classId: 'all',
  category: 'all',
  level: 'all',
  minQuestions: '',
  maxQuestions: '',
  sortBy: 'created_desc'
};

export interface TeacherExerciseAttemptDetail {
  question_id: string;
  answer: unknown;
  correct: boolean;
  points: number;
  max_points: number;
  timed_out?: boolean;
}

export interface TeacherExerciseAttemptRow {
  student_id: string;
  student_name: string;
  student_number?: string | null;
  avatar_url?: string | null;
  class_id: string;
  class_name: string;
  attempt_id?: string | null;
  status: 'completed' | 'in_progress' | 'not_started';
  attempt_count: number;
  score: number;
  best_score?: number | null;
  latest_score?: number | null;
  max_score: number;
  best_attempt_id?: string | null;
  best_details?: TeacherExerciseAttemptDetail[];
  /** Questions from the exact version used by the best completed attempt. */
  best_questions?: import('../types').QuizQuestion[];
  started_at?: string | null;
  completed_at?: string | null;
  details?: TeacherExerciseAttemptDetail[];
}

export type AttemptProgressFilter = 'all' | 'completed' | 'in_progress' | 'not_started';
export type AttemptScoreBandFilter = 'all' | 'passed' | 'needs_review' | 'unscored';
export type AttemptSortOption = 'name_asc' | 'score_desc' | 'score_asc' | 'attempts_desc' | 'activity_desc';

export interface AttemptFilters {
  search: string;
  classId: 'all' | string;
  progress: AttemptProgressFilter;
  scoreBand: AttemptScoreBandFilter;
  sortBy: AttemptSortOption;
}

export const DEFAULT_ATTEMPT_FILTERS: AttemptFilters = {
  search: '',
  classId: 'all',
  progress: 'all',
  scoreBand: 'all',
  sortBy: 'name_asc'
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
}

export function formatExerciseTotalDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) return `${safe} s`;
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem === 0 ? `${mins} min` : `${mins} min ${rem} s`;
}

export function getDistinctExerciseCategories(exercises: ExerciseDefinition[]): string[] {
  const categories = new Set<string>();
  for (const item of exercises) {
    const cat = (item.category || '').trim();
    if (cat) categories.add(cat);
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b, 'fr'));
}

export function countActiveExerciseFilters(filters: ExerciseCatalogFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.status !== 'all') count += 1;
  if (filters.classId !== 'all') count += 1;
  if (filters.level !== 'all') count += 1;
  if (filters.category !== 'all') count += 1;
  if (filters.minQuestions.trim()) count += 1;
  if (filters.maxQuestions.trim()) count += 1;
  return count;
}

export function filterAndSortExercises(
  exercises: ExerciseDefinition[],
  classes: ClassRoom[],
  filters: ExerciseCatalogFilters
): ExerciseDefinition[] {
  const searchTerms = normalizeSearchText(filters.search).trim().split(/\s+/).filter(Boolean);
  const classMap = new Map(classes.map(c => [c.id, c.name]));
  const minQ = filters.minQuestions.trim() !== '' ? Number(filters.minQuestions) : null;
  const maxQ = filters.maxQuestions.trim() !== '' ? Number(filters.maxQuestions) : null;

  const filtered = exercises.filter(item => {
    if (filters.status !== 'all' && item.status !== filters.status) return false;

    if (filters.classId === 'unassigned') {
      if ((item.class_ids || []).length > 0) return false;
    } else if (filters.classId !== 'all') {
      if (!(item.class_ids || []).includes(filters.classId)) return false;
    }

    if (filters.level === 'none') {
      if (item.level) return false;
    } else if (filters.level !== 'all') {
      if (item.level !== filters.level) return false;
    }

    if (filters.category !== 'all') {
      if ((item.category || 'Autre') !== filters.category) return false;
    }

    const qCount = item.questions?.length || 0;
    if (minQ !== null && Number.isFinite(minQ) && qCount < minQ) return false;
    if (maxQ !== null && Number.isFinite(maxQ) && qCount > maxQ) return false;

    if (searchTerms.length > 0) {
      const assignedNames = (item.class_ids || [])
        .map(id => classMap.get(id) || '')
        .join(' ');
      const statusText =
        item.status === 'published'
          ? 'publie published'
          : item.status === 'archived'
          ? 'archive archived'
          : 'brouillon draft';
      const questionsText = (item.questions || [])
        .map(q => `${q.question || ''} ${q.type || ''}`)
        .join(' ');
      const haystack = normalizeSearchText(
        [
          item.title,
          item.description || '',
          item.category || 'Autre',
          item.level || '',
          assignedNames,
          statusText,
          questionsText
        ].join(' ')
      );
      if (!searchTerms.every(term => haystack.includes(term))) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (filters.sortBy === 'title_asc') {
      return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
    }
    if (filters.sortBy === 'questions_desc') {
      return (b.questions?.length || 0) - (a.questions?.length || 0);
    }
    if (filters.sortBy === 'classes_desc') {
      return (b.class_ids?.length || 0) - (a.class_ids?.length || 0);
    }
    const timeA = Date.parse(a.updated_at || a.created_at || '') || 0;
    const timeB = Date.parse(b.updated_at || b.created_at || '') || 0;
    return timeB - timeA;
  });

  return sorted;
}

export function getAttemptPercentage(row: Pick<TeacherExerciseAttemptRow, 'best_score' | 'max_score'>): number | null {
  if (row.best_score === null || row.best_score === undefined || !(Number(row.max_score) > 0)) {
    return null;
  }
  return (Number(row.best_score) / Number(row.max_score)) * 100;
}

export function countActiveAttemptFilters(filters: AttemptFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.classId !== 'all') count += 1;
  if (filters.progress !== 'all') count += 1;
  if (filters.scoreBand !== 'all') count += 1;
  return count;
}

export function filterAndSortAttempts(
  attempts: TeacherExerciseAttemptRow[],
  filters: AttemptFilters
): TeacherExerciseAttemptRow[] {
  const searchTerms = normalizeSearchText(filters.search).trim().split(/\s+/).filter(Boolean);

  const filtered = attempts.filter(row => {
    if (filters.classId !== 'all' && row.class_id !== filters.classId) return false;
    if (filters.progress !== 'all' && row.status !== filters.progress) return false;

    const pct = getAttemptPercentage(row);
    if (filters.scoreBand === 'passed' && (pct === null || pct < 50)) return false;
    if (filters.scoreBand === 'needs_review' && (pct === null || pct >= 50)) return false;
    if (filters.scoreBand === 'unscored' && pct !== null) return false;

    if (searchTerms.length > 0) {
      const statusLabel =
        row.status === 'completed'
          ? 'termine'
          : row.status === 'in_progress'
          ? 'en cours nouvelle tentative'
          : 'non commence';
      const haystack = normalizeSearchText(
        [
          row.student_name || '',
          row.student_number || '',
          row.class_name || '',
          statusLabel
        ].join(' ')
      );
      if (!searchTerms.every(term => haystack.includes(term))) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (filters.sortBy === 'score_desc') {
      const pa = getAttemptPercentage(a) ?? -1;
      const pb = getAttemptPercentage(b) ?? -1;
      if (pb !== pa) return pb - pa;
    } else if (filters.sortBy === 'score_asc') {
      const pa = getAttemptPercentage(a);
      const pb = getAttemptPercentage(b);
      if (pa === null && pb !== null) return 1;
      if (pa !== null && pb === null) return -1;
      if (pa !== null && pb !== null && pa !== pb) return pa - pb;
    } else if (filters.sortBy === 'attempts_desc') {
      const diff = Number(b.attempt_count || 0) - Number(a.attempt_count || 0);
      if (diff !== 0) return diff;
    } else if (filters.sortBy === 'activity_desc') {
      const ta = Date.parse(a.completed_at || a.started_at || '') || 0;
      const tb = Date.parse(b.completed_at || b.started_at || '') || 0;
      if (tb !== ta) return tb - ta;
    }
    return (a.student_name || '').localeCompare(b.student_name || '', 'fr', { sensitivity: 'base' });
  });

  return sorted;
}

export function getDistinctQuizCategories(quizzes: Quiz[]): string[] {
  const categories = new Set<string>();
  for (const q of quizzes) {
    const cat = (q.category || '').trim();
    if (cat) categories.add(cat);
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b, 'fr'));
}

export function countActiveQuizFilters(filters: QuizConversionFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.status !== 'all') count += 1;
  if (filters.visibility !== 'all') count += 1;
  if (filters.classId !== 'all') count += 1;
  if (filters.category !== 'all') count += 1;
  if (filters.level !== 'all') count += 1;
  if (filters.minQuestions.trim()) count += 1;
  if (filters.maxQuestions.trim()) count += 1;
  return count;
}

export function filterAndSortQuizzes(
  quizzes: Quiz[],
  classes: ClassRoom[],
  filters: QuizConversionFilters
): Quiz[] {
  const searchTerms = normalizeSearchText(filters.search).trim().split(/\s+/).filter(Boolean);
  const classMap = new Map(classes.map(c => [c.id, c.name]));
  const minQ = filters.minQuestions.trim() !== '' ? Number(filters.minQuestions) : null;
  const maxQ = filters.maxQuestions.trim() !== '' ? Number(filters.maxQuestions) : null;

  const filtered = quizzes.filter(quiz => {
    if (filters.status !== 'all' && quiz.status !== filters.status) return false;
    if (filters.visibility === 'public' && !quiz.is_public) return false;
    if (filters.visibility === 'private' && quiz.is_public) return false;

    const quizClassIds = quiz.class_ids?.length ? quiz.class_ids : quiz.class_id ? [quiz.class_id] : [];
    if (filters.classId !== 'all' && !quizClassIds.includes(filters.classId)) return false;

    if (filters.category !== 'all' && (quiz.category || 'Autre') !== filters.category) return false;

    if (filters.level === 'none') {
      if (quiz.level) return false;
    } else if (filters.level !== 'all') {
      if (quiz.level !== filters.level) return false;
    }

    const qCount = quiz.questions?.length || 0;
    if (minQ !== null && Number.isFinite(minQ) && qCount < minQ) return false;
    if (maxQ !== null && Number.isFinite(maxQ) && qCount > maxQ) return false;

    if (searchTerms.length > 0) {
      const assignedNames = quizClassIds.map(id => classMap.get(id) || quiz.class_name || '').join(' ');
      const statusText =
        quiz.status === 'launched'
          ? 'en direct lance actif'
          : quiz.status === 'closed'
          ? 'cloture ferme'
          : 'brouillon draft';
      const visibilityText = quiz.is_public ? 'public partage' : 'prive classe';
      const questionsText = (quiz.questions || [])
        .map(q => `${q.question || ''} ${q.type || ''}`)
        .join(' ');
      const haystack = normalizeSearchText(
        [
          quiz.title,
          quiz.description || '',
          quiz.category || 'Autre',
          quiz.level || '',
          assignedNames,
          statusText,
          visibilityText,
          questionsText
        ].join(' ')
      );
      if (!searchTerms.every(term => haystack.includes(term))) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (filters.sortBy === 'title_asc') {
      return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
    }
    if (filters.sortBy === 'questions_desc') {
      return (b.questions?.length || 0) - (a.questions?.length || 0);
    }
    if (filters.sortBy === 'duration_desc') {
      return Number(b.duration_minutes || 0) - Number(a.duration_minutes || 0);
    }
    const timeA = Date.parse(a.created_at || '') || 0;
    const timeB = Date.parse(b.created_at || '') || 0;
    return timeB - timeA;
  });

  return sorted;
}


export const PEDAGOGICAL_MASTERY_THRESHOLD = 70;

export interface ExerciseQuestionDiagnostic {
  id: string;
  label: string;
  competency: string;
  skillCode: string | null;
  responses: number;
  correct: number;
  incorrect: number;
  points: number;
  maxPoints: number;
  masteryRate: number | null;
  studentsNeedingSupport: Array<{ studentId: string; studentName: string; className: string; rate: number }>;
  errorPatterns: Array<{ category: string; count: number }>;
}

export interface ExerciseCompetencyDiagnostic {
  competency: string;
  skillCode: string | null;
  questions: number;
  responses: number;
  points: number;
  maxPoints: number;
  masteryRate: number | null;
  studentsNeedingSupport: Array<{ studentId: string; studentName: string; className: string; rate: number }>;
}

export interface ExercisePedagogicalDiagnostic {
  evaluatedStudents: number;
  masteredStudents: number;
  studentsNeedingSupport: number;
  globalMasteryRate: number | null;
  difficultQuestions: number;
  uncategorizedQuestions: number;
  questions: ExerciseQuestionDiagnostic[];
  competencies: ExerciseCompetencyDiagnostic[];
  targetedStudents: Array<{ studentId: string; studentName: string; className: string; rate: number }>;
}

/**
 * Build pedagogical indicators from each student's best completed attempt only.
 * Competency/error interpretations are only emitted when the teacher explicitly
 * annotated the question; the function never guesses a cause from free text.
 */
export function buildExercisePedagogicalDiagnostic(
  attempts: TeacherExerciseAttemptRow[],
  threshold = PEDAGOGICAL_MASTERY_THRESHOLD
): ExercisePedagogicalDiagnostic {
  const completed = attempts.filter(row => row.best_attempt_id && Array.isArray(row.best_details));
  const perQuestion = new Map<string, {
    question: NonNullable<TeacherExerciseAttemptRow['best_questions']>[number];
    details: Array<{ row: TeacherExerciseAttemptRow; detail: TeacherExerciseAttemptDetail }>;
  }>();

  for (const row of completed) {
    const questions = row.best_questions || [];
    for (const question of questions) {
      const entry = perQuestion.get(question.id) || { question, details: [] };
      for (const detail of row.best_details || []) {
        if (detail.question_id === question.id) entry.details.push({ row, detail });
      }
      perQuestion.set(question.id, entry);
    }
  }

  const questionStats: ExerciseQuestionDiagnostic[] = Array.from(perQuestion.values()).map(({ question, details }) => {
    const points = details.reduce((sum, item) => sum + Number(item.detail.points || 0), 0);
    const maxPoints = details.reduce((sum, item) => sum + Number(item.detail.max_points || 0), 0);
    const masteryRate = maxPoints > 0 ? (points / maxPoints) * 100 : null;
    const byStudent = details.map(({ row, detail }) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      className: row.class_name,
      rate: Number(detail.max_points) > 0 ? (Number(detail.points || 0) / Number(detail.max_points)) * 100 : 0
    }));
    const errorCounts = new Map<string, number>();
    const mapping = question.error_category_map || {};
    for (const { detail } of details) {
      if (detail.correct) continue;
      const answerKey = typeof detail.answer === 'string' ? detail.answer : JSON.stringify(detail.answer ?? '');
      const category = mapping[answerKey] || mapping[answerKey.trim()];
      if (category) errorCounts.set(category, (errorCounts.get(category) || 0) + 1);
    }
    return {
      id: question.id,
      label: question.question || question.titre || question.id,
      competency: question.competency?.trim() || 'Compétence à renseigner',
      skillCode: question.skill_code || null,
      responses: details.length,
      correct: details.filter(item => item.detail.correct).length,
      incorrect: details.filter(item => !item.detail.correct).length,
      points,
      maxPoints,
      masteryRate,
      studentsNeedingSupport: byStudent.filter(student => student.rate < threshold).sort((a, b) => a.rate - b.rate),
      errorPatterns: Array.from(errorCounts, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
    };
  });

  const competencyMap = new Map<string, ExerciseQuestionDiagnostic[]>();
  for (const question of questionStats) {
    const list = competencyMap.get(question.competency) || [];
    list.push(question);
    competencyMap.set(question.competency, list);
  }
  const competencies: ExerciseCompetencyDiagnostic[] = Array.from(competencyMap, ([competency, questions]) => {
    const points = questions.reduce((sum, question) => sum + question.points, 0);
    const maxPoints = questions.reduce((sum, question) => sum + question.maxPoints, 0);
    const studentMap = new Map<string, { studentId: string; studentName: string; className: string; points: number; maxPoints: number }>();
    for (const question of questions) {
      for (const student of question.studentsNeedingSupport) {
        const current = studentMap.get(student.studentId) || { ...student, points: 0, maxPoints: 0 };
        // Per-question support list only contains below-threshold learners. Their
        // competency score is computed from all questions below in the dedicated pass.
        studentMap.set(student.studentId, current);
      }
    }
    const perStudent = new Map<string, { studentId: string; studentName: string; className: string; points: number; maxPoints: number }>();
    for (const row of completed) {
      const studentQuestions = questions.flatMap(question => {
        const questionDef = (row.best_questions || []).find(item => item.id === question.id);
        const detail = (row.best_details || []).find(item => item.question_id === question.id);
        return questionDef && detail ? [{ detail }] : [];
      });
      if (!studentQuestions.length) continue;
      const studentPoints = studentQuestions.reduce((sum, item) => sum + Number(item.detail.points || 0), 0);
      const studentMax = studentQuestions.reduce((sum, item) => sum + Number(item.detail.max_points || 0), 0);
      perStudent.set(row.student_id, { studentId: row.student_id, studentName: row.student_name, className: row.class_name, points: studentPoints, maxPoints: studentMax });
    }
    const studentsNeedingSupport = Array.from(perStudent.values())
      .map(student => ({ studentId: student.studentId, studentName: student.studentName, className: student.className, rate: student.maxPoints > 0 ? (student.points / student.maxPoints) * 100 : 0 }))
      .filter(student => student.rate < threshold)
      .sort((a, b) => a.rate - b.rate);
    return {
      competency,
      skillCode: questions.find(question => question.skillCode)?.skillCode || null,
      questions: questions.length,
      responses: questions.reduce((sum, question) => sum + question.responses, 0),
      points,
      maxPoints,
      masteryRate: maxPoints > 0 ? (points / maxPoints) * 100 : null,
      studentsNeedingSupport
    };
  }).sort((a, b) => (a.masteryRate ?? 101) - (b.masteryRate ?? 101));

  const totalPoints = questionStats.reduce((sum, question) => sum + question.points, 0);
  const totalMaxPoints = questionStats.reduce((sum, question) => sum + question.maxPoints, 0);
  const studentRates = completed.map(row => ({
    studentId: row.student_id,
    studentName: row.student_name,
    className: row.class_name,
    rate: Number(row.max_score) > 0 ? (Number(row.best_score || 0) / Number(row.max_score)) * 100 : 0
  }));
  const targetedStudents = studentRates.filter(student => student.rate < threshold).sort((a, b) => a.rate - b.rate);

  return {
    evaluatedStudents: completed.length,
    masteredStudents: studentRates.filter(student => student.rate >= threshold).length,
    studentsNeedingSupport: targetedStudents.length,
    globalMasteryRate: totalMaxPoints > 0 ? (totalPoints / totalMaxPoints) * 100 : null,
    difficultQuestions: questionStats.filter(question => question.masteryRate !== null && question.masteryRate < threshold).length,
    uncategorizedQuestions: questionStats.filter(question => question.competency === 'Compétence à renseigner').length,
    questions: questionStats,
    competencies,
    targetedStudents
  };
}
