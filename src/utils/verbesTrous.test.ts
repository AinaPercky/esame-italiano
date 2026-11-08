import test from 'node:test';
import assert from 'node:assert/strict';
import {
  banqueRestante, noterQuiz, normalizeVerbesTrousAnswer, parseVerbesTrousAnswers,
  placerVerbe, rendreVerbe, trouverPhraseVide
} from './verbesTrous';

const definition = {
  points_par_phrase: 3,
  banque: ['addormentarsi', 'bere', 'dire', 'extra'],
  phrases: [
    { id: 1, debut: 'Io ', fin: '.', verbe: 'addormentarsi', reponses: ['mi addormento', 'mi addormento subito'] },
    { id: 2, debut: 'Noi ', fin: '.', verbe: 'bere', reponses: ['beviamo'] }
  ]
};

test('normalise la casse et les espaces sans supprimer les accents', () => {
  assert.equal(normalizeVerbesTrousAnswer('  MI   ADDORMENTO  '), 'mi addormento');
  assert.notEqual(normalizeVerbesTrousAnswer('a'), normalizeVerbesTrousAnswer('à'));
});
test('place un verbe une seule fois et calcule la banque restante', () => {
  const one = placerVerbe({}, 1, 'addormentarsi');
  assert.equal(placerVerbe(one, 2, 'addormentarsi'), one);
  assert.deepEqual(banqueRestante(definition.banque, one), ['bere', 'dire', 'extra']);
});
test('retirer un verbe vide la réponse et le remet dans la banque', () => {
  const next = rendreVerbe(placerVerbe({}, 1, 'bere'), 1);
  assert.deepEqual(next, {});
  assert.deepEqual(banqueRestante(definition.banque, next), definition.banque);
});
test('accepte plusieurs conjugaisons possibles', () => {
  const score = noterQuiz(definition, { '1': { verbe_choisi: 'addormentarsi', texte_saisi: 'MI ADDORMENTO' } });
  assert.equal(score.score, 3);
});
test('note séparément le verbe et la conjugaison, même si la phrase est incomplète', () => {
  const score = noterQuiz(definition, {
    '1': { verbe_choisi: 'dire', texte_saisi: 'mi addormento' },
    '2': { verbe_choisi: 'bere', texte_saisi: '' }
  });
  assert.equal(score.score, 3);
  assert.deepEqual(score.phrases.map((phrase) => phrase.total), [2, 1]);
});
test('une phrase vide, un verbe en trop ou un verbe réutilisé ne rapportent pas de points supplémentaires', () => {
  const emptyVerb = noterQuiz(definition, { '1': { verbe_choisi: null, texte_saisi: 'mi addormento' } });
  assert.equal(emptyVerb.score, 0);
  const extra = noterQuiz(definition, { extra: { verbe_choisi: 'extra', texte_saisi: 'extra' } });
  assert.equal(extra.score, 0);
  const repeated = noterQuiz(definition, {
    '1': { verbe_choisi: 'addormentarsi', texte_saisi: 'mi addormento' },
    '2': { verbe_choisi: 'addormentarsi', texte_saisi: 'beviamo' }
  });
  assert.equal(repeated.score, 3);
});
test('soumission vide = zéro et banque plus grande que le nombre de phrases acceptée', () => {
  assert.equal(noterQuiz(definition, {}).score, 0);
  assert.equal(noterQuiz(definition, {}).maxScore, 6);
});
test('parse les réponses JSON et trouve la première phrase vide', () => {
  const answers = parseVerbesTrousAnswers('{"1":{"verbe_choisi":"bere","texte_saisi":""}}');
  assert.equal(trouverPhraseVide(definition.phrases, answers), '2');
});
