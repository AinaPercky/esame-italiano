import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTutorialQuiz, scoreTutorialQuiz } from './tutorialQuiz';
import { getQuizTotalTimeSeconds } from './quizTiming';

describe('tutoriel local des quiz étudiants', () => {
  it('contient exactement cinq questions et tous les formats disponibles', () => {
    const quiz = createTutorialQuiz('class-a1', 'Classe A1');

    assert.equal(quiz.questions.length, 5);
    assert.deepEqual(
      [...new Set(quiz.questions.map((question) => question.type))].sort(),
      ['qcm', 'reorder', 'text', 'verbes_trous'].sort()
    );
    assert.equal(quiz.total_points, 20);
    assert.deepEqual(quiz.questions.map((question) => question.time_limit_seconds), [15, 15, 25, 35, 40]);
    assert.equal(getQuizTotalTimeSeconds(quiz), 130);
  });

  it('calcule 20/20 localement pour des réponses correctes, dont le reorder et verbes_trous', () => {
    const quiz = createTutorialQuiz();
    const answers = Object.fromEntries(quiz.questions.map((question) => {
      if (question.type === 'reorder') return [question.id, question.correct_answer];
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

  it('attribue les points partiels d’une phrase à trous sans consulter de service de données', () => {
    const quiz = createTutorialQuiz();
    const vt = quiz.questions.find((question) => question.id === 'tutorial-verbes-trous');
    assert.ok(vt);

    const result = scoreTutorialQuiz(quiz, {
      [vt.id]: JSON.stringify({
        choices: { 0: 'alzarsi' },
        saisies: { 0: 'mi alzo' }
      })
    });

    assert.equal(result.score, 2);
    assert.equal(result.maxScore, 20);
    assert.equal(result.score20, 2);
  });
});
