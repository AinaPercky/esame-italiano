export interface LessonQuizChoice {
  id: string;
  label: string;
  value: string;
  correct?: boolean;
  reply?: string;
}

export interface LessonOrderItem {
  id: string;
  label: string;
  value: string;
}

/** Normalise les espaces sans raccourcir le texte de l’élève ou des choix. */
export function normalizeLessonText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Normalisation tolérante à la casse, aux accents, aux espaces et à la ponctuation. */
export function normalizeLessonAnswer(value: unknown): string {
  return normalizeLessonText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .replace(/[.,!?;:()[\]{}“”"'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNonEmptyArray(...values: unknown[]): any[] {
  return values.find((value): value is any[] => Array.isArray(value) && value.length > 0) || [];
}

function asChoice(value: any, index: number): LessonQuizChoice {
  const text = typeof value === 'string'
    ? value
    : value?.text ?? value?.it ?? value?.label ?? value?.value ?? value?.short_text ?? '';
  return {
    id: `choice-${index}`,
    label: normalizeLessonText(text),
    value: String(typeof value === 'string' ? value : value?.value ?? value?.text ?? value?.it ?? text),
    ...(typeof value === 'object' && typeof value?.correct === 'boolean' ? { correct: value.correct } : {}),
    ...(typeof value === 'object' && value?.reply ? { reply: String(value.reply) } : {})
  };
}

export function buildLessonQuizChoices(step: any, contextWords: string[] = [], formulaText = ''): LessonQuizChoice[] {
  const data = step?.data || {};
  let raw = firstNonEmptyArray(data.options, data.choices, data.answer_options, data.word_bank, data.answers, data.sentences);

  if (step?.kind === 'highlight') {
    const targets = new Set((data.targets || []).map((word: string) => normalizeLessonAnswer(word)));
    const candidates = raw.length ? raw : contextWords;
    raw = candidates.map((candidate, index) => {
      const choice = asChoice(candidate, index);
      const correct = targets.size
        ? targets.has(normalizeLessonAnswer(choice.value))
        : choice.correct === true;
      return { ...candidate, text: choice.label, value: choice.value, correct, id: `word-${index}` };
    });
  }

  if (step?.kind === 'build_formula') {
    const correct = data.correct_answer || data.correctAnswer || formulaText;
    const distractors = firstNonEmptyArray(data.distractors, data.formula_options, raw);
    raw = [...distractors, ...(correct ? [{ text: correct, value: correct, correct: true }] : [])];
  }

  if (!raw.length) {
    const correct = data.correct_answer ?? data.correctAnswer ?? data.expected_answer ?? data.answer ?? (step?.kind === 'free_text' ? step?.short_answer ?? step?.ok ?? step?.insight : undefined);
    if (correct !== undefined && correct !== null && correct !== '') {
      raw = [{ text: correct, value: correct, correct: true }];
    }
  }

  const choices = raw.map(asChoice).filter(choice => choice.label && choice.value)
    .sort((a, b) => Number(b.correct === true) - Number(a.correct === true));
  const seen = new Set<string>();
  return choices.filter(choice => {
    const key = normalizeLessonAnswer(choice.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isLessonQuizChoiceCorrect(step: any, choice: LessonQuizChoice): boolean {
  if (typeof choice.correct === 'boolean') return choice.correct;
  const expected = step?.data?.correct_answer ?? step?.data?.correctAnswer ?? step?.data?.expected_answer ?? step?.data?.answer;
  if (expected !== undefined && expected !== null) {
    return (Array.isArray(expected) ? expected : [expected])
      .some(item => normalizeLessonAnswer(item) === normalizeLessonAnswer(choice.value));
  }
  // Legacy lessons without an explicit answer key accept the selected choice.
  return true;
}

function acceptedTextAnswers(step: any): unknown[] {
  const data = step?.data || {};
  const explicit = data.accepted_answers ?? data.acceptedAnswers ?? data.alternatives ?? data.variants
    ?? data.correct_answer ?? data.correctAnswer ?? data.expected_answer ?? data.answer ?? step?.short_answer;
  if (Array.isArray(explicit)) return explicit;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    // The lesson authoring format also permits slash/semicolon-separated variants.
    return String(explicit).split(/\s*(?:\/|;)\s*/).filter(Boolean);
  }
  const options = firstNonEmptyArray(data.options, data.choices, data.answers);
  const marked = options.filter(option => option && typeof option === 'object' && option.correct === true);
  return marked.map(option => option.value ?? option.text ?? option.it ?? option.label ?? option.short_text).filter(Boolean);
}

export function isLessonFreeTextCorrect(step: any, answer: string): boolean {
  const normalizedAnswer = normalizeLessonAnswer(answer);
  if (!normalizedAnswer) return false;
  const accepted = acceptedTextAnswers(step).map(normalizeLessonAnswer).filter(Boolean);
  // If no answer key was authored, accept any non-empty student response instead of trapping the learner.
  return accepted.length === 0 || accepted.includes(normalizedAnswer);
}

function orderValue(item: any): string {
  if (item && typeof item === 'object') return String(item.value ?? item.text ?? item.label ?? item.it ?? item.id ?? '');
  return String(item ?? '');
}

export function buildLessonOrderItems(data: any): LessonOrderItem[] {
  const raw = firstNonEmptyArray(data?.items, data?.elements, data?.parts, data?.choices, data?.options);
  return raw.map((item, index) => {
    const value = orderValue(item);
    const id = item && typeof item === 'object' && item.id !== undefined ? String(item.id) : `order-item-${index}`;
    const label = item && typeof item === 'object'
      ? normalizeLessonText(item.text ?? item.label ?? item.it ?? item.value ?? item.short_text ?? value)
      : normalizeLessonText(value);
    return { id, label, value };
  }).filter(item => item.label && item.value);
}

export function moveLessonOrderItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function getLessonExpectedOrder(data: any, items = buildLessonOrderItems(data)): string[] | null {
  const explicit = data?.correct_order ?? data?.correctOrder ?? data?.expected_order ?? data?.expectedOrder
    ?? data?.answer_order ?? data?.correct_answer ?? data?.answer ?? data?.order;
  let expected: unknown[] | null = null;

  if (Array.isArray(explicit)) {
    expected = explicit;
  } else if (typeof explicit === 'string' && explicit.trim()) {
    expected = explicit.split(/\s*(?:→|->|;|\||\n)\s*/).filter(Boolean);
  }

  if (!expected) {
    const rawItems = firstNonEmptyArray(data?.items, data?.elements, data?.parts, data?.choices, data?.options);
    if (rawItems.length && rawItems.every(item => item && typeof item === 'object' && Number.isFinite(Number(item.order ?? item.position)))) {
      expected = rawItems
        .map((item, index) => ({ item, index, order: Number(item.order ?? item.position) }))
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map(({ item }) => orderValue(item));
    }
  }

  if (!expected) return null;
  return expected.map((entry, index) => {
    if (typeof entry === 'number' && Number.isInteger(entry) && items[entry]) return items[entry].value;
    const entryValue = entry && typeof entry === 'object'
      ? String((entry as any).id ?? (entry as any).value ?? (entry as any).text ?? (entry as any).label ?? '')
      : String(entry ?? '');
    return items.find(item => item.id === entryValue || item.label === entryValue || item.value === entryValue)?.value ?? entryValue;
  });
}

export function isLessonOrderCorrect(data: any, orderedValues: string[]): boolean {
  const items = buildLessonOrderItems(data);
  if (!items.length || orderedValues.length !== items.length) return false;
  const expected = getLessonExpectedOrder(data, items);
  // If the author omitted an answer key, do not block the lesson by default.
  if (!expected) return true;
  return expected.length === orderedValues.length
    && expected.every((value, index) => normalizeLessonAnswer(value) === normalizeLessonAnswer(orderedValues[index]));
}
