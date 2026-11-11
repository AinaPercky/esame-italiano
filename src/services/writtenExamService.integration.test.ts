import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { writtenExamService } from './writtenExamService';
import { supabaseService } from './supabaseService';
import { A1_TEMPLATE, createWrittenExamFromTemplate } from '../utils/writtenExam';

type RpcCall = { name: string; args: Record<string, unknown> };
const originalGetClient = supabaseService.getClient;
let calls: RpcCall[] = [];
let responses: Record<string, unknown> = {};

function installSupabaseRpcFake() {
  calls = [];
  responses = {
    save_written_exam_definition: { exam_id: 'exam-1', version_id: 'version-1' },
    save_written_exam_question_time_limits: null,
    set_written_exam_expression_writing_max_points: null,
    publish_written_exam: { exam_id: 'exam-1', status: 'published' },
    list_available_written_exams: [{ id: 'exam-1', title: 'Esame A1' }],
    start_written_exam: {
      attempt_id: 'attempt-1',
      status: 'in_progress',
      deadline_at: '2026-11-11T11:00:00.000Z',
      started_at: '2026-11-11T10:00:00.000Z',
      answers: {},
      order_manifest: { sections: [], questions: {}, options: {}, items: {} },
      exam: { integrity_settings: {} },
      sections: []
    },
    get_or_start_written_exam_question_timer: { question_timer_started_at: '2026-11-11T10:00:00.000Z' },
    save_written_exam_question_answer: { saved: true },
    submit_written_exam: { status: 'submitted' },
    grade_written_exam_attempt: { status: 'graded', raw_score: 8 },
    grade_written_exam_expression_writing: { expression_writing_score: 8 },
    publish_written_exam_results: { published: true },
    get_my_written_exam_corrections: [{
      title: 'Esame A1',
      raw_score: 16,
      raw_max: 20,
      results_published: true,
      sections: [{ section_title: 'Grammaire', questions: [{ question_id: 'q1', student_answer: 'sono' }] }]
    }]
  };
  const fakeClient = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      if (!(name in responses)) return { data: null, error: { message: 'RPC inattendu: ' + name } };
      const value = responses[name];
      if (value instanceof Error) return { data: null, error: { message: value.message } };
      return { data: value, error: null };
    }
  };
  (supabaseService as any).getClient = () => fakeClient;
}

afterEach(() => {
  (supabaseService as any).getClient = originalGetClient;
});

test('integration service: teacher creates a draft and publishes its saved version', async () => {
  installSupabaseRpcFake();
  const exam = {
    ...createWrittenExamFromTemplate(A1_TEMPLATE),
    id: undefined,
    class_ids: ['class-1']
  };

  const saved = await writtenExamService.saveDefinition(exam);
  assert.equal(saved.exam_id, 'exam-1');
  assert.equal(saved.definition_id, 'version-1');
  assert.deepEqual(calls.map(call => call.name), [
    'save_written_exam_definition',
    'save_written_exam_question_time_limits',
    'set_written_exam_expression_writing_max_points'
  ]);

  const definitionCall = calls[0];
  const definition = definitionCall.args.p_definition as any;
  assert.equal(definition.shuffle_questions, true);
  assert.equal(definition.navigation_mode, 'sequential');
  assert.equal(definition.integrity_settings.fullscreen, true);
  assert.ok(definition.sections.every((section: any) =>
    section.questions.every((question: any) => Number.isInteger(question.time_limit_seconds) && question.time_limit_seconds > 0)
  ));

  const published = await writtenExamService.publish(saved.exam_id, saved.definition_id);
  assert.equal(published.status, 'published');
  assert.deepEqual(calls[3], {
    name: 'publish_written_exam',
    args: { p_exam_id: 'exam-1', p_version_id: 'version-1' }
  });
});

test('integration service: student discovers, starts, answers, advances and submits the published exam', async () => {
  installSupabaseRpcFake();

  const available = await writtenExamService.listAvailable();
  assert.equal(available.length, 1);
  assert.equal(available[0].id, 'exam-1');

  const attempt = await writtenExamService.start('exam-1');
  assert.equal(attempt.attempt_id, 'attempt-1');
  assert.equal(attempt.question_timer_started_at, '2026-11-11T10:00:00.000Z');

  await writtenExamService.saveQuestionAnswer('attempt-1', 'question-1', 'sono', true);
  await writtenExamService.submit('attempt-1');

  assert.deepEqual(calls.map(call => call.name), [
    'list_available_written_exams',
    'start_written_exam',
    'get_or_start_written_exam_question_timer',
    'save_written_exam_question_answer',
    'submit_written_exam'
  ]);
  assert.deepEqual(calls[3].args, {
    p_attempt_id: 'attempt-1',
    p_question_id: 'question-1',
    p_answer: 'sono',
    p_advance: true
  });
});

test('integration service: teacher grades objective/manual work, records expression score and publishes results', async () => {
  installSupabaseRpcFake();

  await writtenExamService.grade('attempt-1', { 'manual-question-1': 2 });
  await writtenExamService.gradeExpressionWriting('attempt-1', 8);
  const publication = await writtenExamService.publishResults('exam-1');

  assert.equal(publication.published, true);
  assert.deepEqual(calls.map(call => call.name), [
    'grade_written_exam_attempt',
    'grade_written_exam_expression_writing',
    'publish_written_exam_results'
  ]);
  assert.deepEqual(calls[0].args, {
    p_attempt_id: 'attempt-1',
    p_manual_scores: { 'manual-question-1': 2 }
  });
  assert.equal(calls[1].args.p_score, 8);
});

test('integration service: student receives detailed correction only through the published-corrections RPC', async () => {
  installSupabaseRpcFake();

  const copies = await writtenExamService.getCorrections('exam-1');
  assert.equal(copies[0].results_published, true);
  assert.equal(copies[0].sections[0].questions[0].student_answer, 'sono');
  assert.deepEqual(calls[0], {
    name: 'get_my_written_exam_corrections',
    args: { p_exam_id: 'exam-1' }
  });
});

test('integration service: expired or inactive question answers are rejected instead of silently accepted', async () => {
  installSupabaseRpcFake();
  responses.save_written_exam_question_answer = { saved: false, expired: true };

  await assert.rejects(
    writtenExamService.saveQuestionAnswer('attempt-1', 'question-1', 'sono'),
    /délai.*écoulé/i
  );
});

test('integration service: Supabase publication errors are propagated to the teacher', async () => {
  installSupabaseRpcFake();
  responses.publish_written_exam_results = new Error('Publication refusée: copie non corrigée');

  await assert.rejects(
    writtenExamService.publishResults('exam-1'),
    /copie non corrigée/
  );
});
