import assert from 'node:assert/strict';
import test from 'node:test';
import type { LessonBlock } from '../types/lessons';
import { prepareLessonBlockRows } from './lessonPersistence';

const id = (tail: string) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;

test('convertit les identifiants de blocs compacts en UUID et remappe les références', () => {
  const blocks: LessonBlock[] = [
    { id: 'dlg', type: 'dialogue', content: { lines: [{ it: 'Vado a Roma.' }] } },
    {
      id: 'dec',
      type: 'discovery',
      content: {
        source: 'dlg',
        steps: [{ id: 's1', kind: 'highlight', data: { source: 'dlg' } }]
      }
    },
    { id: 'frm', type: 'formula', content: { formulas: [] } },
    { type: 'tip', content: { text: 'Conseil' } }
  ];
  const generated = [id('1'), id('2'), id('3'), id('4')];
  const rows = prepareLessonBlockRows(id('99'), blocks, () => generated.shift()!);

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => row.id), [id('1'), id('2'), id('3'), id('4')]);
  assert.ok(rows.every(row => row.lesson_id === id('99')));
  assert.equal(rows[1].content && (rows[1].content as any).source, id('1'));
  assert.equal((rows[1].content as any).steps[0].data.source, id('1'));
  assert.equal(rows[3].position, 3);
});

test('conserve un UUID de bloc déjà valide et transforme les références parentales', () => {
  const parentId = id('10');
  const blocks: LessonBlock[] = [
    { id: parentId, type: 'module', content: { title: 'Module' } },
    { id: 'child', type: 'tip', parent_block_id: parentId, content: { text: 'Texte' } }
  ];
  const rows = prepareLessonBlockRows(id('99'), blocks, () => id('11'));

  assert.equal(rows[0].id, parentId);
  assert.equal(rows[1].parent_block_id, parentId);
  assert.equal(rows[1].id, id('11'));
});

test('rejette des IDs UUID dupliqués plutôt que de provoquer un conflit à l’insertion', () => {
  const duplicateId = id('10');
  const blocks: LessonBlock[] = [
    { id: duplicateId, type: 'tip', content: {} },
    { id: duplicateId, type: 'tip', content: {} }
  ];

  assert.throws(
    () => prepareLessonBlockRows(id('99'), blocks, () => id('11')),
    /doivent être valides et uniques/
  );
});
