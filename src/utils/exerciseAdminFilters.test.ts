import test from 'node:test';
import assert from 'node:assert/strict';
import type { ClassRoom, ExerciseDefinition, Quiz } from '../types';
import {
  DEFAULT_ATTEMPT_FILTERS,
  DEFAULT_EXERCISE_CATALOG_FILTERS,
  DEFAULT_QUIZ_CONVERSION_FILTERS,
  countActiveAttemptFilters,
  countActiveExerciseFilters,
  countActiveQuizFilters,
  filterAndSortAttempts,
  filterAndSortExercises,
  filterAndSortQuizzes,
  formatExerciseTotalDuration,
  getDistinctExerciseCategories,
  getDistinctQuizCategories,
  type TeacherExerciseAttemptRow
} from './exerciseAdminFilters';

const CLASSES: ClassRoom[] = [
  { id: 'c1', name: '2nde A', created_at: '2026-09-01T08:00:00Z' },
  { id: 'c2', name: '1ère B', created_at: '2026-09-01T08:00:00Z' }
];

const EXERCISES: ExerciseDefinition[] = [
  {
    id: 'ex1',
    title: 'Passato prossimo — Verbes irréguliers',
    description: 'Révision ciblée sur avere/essere',
    category: 'Conjugaison',
    level: 'A2',
    status: 'published',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-12T10:00:00Z',
    current_version_number: 2,
    class_ids: ['c1', 'c2'],
    questions: [
      { id: 'q1', type: 'qcm', question: 'Ieri Marco ___ andato al mare.', options: ['è', 'ha'], correct_answer: 'è', points: 1, time_limit_seconds: 20 },
      { id: 'q2', type: 'text', question: 'Noi ___ visto un film.', correct_answer: 'abbiamo', points: 1, time_limit_seconds: 25 }
    ]
  },
  {
    id: 'ex2',
    title: 'Vocabulaire de la gare',
    description: 'Expressions pour voyager en train',
    category: 'Vocabulaire',
    level: 'A1',
    status: 'draft',
    created_at: '2026-10-05T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
    current_version_number: 1,
    class_ids: [],
    questions: [
      { id: 'q1', type: 'qcm', question: 'Dove è il binario?', options: ['Quai', 'Gare'], correct_answer: 'Quai', points: 1, time_limit_seconds: 15 }
    ]
  },
  {
    id: 'ex3',
    title: 'Articles définis',
    description: 'il, lo, la, i, gli, le',
    category: 'Grammaire',
    level: null,
    status: 'archived',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-25T10:00:00Z',
    current_version_number: 3,
    class_ids: ['c2'],
    questions: [
      { id: 'q1', type: 'qcm', question: '___ zaino', options: ['lo', 'il'], correct_answer: 'lo', points: 1, time_limit_seconds: 20 },
      { id: 'q2', type: 'qcm', question: '___ studente', options: ['lo', 'il'], correct_answer: 'lo', points: 1, time_limit_seconds: 20 },
      { id: 'q3', type: 'qcm', question: '___ amica', options: ["l'", 'la'], correct_answer: "l'", points: 1, time_limit_seconds: 20 }
    ]
  }
];

const ATTEMPTS: TeacherExerciseAttemptRow[] = [
  {
    student_id: 's1',
    student_name: 'Clara Rossi',
    student_number: '2026-01',
    class_id: 'c1',
    class_name: '2nde A',
    status: 'completed',
    attempt_count: 3,
    score: 8,
    best_score: 8,
    max_score: 10,
    best_attempt_id: 'a1',
    started_at: '2026-10-14T08:00:00Z',
    completed_at: '2026-10-14T08:05:00Z'
  },
  {
    student_id: 's2',
    student_name: 'Élie Bernard',
    student_number: '2026-02',
    class_id: 'c2',
    class_name: '1ère B',
    status: 'in_progress',
    attempt_count: 2,
    score: 4,
    best_score: 4,
    max_score: 10,
    best_attempt_id: 'a2',
    started_at: '2026-10-16T09:00:00Z',
    completed_at: null
  },
  {
    student_id: 's3',
    student_name: 'Nora Conti',
    student_number: '2026-03',
    class_id: 'c1',
    class_name: '2nde A',
    status: 'not_started',
    attempt_count: 0,
    score: 0,
    best_score: null,
    max_score: 10,
    best_attempt_id: null,
    started_at: null,
    completed_at: null
  }
];

test('filterAndSortExercises combines accent-insensitive search, status, class, level, and question count', () => {
  assert.deepEqual(
    filterAndSortExercises(EXERCISES, CLASSES, DEFAULT_EXERCISE_CATALOG_FILTERS).map(e => e.id),
    ['ex2', 'ex1', 'ex3']
  );

  // Accent-insensitive search across class name and description
  assert.deepEqual(
    filterAndSortExercises(EXERCISES, CLASSES, {
      ...DEFAULT_EXERCISE_CATALOG_FILTERS,
      search: 'revision 1ere'
    }).map(e => e.id),
    ['ex1']
  );

  // Unassigned filter
  assert.deepEqual(
    filterAndSortExercises(EXERCISES, CLASSES, {
      ...DEFAULT_EXERCISE_CATALOG_FILTERS,
      classId: 'unassigned'
    }).map(e => e.id),
    ['ex2']
  );

  // Level "none" and minQuestions
  assert.deepEqual(
    filterAndSortExercises(EXERCISES, CLASSES, {
      ...DEFAULT_EXERCISE_CATALOG_FILTERS,
      level: 'none',
      minQuestions: '3'
    }).map(e => e.id),
    ['ex3']
  );

  // Sort by questions_desc
  assert.deepEqual(
    filterAndSortExercises(EXERCISES, CLASSES, {
      ...DEFAULT_EXERCISE_CATALOG_FILTERS,
      sortBy: 'questions_desc'
    }).map(e => e.id),
    ['ex3', 'ex1', 'ex2']
  );
});

test('filterAndSortAttempts handles multi-criteria filtering and score/activity sorting', () => {
  // Search accent-insensitively by first name
  assert.deepEqual(
    filterAndSortAttempts(ATTEMPTS, {
      ...DEFAULT_ATTEMPT_FILTERS,
      search: 'elie'
    }).map(a => a.student_id),
    ['s2']
  );

  // Filter by class and passed score band (>= 50%)
  assert.deepEqual(
    filterAndSortAttempts(ATTEMPTS, {
      ...DEFAULT_ATTEMPT_FILTERS,
      classId: 'c1',
      scoreBand: 'passed'
    }).map(a => a.student_id),
    ['s1']
  );

  // Filter by needs_review (< 50%)
  assert.deepEqual(
    filterAndSortAttempts(ATTEMPTS, {
      ...DEFAULT_ATTEMPT_FILTERS,
      scoreBand: 'needs_review'
    }).map(a => a.student_id),
    ['s2']
  );

  // Filter by unscored
  assert.deepEqual(
    filterAndSortAttempts(ATTEMPTS, {
      ...DEFAULT_ATTEMPT_FILTERS,
      scoreBand: 'unscored'
    }).map(a => a.student_id),
    ['s3']
  );

  // Sort by score_desc
  assert.deepEqual(
    filterAndSortAttempts(ATTEMPTS, {
      ...DEFAULT_ATTEMPT_FILTERS,
      sortBy: 'score_desc'
    }).map(a => a.student_id),
    ['s1', 's2', 's3']
  );

  // Sort by activity_desc
  assert.deepEqual(
    filterAndSortAttempts(ATTEMPTS, {
      ...DEFAULT_ATTEMPT_FILTERS,
      sortBy: 'activity_desc'
    }).map(a => a.student_id),
    ['s2', 's1', 's3']
  );
});

test('metadata helpers count active filters, distinct categories, and format durations', () => {
  assert.equal(countActiveExerciseFilters(DEFAULT_EXERCISE_CATALOG_FILTERS), 0);
  assert.equal(
    countActiveExerciseFilters({
      ...DEFAULT_EXERCISE_CATALOG_FILTERS,
      search: 'passato',
      status: 'published',
      level: 'A2'
    }),
    3
  );

  assert.equal(countActiveAttemptFilters(DEFAULT_ATTEMPT_FILTERS), 0);
  assert.equal(
    countActiveAttemptFilters({
      ...DEFAULT_ATTEMPT_FILTERS,
      progress: 'completed',
      scoreBand: 'passed'
    }),
    2
  );

  assert.deepEqual(getDistinctExerciseCategories(EXERCISES), ['Conjugaison', 'Grammaire', 'Vocabulaire']);
  assert.equal(formatExerciseTotalDuration(45), '45 s');
  assert.equal(formatExerciseTotalDuration(120), '2 min');
  assert.equal(formatExerciseTotalDuration(145), '2 min 25 s');
});

const QUIZZES: Quiz[] = [
  {
    id: 'qz1',
    title: 'Évaluation Passato Prossimo',
    description: 'Auxiliaires essere et avere',
    category: 'Conjugaison',
    level: 'A2',
    class_id: 'c1',
    class_ids: ['c1', 'c2'],
    created_at: '2026-10-10T10:00:00Z',
    duration_minutes: 15,
    status: 'closed',
    is_public: true,
    total_points: 10,
    questions: [
      { id: 'q1', type: 'qcm', question: 'Quando ___ arrivato?', options: ['sei', 'hai'], correct_answer: 'sei', points: 5 },
      { id: 'q2', type: 'text', question: 'Io ___ mangiato.', correct_answer: 'ho', points: 5 }
    ]
  },
  {
    id: 'qz2',
    title: 'Vocabulaire du restaurant',
    description: 'Commander un plat en italien',
    category: 'Vocabulaire',
    level: 'A1',
    class_id: 'c1',
    class_ids: ['c1'],
    created_at: '2026-10-18T10:00:00Z',
    duration_minutes: 8,
    status: 'draft',
    is_public: false,
    total_points: 5,
    questions: [
      { id: 'q1', type: 'qcm', question: 'Il conto per favore', options: ['Addition', 'Menu'], correct_answer: 'Addition', points: 5 }
    ]
  }
];

test('filterAndSortQuizzes supports multi-criteria filtering, visibility, class, level, and sorting', () => {
  assert.deepEqual(
    filterAndSortQuizzes(QUIZZES, CLASSES, DEFAULT_QUIZ_CONVERSION_FILTERS).map(q => q.id),
    ['qz2', 'qz1']
  );

  // Search accent-insensitively across class and question text
  assert.deepEqual(
    filterAndSortQuizzes(QUIZZES, CLASSES, {
      ...DEFAULT_QUIZ_CONVERSION_FILTERS,
      search: 'evaluation 1ere arrivato'
    }).map(q => q.id),
    ['qz1']
  );

  // Visibility + status + class filters
  assert.deepEqual(
    filterAndSortQuizzes(QUIZZES, CLASSES, {
      ...DEFAULT_QUIZ_CONVERSION_FILTERS,
      visibility: 'private',
      status: 'draft',
      classId: 'c1'
    }).map(q => q.id),
    ['qz2']
  );

  // Min questions + sort by questions_desc
  assert.deepEqual(
    filterAndSortQuizzes(QUIZZES, CLASSES, {
      ...DEFAULT_QUIZ_CONVERSION_FILTERS,
      minQuestions: '2',
      sortBy: 'questions_desc'
    }).map(q => q.id),
    ['qz1']
  );

  assert.equal(countActiveQuizFilters(DEFAULT_QUIZ_CONVERSION_FILTERS), 0);
  assert.equal(
    countActiveQuizFilters({
      ...DEFAULT_QUIZ_CONVERSION_FILTERS,
      search: 'italien',
      visibility: 'public',
      level: 'A2'
    }),
    3
  );
  assert.deepEqual(getDistinctQuizCategories(QUIZZES), ['Conjugaison', 'Vocabulaire']);
});


test('pedagogical diagnostic uses best attempt details and the 70 percent threshold', async () => {
  const { buildExercisePedagogicalDiagnostic } = await import('./exerciseAdminFilters');
  const attempts: TeacherExerciseAttemptRow[] = [{
    ...ATTEMPTS[0],
    best_attempt_id: 'best-1',
    best_version_id: 'v1',
    best_score: 7,
    max_score: 10,
    best_questions: [
      { id: 'q1', type: 'qcm', question: 'Choisir l’auxiliaire', correct_answer: 'essere', points: 5, competency: 'Choix de l’auxiliaire', skill_code: 'AUX', error_category_map: { avere: 'Confusion essere/avere' } },
      { id: 'q2', type: 'text', question: 'Participe passé', correct_answer: 'fatto', points: 5, competency: 'Participe passé', skill_code: 'PART' }
    ],
    best_details: [
      { question_id: 'q1', answer: 'avere', correct: false, points: 2, max_points: 5 },
      { question_id: 'q2', answer: 'fatto', correct: true, points: 5, max_points: 5 }
    ],
    details: [{ question_id: 'q1', answer: 'essere', correct: true, points: 5, max_points: 5 }]
  }];
  const result = buildExercisePedagogicalDiagnostic(attempts);
  assert.equal(result.evaluatedStudents, 1);
  assert.equal(result.masteredStudents, 1);
  assert.equal(result.studentsNeedingSupport, 0);
  assert.equal(result.globalMasteryRate, 70);
  assert.equal(result.questions.find(q => q.id.endsWith(':q1'))?.masteryRate, 40);
  assert.equal(result.questions.find(q => q.id === 'q1')?.studentsNeedingSupport.length, 1);
  assert.equal(result.questions.find(q => q.id === 'q1')?.errorPatterns[0]?.category, 'Confusion essere/avere');
  assert.equal(result.questions.find(q => q.id.endsWith(':q2'))?.masteryRate, 100);
});
