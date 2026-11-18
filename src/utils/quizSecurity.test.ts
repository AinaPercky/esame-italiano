import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { QUIZ_SECURITY_MIGRATION_SQL } from '../data/quizSecurityMigration';
import { isSupabaseMissingRpcError } from '../services/supabaseService';

describe('détection des RPC Supabase absentes (PGRST202 / 42883)', () => {
  it('détecte get_student_quiz_catalog et get_public_quiz_catalog absentes du cache de schéma', () => {
    assert.equal(
      isSupabaseMissingRpcError({
        code: 'PGRST202',
        message: 'Could not find the function public.get_student_quiz_catalog without parameters in the schema cache'
      }),
      true
    );

    assert.equal(
      isSupabaseMissingRpcError(
        {
          message: 'Could not find the function public.get_public_quiz_catalog without parameters in the schema cache'
        },
        'get_public_quiz_catalog'
      ),
      true
    );

    assert.equal(
      isSupabaseMissingRpcError(
        {
          code: '42883',
          message: 'function public.quiz_is_teacher() does not exist'
        },
        'quiz_is_teacher'
      ),
      true
    );
  });

  it('filtre par nom de RPC lorsqu’un rpcName est précisé et ignore les autres erreurs', () => {
    assert.equal(
      isSupabaseMissingRpcError(
        {
          code: 'PGRST202',
          message: 'Could not find the function public.get_student_quiz_catalog without parameters in the schema cache'
        },
        'get_public_quiz_catalog'
      ),
      false
    );

    assert.equal(
      isSupabaseMissingRpcError({
        code: '42501',
        message: 'new row violates row-level security policy for table "quizzes"'
      }),
      false
    );

    assert.equal(
      isSupabaseMissingRpcError({
        message: 'Failed to fetch'
      }),
      false
    );

    assert.equal(isSupabaseMissingRpcError(null), false);
    assert.equal(isSupabaseMissingRpcError(undefined), false);
  });
});

describe('migration SQL de sécurité et correction serveur des quiz', () => {
  it('contient toutes les fonctions RPC, sécurités RLS et le rechargement PostgREST', () => {
    const requiredSnippets = [
      'CREATE OR REPLACE FUNCTION public.quiz_is_teacher()',
      'CREATE OR REPLACE FUNCTION public.quiz_current_student_id()',
      'CREATE OR REPLACE FUNCTION public.quiz_norm_answer(',
      'CREATE OR REPLACE FUNCTION public.quiz_text_matches(',
      'CREATE OR REPLACE FUNCTION public.quiz_sanitize_questions(',
      "'blank_count'",
      'CREATE OR REPLACE FUNCTION public.get_public_quiz_catalog()',
      'CREATE OR REPLACE FUNCTION public.get_public_quiz(',
      'CREATE OR REPLACE FUNCTION public.get_student_quiz_catalog()',
      'CREATE OR REPLACE FUNCTION public.evaluate_public_quiz_question(',
      'CREATE OR REPLACE FUNCTION public.evaluate_quiz_question(',
      'CREATE OR REPLACE FUNCTION public.submit_quiz_submission(',
      'CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(',
      'class_enrollments',
      'quizzes_teacher_manage',
      'GRANT EXECUTE ON FUNCTION public.quiz_is_teacher() TO authenticated;',
      'GRANT EXECUTE ON FUNCTION public.get_public_quiz_catalog() TO anon, authenticated;',
      'GRANT EXECUTE ON FUNCTION public.get_student_quiz_catalog() TO authenticated;',
      "NOTIFY pgrst, 'reload schema';"
    ];

    for (const snippet of requiredSnippets) {
      assert.ok(
        QUIZ_SECURITY_MIGRATION_SQL.includes(snippet),
        `La migration SQL doit contenir : ${snippet}`
      );
    }
  });

  it('reste strictement synchronisée entre le fichier SQL et la constante TypeScript', () => {
    const sqlPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261120000000_quiz_server_side_grading_security.sql'
    );
    const sqlFromFile = fs.readFileSync(sqlPath, 'utf8').trim();
    assert.equal(sqlFromFile, QUIZ_SECURITY_MIGRATION_SQL.trim());
  });

  it('ne contourne jamais la RLS sur quizzes pour les sessions non-professeur', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/supabaseService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const importSectionStart = source.indexOf('public async importFromSupabase()');
    assert.notEqual(importSectionStart, -1);
    const importSection = source.slice(importSectionStart);

    // La table brute quizzes doit être interrogée une seule fois et uniquement pour le professeur.
    const quizTableSelectMatches = importSection.match(/from\('quizzes'\)\.select\(/g) || [];
    assert.equal(quizTableSelectMatches.length, 1);
    assert.ok(importSection.includes("client.from('quizzes').select('id,public_id,is_public,attendance_mode,class_id,class_ids,category,level,title,description,created_at,duration_minutes,status,launched_at,expires_at,questions,total_points')"));
    assert.ok(importSection.includes('if (!isTeacher && (isSupabaseMissingRpcError(errQ) || noStudentContextError(errQ)))'));
    assert.ok(importSection.includes('if (isTeacher && orphanedStudentIds.length > 0)'));
  });

  it('évite de charger les datasets professeur pendant une session élève', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/supabaseService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const importSectionStart = source.indexOf('public async importFromSupabase()');
    assert.notEqual(importSectionStart, -1);
    const importSection = source.slice(importSectionStart);

    assert.ok(importSection.includes('const isStudentSession = isAuthenticated && !isTeacher;'));
    // Chaque dataset doit être ignoré pour un élève et un client anonyme,
    // et chargé avec une projection explicite uniquement pour un professeur authentifié.
    const protectedDatasets = [
      ['exams', 'examsRequest'],
      ['exam_rubrics', 'rubricsRequest'],
      ['evaluations', 'evaluationsRequest'],
      ['evaluation_details', 'detailsRequest'],
      ['exam_pass_order', 'passOrderRequest']
    ] as const;

    for (const [table, requestName] of protectedDatasets) {
      const requestPattern = new RegExp(
        String.raw`const ${requestName} = isStudentSession \? emptyRows : isAuthenticated \? client\.from\('${table}'\)\.select\('[^']+'\) : emptyRows;`
      );
      assert.match(
        importSection,
        requestPattern,
        `${table} doit être chargé uniquement pour un professeur authentifié`
      );
    }
    assert.ok(importSection.includes('const classLeaderboardRequest = isAuthenticated && !isTeacher'));
  });

  it('charge un roster élève minimal et limité aux classes actives', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/supabaseService.ts');
    const service = fs.readFileSync(servicePath, 'utf8');
    const importStart = service.indexOf('public async importFromSupabase()');
    assert.notEqual(importStart, -1);
    const importSection = service.slice(importStart);

    assert.ok(importSection.includes("client.rpc('get_student_class_roster')"));
    // Le profil personnel est lu sous RLS avec une projection limitée ;
    // le répertoire des camarades passe par une RPC séparée et minimisée.
    assert.ok(importSection.includes("client.from('students').select('id,class_id,first_name,last_name,gender,email,student_number,avatar_url,validation_status,created_at,updated_at')"));
    assert.ok(importSection.includes("const studentsRequest = isTeacher"));
    assert.ok(importSection.includes("const classRosterRequest = isAuthenticated && !isTeacher"));
    assert.ok(importSection.includes("email: ''"));
    assert.ok(importSection.includes("class_ids: Array.isArray(s.class_ids)"));

    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261117130000_student_class_roster_rpc.sql'
    );
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const requiredSql = [
      'CREATE OR REPLACE FUNCTION public.get_student_class_roster()',
      'IF auth.uid() IS NULL THEN',
      'IF public.quiz_is_teacher() THEN',
      'v_student_id := public.quiz_current_student_id();',
      "ce.status = 'active'",
      "coalesce(s.validation_status, 'approved') = 'approved'",
      'AS class_ids(class_id)',
      'class_ids.class_id = ANY(coalesce(memberships.class_ids, ARRAY[]::text[]))',
      "CASE WHEN s.id::text = v_student_id THEN s.email ELSE '' END",
      'REVOKE ALL ON FUNCTION public.get_student_class_roster() FROM PUBLIC, anon;',
      'GRANT EXECUTE ON FUNCTION public.get_student_class_roster() TO authenticated;'
    ];
    for (const snippet of requiredSql) {
      assert.ok(migration.includes(snippet), `SQL du roster incomplet : ${snippet}`);
    }
  });

  it('optimise le classement élève sans changer son périmètre de sécurité', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261117140000_optimize_class_quiz_leaderboard.sql'
    );
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const requiredSql = [
      'CREATE INDEX IF NOT EXISTS idx_quiz_submissions_leaderboard',
      'WHERE is_counted = TRUE',
      'CREATE OR REPLACE FUNCTION public.get_class_quiz_leaderboard()',
      'WITH eligible_memberships AS',
      'JOIN eligible_memberships member',
      'SELECT DISTINCT ON (candidate.quiz_id, candidate.student_id, candidate.class_id)',
      "CASE WHEN candidate.status = 'missed' THEN 1 ELSE 0 END ASC",
      'candidate.submitted_at DESC NULLS LAST',
      'candidate.attempt_number DESC',
      'REVOKE ALL ON FUNCTION public.get_class_quiz_leaderboard() FROM PUBLIC, anon;',
      'GRANT EXECUTE ON FUNCTION public.get_class_quiz_leaderboard() TO authenticated;'
    ];
    for (const snippet of requiredSql) {
      assert.ok(migration.includes(snippet), `Optimisation classement incomplète : ${snippet}`);
    }
    assert.ok(!migration.includes('JOIN LATERAL'));
    assert.ok(migration.includes('AND (sub.class_id IS NULL OR sub.class_id = member.class_id)'));
    assert.ok(migration.includes("coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id])"));
  });

  it('limite les colonnes téléchargées pendant l’import Supabase', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/supabaseService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const importSectionStart = source.indexOf('public async importFromSupabase()');
    assert.notEqual(importSectionStart, -1);
    const importSection = source.slice(importSectionStart);

    const requiredProjections = [
      "from('classes').select('id,name,enrollment_mode,archived_at,created_at')",
      "from('students').select('id,class_id,first_name,last_name,gender,email,student_number,avatar_url,validation_status,created_at,updated_at')",
      "from('exams').select('id,class_id,title,description,level,exam_date,duration_seconds,status,created_at')",
      "from('exam_rubrics').select('id,exam_id,title,question,example_sentence,points,position')",
      "from('evaluations').select('id,exam_id,student_id,total_score,status,max_duration_seconds,duration_used_seconds,timer_status,created_at,updated_at')",
      "from('evaluation_details').select('evaluation_id,rubric_id,is_validated,awarded_points,error_note')",
      "from('exam_pass_order').select('id,exam_id,student_id,position,status,created_at')",
      "from('quiz_submissions').select('id,quiz_id,quiz_title,student_id,student_name,student_number,class_id,class_name,started_at,submitted_at,answers,score,max_score,score_20,status,feedback,date,attempt_number,launch_id,attendance_status,retry_grant_id,is_counted')"
    ];

    for (const projection of requiredProjections) {
      assert.ok(importSection.includes(projection), `Projection manquante : ${projection}`);
    }
  });
});

describe('non-régression des parcours de quiz publics et authentifiés', () => {
  const servicePath = path.resolve(process.cwd(), 'src/services/supabaseService.ts');
  const publicViewPath = path.resolve(process.cwd(), 'src/views/PublicQuizView.tsx');
  const rpcMigrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261117180000_restrict_anonymous_security_definer_rpcs.sql'
  );
  const rpcTestPath = path.resolve(
    process.cwd(),
    'supabase/tests/security_definer_rpc_grants.sql'
  );

  const serviceSource = fs.readFileSync(servicePath, 'utf8');
  const publicViewSource = fs.readFileSync(publicViewPath, 'utf8');
  const rpcMigration = fs.readFileSync(rpcMigrationPath, 'utf8');
  const rpcTests = fs.readFileSync(rpcTestPath, 'utf8');

  it('conserve les trois RPC strictement nécessaires au quiz public', () => {
    for (const signature of [
      'public.get_public_quiz_catalog()',
      'public.get_public_quiz(text)',
      'public.evaluate_public_quiz_question(text,text,text)'
    ]) {
      assert.ok(rpcMigration.includes(`'${signature}'`), `RPC publique absente de la liste blanche : ${signature}`);
    }

    assert.ok(serviceSource.includes("client.rpc('get_public_quiz_catalog'"));
    assert.ok(serviceSource.includes("client.rpc('get_public_quiz'"));
    assert.ok(serviceSource.includes("client.rpc('evaluate_public_quiz_question'"));
  });

  it('préserve les RPC publiques d’inscription et de rapport QR avec des signatures exactes', () => {
    for (const signature of [
      'public.prepare_student_registration(text,text,text,text,uuid,text)',
      'public.get_public_oral_report(uuid,uuid,text)'
    ]) {
      assert.ok(rpcMigration.includes(`'${signature}'`), `RPC publique absente de la liste blanche : ${signature}`);
      assert.ok(rpcTests.includes(signature), `Test SQL absent pour : ${signature}`);
    }
  });

  it('ne fait pas enregistrer de soumission nominative depuis le parcours de quiz public', () => {
    assert.ok(publicViewSource.includes('supabaseService.fetchPublicQuiz'));
    assert.ok(publicViewSource.includes('supabaseService.evaluatePublicQuizQuestion'));
    assert.doesNotMatch(publicViewSource, /submitQuizSubmissionAtomically|submitQuizPresenceSubmission|saveQuizSubmission/);
    assert.doesNotMatch(
      rpcMigration,
      /'public\.submit_quiz_submission\(jsonb\)'/
    );
  });

  it('préserve les soumissions de quiz des élèves authentifiés', () => {
    assert.ok(serviceSource.includes("client.rpc('submit_quiz_submission'"));
    assert.ok(serviceSource.includes("client.rpc('submit_quiz_presence_submission'"));
    assert.match(rpcTests, /Authenticated students cannot submit standard quiz results/);
    assert.match(rpcTests, /Authenticated students cannot submit attendance-controlled quiz results/);
  });

  it('interdit les soumissions anonymes avec un student_id fourni par le navigateur', () => {
    assert.match(rpcTests, /Anonymous users can submit quiz results using a caller-supplied student ID/);
    assert.match(rpcTests, /has_function_privilege\('anon', 'public\.submit_quiz_submission\(jsonb\)', 'EXECUTE'\)/);
  });
});
