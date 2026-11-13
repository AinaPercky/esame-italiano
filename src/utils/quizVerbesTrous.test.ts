import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeVerbesTrousPhrase,
  gradeVerbesTrousQuestion,
  normalizeVerbesTrousText,
  isConjugationAccepted,
  findDuplicateVerbs,
  parseVerbesTrousStudentAnswer,
  VerbesTrousPhrase
} from './quizVerbesTrous';
import { QuizQuestion } from '../types';

describe('quizVerbesTrous - Système de notation et validation', () => {
  const samplePhrase: VerbesTrousPhrase = {
    debut: 'Quando sono molto stanco, io ',
    fin: ' subito.',
    verbe: 'addormentarsi',
    reponses: ['mi addormento', 'io mi addormento']
  };

  it('attribue 3 points pour le bon verbe et la bonne conjugaison', () => {
    const result = gradeVerbesTrousPhrase(samplePhrase, 0, 'addormentarsi', 'mi addormento');
    assert.equal(result.isVerbCorrect, true);
    assert.equal(result.verbPoints, 1);
    assert.equal(result.isConjugationCorrect, true);
    assert.equal(result.conjugationPoints, 2);
    assert.equal(result.totalPoints, 3);
    assert.equal(result.isFullyCorrect, true);
  });

  it('attribue 1 point pour le bon verbe avec une mauvaise conjugaison', () => {
    const result = gradeVerbesTrousPhrase(samplePhrase, 0, 'addormentarsi', 'si addormenta');
    assert.equal(result.isVerbCorrect, true);
    assert.equal(result.verbPoints, 1);
    assert.equal(result.isConjugationCorrect, false);
    assert.equal(result.conjugationPoints, 0);
    assert.equal(result.totalPoints, 1);
    assert.equal(result.isFullyCorrect, false);
  });

  it('attribue 2 points si le verbe choisi est incorrect mais la conjugaison correspond à une réponse acceptée', () => {
    const result = gradeVerbesTrousPhrase(samplePhrase, 0, 'divertirsi', 'mi addormento');
    assert.equal(result.isVerbCorrect, false);
    assert.equal(result.verbPoints, 0);
    assert.equal(result.isConjugationCorrect, true);
    assert.equal(result.conjugationPoints, 2);
    assert.equal(result.totalPoints, 2);
    assert.equal(result.isFullyCorrect, false);
  });

  it('attribue 0 point pour mauvais verbe et mauvaise conjugaison', () => {
    const result = gradeVerbesTrousPhrase(samplePhrase, 0, 'bere', 'bevo');
    assert.equal(result.isVerbCorrect, false);
    assert.equal(result.verbPoints, 0);
    assert.equal(result.isConjugationCorrect, false);
    assert.equal(result.conjugationPoints, 0);
    assert.equal(result.totalPoints, 0);
  });

  it('attribue 0 point pour champs vides', () => {
    const result = gradeVerbesTrousPhrase(samplePhrase, 0, '', '');
    assert.equal(result.totalPoints, 0);
  });

  it('ignore les majuscules et les espaces superflus dans le verbe et la conjugaison', () => {
    const result = gradeVerbesTrousPhrase(samplePhrase, 0, '  ADDORMENTARSI  ', '   MI   ADDORMENTO   ');
    assert.equal(result.verbPoints, 1);
    assert.equal(result.conjugationPoints, 2);
    assert.equal(result.totalPoints, 3);
  });

  it('accepte les variantes multiples d’une réponse acceptée', () => {
    assert.equal(isConjugationAccepted('io mi addormento', samplePhrase.reponses), true);
    assert.equal(isConjugationAccepted('mi addormento', samplePhrase.reponses), true);
    assert.equal(isConjugationAccepted('tu ti addormenti', samplePhrase.reponses), false);
  });

  it('gère les réponses avec séparateur slash dans le tableau des réponses', () => {
    const phraseWithSlash: VerbesTrousPhrase = {
      debut: 'Noi ',
      fin: ' a Roma.',
      verbe: 'andare',
      reponses: ['andiamo / noi andiamo']
    };
    assert.equal(isConjugationAccepted('andiamo', phraseWithSlash.reponses), true);
    assert.equal(isConjugationAccepted('noi andiamo', phraseWithSlash.reponses), true);
    assert.equal(isConjugationAccepted('vado', phraseWithSlash.reponses), false);
  });

  it('détecte les doublons de verbes dans une liste de phrases', () => {
    const phrases: VerbesTrousPhrase[] = [
      { debut: 'A', fin: 'B', verbe: 'bere', reponses: ['bevo'] },
      { debut: 'C', fin: 'D', verbe: 'dire', reponses: ['dico'] },
      { debut: 'E', fin: 'F', verbe: 'Bere', reponses: ['beviamo'] }
    ];
    const duplicates = findDuplicateVerbs(phrases);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].toLowerCase(), 'bere');
  });

  it('calcule la note globale d’un exercice de 5 phrases sur 15 points', () => {
    const question: QuizQuestion = {
      id: 'q_test_vt',
      type: 'verbes_trous',
      question: 'Esercizio 6 – Verbi riflessivi',
      points: 15,
      points_par_phrase: 3,
      correct_answer: 'addormentarsi | divertirsi | chiamarsi | bere | dire',
      phrases: [
        { id: 1, debut: 'Quando sono molto stanco, io ', fin: ' subito.', verbe: 'addormentarsi', reponses: ['mi addormento'] },
        { id: 2, debut: 'Le mie amiche ', fin: ' sempre molto alle feste.', verbe: 'divertirsi', reponses: ['si divertono'] },
        { id: 3, debut: 'Voi due ', fin: ' Esposito, vero?', verbe: 'chiamarsi', reponses: ['vi chiamate'] },
        { id: 4, debut: 'Noi ', fin: ' troppo caffè la mattina.', verbe: 'bere', reponses: ['beviamo'] },
        { id: 5, debut: 'Tu non ', fin: ' mai la verità!', verbe: 'dire', reponses: ['dici'] }
      ]
    };

    // Cas 1: Tout est correct (15/15)
    const fullCorrectAnswer = JSON.stringify({
      choices: { 0: 'addormentarsi', 1: 'divertirsi', 2: 'chiamarsi', 3: 'bere', 4: 'dire' },
      saisies: { 0: 'mi addormento', 1: 'si divertono', 2: 'vi chiamate', 3: 'beviamo', 4: 'dici' }
    });
    const res1 = gradeVerbesTrousQuestion(question, fullCorrectAnswer);
    assert.equal(res1.awardedPoints, 15);
    assert.equal(res1.maxPoints, 15);
    assert.equal(res1.isFullyCorrect, true);
    assert.equal(res1.verbsPlacedCount, 5);
    assert.equal(res1.verbsConjugatedCount, 5);

    // Cas 2: Phrase 0: bon verbe + faute conjugaison (1 pt)
    // Phrase 1: bon verbe + bonne conjugaison (3 pts)
    // Phrase 2: rien (0 pt)
    // Phrase 3: rien (0 pt)
    // Phrase 4: rien (0 pt)
    // Total attendu = 4 pts sur 15
    const partialAnswer = JSON.stringify({
      choices: { 0: 'addormentarsi', 1: 'divertirsi' },
      saisies: { 0: 'addormento', 1: 'si divertono' }
    });
    const res2 = gradeVerbesTrousQuestion(question, partialAnswer);
    assert.equal(res2.awardedPoints, 4);
    assert.equal(res2.maxPoints, 15);
    assert.equal(res2.isFullyCorrect, false);
    assert.equal(res2.verbsPlacedCount, 2);
    assert.equal(res2.verbsConjugatedCount, 2);
  });
});
