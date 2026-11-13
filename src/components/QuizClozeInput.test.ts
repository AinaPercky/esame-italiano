import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getClozeRenderedBlankCount, updateClozeAnswer } from './QuizClozeInput';
import { parseStudentAnswers } from '../utils/quizAnswerMatcher';
import type { QuizQuestion } from '../types';

describe('QuizClozeInput – réponses multi-trous', () => {
  it('conserve les trois champs saisis au fil des rerendus', () => {
    const question: QuizQuestion = {
      id: 'multi-3', type: 'text', question: 'Io ___ a ___ e loro ___.',
      correct_answer: 'vado | scuola | parlano', points: 3
    };
    const count = getClozeRenderedBlankCount(question);
    assert.equal(count, 3);

    let answer = '';
    answer = updateClozeAnswer(answer, 0, 'vado', count);
    answer = updateClozeAnswer(answer, 1, 'scuola', count);
    answer = updateClozeAnswer(answer, 2, 'parlano', count);

    assert.deepEqual(parseStudentAnswers(answer, count), ['vado', 'scuola', 'parlano']);
  });

  it('conserve quatre champs même si une seule réponse attendue est fournie dans la propriété legacy', () => {
    const question: QuizQuestion = {
      id: 'multi-4', type: 'text', question: '___ ___ ___ ___',
      correct_answer: 'una risposta legacy', points: 4
    };
    const count = getClozeRenderedBlankCount(question);
    assert.equal(count, 4);

    let answer = '';
    ['uno', 'due', 'tre', 'quattro'].forEach((value, index) => {
      answer = updateClozeAnswer(answer, index, value, count);
    });
    assert.deepEqual(parseStudentAnswers(answer, count), ['uno', 'due', 'tre', 'quattro']);
  });

  it('préserve les valeurs existantes quand un champ précédent est modifié', () => {
    const question: QuizQuestion = {
      id: 'multi-edit', type: 'text', question: '___ / ___ / ___',
      correct_answer: 'a | b | c', points: 3
    };
    const count = getClozeRenderedBlankCount(question);
    let answer = JSON.stringify(['a', 'b', 'c']);
    answer = updateClozeAnswer(answer, 1, 'B', count);
    assert.deepEqual(parseStudentAnswers(answer, count), ['a', 'B', 'c']);
  });
});
