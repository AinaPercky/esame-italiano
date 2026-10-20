import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dataService } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { getStudentVisibleQuizzes } from './studentQuizVisibility';

const classA = { id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', name: 'QA Classe A', created_at: '2026-10-20T00:00:00.000Z' };
const classB = { id: '2f8d07e6-e4f5-5ede-aa59-ebe4ed99bdbf', name: 'QA Classe B', created_at: '2026-10-20T00:00:00.000Z' };
const classC = { id: '3a9e18f7-f506-4fef-9bba-9fbfaf00cace', name: 'QA Classe C', created_at: '2026-10-20T00:00:00.000Z' };
const originalState = dataService.getRawState();
const originalSaveQuiz = supabaseService.saveQuiz;
const originalDeleteQuiz = supabaseService.deleteQuiz;

const visibleFor = (classId: string) => getStudentVisibleQuizzes(dataService.getQuizzes(classId), []);

describe('CRUD et affectations des quiz — test local isolé', () => {
  before(() => {
    // Toute écriture cloud est neutralisée : ce test ne contacte jamais Supabase.
    supabaseService.saveQuiz = async () => undefined;
    supabaseService.deleteQuiz = async () => undefined;
    dataService.setImportedState({
      classes: [classA, classB, classC],
      students: [],
      exams: [],
      evaluations: [],
      passOrder: [],
      quizzes: [],
      quizSubmissions: []
    });
  });

  after(() => {
    supabaseService.saveQuiz = originalSaveQuiz;
    supabaseService.deleteQuiz = originalDeleteQuiz;
    dataService.setImportedState(originalState);
  });

  it('crée, relit, modifie plusieurs fois l’affectation, vérifie la visibilité élève puis supprime le quiz', () => {
    const classes = dataService.getClasses();
    const quiz = dataService.createQuiz({
      title: 'QA — Quiz de test affectation',
      description: 'Donnée temporaire de test, jamais synchronisée.',
      category: 'Grammaire',
      class_id: classA.id,
      class_ids: [classA.id],
      duration_minutes: 1,
      questions: [{
        id: 'qa-question-1',
        type: 'qcm',
        question: 'Quelle réponse est correcte ?',
        options: ['A', 'B'],
        correct_answer: 'A',
        points: 1
      }]
    });

    assert.equal(dataService.getQuizById(quiz.id)?.title, 'QA — Quiz de test affectation');
    assert.deepEqual(dataService.getQuizById(quiz.id)?.class_ids, [classA.id]);
    assert.equal(visibleFor(classA.id).some(item => item.id === quiz.id), false, 'un brouillon ne doit pas apparaître à l’élève');

    dataService.launchQuiz(quiz.id);
    assert.equal(visibleFor(classA.id).some(item => item.id === quiz.id), true, 'le quiz lancé doit apparaître à l’élève de A');
    assert.equal(visibleFor(classB.id).some(item => item.id === quiz.id), false, 'le quiz ne doit pas apparaître à l’élève de B tant qu’il n’est pas affecté');

    dataService.updateQuiz(quiz.id, {
      title: 'QA — Réaffecté à B',
      class_id: classB.id,
      class_ids: [classB.id]
    });
    assert.equal(dataService.getQuizById(quiz.id)?.title, 'QA — Réaffecté à B');
    assert.equal(visibleFor(classA.id).some(item => item.id === quiz.id), false);
    assert.equal(visibleFor(classB.id).some(item => item.id === quiz.id), true);

    dataService.updateQuiz(quiz.id, {
      title: 'QA — Plusieurs classes',
      class_id: classA.id,
      class_ids: [classA.id, classB.id]
    });
    assert.equal(visibleFor(classA.id).some(item => item.id === quiz.id), true);
    assert.equal(visibleFor(classB.id).some(item => item.id === quiz.id), true);
    assert.equal(visibleFor(classC.id).some(item => item.id === quiz.id), false);

    const allClassIds = classes.map(classroom => classroom.id);
    dataService.updateQuiz(quiz.id, {
      title: 'QA — Toutes les classes',
      class_id: allClassIds[0],
      class_ids: allClassIds,
      category: 'Vocabulaire'
    });
    const updatedQuiz = dataService.getQuizById(quiz.id);
    assert.deepEqual(updatedQuiz?.class_ids, allClassIds);
    assert.equal(updatedQuiz?.category, 'Vocabulaire');
    for (const classroom of classes) {
      assert.equal(visibleFor(classroom.id).some(item => item.id === quiz.id), true, `le quiz doit apparaître à ${classroom.name}`);
    }

    dataService.updateQuiz(quiz.id, { title: 'QA — Après nouvelle modification' });
    assert.deepEqual(dataService.getQuizById(quiz.id)?.class_ids, allClassIds, 'une modification ultérieure ne doit pas effacer les classes');
    assert.equal(dataService.getQuizById(quiz.id)?.title, 'QA — Après nouvelle modification');

    dataService.deleteQuiz(quiz.id);
    assert.equal(dataService.getQuizById(quiz.id), null, 'le quiz doit être supprimé du stockage local');
    for (const classroom of classes) {
      assert.equal(visibleFor(classroom.id).some(item => item.id === quiz.id), false);
    }
  });
});
