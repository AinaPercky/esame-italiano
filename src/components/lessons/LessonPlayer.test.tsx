import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Lesson } from '../../types/lessons';
import { LessonFullPreview, LessonPlayer } from './LessonRenderer';

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

function renderCustomStep(step: any) {
  const customLesson: Lesson = {
    ...lesson,
    blocks: [lesson.blocks[0], { id: 'custom-discovery', type: 'discovery', content: { source: 'dialogue', steps: [step] } }]
  };
  return renderToStaticMarkup(React.createElement(LessonPlayer, {
    lesson: customLesson,
    progress: { user_id: 'student-1', lesson_id: customLesson.id, status: 'started', discovery_state: { screen: 1 }, updated_at: '' }
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

test('une leçon déjà terminée s’ouvre directement sur le cours sans dialogue ni guide', () => {
  const html = renderAt(11, 'done');
  assert.match(html, /lesson-direct-toolbar/);
  assert.match(html, /Révision autonome/);
  assert.match(html, /lesson-formula/);
  assert.match(html, /Recommencer le guide/);
  assert.doesNotMatch(html, /lesson-dialogue|lesson-player-question|lesson-discovery|Refaire la découverte/);
});

test('l’écran de fin propose la reprise guidée, la lecture directe et le téléchargement PDF A4', () => {
  const html = renderAt(11);
  assert.match(html, /Parcours terminé/);
  assert.match(html, /Reprendre le parcours guidé depuis le début/);
  assert.match(html, /Lire la leçon directement/);
  assert.match(html, /Télécharger le PDF A4/);
});

test('le lecteur affiche le libellé complet des choix de plus de trois mots', () => {
  const html = renderCustomStep({ id: 'long-choice', kind: 'choose', prompt: 'Choisissez la règle complète.', data: {
    options: [{ text: 'Il verbo ausiliare essere accompagna il participio', correct: true }]
  } });
  assert.match(html, /Il verbo ausiliare essere accompagna il participio/);
  assert.doesNotMatch(html, /3 mots maximum/);
});

test('le lecteur affiche une zone de réponse libre sans limite de longueur', () => {
  const html = renderCustomStep({ id: 'free-answer', kind: 'free_text', prompt: 'Expliquez la règle.', data: {
    correct_answer: 'Una frase lunga che contiene più di tre parole.'
  } });
  assert.match(html, /<textarea/);
  assert.match(html, /Saisissez votre réponse complète/);
  assert.doesNotMatch(html, /maxlength=/i);
});

test('le lecteur affiche les éléments d’une question de réordonnancement', () => {
  const html = renderCustomStep({ id: 'order-answer', kind: 'reorder', prompt: 'Mettez dans l’ordre.', data: {
    items: ['Preparare gli ingredienti', 'Cuocere la pasta', 'Servire il piatto'],
    correct_order: ['Preparare gli ingredienti', 'Cuocere la pasta', 'Servire il piatto']
  } });
  assert.match(html, /lesson-order-list/);
  assert.match(html, /Preparare gli ingredienti/);
  assert.match(html, /Cuocere la pasta/);
  assert.match(html, /Servire il piatto/);
  assert.match(html, /Faites glisser les éléments/);
});

test('la synthèse affiche les repères et sépare visuellement la phrase modèle', () => {
  const recapLesson: Lesson = {
    ...lesson,
    blocks: [{
      id: 'recap-design',
      type: 'recap',
      content: {
        bullets: ['Avere ou essere au présent', 'Ajouter le participe passé'],
        model: { it: 'Ieri sono andata a Roma.', fr: 'Hier, je suis allée à Rome.' }
      }
    }]
  };
  const html = renderToStaticMarkup(React.createElement(LessonFullPreview, { lesson: recapLesson, revealAll: true }));
  assert.match(html, /lesson-recap-header/);
  assert.match(html, /Fiche mémo/);
  assert.match(html, /2 repères/);
  assert.match(html, /Avere ou essere au présent/);
  assert.match(html, /Phrase modèle/);
  assert.match(html, /Ieri sono andata a Roma/);
  assert.match(html, /Hier, je suis allée à Rome/);
});
