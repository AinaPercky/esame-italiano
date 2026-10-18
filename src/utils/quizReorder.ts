import { QuizQuestion, QuizReorderItem } from '../types';

export function createQuizReorderItem(text = ''): QuizReorderItem {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return { id, text };
}

export function parseReorderAnswer(answer: string): string[] {
  try {
    const parsed: unknown = JSON.parse(answer);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function getReorderAnswerIds(question: QuizQuestion, answer: string): string[] {
  const itemIds = (question.items || []).map((item) => item.id);
  const parsed = parseReorderAnswer(answer);
  const isCompletePermutation = parsed.length === itemIds.length
    && new Set(parsed).size === parsed.length
    && parsed.every((id) => itemIds.includes(id));
  return isCompletePermutation ? parsed : itemIds;
}

export function applyQuizItemOrder(items: readonly QuizReorderItem[], order: unknown): QuizReorderItem[] | null {
  if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) return null;
  const ids = order as string[];
  if (ids.length !== items.length || new Set(ids).size !== ids.length) return null;
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length) return null;
  const orderedItems = ids.map((id) => byId.get(id));
  return orderedItems.every((item): item is QuizReorderItem => Boolean(item)) ? orderedItems : null;
}

export function getCorrectReorderIds(question: QuizQuestion): string[] {
  const fromAnswer = parseReorderAnswer(question.correct_answer || '');
  const itemIds = (question.items || []).map((item) => item.id);
  if (fromAnswer.length === itemIds.length && fromAnswer.length > 0
    && new Set(fromAnswer).size === fromAnswer.length
    && fromAnswer.every((id) => itemIds.includes(id))) {
    return fromAnswer;
  }
  return itemIds;
}

export function isReorderAnswerCorrect(question: QuizQuestion, answer: string): boolean {
  const studentOrder = parseReorderAnswer(answer);
  const correctOrder = getCorrectReorderIds(question);
  return correctOrder.length > 0
    && studentOrder.length === correctOrder.length
    && studentOrder.every((id, index) => id === correctOrder[index]);
}

export function formatReorderAnswer(question: QuizQuestion, answer: string): string {
  const ids = parseReorderAnswer(answer);
  const itemsById = new Map((question.items || []).map((item) => [item.id, item.text]));
  return ids.map((id) => itemsById.get(id) || '').filter(Boolean).join(' → ');
}

export function formatCorrectReorderAnswer(question: QuizQuestion): string {
  const itemsById = new Map((question.items || []).map((item) => [item.id, item.text]));
  return getCorrectReorderIds(question).map((id) => itemsById.get(id) || '').filter(Boolean).join(' → ');
}
