import test from 'node:test';
import assert from 'node:assert/strict';
import { Lesson } from '../types/lessons';
import { createLessonPdf } from './lessonPdf';

const sampleLesson: Lesson = {
  id: 'pdf-test', slug: 'passato-prossimo', type: 'grammaire', level: 'A1', duration_min: 10,
  title_it: 'Il passato prossimo', title_fr: 'Le passé composé', objective: 'Former une phrase au passé composé.',
  status: 'published', method: 'inductive', sort_order: 0, access: 'free', created_at: '', updated_at: '',
  blocks: [
    { id: 'dialogue', type: 'dialogue', content: { lines: [{ it: 'Ieri ho studiato.', fr: 'Hier, j’ai étudié.' }] } },
    { id: 'discovery', type: 'discovery', content: { steps: [{ id: 'q1', kind: 'choose', prompt: 'Quelle forme ?', data: {} }] } },
    { id: 'rules', type: 'rules_table', content: { title: 'Choisir l’auxiliaire', label: 'Sujet', columns: ['Auxiliaire'], rows: [{ label: 'Io', cells: ['ho'] }] } },
    { id: 'module', type: 'module', content: { title: 'Exemples', blocks: [{ id: 'example', type: 'example_list', content: { examples: [{ it: 'Ho mangiato.', fr: 'J’ai mangé.' }] } }] } },
    { id: 'recap', type: 'recap', content: { bullets: ['Auxiliaire + participe passé'], model: { it: 'Sono partita.', fr: 'Je suis partie.' } } }
  ]
};

test('génère un PDF A4 non vide à partir des contenus de leçon et des modules', async () => {
  const doc = await createLessonPdf(sampleLesson, null);
  const output = doc.output('arraybuffer');
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 210) < 0.1);
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 297) < 0.1);
  assert.ok(output.byteLength > 1000);
  assert.match(new TextDecoder().decode(output.slice(0, 8)), /^%PDF-/);
});
