# Déploiement — présence et tentatives de quiz

Dans Supabase, ouvrir **SQL Editor → New query**, coller le contenu complet de `database/migration_quiz_presence_attempts.sql`, puis cliquer sur **Run**.

La migration est additive. Elle crée `quiz_launches`, `quiz_participants`, `quiz_retry_grants` et `quiz_attempts`, ajoute `quizzes.attendance_mode` et installe les RPC de lancement, confirmation de présence, clôture et seconde chance.

Avant l’exécution, vérifier que le schéma de production correspond au schéma versionné et effectuer une sauvegarde. Ne pas exécuter `database/schema.sql` sur une base existante : ce fichier contient des instructions destructives. Ne pas exécuter non plus l’ancien script `migration_atomic_quiz_close.sql` pour ce nouveau parcours, car son RPC de relance supprime les anciennes lignes `missed`.

Si la migration de présence avait déjà été exécutée avant l'ajout de `launched_by`, exécuter aussi `supabase/migrations/20261110010000_add_quiz_launches_launched_by.sql` dans le SQL Editor. Cette migration ajoute la colonne manquante sans modifier les lancements existants. Après exécution, vérifier dans Supabase que le cache PostgREST a été rechargé et tester avec un quiz privé de préproduction. Les quiz historiques et les quiz publics restent en mode `legacy`; les nouveaux quiz privés sauvegardés par l’application utilisent `strict_presence`.

## Vérification rapide

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
