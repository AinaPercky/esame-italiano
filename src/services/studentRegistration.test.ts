import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('inscription étudiant — contrat frontend / RPC Supabase', () => {
  const service = read('src/services/supabaseService.ts');
  const auth = read('src/services/authService.ts');
  const migration = read('supabase/migrations/20261118070000_restore_student_registration_rpc.sql');

  it('appelle la RPC avec les six paramètres nommés et normalise l’e-mail', () => {
    const method = service.slice(
      service.indexOf('public async prepareStudentRegistration('),
      service.indexOf('public async updateOwnStudentProfile(')
    );
    assert.match(method, /client\.rpc\('prepare_student_registration'/);
    for (const key of ['p_first_name', 'p_last_name', 'p_gender', 'p_student_number', 'p_class_id', 'p_email']) {
      assert.ok(method.includes(key), `Paramètre RPC absent : ${key}`);
    }
    assert.match(method, /params\.email\.trim\(\)\.toLowerCase\(\)/);
    assert.match(method, /if \(!data\?\.id \|\| !data\?\.class_id\)/);
  });

  it('valide les champs avant toute requête Auth et Supabase', () => {
    const registration = auth.slice(
      auth.indexOf('async registerStudent('),
      auth.indexOf('updateStudentProfile(')
    );
    assert.ok(registration.indexOf('if (!firstName || !lastName)') < registration.indexOf('prepareStudentRegistration'));
    assert.ok(registration.indexOf('if (!classId)') < registration.indexOf('prepareStudentRegistration'));
    assert.ok(registration.indexOf('if (!isValidEmail(email))') < registration.indexOf('prepareStudentRegistration'));
    assert.ok(registration.indexOf('if (!password || password.length < 4)') < registration.indexOf('prepareStudentRegistration'));
  });

  it('respecte les deux parcours Auth : confirmation e-mail ou session immédiate', () => {
    const registration = auth.slice(
      auth.indexOf('async registerStudent('),
      auth.indexOf('updateStudentProfile(')
    );
    assert.match(registration, /prepareStudentRegistration\([\s\S]*?\);\s*const sessionCreated = await supabaseService\.registerStudentAuth/);
    assert.match(registration, /if \(!sessionCreated\)[\s\S]*?confirmationRequired: true/);
    assert.match(registration, /await supabaseService\.finalizeStudentRegistration\(\)/);
    assert.ok(registration.indexOf('if (!sessionCreated)') < registration.indexOf('finalizeStudentRegistration'));
  });

  it('versionne les deux RPC, les grants minimaux et le rechargement du cache', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prepare_student_registration\(/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.finalize_student_registration\(\)/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.prepare_student_registration\(text,text,text,text,uuid,text\) FROM PUBLIC/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.prepare_student_registration\(text,text,text,text,uuid,text\) TO anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.finalize_student_registration\(\) FROM PUBLIC, anon/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.finalize_student_registration\(\) TO authenticated/);
    assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
  });

  it('ne crée que des fiches en attente et contrôle la classe ainsi que les doublons', () => {
    assert.match(migration, /validation_status, created_at, updated_at/);
    assert.match(migration, /'pending', now\(\), now\(\)/);
    assert.match(migration, /c\.id = p_class_id AND c\.archived_at IS NULL/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /v_match_count > 1/);
    assert.match(migration, /Les informations ne correspondent pas au dossier scolaire/);
  });
});
