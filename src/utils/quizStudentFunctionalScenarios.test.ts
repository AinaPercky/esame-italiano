import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { QUIZ_INDIVIDUAL_RETRY_MIGRATION_SQL } from '../data/quizRetryMigration';
import { QUIZ_RETRY_CONFIRMATION_MIGRATION_SQL } from '../data/quizRetryConfirmationMigration';
import { canStudentStartQuiz, canSubmitQuizAttempt, isRetryAuthorizedParticipant } from './quizRetryAvailability';
import { evaluateQuizAnswers } from '../views/publicQuiz/publicQuizUtils';
import { calculateQuestionPointsEarned, parseStudentAnswers } from './quizAnswerMatcher';
import { noterQuiz } from './verbesTrous';
import { markBestQuizAttempt, type QuizAttemptScore } from './quizBestAttempt';
import type { Quiz, QuizQuestion } from '../types';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const classRetryMigration = read('../../supabase/migrations/20261115190000_unify_quiz_retry_lifecycle.sql');
const participantMigration = read('../../supabase/migrations/20261117120000_unify_quiz_participant_retry_lifecycle.sql');
const submissionMigration = read('../../supabase/migrations/20261115080000_quiz_submission_best_score_and_persistence_fix.sql');
const studentView = read('../views/StudentSpaceView.tsx');
const adminView = read('../views/QuizzesAdminView.tsx');

function sqlFunction(sql: string, name: string, delimiter = '$$;'): string {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name);
  if (start < 0) return '';
  const end = sql.indexOf(delimiter, start);
  return end < 0 ? '' : sql.slice(start, end + delimiter.length);
}

describe('Parcours étudiant — secondes chances', () => {
  it('accorde une seconde chance individuelle au seul étudiant ciblé et conserve son historique', () => {
    const grant = sqlFunction(QUIZ_INDIVIDUAL_RETRY_MIGRATION_SQL, 'grant_quiz_retry(');
    assert.ok(grant.includes('public.quiz_is_teacher()'));
    assert.ok(grant.includes('p_student_id'));
    assert.ok(grant.includes('p_quiz_id'));
    assert.ok(grant.includes("presence_status = 'retry_authorized'"));
    assert.ok(!grant.includes('DELETE FROM public.quiz_submissions'));
    assert.ok(!grant.includes('DELETE FROM public.quiz_attempts'));
    assert.equal(isRetryAuthorizedParticipant('retry_authorized'), true);
    assert.equal(isRetryAuthorizedParticipant('present'), false);
    assert.equal(canStudentStartQuiz('closed', true, true), true);
    assert.equal(canStudentStartQuiz('closed', true, false), false);
  });

  it('ne débloque pas un autre étudiant qui n’a pas reçu son autorisation individuelle', () => {
    const students = [
      { id: 'student-authorized', status: 'retry_authorized' },
      { id: 'student-not-authorized', status: 'completed' }
    ];
    const canStart = (status: string) => canStudentStartQuiz('closed', true, isRetryAuthorizedParticipant(status));
    assert.equal(canStart(students[0].status), true);
    assert.equal(canStart(students[1].status), false);
  });

  it('accorde la seconde chance de classe uniquement aux inscriptions actives de la classe ciblée', () => {
    const grantClass = sqlFunction(classRetryMigration, 'grant_quiz_retry_for_class(');
    assert.ok(grantClass.includes('p_class_id = ANY(coalesce(nullif(q.class_ids'));
    assert.ok(grantClass.includes('FROM public.class_enrollments ce'));
    assert.ok(grantClass.includes('ce.class_id::text = p_class_id'));
    assert.ok(grantClass.includes("ce.status = 'active'"));
    assert.ok(grantClass.includes('public.grant_quiz_retry(p_quiz_id, v_student, p_reason, NULL)'));
    assert.ok(grantClass.includes('greatest(1, p_max_attempts)'));
    assert.ok(grantClass.includes("RETURN jsonb_build_object('granted', v_count)"));
    // La RPC individuelle appelée dans la boucle vérifie aussi que l'élève est approuvé.
    assert.ok(participantMigration.includes("s.validation_status = 'approved'"));
    assert.ok(adminView.includes('grantQuizRetryForClass'));
  });

  it('refuse une nouvelle tentative après remise si aucune autorisation active n’existe', () => {
    for (const status of ['pending', 'present', 'absent', 'completed', 'timeout', null, undefined]) {
      assert.equal(isRetryAuthorizedParticipant(status), false);
      assert.equal(canStudentStartQuiz('launched', true, false), false);
      assert.equal(canSubmitQuizAttempt(true, false, false), false);
    }
    assert.equal(canSubmitQuizAttempt(true, false, true), true);
  });

  it('n’autorise pas les secondes chances expirées, révoquées ou épuisées', () => {
    assert.ok(participantMigration.includes('g.used_at IS NULL'));
    assert.ok(participantMigration.includes('g.revoked_at IS NULL'));
    assert.ok(participantMigration.includes('g.expires_at IS NULL OR g.expires_at > clock_timestamp()'));
    assert.ok(participantMigration.includes('g.used_attempts < g.max_attempts'));
    assert.ok(participantMigration.includes('La seconde chance est expirée, révoquée ou déjà utilisée'));
  });

  it('consomme une tentative seulement à la remise et respecte max_attempts', () => {
    assert.ok(participantMigration.includes('used_attempts = used_attempts + 1'));
    assert.ok(participantMigration.includes('used_attempts + 1 >= max_attempts'));
    assert.ok(participantMigration.includes('Presence confirmation must not consume retry grants'));
    const confirmation = sqlFunction(QUIZ_RETRY_CONFIRMATION_MIGRATION_SQL, 'confirm_quiz_presence(');
    assert.ok(confirmation.length > 0);
    assert.ok(!confirmation.includes('UPDATE public.quiz_retry_grants'));
  });

  it('le parcours étudiant confirme la présence puis ouvre la tentative autorisée', () => {
    assert.ok(studentView.includes('isRetryAuthorizedParticipant(activeLaunch.participant.presence_status)'));
    assert.ok(studentView.includes('confirmQuizPresence(activeLaunch.launch.id)'));
    assert.ok(studentView.includes('retryAuthorized'));
    assert.ok(studentView.includes('startQuizSession(quiz, false, presenceInitialization.retryAuthorized === true)'));
    assert.ok(studentView.includes('isRetryAttempt'));
    assert.ok(studentView.includes('dataService.submitQuiz('));
  });
});

describe('Parcours étudiant — inscription après le lancement', () => {
  it('rattache à la volée un nouvel inscrit approuvé ayant une inscription active dans une classe du quiz', () => {
    const activeLaunch = sqlFunction(participantMigration, 'get_student_active_launch(', '$function$;');
    assert.ok(activeLaunch.includes('JOIN public.class_enrollments ce ON ce.student_id = s.id'));
    assert.ok(activeLaunch.includes("s.validation_status = 'approved'"));
    assert.ok(activeLaunch.includes("ce.status = 'active'"));
    assert.ok(activeLaunch.includes('v_quiz.class_ids'));
    assert.ok(activeLaunch.includes('INSERT INTO public.quiz_participants AS existing_participant'));
    assert.ok(activeLaunch.includes("CASE WHEN v_has_retry THEN 'retry_authorized' ELSE 'pending' END"));
    assert.ok(activeLaunch.includes('ON CONFLICT (quiz_id, student_id)'));
  });

  it('ne donne pas accès à un élève non approuvé, suspendu, désinscrit ou hors classe', () => {
    const activeLaunch = sqlFunction(participantMigration, 'get_student_active_launch(', '$function$;');
    assert.ok(activeLaunch.includes("s.validation_status = 'approved'"));
    assert.ok(activeLaunch.includes("ce.status = 'active'"));
    assert.ok(activeLaunch.includes("IF v_class_id IS NULL THEN"));
    assert.ok(activeLaunch.includes("RETURN '{}'::jsonb"));
  });

  it('ne réinitialise pas une ancienne tentative sans autorisation valide', () => {
    const activeLaunch = sqlFunction(participantMigration, 'get_student_active_launch(', '$function$;');
    assert.ok(activeLaunch.includes('v_has_history'));
    assert.ok(activeLaunch.includes('v_has_terminal_participation'));
    assert.ok(activeLaunch.includes('IF v_has_retry OR (NOT v_has_history AND NOT v_has_terminal_participation) THEN'));
    assert.ok(activeLaunch.includes("presence_status IN ('absent', 'completed', 'timeout')"));
  });
});

describe('Parcours étudiant — réponses, correction et persistance', () => {
  const questions: QuizQuestion[] = [
    { id: 'qcm', type: 'qcm', question: 'Scegli.', options: ['A', 'B'], correct_answer: 'B', points: 2 },
    { id: 'cloze', type: 'text', question: 'Io ___ a ___ e loro ___.', correct_answer: 'vado | scuola | parlano', points: 3 },
    { id: 'reorder', type: 'reorder', question: 'Riordina.', items: [
      { id: 'i1', text: 'Io' }, { id: 'i2', text: 'vado' }, { id: 'i3', text: 'a scuola' }
    ], correct_answer: JSON.stringify(['i1', 'i2', 'i3']), points: 2 },
    { id: 'verbs', type: 'verbes_trous', question: 'Completa i verbi.', correct_answer: '', points: 6,
      verbes_trous: { banque: ['andare', 'essere'], points_par_phrase: 3, phrases: [
        { id: 1, debut: 'Io ', fin: '.', verbe: 'andare', reponses: ['vado'] },
        { id: 2, debut: 'Noi ', fin: '.', verbe: 'essere', reponses: ['siamo'] }
      ] }
    }
  ];
  const quiz = { questions, total_points: 13 } as Pick<Quiz, 'questions' | 'total_points'>;

  it('affiche les quatre types de questions dans le parcours étudiant', () => {
    assert.ok(studentView.includes("question.type === 'qcm'"));
    assert.ok(studentView.includes("question.type === 'text'"));
    assert.ok(studentView.includes("question.type === 'reorder'"));
    assert.ok(studentView.includes("question.type === 'verbes_trous'"));
  });

  it('corrige QCM, cloze multi-trous, réordonnancement et verbes à trous dans un même quiz', () => {
    const result = evaluateQuizAnswers(quiz, {
      qcm: 'B',
      cloze: JSON.stringify(['vado', 'scuola', 'parlano']),
      reorder: JSON.stringify(['i1', 'i2', 'i3']),
      verbs: JSON.stringify({
        '1': { verbe_choisi: 'andare', texte_saisi: 'vado' },
        '2': { verbe_choisi: 'essere', texte_saisi: 'siamo' }
      })
    });
    assert.equal(result.rawScore, 13);
    assert.equal(result.maxScore, 13);
    assert.equal(result.score20, 20);
    assert.equal(result.feedback.cloze.correct, true);
    assert.equal(result.feedback.verbs.correct, true);
  });

  it('conserve chaque champ cloze et attribue des points partiels sans effacer les autres réponses', () => {
    const answer = JSON.stringify(['vado', 'errato', 'parlano']);
    assert.deepEqual(parseStudentAnswers(answer, 3), ['vado', 'errato', 'parlano']);
    const score = calculateQuestionPointsEarned(questions[1], answer);
    assert.equal(score.partialCorrectCount, 2);
    assert.equal(score.awardedPoints, 2);
    assert.equal(score.isFullyCorrect, false);
  });

  it('note séparément le choix du verbe et sa conjugaison, sans points gratuits pour les doublons', () => {
    const definition = questions[3].verbes_trous!;
    const score = noterQuiz(definition, {
      '1': { verbe_choisi: 'andare', texte_saisi: 'vado' },
      '2': { verbe_choisi: 'andare', texte_saisi: 'siamo' }
    });
    assert.equal(score.score, 3);
    assert.equal(score.maxScore, 6);
  });

  it('conserve toutes les copies mais ne compte que la meilleure note', () => {
    const attempts: QuizAttemptScore[] = [
      { id: 'attempt-1', attempt_number: 1, score_20: 9 },
      { id: 'attempt-2', attempt_number: 2, score_20: 17 },
      { id: 'attempt-3', attempt_number: 3, score_20: 12 }
    ];
    const result = markBestQuizAttempt(attempts);
    assert.equal(result.length, 3);
    assert.equal(result.filter(row => row.is_counted).length, 1);
    assert.equal(result.find(row => row.is_counted)?.id, 'attempt-2');
  });

  it('calcule le numéro de tentative par couple quiz/élève et ne réutilise pas les anciennes réponses', () => {
    assert.ok(submissionMigration.includes('a.quiz_id = q.id AND a.student_id = sid'));
    assert.ok(submissionMigration.includes('s.quiz_id = q.id AND s.student_id = sid'));
    assert.ok(submissionMigration.includes('AND attempt_number = attempt_no'));
    assert.ok(submissionMigration.includes('WHERE id = submission_id AND quiz_id = q.id AND student_id = sid'));
  });

  it('refuse les doubles soumissions côté interface et corrige les quiz officiels côté serveur', () => {
    assert.ok(studentView.includes('if (quizSubmissionLockRef.current) return'));
    assert.ok(studentView.includes('supabaseService.evaluateQuizQuestion(activeQuiz.id, currentQ.id, studentAns)'));
    assert.ok(studentView.includes('dataService.submitQuiz('));
    assert.ok(submissionMigration.includes('public.quiz_grade_all(q.id, coalesce(saved_answers'));
  });

  it('ne consomme pas une autorisation si la confirmation de présence est seule effectuée', () => {
    const confirmation = sqlFunction(QUIZ_RETRY_CONFIRMATION_MIGRATION_SQL, 'confirm_quiz_presence(');
    assert.ok(confirmation.length > 0);
    assert.ok(!confirmation.includes('UPDATE public.quiz_retry_grants'));
  });
});
