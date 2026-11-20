# Optimisation des quiz et exercices — soumission groupée

## Objectif

Réduire les allers-retours Supabase pendant une session élève, particulièrement lors des démarrages simultanés, sans exposer les réponses attendues au navigateur et sans modifier les règles métier de seconde chance des quiz officiels.

## Comportement cible

### Quiz officiels (élèves authentifiés)

- Les réponses restent dans l'état local et sont sauvegardées dans IndexedDB pendant la session.
- Le navigateur ne demande plus la correction question par question.
- À la fin, le service existant submitQuiz envoie toutes les réponses à submit_quiz_submission ou submit_quiz_presence_submission.
- PostgreSQL recalcule les points et le feedback à partir de la version privée du quiz, puis conserve les historiques, tentatives, notes et états de seconde chance.
- Le mode tutoriel reste corrigé localement et conserve son feedback immédiat.

### Quiz publics

- Le navigateur garde les réponses en local dans IndexedDB et ne demande aucune correction intermédiaire.
- La nouvelle RPC evaluate_public_quiz_answers(text,jsonb) corrige toutes les questions dans une seule transaction.
- Elle retourne le score et le feedback détaillé sans enregistrer d'identité ni de soumission nominative.
- La fonction n'accepte que les quiz publics et reste exécutable par anon et authenticated, explicitement et sans privilège PUBLIC.

### Exercices

- start_exercise_attempt_batch(uuid) crée une tentative avec l'ordre des questions et des options figé côté serveur, puis renvoie le paquet complet de questions nettoyées.
- Le navigateur conserve chaque réponse et l'index courant localement (IndexedDB), y compris pendant la saisie.
- Le passage d'une question à l'autre ne déclenche plus de RPC.
- submit_exercise_attempt_batch(uuid,jsonb) corrige toutes les réponses côté serveur, écrit les lignes de détail, calcule le score et clôt la tentative dans une transaction.
- get_exercise_attempt_bundle(uuid) permet la reprise d'une tentative groupée après rechargement. Les tentatives anciennes continuent d'utiliser les RPC historiques.
- Les corrigés et explications ne sont renvoyés qu'après la remise, via le détail de tentative.

## Temps et intégrité

Les exercices groupés utilisent un calendrier de questions calculé depuis exercise_attempts.started_at et la somme des durées configurées, comme le parcours des examens écrits. Le serveur calcule les échéances cumulées depuis le début de la tentative. Les réponses saisies sont corrigées à la remise finale ; une question laissée vide après son échéance reçoit zéro point et le statut timeout. La navigation locale n'effectue pas d'appel de progression par question. Les horloges du navigateur ne déterminent jamais le score.

Les quiz officiels gardent leurs contrôles de lancement, présence, participant, seconde chance, idempotence et unicité dans les RPC de soumission existantes. Aucun changement n'est apporté aux politiques de retry ou au verrouillage des quiz.

## Impact attendu sur les requêtes

| Parcours | Avant | Après |
|---|---:|---:|
| Quiz officiel standard | Jusqu'à 1 correction RPC par question + soumission finale | 1 soumission finale |
| Quiz public | 1 RPC par question à la validation + nouvelle boucle de correction finale | 1 RPC de correction finale |
| Exercice | Démarrage + 1 soumission et 1 avance par question | 1 démarrage, 0 RPC intermédiaire, 1 soumission finale |

Les compteurs et timers React restent locaux ; ils ne génèrent pas de requête Supabase périodique.

## Modifications base de données

- 20261120190000_batch_public_quiz_grading.sql
- 20261120200000_batch_exercise_attempts.sql (ajoute exercise_attempts.batch_mode et trois RPC sécurisées, plus un helper privé de nettoyage)
- mise à jour de la liste blanche des RPC publiques et du test de privilèges.

Les migrations doivent être appliquées dans l'ordre avant le déploiement du frontend. Elles ne sont pas exécutées automatiquement sur la base de production par cette PR.

## Tests prévus / garde-fous

- Tests unitaires TypeScript de l'absence de correction intermédiaire et de la persistance locale.
- Tests SQL d'isolation élève/professeur, d'absence de fuite de corrigé, de remise idempotente et de relecture des corrections.
- Type-check, suite npm test, build Vite et CI PostgreSQL via les workflows du dépôt.