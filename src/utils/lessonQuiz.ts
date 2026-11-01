export interface LessonQuizChoice {
  id: string;
  label: string;
  value: string;
  correct?: boolean;
  reply?: string;
}

export function compactLessonAnswer(value: unknown, maxWords = 3): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.split(' ').slice(0, maxWords).join(' ');
}

function asChoice(value: any, index: number): LessonQuizChoice {
  const text = typeof value === 'string' ? value : value?.short_text || value?.label || value?.text || value?.it || value?.value || '';
  return {
    id: `choice-${index}`,
    label: compactLessonAnswer(text),
    value: String(typeof value === 'string' ? value : value?.value ?? value?.text ?? value?.it ?? text),
    ...(typeof value === 'object' && typeof value?.correct === 'boolean' ? { correct: value.correct } : {}),
    ...(typeof value === 'object' && value?.reply ? { reply: String(value.reply) } : {})
  };
}

export function buildLessonQuizChoices(step: any, contextWords: string[] = [], formulaText = ''): LessonQuizChoice[] {
  const data = step?.data || {};
  let raw: any[] = data.options || data.choices || data.word_bank || [];
  if (!Array.isArray(raw)) raw = [];

  if (step?.kind === 'highlight' && contextWords.length) {
    const targets = new Set((data.targets || []).map((word: string) => word.toLocaleLowerCase('it')));
    raw = contextWords.map((word, index) => ({ text: word, value: word, correct: targets.has(word.toLocaleLowerCase('it')), id: `word-${index}` }));
  }

  if (step?.kind === 'build_formula') {
    const correct = data.correct_answer || data.correctAnswer || formulaText;
    const distractors = data.distractors || data.formula_options || raw;
    raw = [...(Array.isArray(distractors) ? distractors : []), ...(correct ? [{ text: correct, value: correct, correct: true }] : [])];
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
    const key = choice.label.toLocaleLowerCase('it');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isLessonQuizChoiceCorrect(step: any, choice: LessonQuizChoice): boolean {
  if (typeof choice.correct === 'boolean') return choice.correct;
  const expected = step?.data?.correct_answer ?? step?.data?.correctAnswer ?? step?.data?.expected_answer ?? step?.data?.answer;
  if (expected !== undefined && expected !== null) {
    const normalize = (value: unknown) => String(value).trim().toLocaleLowerCase('it');
    return (Array.isArray(expected) ? expected : [expected]).some(item => normalize(item) === normalize(choice.value));
  }
  // Legacy lessons without an explicit answer key accept the selected choice.
  return true;
}
