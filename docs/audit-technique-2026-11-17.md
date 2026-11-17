# Audit technique PerckyLingua — 17 novembre 2026

## Périmètre et limites

- Dépôt : `AinaPercky/esame-italiano`, branche `main`, commit audité `c1c72b27`.
- Base Supabase active : projet `italian_exam`.
- Inspection du frontend React/TypeScript, des services Supabase, de l'API Express, des migrations, des politiques RLS, des privilèges SQL, des fonctions RPC, des journaux et des workflows GitHub Actions.
- Audit réalisé en lecture seule sur la base de production. Aucune donnée ni structure de production n'a été modifiée pendant cet audit.
- Pas de test de charge exécuté sur la production. Les conclusions de capacité à 100 élèves sont donc des risques techniques identifiés dans le code et les verrous SQL, pas une mesure de débit ou de latence réelle.

## Synthèse

L'application dispose déjà de plusieurs protections utiles : correction des quiz côté serveur, catalogue étudiant/public filtré, résultats agrégés pour le classement de classe, contraintes d'unicité et tests de régression. Cependant, ces protections coexistent avec des accès historiques trop larges et des chemins de traitement qui sérialisent les opérations d'un même quiz.

Les priorités sont :
1. fermer les accès anonymes aux données scolaires et aux fonctions privilégiées ;
2. réorganiser le chargement des données par rôle sans casser l'inscription et les rapports QR ;
3. supprimer les verrous globaux et les appels de polling inutiles ;
4. réconcilier l'historique des migrations avant tout déploiement ;
5. ajouter des tests de charge et de reprise réseau après stabilisation.

## 1. Sécurité — priorité critique

### 1.1 Tables scolaires accessibles au rôle anon

Les politiques suivantes sont actives sur le schéma public :

- `Students full access`
- `Evaluations full access`
- `Evaluation details full access`
- `Exam pass order full access`
- `Exam rubrics full access`
- `Exams full access`

Elles utilisent `USING true` et/ou `WITH CHECK true`, avec le rôle `public`. Les privilèges SQL du rôle `anon` autorisent également SELECT, INSERT, UPDATE et DELETE sur ces tables.

Conséquence : un visiteur non connecté peut potentiellement lire, créer, modifier ou supprimer des fiches d'élèves, des notes, des détails d'évaluation, des examens, des grilles et des ordres de passage via l'API Supabase.

Le risque est aggravé par `importFromSupabase()` : le chargement initial exécute des lectures complètes de ces tables avant que l'utilisateur soit connecté.

### 1.2 Parcours qui dépendent encore de ces accès publics

Une suppression directe des politiques publiques casserait des parcours existants si elle n'est pas accompagnée d'une refonte :

- l'inscription recherche actuellement une fiche élève par e-mail dans le jeu de données chargé ;
- le tableau de bord professeur charge le registre complet ;
- le portail de rapport oral QR utilise directement les listes d'élèves, examens, grilles et évaluations ;
- le portail commun permet de rechercher un rapport par e-mail.

La correction doit donc remplacer ces lectures générales par des RPC ciblées : profil propre, répertoire de classe limité, inscription sécurisée et rapport public limité à un élève/examen. Il ne faut pas simplement révoquer les droits et laisser les écrans existants inchangés.

### 1.3 Fonctions SECURITY DEFINER accessibles anonymement

L'analyse des privilèges de la base a identifié 37 fonctions `SECURITY DEFINER` exécutables par `anon`. Plusieurs vérifient correctement le rôle à l'intérieur de leur corps, mais ces droits restent inutiles et trop larges.

Deux cas nécessitent une correction explicite :

- `written_exam_auto_question_score(uuid,jsonb)` lit une clé de réponse privée et renvoie un score sans contrôle d'identité ou de rôle. Un appelant anonyme peut s'en servir comme oracle de notation.
- `submit_quiz_submission(jsonb)` accepte un chemin anonyme dans lequel l'identifiant élève provient du payload. Cela permet de tenter de créer une soumission sous l'identité d'un autre élève.

Le fichier historique de notation révoque EXECUTE à `PUBLIC`, mais cela ne retire pas un droit accordé directement à `anon`. Le correctif de la PR #123 traite ce cas et ajoute un test de non-régression.

Les RPC suivantes doivent rester publiques pour les quiz publics : `get_public_quiz_catalog`, `get_public_quiz` et `evaluate_public_quiz_question`. Elles renvoient un contenu filtré et une correction sans exposer la réponse attendue avant validation.

### 1.4 Contrôle d'accès des élèves

`quiz_current_student_id()` vérifie la session authentifiée et associe l'e-mail à une fiche élève, mais ne vérifie pas lui-même que `validation_status = 'approved'`. Certains RPC de quiz s'appuient sur ce helper. Le contrôle d'approbation doit être garanti côté serveur, pas uniquement par l'écran de connexion.

Les contrôles professeur ne sont pas uniformes : le helper quiz repose sur une adresse e-mail codée en dur, tandis que le helper des examens écrits accepte aussi un rôle dans `app_metadata`. Ces règles doivent être harmonisées avant d'étendre les rôles enseignants.

### 1.5 API Express

Le middleware Express vérifie l'authentification Supabase, mais les routes élèves ne réalisent pas toutes une vérification de rôle professeur. Si cette API est déployée et exposée, les opérations de gestion du registre doivent être limitées aux professeurs côté serveur. Le mode de démonstration sans configuration Supabase doit également être interdit en production.

L'usage effectif de cette API par le frontend React principal reste à confirmer avant de la modifier.

## 2. Performance et concurrence

### 2.1 Verrous partagés au niveau du quiz

Les définitions SQL actuellement installées utilisent des verrous exclusifs sur les mêmes lignes pour des élèves différents :

- `confirm_quiz_presence` verrouille la ligne du quiz et celle du lancement avec `FOR UPDATE` ;
- `get_student_active_launch` verrouille la ligne du lancement avec `FOR UPDATE`, alors que plusieurs élèves doivent pouvoir consulter le même lancement simultanément ;
- `submit_quiz_presence_submission` verrouille la ligne du quiz, puis appelle une ancienne fonction qui verrouille à nouveau le quiz et le lancement ;
- `submit_quiz_submission` verrouille aussi la ligne du quiz avant d'appeler l'ancienne fonction de soumission, qui reprend le même verrou.

Conséquence : les confirmations de présence, consultations de lancement et soumissions d'un même quiz peuvent se mettre en file d'attente. C'est un risque structurel pour une classe de 100 élèves qui démarre ou termine au même moment.

La correction doit conserver l'atomicité, mais déplacer les verrous exclusifs au niveau de la participation/tentative de chaque élève. Les lignes quiz/lancement doivent être lues avec un verrou compatible avec plusieurs lecteurs lorsque cela suffit à empêcher une clôture concurrente.

### 2.2 Polling trop fréquent

Dans `StudentSpaceView`, les autorisations de seconde chance sont vérifiées toutes les 5 secondes pour chaque quiz non public présent dans la liste, y compris des quiz déjà soumis. Chaque vérification appelle `getStudentActiveLaunch`, qui verrouille la ligne du lancement.

Avec de nombreux élèves et plusieurs quiz, ce polling crée un volume important de RPC et accentue précisément le verrou partagé décrit plus haut. Il faut le limiter aux quiz pertinents, augmenter raisonnablement l'intervalle ou passer à une notification ciblée.

Le rafraîchissement local de l'écran toutes les 10 secondes n'est pas, à lui seul, une requête réseau ; le problème identifié concerne les RPC de vérification toutes les 5 secondes.

### 2.3 Correction des quiz publics

`PublicQuizView.handleSubmit()` parcourt les questions et appelle la correction serveur de manière séquentielle. Les questions déjà validées peuvent être corrigées une seconde fois au moment du résultat final.

Il faut conserver la correction immédiate, mais éviter la série de RPC séquentiels au rendu final. Une correction finale groupée côté serveur ou une réutilisation sûre des résultats enregistrés est préférable.

### 2.4 Chargement global

`importFromSupabase()` charge en parallèle les classes, élèves, examens, grilles, évaluations, détails, ordre de passage, quiz, soumissions et classements. Plusieurs requêtes lisent des tables entières, sans pagination dans ce flux.

Le chargement doit être séparé par rôle et par écran :
- anonyme : données publiques minimales ;
- élève : sa fiche, ses tentatives et les métadonnées limitées de sa classe ;
- professeur : données des classes qu'il gère, avec pagination pour l'historique.

Il faut également éviter de charger les réponses complètes des autres élèves pour construire un classement.

### 2.5 Index et statistiques

L'analyse Supabase signale notamment des clés étrangères sans index, des politiques permissives qui se chevauchent, des index inutilisés et un index redondant sur les participants de quiz.

Les compteurs PostgreSQL montrent beaucoup de scans séquentiels sur certaines petites tables, notamment les élèves. L'index e-mail existant utilise `lower(btrim(email))`, alors que plusieurs recherches utilisent `lower(email)` ou `ILIKE`. Les expressions de recherche et les index doivent être alignés après vérification des plans d'exécution.

Ces compteurs sont cumulatifs depuis le dernier reset des statistiques ; ils ne constituent pas une mesure de latence instantanée.

## 3. Inscription et rapports

### 3.1 Inscription avec confirmation e-mail

Dans le parcours actuel, si Supabase exige une confirmation e-mail et ne crée pas immédiatement de session, `LoginView` retourne avant l'appel qui crée la fiche élève. Pour un nouvel élève sans fiche préexistante, la confirmation peut donc aboutir à un compte Auth sans fiche `students`, ce qui empêche ensuite la connexion applicative.

La création ou la récupération sécurisée de la fiche doit être finalisée après confirmation, à partir de l'e-mail authentifié et des métadonnées d'inscription, avec un statut forcé à `pending`.

### 3.2 Rapport oral QR

Le rapport public utilise les données générales chargées dans `dataService`. Les QR individuels reposent sur l'identifiant élève dans l'URL ; le portail commun recherche par e-mail.

Il faut préserver ces usages, mais renvoyer uniquement les champs du rapport demandé via une RPC dédiée, sans exposer la table complète des élèves ni toutes les évaluations.

## 4. Reprise après coupure réseau

Le dépôt utilise du stockage local pour certains brouillons de réponses, mais l'audit n'a pas trouvé d'implémentation IndexedDB, de file d'opérations à synchroniser, de gestionnaire de reconnexion ou de service worker destiné à la reprise des sessions.

La conservation locale et la synchronisation automatique demandées pour les coupures Internet ne sont donc pas encore garanties. Cette évolution doit venir après la correction des accès et de la concurrence, avec une source de vérité serveur et des opérations idempotentes.

## 5. Migrations et déploiement — blocage avant production

- Le dépôt contient 45 fichiers dans `supabase/migrations`.
- La base active possède 46 entrées d'historique de migrations.
- Une seule version locale correspond exactement à une version distante.
- Il existe 4 préfixes de version dupliqués dans le dépôt : `20261110000000`, `20261111000000`, `20261113000000` et `20261115000000`.

L'historique local et l'historique distant ne sont donc pas reproductibles l'un à partir de l'autre dans leur état actuel. Un déploiement automatique de migrations peut appliquer des opérations déjà présentes, omettre des changements ou échouer sur les versions ambiguës.

Aucune migration ne doit être poussée en production avant une réconciliation explicite des versions locales et distantes et une répétition sur une base de test.

## 6. Tests et intégration continue

À la date de l'audit :

- `Quiz regression tests` réussit sur le commit audité `c1c72b27`.
- `Written exams CI` a réussi sur le commit précédent `5d9f3138`, pas sur le commit audité.
- Le workflow Selenium des examens écrits est `skipped` sur le commit audité.
- Aucun scénario k6 ou test de charge à 100 élèves n'a été trouvé.
- Aucun test automatisé de reprise hors ligne avec synchronisation n'a été trouvé.
- Le script nommé `lint` lance la vérification TypeScript ; il ne remplace pas un lint ESLint.

La CI de la PR #123 ajoute une vérification ciblée des droits d'exécution RPC.

## 7. Ordre de correction recommandé

### Phase A — Sécurité RPC

- Retirer les grants anonymes des fonctions privilégiées.
- Garder uniquement les RPC publiques réellement nécessaires.
- Ajouter les tests de droits d'exécution.
- Vérifier les droits de toutes les fonctions SECURITY DEFINER après migration.

### Phase B — RLS et données scolaires

- Séparer le chargement anonyme, élève et professeur.
- Remplacer la recherche publique de fiche élève par une inscription/association sécurisée.
- Créer une RPC de rapport oral QR limitée à un élève et un examen.
- Ajouter les politiques RLS professeur et élève propriétaire.
- Tester les accès anon, élève et professeur avant toute application en production.

### Phase C — Concurrence et requêtes

- Réduire les verrous exclusifs au niveau participant/tentative.
- Réduire le polling de seconde chance.
- Regrouper la correction finale des quiz publics.
- Aligner les index et les prédicats de recherche.

### Phase D — Migration et validation

- Réconcilier l'historique des migrations.
- Rejouer les migrations sur une base isolée.
- Tester 10, 25, 50, 100 puis 150/200 utilisateurs simultanés.
- Tester double soumission, coupure réseau, reconnexion, actualisation et seconde chance.
- Déployer progressivement après validation.

Aucune nouvelle fonctionnalité de session hors ligne ou d'architecture supplémentaire ne doit être construite avant la fin des phases A à D.
