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
