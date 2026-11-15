export interface QuizAttemptScore {
  id: string;
  score_20?: number | null;
  submitted_at?: string | null;
  started_at?: string | null;
  attempt_number?: number | null;
  is_counted?: boolean;
  status?: string | null;
}

/**
 * Returns a copy of the attempts with exactly one reference result:
 * highest score, then latest submission, then highest attempt number.
 */
export function markBestQuizAttempt<T extends QuizAttemptScore>(attempts: T[]): T[] {
  if (attempts.length === 0) return [];
  const ranked = [...attempts].sort((a, b) =>
    (Number(b.score_20) || 0) - (Number(a.score_20) || 0) ||
    Number(a.status === 'missed') - Number(b.status === 'missed') ||
    (new Date(b.submitted_at || b.started_at || 0).getTime() -
      new Date(a.submitted_at || a.started_at || 0).getTime()) ||
    (Number(b.attempt_number) || 0) - (Number(a.attempt_number) || 0) ||
    b.id.localeCompare(a.id)
  );
  const bestId = ranked[0].id;
  return attempts.map(attempt => ({ ...attempt, is_counted: attempt.id === bestId }));
}

/**
 * Keeps only the canonical attempt used for grades and rankings.
 * Undefined is retained for backward compatibility with pre-migration local data;
 * Supabase imports must always map the persisted is_counted column explicitly.
 */
export function isCountedQuizSubmission(submission: { is_counted?: boolean }): boolean {
  return submission.is_counted !== false;
}

export function getCountedQuizSubmissions<T extends { is_counted?: boolean }>(submissions: T[]): T[] {
  return submissions.filter(isCountedQuizSubmission);
}

export interface CumulativeQuizSubmission {
  id: string;
  student_id: string;
  class_id: string;
  quiz_id: string;
  score: number;
  max_score: number;
  score_20?: number | null;
  is_counted?: boolean;
  status?: string | null;
  attempt_number?: number | null;
  submitted_at?: string | null;
  started_at?: string | null;
}

export interface CumulativeQuizGrade<T extends CumulativeQuizSubmission> {
  student_id: string;
  class_id: string;
  quizzes_count: number;
  total_score: number;
  total_possible: number;
  average_score_20: number;
  submissions: T[];
}

/**
 * Builds an all-quiz cumulative grade per student/class.
 * A quiz contributes once: only its canonical counted attempt is eligible.
 * Duplicate imported rows are resolved deterministically rather than summed.
 * The overall average is weighted by each quiz's actual maximum points.
 */
export function aggregateCumulativeQuizGrades<T extends CumulativeQuizSubmission>(
  submissions: T[]
): CumulativeQuizGrade<T>[] {
  const bestByQuiz = new Map<string, T>();
  const compareAttempts = (a: T, b: T): number =>
    (Number(b.score_20 ?? (b.max_score > 0 ? b.score / b.max_score * 20 : 0)) -
      Number(a.score_20 ?? (a.max_score > 0 ? a.score / a.max_score * 20 : 0))) ||
    Number(a.status === 'missed') - Number(b.status === 'missed') ||
    (new Date(b.submitted_at || b.started_at || 0).getTime() -
      new Date(a.submitted_at || a.started_at || 0).getTime()) ||
    (Number(b.attempt_number) || 0) - (Number(a.attempt_number) || 0) ||
    b.id.localeCompare(a.id);

  submissions.filter(isCountedQuizSubmission).forEach(submission => {
    const key = `${submission.class_id}_${submission.student_id}_${submission.quiz_id}`;
    const current = bestByQuiz.get(key);
    if (!current || compareAttempts(submission, current) < 0) bestByQuiz.set(key, submission);
  });

  const byStudent = new Map<string, T[]>();
  bestByQuiz.forEach(submission => {
    const key = `${submission.class_id}_${submission.student_id}`;
    const rows = byStudent.get(key) || [];
    rows.push(submission);
    byStudent.set(key, rows);
  });

  return Array.from(byStudent.values()).map(rows => {
    const totalScore = rows.reduce((sum, row) => sum + (Number(row.score) || 0), 0);
    const totalPossible = rows.reduce((sum, row) => sum + (Number(row.max_score) || 0), 0);
    return {
      student_id: rows[0].student_id,
      class_id: rows[0].class_id,
      quizzes_count: rows.length,
      total_score: totalScore,
      total_possible: totalPossible,
      average_score_20: totalPossible > 0 ? Number(((totalScore / totalPossible) * 20).toFixed(2)) : 0,
      submissions: rows
    };
  });
}
