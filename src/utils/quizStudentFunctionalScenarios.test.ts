import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { QUIZ_INDIVIDUAL_RETRY_MIGRATION_SQL } from '../data/quizRetryMigration';
import { QUIZ_PARTICIPANT_LIFECYCLE_MIGRATION_SQL } from '../data/quizParticipantLifecycleMigration';
import { canStudentStartQuiz, canSubmitQuizAttempt, isRetryAuthorizedParticipant } from './quizRetryAvailability';
import { evaluateQuizAnswers } from '../views/publicQuiz/publicQuizUtils';
import { calculateQuestionPointsEarned, parseStudentAnswers } from './quizAnswerMatcher';
import { noterQuiz } from './verbesTrous';
import { markBestQuizAttempt } from './quizBestAttempt';
import type { Quiz, QuizQuestion } from '../types';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const classRetryMigration = read('../../supabase/migrations/20261115190000_unify_quiz_retry_lifecycle.sql');
const participantMigration = read('../../supabase/migrations/20261117120000_unify_quiz_participant_retry_lifecycle.sql');
const submissionMigration = read('../../supabase/migrations/20261115080000_quiz_submission_best_score_and_persistence_fix.sql');
const studentView = read('../views/StudentSpaceView.tsx');
const adminView = read('../views/QuizzesAdminView.tsx');

describe('Parcours étudiant — secondes chances', () => {
  it('accorde une seconde chance individuelle au seul étudiant ciblé et conserve son historique', () => {
    const grant = QUIZ_INDIVIDUAL_RETRY_MIGRATION_SQL.match(
      /CREATE OR REPLACE FUNCTION public\\.grant_quiz_retry\\([\\s\\S]*?\\$\\$;/
    )?.[0] || '';

    assert.match(grant, /public\\.quiz_is_teacher\\(\\)/);
    assert.match(grant, /p_student_id/);
    assert.match(grant, /p_quiz_id/);
    assert.match(grant, /Cet élève n’appartient pas aux classes de ce quiz/);
    assert.match(grant, /presence_status = 'retry_authorized'/);
    assert.doesNotMatch(grant, /DELETE FROM public\\.(quiz_submissions|quiz_attempts)/i);
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
    const grantClass = classRetryMigration.match(
      /CREATE OR REPLACE FUNCTION public\\.grant_quiz_retry_for_class\\([\\s\\S]*?\\$\\$;/
    )?.[0] || '';
    assert.match(grantClass, /p_class_id = ANY\\(coalesce\\(nullif\\(q\\.class_ids/);
    assert.match(grantClass, /FROM public\\.class_enrollments ce/);
    assert.match(grantClass, /ce\\.class_id::text = p_class_id/);
    assert.match(grantClass, /ce\\.status = 'active'/);
    assert.match(grantClass, /public\\.grant_quiz_retry\\(p_quiz_id, v_student, p_reason, NULL\\)/);
    assert.match(grantClass, /greatest\\(1, p_max_attempts\\)/);
    assert.match(grantClass, /RETURN jsonb_build_object\\('granted', v_count\\)/);

    // La RPC individuelle appelée dans la boucle vérifie aussi que l'élève est approuvé.
    assert.match(participantMigration, /JOIN public\\.students s ON s\\.id = ce\\.student_id AND s\\.validation_status = ''approved''/);
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
    assert.match(participantMigration, /g\\.used_at IS NULL/);
    assert.match(participantMigration, /g\\.revoked_at IS NULL/);
    assert.match(participantMigration, /g\\.expires_at IS NULL OR g\\.expires_at > clock_timestamp\\(\\)/);
    assert.match(participantMigration, /g\\.used_attempts < g\\.max_attempts/);
    assert.match(participantMigration, /La seconde chance est expirée, révoquée ou déjà utilisée/);
  });

  it('consomme une tentative seulement à la remise et respecte max_attempts', () => {
    assert.match(participantMigration, /used_attempts = used_attempts \\+ 1/);
    assert.match(participantMigration, /used_attempts \\+ 1 >= max_attempts/);
    assert.match(participantMigration, /Presence confirmation must not consume retry grants/);
    const confirm = participantMigration.match(
      /CREATE OR REPLACE FUNCTION public\\.confirm_quiz_presence\\([\\s\\S]*?\\$\\$;/
    )?.[0] || '';
    assert.doesNotMatch(confirm, /UPDATE public\\.quiz_retry_grants[\\s\\S]*?used_at/i);
  });

  it('le parcours étudiant confirme la présence puis ouvre la tentative autorisée', () => {
    assert.match(studentView, /const retryAuthorized = isRetryAuthorizedParticipant\\(activeLaunch\\.participant\\.presence_status\\)/);
    assert.match(studentView, /confirmQuizPresence\\(activeLaunch\\.launch\\.id\\)/);
    assert.match(studentView, /retryAuthorized: retryAuthorized/);
    assert.match(studentView, /startQuizSession\\(quiz, false, presenceInitialization\\.retryAuthorized === true\\)/);
    assert.match(studentView, /isRetryAttempt\\s*\\n?\\s*\\)/);
    assert.match(studentView, /isRetryAttempt\\s*\\n?\\s*\\)/);
  });
});

describe('Parcours étudiant — inscription après le lancement', () => {
  it('rattache à la volée un nouvel inscrit approuvé ayant une inscription active dans une classe du quiz', () => {
    const activeLaunch = participantMigration.match(
      /CREATE OR REPLACE FUNCTION public\\.get_student_active_launch\\([\\s\\S]*?\\$function\\$;/
    )?.[0] || '';
    assert.match(activeLaunch, /JOIN public\\.class_enrollments ce ON ce\\.student_id = s\\.id/);
    assert.match(activeLaunch, /s\\.validation_status = 'approved'/);
    assert.match(activeLaunch, /ce\\.status = 'active'/);
    assert.match(activeLaunch, /ce\\.class_id::text = ANY\\([\\s\\S]*?v_quiz\\.class_ids/);
    assert.match(activeLaunch, /INSERT INTO public\\.quiz_participants AS existing_participant/);
    assert.match(activeLaunch, /CASE WHEN v_has_retry THEN 'retry_authorized' ELSE 'pending' END/);
    assert.match(activeLaunch, /ON CONFLICT \\(quiz_id, student_id\\)/);
  });

  it('ne donne pas accès à un élève non approuvé, suspendu, désinscrit ou hors classe', () => {
    const activeLaunch = participantMigration.match(
      /CREATE OR REPLACE FUNCTION public\\.get_student_active_launch\\([\\s\\S]*?\\$function\\$;/
    )?.[0] || '';
    assert.match(activeLaunch, /s\\.validation_status = 'approved'/);
    assert.match(activeLaunch, /ce\\.status = 'active'/);
    assert.match(activeLaunch, /IF v_class_id IS NULL THEN\\s+RETURN '\\{\\}'::jsonb/);
  });

  it('ne réinitialise pas une ancienne tentative sans autorisation valide', () => {
    const activeLaunch = participantMigration.match(
      /CREATE OR REPLACE FUNCTION public\\.get_student_active_launch\\([\\s\\S]*?\\$function\\$;/
    )?.[0] || '';
    assert.match(activeLaunch, /v_has_history/);
    assert.match(activeLaunch, /v_has_terminal_participation/);
    assert.match(activeLaunch, /IF v_has_retry OR \\(NOT v_has_history AND NOT v_has_terminal_participation\\) THEN/);
    assert.match(activeLaunch, /presence_status IN \\('absent', 'completed', 'timeout'\\)/);
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
    assert.match(studentView, /question\\.type === 'qcm'/);
    assert.match(studentView, /question\\.type === 'text'/);
    assert.match(studentView, /question\\.type === 'reorder'/);
    assert.match(studentView, /question\\.type === 'verbes_trous'/);
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
    const question = questions[1];
    const answer = JSON.stringify(['vado', 'errato', 'parlano']);
    assert.deepEqual(parseStudentAnswers(answer, 3), ['vado', 'errato', 'parlano']);
    const score = calculateQuestionPointsEarned(question, answer);
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
    const result = markBestQuizAttempt([
      { id: 'attempt-1', attempt_number: 1, score_20: 9 },
      { id: 'attempt-2', attempt_number: 2, score_20: 17 },
      { id: 'attempt-3', attempt_number: 3, score_20: 12 }
    ]);
    assert.equal(result.length, 3);
    assert.equal(result.filter(row => row.is_counted).length, 1);
    assert.equal(result.find(row => row.is_counted)?.id, 'attempt-2');
  });

  it('calcule le numéro de tentative par couple quiz/élève et ne réutilise pas les anciennes réponses', () => {
    assert.match(submissionMigration, /a\\.quiz_id = q\\.id AND a\\.student_id = sid/);
    assert.match(submissionMigration, /s\\.quiz_id = q\\.id AND s\\.student_id = sid/);
    assert.match(submissionMigration, /AND attempt_number = attempt_no/);
    assert.match(submissionMigration, /WHERE id = submission_id AND quiz_id = q\\.id AND student_id = sid/);
  });

  it('refuse les doubles soumissions côté interface et corrige les quiz officiels côté serveur', () => {
    assert.match(studentView, /if \\(quizSubmissionLockRef\\.current\\) return/);
    assert.match(studentView, /supabaseService\\.evaluateQuizQuestion\\(activeQuiz\\.id, currentQ\\.id, studentAns\\)/);
    assert.match(studentView, /dataService\\.submitQuiz\\([\\s\\S]*?isRetryAttempt/);
    assert.match(submissionMigration, /public\\.quiz_grade_all\\(q\\.id, coalesce\\(saved_answers/);
  });

  it('ne consomme pas une autorisation si la confirmation de présence est seule effectuée', () => {
    const confirmation = QUIZ_INDIVIDUAL_RETRY_MIGRATION_SQL.match(
      /CREATE OR REPLACE FUNCTION public\\.confirm_quiz_presence\\([\\s\\S]*?\\$\\$;/
    )?.[0] || '';
    assert.doesNotMatch(confirmation, /UPDATE public\\.quiz_retry_grants[\\s\\S]*?used_at/i);
  });
});
