import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTutorialQuiz, scoreTutorialQuiz } from './tutorialQuiz';
import { getQuizTotalTimeSeconds } from './quizTiming';

describe('tutoriel local des quiz étudiants', () => {
  it('contient exactement six questions et tous les formats disponibles dont mots_trous', () => {
    const quiz = createTutorialQuiz('class-a1', 'Classe A1');

    assert.equal(quiz.questions.length, 6);
    assert.deepEqual(
      [...new Set(quiz.questions.map((question) => question.type))].sort(),
      ['mots_trous', 'qcm', 'reorder', 'text', 'verbes_trous'].sort()
    );
    assert.equal(quiz.total_points, 20);
    assert.deepEqual(quiz.questions.map((question) => question.time_limit_seconds), [15, 15, 25, 35, 35, 40]);
    assert.equal(getQuizTotalTimeSeconds(quiz), 165);
  });

  it('calcule 20/20 localement pour des réponses correctes, dont reorder, mots_trous et verbes_trous', () => {
    const quiz = createTutorialQuiz();
    const answers = Object.fromEntries(quiz.questions.map((question) => {
      if (question.type === 'reorder') return [question.id, question.correct_answer];
      if (question.type === 'mots_trous') {
        return [question.id, JSON.stringify({ '1': 'caffè', '2': 'cornetto' })];
      }
      if (question.type === 'verbes_trous') {
        return [question.id, JSON.stringify({
          choices: { 0: 'alzarsi', 1: 'lavarsi' },
          saisies: { 0: 'mi alzo', 1: 'ti lavi' }
        })];
      }
      return [question.id, question.correct_answer.split(/\s*[\/;|]\s*/)[0]];
    }));

    assert.deepEqual(scoreTutorialQuiz(quiz, answers), {
      score: 20,
      maxScore: 20,
      score20: 20
    });
  });

  it('attribue les points partiels de verbes_trous et mots_trous sans consulter de service de données', () => {
    const quiz = createTutorialQuiz();
    const vt = quiz.questions.find((question) => question.id === 'tutorial-verbes-trous');
    const mt = quiz.questions.find((question) => question.id === 'tutorial-mots-trous');
    assert.ok(vt);
    assert.ok(mt);

    const vtResult = scoreTutorialQuiz(quiz, {
      [vt.id]: JSON.stringify({
        choices: { 0: 'alzarsi' },
        saisies: { 0: 'mi alzo' }
      })
    });

    assert.equal(vtResult.score, 2);
    assert.equal(vtResult.maxScore, 20);
    assert.equal(vtResult.score20, 2);

    const mtResult = scoreTutorialQuiz(quiz, {
      [mt.id]: JSON.stringify({ '1': 'caffè', '2': 'tè' })
    });

    assert.equal(mtResult.score, 2);
    assert.equal(mtResult.maxScore, 20);
    assert.equal(mtResult.score20, 2);
  });
});
