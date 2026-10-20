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
      ['qcm', 'reorder', 'text']
    );
    assert.equal(quiz.total_points, 20);
    assert.deepEqual(quiz.questions.map((question) => question.time_limit_seconds), [15, 15, 25, 44, 35]);
    assert.equal(getQuizTotalTimeSeconds(quiz), 134);
  });

  it('calcule 20/20 localement pour des réponses correctes, dont le reorder et le cloze', () => {
    const quiz = createTutorialQuiz();
    const answers = Object.fromEntries(quiz.questions.map((question) => {
      if (question.type === 'reorder') return [question.id, question.correct_answer];
      if (question.type === 'text' && question.answers?.length) {
        return [question.id, JSON.stringify(question.answers)];
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
    const cloze = quiz.questions.find((question) => question.id === 'tutorial-text-cloze');
    assert.ok(cloze);

    const result = scoreTutorialQuiz(quiz, {
      [cloze.id]: JSON.stringify(['vado', 'sbagliato'])
    });

    assert.equal(result.score, 2);
    assert.equal(result.maxScore, 20);
    assert.equal(result.score20, 2);
  });
});
