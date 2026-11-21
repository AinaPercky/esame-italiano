export type DialogueColor = 'green' | 'amber' | 'blue' | 'purple' | 'rose' | 'teal';
export type DialogueEmphasisStyle = 'underline' | 'outline' | 'circle';

export interface DialogueHighlightMark {
  line_index?: number;
  word_index: number;
  text?: string;
  color?: DialogueColor | string;
}

export interface DialogueEmphasisMark {
  line_index?: number;
  word_index: number;
  text?: string;
  color?: DialogueColor | string;
  style?: DialogueEmphasisStyle | string;
  group_id?: string;
}

export interface DialogueToken {
  raw: string;
  isWord: boolean;
  wordIndex: number | null;
}

export type DialogueRenderSegment =
  | { kind: 'token'; token: DialogueToken }
  | {
      kind: 'emphasis-group';
      style: DialogueEmphasisStyle;
      color: DialogueColor;
      groupId: string | null;
      tokens: DialogueToken[];
    };

const VALID_COLORS = new Set<DialogueColor>(['green', 'amber', 'blue', 'purple', 'rose', 'teal']);
const VALID_EMPHASIS_STYLES = new Set<DialogueEmphasisStyle>(['underline', 'outline', 'circle']);
const WORD_ONLY_REGEX = /^[\p{L}\p{M}]+$/u;
const TOKEN_SPLIT_REGEX = /(\s+|[^\p{L}\p{M}]+)/u;

export function normalizeDialogueColor(color?: string): DialogueColor {
  return VALID_COLORS.has(color as DialogueColor) ? (color as DialogueColor) : 'green';
}

export function normalizeDialogueEmphasisStyle(style?: string): DialogueEmphasisStyle {
  return VALID_EMPHASIS_STYLES.has(style as DialogueEmphasisStyle)
    ? (style as DialogueEmphasisStyle)
    : 'underline';
}

/**
 * Returns dialogue words in the same order as the word buttons and student renderer.
 * Unicode letters and combining marks are supported (Italian accents included).
 */
export function getDialogueWords(text: string): string[] {
  return String(text || '').match(/[\p{L}\p{M}]+/gu) ?? [];
}

export function createDialogueEmphasisGroupId(): string {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

interface ResolvedEmphasis {
  style: DialogueEmphasisStyle;
  color: DialogueColor;
  groupId: string | null;
  wordIndex: number;
}

function canJoinEmphasisGroup(prev: ResolvedEmphasis, next: ResolvedEmphasis): boolean {
  if (prev.style !== next.style || prev.color !== next.color) return false;
  if (next.wordIndex !== prev.wordIndex + 1) return false;
  if (prev.groupId && next.groupId) return prev.groupId === next.groupId;
  if (!prev.groupId && !next.groupId) return true;
  return false;
}

/**
 * Tokenizes dialogue text and groups contiguous words that belong to the same
 * emphasis effect (underline, outline, circle) so intervening spaces and punctuation
 * are wrapped together inside one visual container.
 */
export function buildDialogueSegments(
  text: string,
  emphasisWordMarks: DialogueEmphasisMark[] = [],
  startingWordIndex = 0
): { segments: DialogueRenderSegment[]; nextWordIndex: number } {
  const markByWordIndex = new Map<number, DialogueEmphasisMark>();
  for (const mark of emphasisWordMarks) {
    if (typeof mark?.word_index === 'number') {
      markByWordIndex.set(mark.word_index, mark);
    }
  }

  let wordIndex = startingWordIndex;
  const tokens: DialogueToken[] = String(text || '')
    .split(TOKEN_SPLIT_REGEX)
    .filter(raw => raw.length > 0)
    .map(raw => {
      if (!WORD_ONLY_REGEX.test(raw)) {
        return { raw, isWord: false, wordIndex: null };
      }
      const currentIndex = wordIndex++;
      return { raw, isWord: true, wordIndex: currentIndex };
    });

  const resolvedByTokenIdx = new Map<number, ResolvedEmphasis>();
  tokens.forEach((token, idx) => {
    if (!token.isWord || token.wordIndex === null) return;
    const mark = markByWordIndex.get(token.wordIndex);
    if (!mark) return;
    if (mark.text && mark.text.toLocaleLowerCase('it-IT') !== token.raw.toLocaleLowerCase('it-IT')) {
      return;
    }
    const groupId = typeof mark.group_id === 'string' && mark.group_id.trim() ? mark.group_id.trim() : null;
    resolvedByTokenIdx.set(idx, {
      style: normalizeDialogueEmphasisStyle(mark.style),
      color: normalizeDialogueColor(mark.color),
      groupId,
      wordIndex: token.wordIndex
    });
  });

  // Collect ordered word token indices to detect contiguous emphasis groups
  const wordTokenIndices: number[] = [];
  tokens.forEach((token, idx) => {
    if (token.isWord) wordTokenIndices.push(idx);
  });

  const groupSpanByStartToken = new Map<number, { endTokenIdx: number; style: DialogueEmphasisStyle; color: DialogueColor; groupId: string | null }>();
  let wCursor = 0;
  while (wCursor < wordTokenIndices.length) {
    const startTokenIdx = wordTokenIndices[wCursor];
    const startEmphasis = resolvedByTokenIdx.get(startTokenIdx);
    if (!startEmphasis) {
      wCursor += 1;
      continue;
    }

    let endWordCursor = wCursor;
    let prevEmphasis = startEmphasis;
    while (endWordCursor + 1 < wordTokenIndices.length) {
      const candidateTokenIdx = wordTokenIndices[endWordCursor + 1];
      const candidateEmphasis = resolvedByTokenIdx.get(candidateTokenIdx);
      if (!candidateEmphasis || !canJoinEmphasisGroup(prevEmphasis, candidateEmphasis)) {
        break;
      }
      endWordCursor += 1;
      prevEmphasis = candidateEmphasis;
    }

    const endTokenIdx = wordTokenIndices[endWordCursor];
    groupSpanByStartToken.set(startTokenIdx, {
      endTokenIdx,
      style: startEmphasis.style,
      color: startEmphasis.color,
      groupId: startEmphasis.groupId
    });
    wCursor = endWordCursor + 1;
  }

  const segments: DialogueRenderSegment[] = [];
  let tIdx = 0;
  while (tIdx < tokens.length) {
    const groupSpan = groupSpanByStartToken.get(tIdx);
    if (groupSpan) {
      segments.push({
        kind: 'emphasis-group',
        style: groupSpan.style,
        color: groupSpan.color,
        groupId: groupSpan.groupId,
        tokens: tokens.slice(tIdx, groupSpan.endTokenIdx + 1)
      });
      tIdx = groupSpan.endTokenIdx + 1;
    } else {
      segments.push({ kind: 'token', token: tokens[tIdx] });
      tIdx += 1;
    }
  }

  return { segments, nextWordIndex: wordIndex };
}

export function applyDialogueEmphasisRange(
  existingMarks: DialogueEmphasisMark[],
  params: {
    lineIndex: number;
    startIndex: number;
    endIndex: number;
    words: string[];
    color: DialogueColor;
    style: DialogueEmphasisStyle;
    groupId?: string;
  }
): DialogueEmphasisMark[] {
  const { lineIndex, startIndex, endIndex, words, color, style } = params;
  const groupId = params.groupId || createDialogueEmphasisGroupId();

  // Remove any marks on the same line overlapping the selected range
  const filtered = existingMarks.filter(
    mark => !(mark.line_index === lineIndex && mark.word_index >= startIndex && mark.word_index <= endIndex)
  );

  for (let index = startIndex; index <= endIndex; index += 1) {
    const selectedWord = words[index];
    if (!selectedWord) continue;
    filtered.push({
      line_index: lineIndex,
      word_index: index,
      text: selectedWord,
      color,
      style,
      group_id: groupId
    });
  }

  return filtered;
}

/**
 * Returns the word_index set belonging to the same emphasis group as (lineIndex, wordIndex).
 */
export function getEmphasisGroupWordIndices(
  marks: DialogueEmphasisMark[],
  lineIndex: number,
  wordIndex: number
): Set<number> {
  const lineMarks = marks.filter(mark => mark.line_index === lineIndex);
  const target = lineMarks.find(mark => mark.word_index === wordIndex);
  if (!target) return new Set();

  const targetGroupId = typeof target.group_id === 'string' && target.group_id.trim() ? target.group_id.trim() : null;
  if (targetGroupId) {
    return new Set(
      lineMarks
        .filter(mark => (typeof mark.group_id === 'string' ? mark.group_id.trim() : '') === targetGroupId)
        .map(mark => mark.word_index)
    );
  }

  // Legacy fallback: contiguous marks without group_id sharing same style and color
  const targetStyle = normalizeDialogueEmphasisStyle(target.style);
  const targetColor = normalizeDialogueColor(target.color);
  const legacyByWord = new Map<number, DialogueEmphasisMark>();
  for (const mark of lineMarks) {
    const hasGroupId = typeof mark.group_id === 'string' && mark.group_id.trim().length > 0;
    if (!hasGroupId && normalizeDialogueEmphasisStyle(mark.style) === targetStyle && normalizeDialogueColor(mark.color) === targetColor) {
      legacyByWord.set(mark.word_index, mark);
    }
  }

  const groupIndices = new Set<number>([wordIndex]);
  let left = wordIndex - 1;
  while (legacyByWord.has(left)) {
    groupIndices.add(left);
    left -= 1;
  }
  let right = wordIndex + 1;
  while (legacyByWord.has(right)) {
    groupIndices.add(right);
    right += 1;
  }
  return groupIndices;
}

export function removeDialogueEmphasisAtWord(
  existingMarks: DialogueEmphasisMark[],
  lineIndex: number,
  wordIndex: number
): { marks: DialogueEmphasisMark[]; removed: boolean } {
  const groupIndices = getEmphasisGroupWordIndices(existingMarks, lineIndex, wordIndex);
  if (groupIndices.size === 0) {
    return { marks: existingMarks, removed: false };
  }
  const nextMarks = existingMarks.filter(
    mark => !(mark.line_index === lineIndex && groupIndices.has(mark.word_index))
  );
  return { marks: nextMarks, removed: true };
}
