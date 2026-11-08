export type VerbesTrousPhrase = {
  id: string | number;
  debut: string;
  fin: string;
};
export type VerbesTrousAnswerKeyPhrase = VerbesTrousPhrase & {
  verbe: string;
  reponses: string[];
};
export type VerbesTrousDefinition = {
  titre?: string;
  consigne?: string;
  points_par_phrase?: number;
  banque: string[];
  phrases: VerbesTrousPhrase[];
};
export type VerbesTrousPhraseAnswer = {
  verbe_choisi: string | null;
  texte_saisi: string;
};
export type VerbesTrousAnswers = Record<string, VerbesTrousPhraseAnswer>;
export type VerbesTrousPhraseScore = {
  id: string | number;
  points_verbe: 0 | 1;
  points_conjugaison: 0 | 2;
  total: number;
  correct: boolean;
  expectedVerb: string;
  expectedAnswers: string[];
};
export type VerbesTrousScore = {
  score: number;
  maxScore: number;
  phrases: VerbesTrousPhraseScore[];
};

export function normalizeVerbesTrousAnswer(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('it-IT').replace(/\s+/g, ' ');
}

export function parseVerbesTrousAnswers(value: unknown): VerbesTrousAnswers {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as VerbesTrousAnswers;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as VerbesTrousAnswers;
    } catch { /* réponse encore vide ou JSON incomplet */ }
  }
  return {};
}

export function placerVerbe(
  answers: VerbesTrousAnswers,
  phraseId: string | number,
  verb: string
): VerbesTrousAnswers {
  const id = String(phraseId);
  if (Object.values(answers).some((answer) => answer.verbe_choisi === verb)) return answers;
  return { ...answers, [id]: { verbe_choisi: verb, texte_saisi: '' } };
}

export function rendreVerbe(answers: VerbesTrousAnswers, phraseId: string | number): VerbesTrousAnswers {
  const id = String(phraseId);
  const next = { ...answers };
  delete next[id];
  return next;
}

export function banqueRestante(banque: string[], answers: VerbesTrousAnswers): string[] {
  const used = new Set(Object.values(answers).map((answer) => answer.verbe_choisi).filter(Boolean));
  return banque.filter((verb) => !used.has(verb));
}

export function noterPhrase(
  phrase: VerbesTrousAnswerKeyPhrase,
  answer?: VerbesTrousPhraseAnswer,
  pointsParPhrase = 3
): VerbesTrousPhraseScore {
  const chosen = normalizeVerbesTrousAnswer(answer?.verbe_choisi);
  const expectedVerb = normalizeVerbesTrousAnswer(phrase.verbe);
  const typed = normalizeVerbesTrousAnswer(answer?.texte_saisi);
  const points_verbe = chosen && chosen === expectedVerb ? 1 : 0;
  const accepted = (phrase.reponses || []).map(normalizeVerbesTrousAnswer).filter(Boolean);
  const points_conjugaison = chosen && typed && accepted.includes(typed) ? 2 : 0;
  const total = points_verbe + points_conjugaison;
  return {
    id: phrase.id,
    points_verbe: points_verbe as 0 | 1,
    points_conjugaison: points_conjugaison as 0 | 2,
    total: Math.min(pointsParPhrase, total),
    correct: total === pointsParPhrase,
    expectedVerb: phrase.verbe,
    expectedAnswers: phrase.reponses || []
  };
}

export function noterQuiz(
  definition: VerbesTrousDefinition,
  answerValue: unknown,
  answerKeyPhrases?: VerbesTrousAnswerKeyPhrase[]
): VerbesTrousScore {
  const answers = parseVerbesTrousAnswers(answerValue);
  const keyPhrases = answerKeyPhrases || (definition.phrases as VerbesTrousAnswerKeyPhrase[]);
  const pointsParPhrase = Number(definition.points_par_phrase) || 3;
  const usedVerbs = new Set<string>();
  const phrases = keyPhrases.map((phrase) => {
    const answer = answers[String(phrase.id)];
    const chosen = normalizeVerbesTrousAnswer(answer?.verbe_choisi);
    if (chosen && usedVerbs.has(chosen)) return noterPhrase(phrase, undefined, pointsParPhrase);
    if (chosen) usedVerbs.add(chosen);
    return noterPhrase(phrase, answer, pointsParPhrase);
  });
  return {
    score: phrases.reduce((sum, phrase) => sum + phrase.total, 0),
    maxScore: keyPhrases.length * pointsParPhrase,
    phrases
  };
}

export function trouverPhraseVide(
  phrases: VerbesTrousPhrase[],
  answers: VerbesTrousAnswers
): string | null {
  const next = phrases.find((phrase) => !answers[String(phrase.id)]?.verbe_choisi);
  return next ? String(next.id) : null;
}
