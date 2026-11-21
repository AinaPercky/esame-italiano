/**
 * Returns dialogue words in the same order as the word buttons and student renderer.
 * Unicode letters and combining marks are supported (Italian accents included).
 */
export function getDialogueWords(text: string): string[] {
  return String(text || '').match(/[\p{L}\p{M}]+/gu) ?? [];
}
