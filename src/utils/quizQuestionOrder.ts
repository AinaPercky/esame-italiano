import { QuizQuestion } from '../types';

const RANDOM_UINT32_RANGE = 0x1_0000_0000;

function randomIndex(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues && maxExclusive <= RANDOM_UINT32_RANGE) {
    const limit = Math.floor(RANDOM_UINT32_RANGE / maxExclusive) * maxExclusive;
    const values = new Uint32Array(1);
    let value: number;

    do {
      cryptoApi.getRandomValues(values);
      value = values[0];
    } while (value >= limit);

    return value % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

/** Return a new question array in a random order without mutating the quiz. */
export function shuffleQuizQuestions(questions: readonly QuizQuestion[]): QuizQuestion[] {
  const shuffled = [...questions];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = randomIndex(index + 1);
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }

  return shuffled;
}

/** Restore a stored order only when it is a complete permutation of the current quiz. */
export function applyQuizQuestionOrder(
  questions: readonly QuizQuestion[],
  order: unknown
): QuizQuestion[] | null {
  if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) return null;

  const ids = order as string[];
  if (ids.length !== questions.length || new Set(ids).size !== ids.length) return null;

  const questionsById = new Map<string, QuizQuestion>();
  for (const question of questions) {
    if (!question.id || questionsById.has(question.id)) return null;
    questionsById.set(question.id, question);
  }

  if (questionsById.size !== ids.length) return null;

  const orderedQuestions: QuizQuestion[] = [];
  for (const id of ids) {
    const question = questionsById.get(id);
    if (!question) return null;
    orderedQuestions.push(question);
  }

  return orderedQuestions;
}
