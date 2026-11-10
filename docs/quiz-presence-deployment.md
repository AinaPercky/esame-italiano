# Déploiement — présence et tentatives de quiz

Dans Supabase, ouvrir **SQL Editor → New query**, coller le contenu complet de `database/migration_quiz_presence_attempts.sql`, puis cliquer sur **Run**.

La migration est additive. Elle crée `quiz_launches`, `quiz_participants`, `quiz_retry_grants` et `quiz_attempts`, ajoute `quizzes.attendance_mode` et installe les RPC de lancement, confirmation de présence, clôture et seconde chance.

Avant l’exécution, vérifier que le schéma de production correspond au schéma versionné et effectuer une sauvegarde. Ne pas exécuter `database/schema.sql` sur une base existante : ce fichier contient des instructions destructives. Ne pas exécuter non plus l’ancien script `migration_atomic_quiz_close.sql` pour ce nouveau parcours, car son RPC de relance supprime les anciennes lignes `missed`.

Si la migration de présence a déjà été exécutée, exécuter aussi `supabase/migrations/20261110010000_add_quiz_launches_launched_by.sql`, puis `supabase/migrations/20261110020000_reconcile_quiz_presence_schema.sql` dans le SQL Editor. La seconde migration réconcilie les anciens schémas divergents : elle ajoute notamment `launch_id` à `quiz_participants`, `quiz_attempts`, `quiz_retry_grants` et `quiz_submissions`, ainsi que les colonnes attendues par les RPC actuelles. Elle conserve les données historiques; les anciens participants dont le lancement ne peut pas être identifié gardent `launch_id = NULL`. Elle remplace aussi l'ancienne contrainte de statut de présence devenue trop restrictive. Après exécution, vérifier le schéma puis tester avec un quiz privé de préproduction. Les quiz historiques et les quiz publics restent en mode `legacy`; les nouveaux quiz privés sauvegardés par l’application utilisent `strict_presence`.

## Vérification rapide

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('quiz_launches', 'quiz_participants', 'quiz_retry_grants', 'quiz_attempts', 'quiz_submissions')
  and column_name in ('launched_by', 'launch_id', 'participant_id', 'presence_deadline_at', 'final_status', 'final_score')
order by table_name, column_name;
```


```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'quizzes'
  and column_name = 'attendance_mode';

select to_regclass('public.quiz_launches'),
       to_regclass('public.quiz_participants'),
       to_regclass('public.quiz_retry_grants'),
       to_regclass('public.quiz_attempts');
```

Les RPC sensibles exigent une session Supabase Auth authentifiée. Le droit professeur est vérifié côté SQL par comparaison de l’adresse e-mail du JWT avec l’adresse administrateur configurée dans l’application (`ainapercky@gmail.com`). Le contrôle ne dépend pas de `user_metadata` ni d’un `app_metadata.role` absent du flux de connexion actuel.
