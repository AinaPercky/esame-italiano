import { Quiz, QuizSubmission } from '../types';

/** Les quiz en brouillon sont cachés, sauf si l’élève a déjà une soumission. */
export function getStudentVisibleQuizzes(
  quizzes: Quiz[],
  submissions: QuizSubmission[]
): Quiz[] {
  return quizzes.filter(quiz =>
    quiz.status === 'launched' || submissions.some(submission => submission.quiz_id === quiz.id)
  );
}
