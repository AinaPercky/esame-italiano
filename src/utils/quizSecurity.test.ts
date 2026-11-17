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
    assert.ok(importSection.includes('if (!isTeacher && isSupabaseMissingRpcError(errQ))'));
    assert.ok(importSection.includes('if (isTeacher && orphanedStudentIds.length > 0)'));
  });

  it('évite de charger les datasets professeur pendant une session élève', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/supabaseService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const importSectionStart = source.indexOf('public async importFromSupabase()');
    assert.notEqual(importSectionStart, -1);
    const importSection = source.slice(importSectionStart);

    assert.ok(importSection.includes('const isStudentSession = isAuthenticated && !isTeacher;'));
    assert.ok(importSection.includes("isStudentSession ? emptyRows : client.from('exams')"));
    assert.ok(importSection.includes("isStudentSession ? emptyRows : client.from('exam_rubrics')"));
    assert.ok(importSection.includes("isStudentSession ? emptyRows : client.from('evaluations')"));
    assert.ok(importSection.includes("isStudentSession ? emptyRows : client.from('evaluation_details')"));
    assert.ok(importSection.includes("isStudentSession ? emptyRows : client.from('exam_pass_order')"));
    assert.ok(importSection.includes('const classLeaderboardRequest = isAuthenticated && !isTeacher'));
  });

  it('limite les colonnes téléchargées pendant l’import Supabase', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/supabaseService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const importSectionStart = source.indexOf('public async importFromSupabase()');
    assert.notEqual(importSectionStart, -1);
    const importSection = source.slice(importSectionStart);

    const requiredProjections = [
      "from('classes').select('id,name,enrollment_mode,archived_at,created_at')",
      "from('students').select('id,class_id,first_name,last_name,email,student_number,avatar_url,validation_status,created_at,updated_at')",
      "from('exams').select('id,class_id,title,description,level,exam_date,status,created_at')",
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
