/**
 * Service de stockage de données pour PerckyLingua
 * Prend en charge Supabase PostgreSQL ou stockage structuré en mémoire avec persistance
 */

const { supabase, isConfigured } = require('../config/supabase');

// Données d'initialisation conformes aux consignes
const initialClasses = [
  { id: 'c1', name: 'Classe A1 - Débutants', created_at: '2026-09-01T08:00:00Z' },
  { id: 'c2', name: 'Classe B1 - Intermédiaires', created_at: '2026-09-01T08:00:00Z' }
];

const initialStudents = [
  { id: 's1', class_id: 'c1', first_name: 'Jean', last_name: 'Rakoto', student_number: 'STU-001', created_at: '2026-09-02T08:00:00Z' },
  { id: 's2', class_id: 'c1', first_name: 'Marie', last_name: 'Rabe', student_number: 'STU-002', created_at: '2026-09-02T08:00:00Z' },
  { id: 's3', class_id: 'c1', first_name: 'Paul', last_name: 'Rasoa', student_number: 'STU-003', created_at: '2026-09-02T08:00:00Z' },
  { id: 's4', class_id: 'c1', first_name: 'Sarah', last_name: 'Ranaivo', student_number: 'STU-004', created_at: '2026-09-02T08:00:00Z' },
  { id: 's5', class_id: 'c1', first_name: 'Lucas', last_name: 'Martin', student_number: 'STU-005', created_at: '2026-09-03T08:00:00Z' },
  { id: 's6', class_id: 'c1', first_name: 'Giulia', last_name: 'Rossi', student_number: 'STU-006', created_at: '2026-09-03T08:00:00Z' },
  { id: 's7', class_id: 'c2', first_name: 'Matteo', last_name: 'Conti', student_number: 'STU-007', created_at: '2026-09-03T08:00:00Z' }
];

const initialExams = [
  {
    id: 'e1',
    class_id: 'c1',
    title: 'Présentation orale — Lo zébu',
    description: 'Présentation orale en 10 rubriques décrivant les caractéristiques du zébu.',
    exam_date: '2026-09-27',
    status: 'in_progress',
    created_at: '2026-09-10T09:00:00Z'
  }
];

const initialRubrics = [
  { id: 'r1', exam_id: 'e1', position: 1, title: 'Identificazione', question: 'Che animale è?', example_sentence: 'Questo è…', points: 1 },
  { id: 'r2', exam_id: 'e1', position: 2, title: 'Nome scientifico e significato', question: 'Qual è il suo nome scientifico?', example_sentence: 'Il suo nome scientifico è…', points: 1 },
  { id: 'r3', exam_id: 'e1', position: 3, title: 'Aspetto fisico', question: 'Com\'è fatto?', example_sentence: 'Ha… / È ricoperto di…', points: 1 },
  { id: 'r4', exam_id: 'e1', position: 4, title: 'Dimensioni e peso', question: 'Quanto è grande?', example_sentence: 'È lungo circa… / Pesa circa…', points: 1 },
  { id: 'r5', exam_id: 'e1', position: 5, title: 'Habitat e distribuzione', question: 'Dove vive?', example_sentence: 'Vive soprattutto in…', points: 1 },
  { id: 'r6', exam_id: 'e1', position: 6, title: 'Alimentazione', question: 'Che cosa mangia?', example_sentence: 'Si nutre di…', points: 1 },
  { id: 'r7', exam_id: 'e1', position: 7, title: 'Comportamento', question: 'Come si comporta?', example_sentence: 'Di solito… / Spesso…', points: 1 },
  { id: 'r8', exam_id: 'e1', position: 8, title: 'Particolarità', question: 'Che cosa lo rende speciale?', example_sentence: 'È particolare perché…', points: 1 },
  { id: 'r9', exam_id: 'e1', position: 9, title: 'Curiosità', question: 'Qual è una curiosità interessante?', example_sentence: 'Una cosa interessante è che…', points: 1 },
  { id: 'r10', exam_id: 'e1', position: 10, title: 'Utilità', question: 'A che cosa serve lo zebu?', example_sentence: 'Può essere utilizzato per…', points: 1 }
];

// Évaluations initiales correspondant à l'exemple de la consigne (Jean: 7/10, Marie: 9/10, Paul: 6/10)
const initialEvaluations = [
  {
    id: 'ev1',
    exam_id: 'e1',
    student_id: 's1', // Jean Rakoto (7/10: r4, r7, r10 non validées)
    total_score: 7,
    status: 'completed',
    max_duration_seconds: 180,
    duration_used_seconds: 165,
    timer_status: 'stopped_manually',
    created_at: '2026-09-27T09:00:00Z',
    updated_at: '2026-09-27T09:00:00Z',
    details: [
      { rubric_id: 'r1', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r2', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r3', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r4', is_validated: false, awarded_points: 0 },
      { rubric_id: 'r5', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r6', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r7', is_validated: false, awarded_points: 0 },
      { rubric_id: 'r8', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r9', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r10', is_validated: false, awarded_points: 0 }
    ]
  },
  {
    id: 'ev2',
    exam_id: 'e1',
    student_id: 's2', // Marie Rabe (9/10)
    total_score: 9,
    status: 'completed',
    max_duration_seconds: 180,
    duration_used_seconds: 180,
    timer_status: 'completed',
    created_at: '2026-09-27T09:15:00Z',
    updated_at: '2026-09-27T09:15:00Z',
    details: [
      { rubric_id: 'r1', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r2', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r3', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r4', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r5', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r6', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r7', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r8', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r9', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r10', is_validated: false, awarded_points: 0 }
    ]
  },
  {
    id: 'ev3',
    exam_id: 'e1',
    student_id: 's3', // Paul Rasoa (6/10)
    total_score: 6,
    status: 'completed',
    created_at: '2026-09-27T09:30:00Z',
    updated_at: '2026-09-27T09:30:00Z',
    details: [
      { rubric_id: 'r1', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r2', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r3', is_validated: false, awarded_points: 0 },
      { rubric_id: 'r4', is_validated: false, awarded_points: 0 },
      { rubric_id: 'r5', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r6', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r7', is_validated: false, awarded_points: 0 },
      { rubric_id: 'r8', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r9', is_validated: true, awarded_points: 1 },
      { rubric_id: 'r10', is_validated: false, awarded_points: 0 }
    ]
  }
];

const initialPassOrder = [
  { id: 'po1', exam_id: 'e1', student_id: 's2', position: 1, status: 'completed' },
  { id: 'po2', exam_id: 'e1', student_id: 's3', position: 2, status: 'completed' },
  { id: 'po3', exam_id: 'e1', student_id: 's1', position: 3, status: 'completed' },
  { id: 'po4', exam_id: 'e1', student_id: 's4', position: 4, status: 'waiting' },
  { id: 'po5', exam_id: 'e1', student_id: 's5', position: 5, status: 'waiting' },
  { id: 'po6', exam_id: 'e1', student_id: 's6', position: 6, status: 'waiting' }
];

let memoryStore = {
  classes: [...initialClasses],
  students: [...initialStudents],
  enrollments: initialStudents.map(student => ({
    id: 'legacy_' + student.id,
    student_id: student.id,
    class_id: student.class_id,
    status: 'active',
    source: 'legacy',
    started_at: student.created_at,
    ended_at: null
  })),
  enrollmentRequests: [],
  exams: [...initialExams],
  rubrics: [...initialRubrics],
  evaluations: [...initialEvaluations],
  passOrder: [...initialPassOrder]
};

// Fonctions utilitaires
const generateId = () => 'id_' + Math.random().toString(36).substring(2, 11);

module.exports = {
  memoryStore,
  generateId,
  isConfigured
};
