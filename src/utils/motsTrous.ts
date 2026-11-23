export type MotsTrousPhrase = {
  id: string | number;
  debut: string;
  fin: string;
};

export type MotsTrousAnswerKeyPhrase = MotsTrousPhrase & {
  mot: string;
};

export type MotsTrousDefinition = {
  titre?: string;
  consigne?: string;
  points_par_phrase?: number;
  banque: string[];
  phrases: MotsTrousPhrase[];
};

export type MotsTrousAnswers = Record<string, string>;

export type MotsTrousPhraseScore = {
  id: string | number;
  points: number;
  maxPoints: number;
  correct: boolean;
  chosenWord: string;
  expectedWord: string;
};

export type MotsTrousScore = {
  score: number;
  maxScore: number;
  phrases: MotsTrousPhraseScore[];
};

export function normalizeMotsTrousAnswer(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .trim()
    .toLocaleLowerCase('it-IT')
    .replace(/[’‘`]/g, "'")
    .replace(/'\s+/g, "'")
    .replace(/\s+/g, ' ');
}

function extractWordEntry(entry: unknown): string {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    const candidate = obj.mot_choisi ?? obj.mot ?? obj.word ?? obj.value ?? '';
    return typeof candidate === 'string' ? candidate.trim() : String(candidate ?? '').trim();
  }
  return '';
}

export function parseMotsTrousAnswers(
  value: unknown,
  phrases?: Array<{ id: string | number }>
): MotsTrousAnswers {
  let rawObj: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      rawObj = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }

  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
    return {};
  }

  const obj = rawObj as Record<string, unknown>;
  const result: MotsTrousAnswers = {};

  if (obj.choices && typeof obj.choices === 'object' && !Array.isArray(obj.choices)) {
    const choices = obj.choices as Record<string, unknown>;
    if (Array.isArray(phrases) && phrases.length > 0) {
      const phraseIds = new Set(phrases.map(p => String(p.id)));
      phrases.forEach((phrase, idx) => {
        const idKey = String(phrase.id);
        const idxKey = String(idx);
        const entry =
          choices[idKey] !== undefined
            ? choices[idKey]
            : (!phraseIds.has(idxKey) ? choices[idxKey] : undefined);
        const word = extractWordEntry(entry);
        if (word) result[idKey] = word;
      });
    } else {
      Object.entries(choices).forEach(([key, entry]) => {
        const word = extractWordEntry(entry);
        if (word) result[key] = word;
      });
    }
    return result;
  }

  Object.entries(obj).forEach(([key, entry]) => {
    const word = extractWordEntry(entry);
    if (word) result[key] = word;
  });

  return result;
}

export function placerMot(
  answers: MotsTrousAnswers,
  phraseId: string | number,
  mot: string
): MotsTrousAnswers {
  const targetId = String(phraseId);
  const cleanWord = mot.trim();
  if (!cleanWord) return answers;

  const normalizedWord = normalizeMotsTrousAnswer(cleanWord);
  const next: MotsTrousAnswers = {};

  Object.entries(answers).forEach(([id, value]) => {
    if (id !== targetId && normalizeMotsTrousAnswer(value) !== normalizedWord) {
      next[id] = value;
    }
  });

  next[targetId] = cleanWord;
  return next;
}

export function deplacerOuEchangerMot(
  answers: MotsTrousAnswers,
  sourcePhraseId: string | number,
  targetPhraseId: string | number
): MotsTrousAnswers {
  const sourceId = String(sourcePhraseId);
  const targetId = String(targetPhraseId);
  if (sourceId === targetId) return answers;

  const sourceWord = answers[sourceId];
  if (!sourceWord) return answers;

  const next = { ...answers };
  const existingTargetWord = next[targetId];

  next[targetId] = sourceWord;
  if (existingTargetWord) {
    next[sourceId] = existingTargetWord;
  } else {
    delete next[sourceId];
  }
  return next;
}

export function retirerMot(
  answers: MotsTrousAnswers,
  phraseId: string | number
): MotsTrousAnswers {
  const targetId = String(phraseId);
  if (!(targetId in answers)) return answers;
  const next = { ...answers };
  delete next[targetId];
  return next;
}

export function banqueRestanteMots(
  banque: string[],
  answers: MotsTrousAnswers
): string[] {
  const used = new Set(
    Object.values(answers)
      .map(word => normalizeMotsTrousAnswer(word))
      .filter(Boolean)
  );
  return (banque || []).filter(word => !used.has(normalizeMotsTrousAnswer(word)));
}

export function noterPhraseMot(
  phrase: MotsTrousAnswerKeyPhrase,
  chosenWord: string | undefined,
  pointsParPhrase = 1
): MotsTrousPhraseScore {
  const safePointsPerPhrase = Math.max(1, Math.round(Number(pointsParPhrase) || 1));
  const normalizedChosen = normalizeMotsTrousAnswer(chosenWord);
  const normalizedExpected = normalizeMotsTrousAnswer(phrase.mot);
  const correct = Boolean(normalizedChosen && normalizedExpected && normalizedChosen === normalizedExpected);
  return {
    id: phrase.id,
    points: correct ? safePointsPerPhrase : 0,
    maxPoints: safePointsPerPhrase,
    correct,
    chosenWord: (chosenWord || '').trim(),
    expectedWord: (phrase.mot || '').trim()
  };
}

export function noterMotsTrous(
  definition: MotsTrousDefinition,
  answerValue: unknown,
  answerKeyPhrases?: MotsTrousAnswerKeyPhrase[]
): MotsTrousScore {
  const keyPhrases =
    answerKeyPhrases || (definition.phrases as MotsTrousAnswerKeyPhrase[]) || [];
  const pointsParPhrase = Math.max(1, Math.round(Number(definition.points_par_phrase) || 1));
  const answersMap = parseMotsTrousAnswers(answerValue, keyPhrases);
  const bankSet = new Set(
    (definition.banque || []).map(word => normalizeMotsTrousAnswer(word)).filter(Boolean)
  );
  const usedWords = new Set<string>();

  const phrases = keyPhrases.map(phrase => {
    const rawChosen = answersMap[String(phrase.id)];
    const normChosen = normalizeMotsTrousAnswer(rawChosen);

    if (!normChosen || usedWords.has(normChosen) || (bankSet.size > 0 && !bankSet.has(normChosen))) {
      return noterPhraseMot(phrase, '', pointsParPhrase);
    }

    usedWords.add(normChosen);
    return noterPhraseMot(phrase, rawChosen, pointsParPhrase);
  });

  return {
    score: phrases.reduce((sum, phrase) => sum + phrase.points, 0),
    maxScore: keyPhrases.length * pointsParPhrase,
    phrases
  };
}

export function trouverPhraseVideMot(
  phrases: MotsTrousPhrase[],
  answers: MotsTrousAnswers
): string | null {
  const next = (phrases || []).find(phrase => !answers[String(phrase.id)]);
  return next ? String(next.id) : null;
}

export function formatMotsTrousAnswerForDisplay(
  definition: Pick<MotsTrousDefinition, 'phrases'> | undefined,
  answerValue: unknown,
  fallbackPhrases?: Array<{ id: string | number }>
): string {
  const phrases = definition?.phrases || fallbackPhrases || [];
  const answers = parseMotsTrousAnswers(answerValue, phrases);
  if (phrases.length === 0) {
    const entries = Object.entries(answers);
    return entries.length > 0
      ? entries.map(([id, word]) => `${id}: ${word}`).join(' · ')
      : 'Aucune réponse';
  }

  const parts = phrases.map((phrase, index) => {
    const chosen = answers[String(phrase.id)];
    return `${index + 1}. ${chosen || '—'}`;
  });
  return parts.join(' · ');
}

export function formatCorrectMotsTrousForDisplay(
  definition: Pick<MotsTrousDefinition, 'phrases'> | undefined,
  answerKeyPhrases?: Array<{ id: string | number; mot?: string }>
): string {
  const phrases = (answerKeyPhrases && answerKeyPhrases.length > 0
    ? answerKeyPhrases
    : (definition?.phrases as Array<{ id: string | number; mot?: string }> | undefined)) || [];
  if (phrases.length === 0) return 'Correction non disponible';
  return phrases
    .map((phrase, index) => `${index + 1}. ${String(phrase.mot || '').trim() || '—'}`)
    .join(' · ');
}

export function validateMotsTrousDefinition(
  definition: Partial<MotsTrousDefinition> | undefined,
  answerKey?: Array<{ id?: string | number; mot?: string }>
): string[] {
  const errors: string[] = [];
  if (!definition) {
    errors.push('La configuration « Mots à trous avec banque » est manquante.');
    return errors;
  }

  const phrases = Array.isArray(definition.phrases) ? definition.phrases : [];
  const banque = Array.isArray(definition.banque) ? definition.banque : [];
  const pointsPerPhrase =
    definition.points_par_phrase === undefined ? 1 : Number(definition.points_par_phrase);

  if (!Number.isInteger(pointsPerPhrase) || pointsPerPhrase < 1) {
    errors.push('Le barème par phrase (points_par_phrase) doit être un entier supérieur ou égal à 1.');
  }

  if (phrases.length < 1) {
    errors.push('Ajoutez au moins une phrase à trou.');
  }

  if (banque.length < phrases.length) {
    errors.push('La banque de mots doit contenir au moins autant de mots que de phrases.');
  }

  const bankNorms = banque.map(word => normalizeMotsTrousAnswer(word)).filter(Boolean);
  if (bankNorms.length !== banque.length || new Set(bankNorms).size !== bankNorms.length) {
    errors.push('La banque de mots contient des entrées vides ou des doublons.');
  }

  const expectedWords = phrases.map((phrase, idx) => {
    const keyItem = answerKey?.[idx];
    return String(keyItem?.mot ?? (phrase as { mot?: string }).mot ?? '').trim();
  });

  if (expectedWords.some(word => !word)) {
    errors.push('Chaque phrase doit définir le mot manquant attendu.');
  }

  const expectedNorms = expectedWords.map(word => normalizeMotsTrousAnswer(word)).filter(Boolean);
  if (new Set(expectedNorms).size !== expectedNorms.length) {
    errors.push('Chaque phrase doit avoir un mot attendu différent.');
  }

  const missingFromBank = expectedWords.filter(word => {
    const norm = normalizeMotsTrousAnswer(word);
    return norm && !bankNorms.includes(norm);
  });
  if (missingFromBank.length > 0) {
    errors.push(`Mots attendus absents de la banque : ${missingFromBank.join(', ')}.`);
  }

  return errors;
}
