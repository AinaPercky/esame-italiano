import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Lesson } from '../../types/lessons';
import { LessonPlayer } from './LessonRenderer';

const steps = Array.from({ length: 6 }, (_, index) => ({
  id: `q-${index + 1}`,
  kind: (index === 0 ? 'highlight' : 'choose') as 'highlight' | 'choose',
  prompt: `Question ${index + 1} ?`,
  data: index === 0
    ? { targets: ['mangiato'] }
    : { options: [{ text: 'Réponse courte', correct: true }, { text: 'Autre choix', correct: false }] },
  insight: `Règle ${index + 1}`
}));

const lesson: Lesson = {
  id: 'lesson-test', slug: 'test', type: 'grammaire', level: 'A1', duration_min: 12,
  title_it: 'Il passato prossimo', title_fr: 'Le passé composé', objective: 'Comprendre la formation',
  status: 'published', method: 'inductive', sort_order: 0, access: 'free', created_at: '', updated_at: '',
  blocks: [
    { id: 'dialogue', type: 'dialogue', content: { lines: [{ speaker: 'Anna', side: 'left', it: 'Ieri ho ==mangiato== una mela.', fr: 'Hier, j’ai mangé une pomme.' }] } },
    { id: 'discovery', type: 'discovery', content: { source: 'dialogue', steps } },
    { id: 'formula', type: 'formula', content: { title: 'Formule', formulas: [{ parts: [{ text: 'essere/avere', kind: 'slot' }, { text: '+', kind: 'operator' }, { text: 'participio', kind: 'slot' }] }] } },
    { id: 'exceptions', type: 'exceptions', content: { title: 'Exceptions', items: [] } },
    { id: 'chips', type: 'chips', content: { items: [{ it: 'ieri', fr: 'hier' }] } },
    { id: 'recap', type: 'recap', content: { bullets: ['Auxiliaire + participe passé'] } }
  ]
};

function renderAt(screen: number, status: 'started' | 'done' = 'started', completedSteps: string[] = []) {
  return renderToStaticMarkup(React.createElement(LessonPlayer, {
    lesson,
    progress: {
      user_id: 'student-1', lesson_id: lesson.id, status,
      discovery_state: { screen, completedSteps }, updated_at: ''
    }
  }));
}

test('à l’ouverture, le DOM étudiant contient le dialogue et aucun bloc de cours ni quiz', () => {
  const html = renderAt(0);
  assert.match(html, /lesson-dialogue/);
  assert.match(html, /Ieri ho/);
  assert.doesNotMatch(html, /lesson-player-question|lesson-discovery|lesson-formula|lesson-exceptions|lesson-chips|lesson-recap/);
  assert.doesNotMatch(html, /class="lesson-word/);
});

test('après le dialogue, le DOM ne contient qu’une question de découverte', () => {
  const html = renderAt(1);
  assert.match(html, /lesson-player-question/);
  assert.match(html, /Question 1 \?/);
  assert.doesNotMatch(html, /Question 2 \?|lesson-dialogue|lesson-formula|lesson-exceptions|lesson-chips|lesson-recap/);
  assert.doesNotMatch(html, /class="lesson-word/);
});

test('le marqueur du dialogue se colore seulement après réussite de l’étape liée', () => {
  const html = renderAt(1, 'started', ['q-1']);
  assert.match(html, /lesson-word-yellow/);
  assert.match(html, /mangiato/);
});

test('la progression reprend exactement à l’index sauvegardé', () => {
  const html = renderAt(4);
  assert.match(html, /Question 4 \?/);
  assert.doesNotMatch(html, /Question 3 \?|Question 5 \?|lesson-formula/);
});

test('une leçon déjà terminée s’ouvre sur le premier écran de cours en révision', () => {
  const html = renderAt(11, 'done');
  assert.match(html, /lesson-formula/);
  assert.match(html, /Refaire la découverte/);
  assert.doesNotMatch(html, /lesson-dialogue|lesson-player-question|lesson-exceptions|lesson-chips|lesson-recap/);
});
