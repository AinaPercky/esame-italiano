import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLessonSpeechText } from './lessonSpeech';

test('nettoie le texte vocal des marqueurs de surbrillance', () => {
  assert.equal(
    cleanLessonSpeechText('Marco va ==a== Roma ++con++ Anna.'),
    'Marco va a Roma con Anna.'
  );
});

test('retire également les marqueurs gras et normalise les espaces sans perdre les accents', () => {
  assert.equal(
    cleanLessonSpeechText('  **L’ho   visto** e __le__ ho ++scritto++.  '),
    'L’ho visto e le ho scritto.'
  );
});
