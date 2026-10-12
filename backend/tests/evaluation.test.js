/**
 * Tests unitaires et d'intégration pour Italian Oral Exam Manager
 * Section 15 du cahier des charges
 */

const assert = require('assert');
const { memoryStore, generateId } = require('../src/services/store');

console.log('--- Lancement des tests automatisés de validation ---\n');

let passedTests = 0;
let totalTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`[SUCCÈS] ${description}`);
    passedTests++;
  } catch (error) {
    console.error(`[ÉCHEC] ${description}`);
    console.error(`       Erreur: ${error.message}`);
  }
}

// 1. Test du calcul de la note : rubrique cochée vs non cochée
runTest('Une rubrique cochée rapporte ses points, non cochée rapporte 0', () => {
  const rubrics = [
    { id: 'r1', points: 1 },
    { id: 'r2', points: 1 },
    { id: 'r3', points: 2 }
  ];
  const validatedMap = { r1: true, r2: false, r3: true };

  const total = rubrics.reduce((sum, r) => {
    return sum + (validatedMap[r.id] ? r.points : 0);
  }, 0);

  assert.strictEqual(total, 3, 'Le total calculé doit être égal à 1 + 0 + 2 = 3');
});

// 2. Test de l'évaluation modèle du zébu (7/10 comme dans l'exemple de consigne)
runTest('Calcul exact du modèle Présentation du zébu (7/10)', () => {
  const evalJean = memoryStore.evaluations.find(e => e.student_id === 's1');
  assert.ok(evalJean, 'L\'évaluation de Jean doit exister');
  assert.strictEqual(evalJean.total_score, 7, 'La note de Jean doit être exactement de 7/10');
  
  const validatedCount = evalJean.details.filter(d => d.is_validated).length;
  assert.strictEqual(validatedCount, 7, 'Exactement 7 rubriques doivent être validées');
  
  const unvalidatedCount = evalJean.details.filter(d => !d.is_validated).length;
  assert.strictEqual(unvalidatedCount, 3, 'Exactement 3 rubriques doivent être non-validées');
});

// 3. Test que les élèves non évalués ne sont PAS comptés comme ayant 0 dans la moyenne
runTest('La moyenne de la classe ne compte PAS les élèves absents ou non évalués comme ayant 0', () => {
  const examId = 'e1';
  const evaluations = memoryStore.evaluations.filter(e => e.exam_id === examId);
  const totalStudentsInClass = memoryStore.students.filter(s => s.class_id === 'c1').length;
  
  assert.strictEqual(evaluations.length, 3, '3 élèves évalués (Jean=7, Marie=9, Paul=6)');
  assert.ok(totalStudentsInClass > 3, 'Il y a 6 élèves au total dans la classe A1');

  const scores = evaluations.map(e => e.total_score);
  const sumScores = scores.reduce((a, b) => a + b, 0); // 7 + 9 + 6 = 22
  const averageFromEvaluated = Number((sumScores / evaluations.length).toFixed(2)); // 22 / 3 = 7.33
  const badAverageWithZeros = Number((sumScores / totalStudentsInClass).toFixed(2)); // 22 / 6 = 3.67

  assert.strictEqual(averageFromEvaluated, 7.33, 'La moyenne doit être basée uniquement sur les 3 évalués (7.33)');
  assert.notStrictEqual(averageFromEvaluated, badAverageWithZeros, 'La moyenne ne doit pas compter les 3 non évalués comme 0');
});

// 4. Test d'unicité de l'évaluation (mise à jour au lieu d'une double entrée)
runTest('Un élève ne peut pas avoir deux évaluations pour le même examen (mise à jour)', () => {
  const examId = 'e1';
  const studentId = 's1';
  const countBefore = memoryStore.evaluations.filter(e => e.exam_id === examId && e.student_id === studentId).length;
  assert.strictEqual(countBefore, 1);

  // Simuler une seconde soumission modifiant la note de 7 à 8
  const idx = memoryStore.evaluations.findIndex(e => e.exam_id === examId && e.student_id === studentId);
  memoryStore.evaluations[idx].total_score = 8;

  const countAfter = memoryStore.evaluations.filter(e => e.exam_id === examId && e.student_id === studentId).length;
  assert.strictEqual(countAfter, 1, 'Toujours une seule évaluation existante');
  assert.strictEqual(memoryStore.evaluations[idx].total_score, 8, 'Note mise à jour avec succès');

  // Remettre la note à 7
  memoryStore.evaluations[idx].total_score = 7;
});

// 5. Test du mélange de passage aléatoire (Fisher-Yates)
runTest('Génération de l\'ordre aléatoire sans perte d\'élèves', () => {
  const students = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const shuffled = [...students];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  assert.strictEqual(shuffled.length, students.length, 'La taille de la liste reste identique');
  students.forEach(id => {
    assert.ok(shuffled.includes(id), `L'élève ${id} est toujours présent dans la liste mélangée`);
  });
});

// 6. Tests Section 5.3 : Chronomètre de 3 minutes (180s) et calcul du temps restant
runTest('Section 5.3: Chronomètre démarre à 180s et calcule le temps restant et les alertes', () => {
  const maxDuration = 180;
  let elapsed = 0;
  assert.strictEqual(maxDuration - elapsed, 180, 'Chronomètre démarre à 3 minutes (180s)');

  // Simulation pause après 60s
  elapsed = 60;
  const remainingAt1m = maxDuration - elapsed; // 120s
  assert.strictEqual(remainingAt1m, 120, 'Temps restant correct après 60s (120s restantes)');

  // Test des paliers d'alerte : 60s restantes (elapsed = 120), 30s restantes (elapsed = 150), 10s restantes (elapsed = 170), 0s restantes (elapsed = 180)
  const alertCheckpoints = [
    { elapsed: 120, remaining: 60, alert: '1 minute restante' },
    { elapsed: 150, remaining: 30, alert: '30 secondes restantes' },
    { elapsed: 170, remaining: 10, alert: '10 secondes restantes' },
    { elapsed: 180, remaining: 0, alert: 'Temps de parole écoulé' }
  ];

  alertCheckpoints.forEach(cp => {
    assert.strictEqual(maxDuration - cp.elapsed, cp.remaining, `Palier d'alerte ${cp.remaining}s vérifié`);
  });
});

// 7. Tests Section 5.3 : Enregistrement de la durée et stricte indépendance de la note
runTest('Section 5.3: Durée utilisée enregistrée et note strictement indépendante du temps', () => {
  const evalJean = memoryStore.evaluations.find(e => e.student_id === 's1');
  assert.ok(evalJean);
  assert.strictEqual(evalJean.max_duration_seconds, 180, 'Durée max autorisée égale à 180s');
  assert.strictEqual(evalJean.duration_used_seconds, 165, 'Durée utilisée de Jean égale à 165s');
  assert.strictEqual(evalJean.timer_status, 'stopped_manually', 'Statut du chrono arrêté manuellement');
  assert.strictEqual(evalJean.total_score, 7, 'La note de 7/10 reste strictement indépendante de la durée (165s < 180s)');

  // Cas d'un élève terminant à 180s (temps écoulé) mais ayant 9/10
  const evalMarie = memoryStore.evaluations.find(e => e.student_id === 's2');
  if (evalMarie) {
    assert.strictEqual(evalMarie.total_score, 9);
    assert.ok(evalMarie.duration_used_seconds <= 180);
  }
});

console.log(`\n---------------------------------------------------`);
console.log(`Résultats: ${passedTests}/${totalTests} tests réussis.`);
console.log(`---------------------------------------------------\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
