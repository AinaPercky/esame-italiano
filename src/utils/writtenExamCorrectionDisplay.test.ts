import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWrittenQuestionCorrectionBreakdown,
  getOrderedWrittenQuestions,
  getWrittenAttemptReviewState
} from './writtenExamCorrectionDisplay';

describe('writtenExamCorrectionDisplay', () => {
  it('orders sections and questions using attempt order_manifest', () => {
    const version = {
      written_exam_sections: [
        {
          id: 's1',
          position: 0,
          title: 'Section 1',
          written_exam_questions: [
            { id: 'q1', position: 0, question_type: 'text', prompt: 'Q1', points: 1 },
            { id: 'q2', position: 1, question_type: 'text', prompt: 'Q2', points: 1 }
          ]
        },
        {
          id: 's2',
          position: 1,
          title: 'Section 2',
          written_exam_questions: [{ id: 'q3', position: 0, question_type: 'text', prompt: 'Q3', points: 1 }]
        }
      ]
    };

    const attempt = {
      order_manifest: {
        sections: ['s2', 's1'],
        questions: { s1: ['q2', 'q1'], s2: ['q3'] }
      }
    };

    const ordered = getOrderedWrittenQuestions(attempt, version);
    assert.deepEqual(
      ordered.map(item => item.question.id),
      ['q3', 'q2', 'q1']
    );
    assert.deepEqual(
      ordered.map(item => item.questionIndex),
      [0, 1, 2]
    );
  });

  it('builds structured breakdowns for qcm, text, reorder, verbes_trous and mots_trous', () => {
    const qcm = buildWrittenQuestionCorrectionBreakdown(
      {
        id: 'w-qcm',
        question_type: 'qcm',
        prompt: 'Capitale ?',
        points: 1,
        public_data: {
          options: [
            { id: 'opt-1', label: 'Milano' },
            { id: 'opt-2', label: 'Roma' }
          ]
        },
        written_exam_answer_keys: [{ answer_key: { correctOptionId: 'opt-2' } }]
      },
      'opt-1'
    );
    assert.equal(qcm.type, 'qcm');
    if (qcm.type === 'qcm') {
      assert.equal(qcm.studentDisplay, 'Milano');
      assert.equal(qcm.expectedDisplay, 'Roma');
      assert.equal(qcm.isCorrect, false);
    }

    const multiText = buildWrittenQuestionCorrectionBreakdown(
      {
        id: 'w-text',
        question_type: 'text',
        prompt: 'Completa',
        points: 2,
        public_data: { blank_count: 2 },
        written_exam_answer_keys: [{ answer_key: { answers: [['sono', 'io sono'], ['ho']] } }]
      },
      ['IO SONO', 'hai']
    );
    assert.equal(multiText.type, 'text');
    if (multiText.type === 'text') {
      assert.equal(multiText.isMultiBlank, true);
      assert.equal(multiText.slots[0].isCorrect, true);
      assert.equal(multiText.slots[1].isCorrect, false);
      assert.equal(multiText.slots[1].expectedValue, 'ho');
    }

    const verbes = buildWrittenQuestionCorrectionBreakdown(
      {
        id: 'w-vt',
        question_type: 'verbes_trous',
        prompt: 'Verbi',
        points: 3,
        public_data: {
          verbes_trous: {
            titre: 'Presente',
            consigne: 'Completa',
            points_par_phrase: 3,
            banque: ['andare'],
            phrases: [{ id: 'p1', debut: 'Io ', fin: ' a casa.' }]
          }
        },
        written_exam_answer_keys: [
          { answer_key: { phrases: [{ id: 'p1', verbe: 'andare', reponses: ['vado'] }] } }
        ]
      },
      { p1: { verbe_choisi: 'andare', texte_saisi: 'vado' } }
    );
    assert.equal(verbes.type, 'verbes_trous');
    if (verbes.type === 'verbes_trous') {
      assert.equal(verbes.totalEarned, 3);
      assert.equal(verbes.phrases[0].isVerbCorrect, true);
      assert.equal(verbes.phrases[0].isConjugationCorrect, true);
    }

    const mots = buildWrittenQuestionCorrectionBreakdown(
      {
        id: 'w-mt',
        question_type: 'mots_trous',
        prompt: 'Mots',
        points: 1,
        public_data: {
          mots_trous: {
            titre: 'Lessico',
            consigne: 'Completa',
            points_par_phrase: 1,
            banque: ['libro'],
            phrases: [{ id: 'm1', debut: 'Leggo un ', fin: '.' }]
          }
        },
        written_exam_answer_keys: [{ answer_key: { phrases: [{ id: 'm1', mot: 'libro' }] } }]
      },
      { m1: 'libro' }
    );
    assert.equal(mots.type, 'mots_trous');
    if (mots.type === 'mots_trous') {
      assert.equal(mots.phrases[0].isCorrect, true);
      assert.equal(mots.phrases[0].expectedWord, 'libro');
    }
  });

  it('resolves review state cleanly for written attempts', () => {
    assert.equal(getWrittenAttemptReviewState({ status: 'in_progress' }), 'unavailable');
    assert.equal(
      getWrittenAttemptReviewState({
        status: 'graded',
        expression_writing_max_points: 10,
        expression_writing_score: null
      }),
      'pending'
    );
    assert.equal(
      getWrittenAttemptReviewState({
        status: 'graded',
        expression_writing_max_points: 10,
        expression_writing_score: 8
      }),
      'reviewed'
    );
  });
});
