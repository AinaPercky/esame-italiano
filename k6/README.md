# Test de charge k6 — 100 élèves sur un même quiz PerckyLingua

Le script appelle les mêmes endpoints/RPC que l'espace élève :
1. Auth Supabase Password Grant.
2. `get_student_quiz_catalog`.
3. `get_student_active_launch`.
4. `confirm_quiz_presence`.
5. `submit_quiz_presence_submission`.

Il cible un **quiz officiel déjà lancé en présence stricte** (`attendance_mode = strict_presence`). Il ne lance/clôt pas le quiz, ne crée aucun compte et ne modifie pas le schéma.

## Prérequis et sécurité

- Utilisez de préférence un projet Supabase de staging.
- Créez un quiz dédié, déjà lancé par le professeur.
- Créez 100 comptes élèves de test, approuvés et inscrits dans la classe concernée.
- Les 100 élèves doivent figurer dans les participants du lancement actif.
- Préparez un jeu de réponses de test adapté aux IDs/types des questions.

**Ne lancez pas le test sur un quiz réel avec vos élèves.** Le mode réel confirme les présences et crée 100 tentatives qui apparaîtront dans PerckyLingua et peuvent verrouiller les participations. Utilisez des comptes et un quiz jetables.

Copiez :
- `students.example.json` vers `students.json` et ajoutez 100 comptes différents.
- `answers.example.json` vers `answers.json` et remplacez les IDs d'exemple par les IDs réels.

Les deux fichiers contenant des mots de passe/réponses sont ignorés par Git. Ne les committez pas. N'utilisez jamais la clé Supabase `service_role` : seule la clé publique anon/publishable est nécessaire.

## 1. Dry-run (sans soumission)

Dans PowerShell, depuis ce dossier :

```powershell
$env:SUPABASE_URL="https://VOTRE-PROJET.supabase.co"
$env:SUPABASE_ANON_KEY="VOTRE_CLE_ANON_OU_PUBLISHABLE"
$env:QUIZ_ID="ID_DU_QUIZ"
$env:VUS="100"
$env:DRY_RUN="true"
k6 run .\quiz-100-students.js
```

Le dry-run connecte les 100 comptes, lit le catalogue et vérifie leur inscription au lancement. Il ne confirme aucune présence et ne crée aucune tentative. Ne passez au test réel que si les 100 VU réussissent.

## 2. Test réel

```powershell
$env:DRY_RUN="false"
$env:THINK_SECONDS="5"
k6 run .\quiz-100-students.js
```

Les 100 VU commencent en parallèle. Chacun confirme sa présence, attend son délai individuel d'initialisation, simule 5 secondes de réflexion par question sans générer d'appels réseau artificiels, puis envoie une seule soumission groupée. PostgreSQL recalcule la note avec le corrigé privé.

## Variables

| Variable | Défaut | Description |
|---|---:|---|
| `SUPABASE_URL` | — | URL Supabase |
| `SUPABASE_ANON_KEY` | — | Clé publique anon/publishable |
| `QUIZ_ID` | — | ID du quiz officiel |
| `VUS` | 100 | Nombre d'élèves simultanés (1–100) |
| `DRY_RUN` | true | true = lecture seule après connexion |
| `THINK_SECONDS` | 5 | Temps simulé par question |
| `REQUEST_TIMEOUT` | 60s | Timeout HTTP |

## Mesures à observer

- `http_req_failed`, `http_req_duration`
- `student_login_duration`
- `quiz_rpc_duration`
- `quiz_submission_duration`
- `quiz_submission_success`
- `students_quiz_started` et `students_quiz_submitted`

Les seuils inclus sont des garde-fous initiaux, pas une certification de capacité. Pendant le test, surveillez dans Supabase Dashboard le CPU, la mémoire, les connexions, les I/O, les erreurs Auth/PostgREST et les limites de débit.

**Point d'architecture important :** les RPC de confirmation et de remise verrouillent des lignes partagées du quiz/lancement. Les 100 élèves peuvent donc arriver simultanément côté HTTP mais certaines transactions PostgreSQL peuvent être sérialisées. C'est précisément un des comportements que ce test doit mesurer.

## Limites

- Test backend/API direct, pas test du navigateur, du rendu React ou du réseau mobile.
- Ce script ne couvre pas les quiz publics ni les quiz historiques en mode `legacy`.
- Si le test est interrompu après la confirmation de présence, vérifiez les participations/tentatives de test avant toute relance.
