import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseService } from './supabaseService';

const originalGetClient = supabaseService.getClient;
const examId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const evaluationId = '33333333-3333-4333-8333-333333333333';
const rubricA = '44444444-4444-4444-8444-444444444444';
const rubricB = '55555555-5555-4555-8555-555555555555';

const evaluation = {
  id: evaluationId,
  exam_id: examId,
  student_id: studentId,
  total_score: 2,
  status: 'completed' as const,
  created_at: '2026-11-18T08:00:00.000Z',
  updated_at: '2026-11-18T08:01:00.000Z',
  max_duration_seconds: 180,
  duration_used_seconds: 125,
  timer_status: 'stopped_manually' as const,
  details: [
    { rubric_id: rubricA, is_validated: true, awarded_points: 2 },
    { rubric_id: rubricB, is_validated: false, awarded_points: 0, error_note: 'Accord incorrect' }
  ]
};

let rubricRows: Array<{ id: string; points: number }> = [];
let calls: Array<{ table: string; operation: string; payload?: any; options?: any }> = [];
let failures: Record<string, string> = {};

function installFake() {
  calls = [];
  failures = {};
  rubricRows = [{ id: rubricA, points: 2 }, { id: rubricB, points: 3 }];
  const fakeClient = {
    from(table: string) {
      return {
        select(columns: string) {
          calls.push({ table, operation: 'select', payload: columns });
          return {
            eq: async (_column: string, _value: string) => ({
              data: rubricRows,
              error: failures.rubricSelect ? { message: failures.rubricSelect } : null
            })
          };
        },
        upsert(payload: any, options?: any) {
          calls.push({ table, operation: 'upsert', payload, options });
          return {
            select: async (_columns: string) => ({
              data: failures[`${table}.upsert`] ? null : table === 'evaluations'
                ? [{ id: evaluationId }]
                : payload.map((item: any) => ({ rubric_id: item.rubric_id })),
              error: failures[`${table}.upsert`] ? { message: failures[`${table}.upsert`] } : null
            })
          };
        },
        update(payload: any) {
          calls.push({ table, operation: 'update', payload });
          return {
            eq: (_column: string, _value: string) => ({
              select: async (_columns: string) => ({
                data: failures[`${table}.update`] ? null : [{ id: evaluationId }],
                error: failures[`${table}.update`] ? { message: failures[`${table}.update`] } : null
              })
            })
          };
        }
      };
    }
  };
  (supabaseService as any).getClient = () => fakeClient;
}

afterEach(() => {
  (supabaseService as any).getClient = originalGetClient;
});

test('sauvegarde tous les critères avant de marquer une évaluation comme terminée', async () => {
  installFake();
  await supabaseService.saveEvaluation(evaluation as any);

  assert.deepEqual(calls.map(call => [call.table, call.operation]), [
    ['exam_rubrics', 'select'],
    ['evaluations', 'upsert'],
    ['evaluation_details', 'upsert'],
    ['evaluations', 'update']
  ]);
  assert.equal(calls[1].payload.status, 'draft');
  assert.equal(calls[2].payload.length, 2, 'les critères à zéro point doivent aussi être enregistrés');
  assert.equal(calls[2].payload[1].awarded_points, 0);
  assert.equal(calls[3].payload.status, 'completed');
});

test('refuse une évaluation si aucune grille persistée n’existe', async () => {
  installFake();
  rubricRows = [];
  await assert.rejects(
    supabaseService.saveEvaluation(evaluation as any),
    /aucun critère enregistré/i
  );
  assert.equal(calls.some(call => call.table === 'evaluations'), false);
});

test('refuse une évaluation si un critère manque', async () => {
  installFake();
  const incomplete = { ...evaluation, details: [evaluation.details[0]] };
  await assert.rejects(supabaseService.saveEvaluation(incomplete as any), /critères attendus/i);
  assert.equal(calls.some(call => call.table === 'evaluations'), false);
});

test('refuse un total qui ne correspond pas à la somme des critères', async () => {
  installFake();
  const inconsistent = { ...evaluation, total_score: 5 };
  await assert.rejects(supabaseService.saveEvaluation(inconsistent as any), /note incohérente/i);
  assert.equal(calls.some(call => call.table === 'evaluations'), false);
});

test('laisse l’évaluation en brouillon si la sauvegarde des détails échoue', async () => {
  installFake();
  failures['evaluation_details.upsert'] = 'permission denied';
  await assert.rejects(supabaseService.saveEvaluation(evaluation as any), /reste en brouillon.*permission denied/i);
  assert.equal(calls.filter(call => call.table === 'evaluations').length, 1);
  assert.equal(calls.find(call => call.table === 'evaluations')?.payload.status, 'draft');
});

test('remonte une erreur de validation finale au lieu de masquer la sauvegarde incomplète', async () => {
  installFake();
  failures['evaluations.update'] = 'update rejected';
  await assert.rejects(supabaseService.saveEvaluation(evaluation as any), /validation finale a échoué/i);
});
