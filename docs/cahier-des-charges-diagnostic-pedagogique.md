# Cahier des charges — Diagnostic pédagogique par compétence

## 1. Contexte et objectif

PerckyLingua doit permettre à l'enseignant de comprendre non seulement le score obtenu par un élève, mais aussi les compétences évaluées, les questions qui posent difficulté et les catégories d'erreurs réellement documentées.

La fonctionnalité concerne les modules **Quiz** et **Exercices**. Elle doit rester compatible avec les contenus existants et ne jamais inventer une cause d'erreur.

## 2. Périmètre fonctionnel

### 2.1 Métadonnées pédagogiques d'une question

Chaque question peut porter les propriétés facultatives suivantes :

| Propriété | Type | Rôle |
|---|---|---|
| `competency` | string | Nom lisible de la compétence évaluée |
| `skill_code` | string | Identifiant stable pour regrouper une compétence malgré les variations de libellé |
| `error_categories` | string[] | Liste blanche des catégories d'erreurs autorisées pour cette question |
| `error_category_map` | Record<string, string> | Association d'une réponse/d'un distracteur à une catégorie déclarée |

Exemple :

```json
{
  "competency": "Choix de l’auxiliaire",
  "skill_code": "PASSATO_PROSSIMO_AUX",
  "error_categories": ["Confusion essere/avere"],
  "error_category_map": {
    "avere": "Confusion essere/avere"
  }
}
```

Ces propriétés sont facultatives. Leur absence ne doit pas invalider une question ni empêcher un quiz ou un exercice de fonctionner.

### 2.2 Règles d'interprétation

1. Une compétence est regroupée par `skill_code` lorsqu'il est présent ; sinon, le libellé `competency` sert de regroupement.
2. Une question sans compétence est affichée sous le libellé **« Compétence à renseigner »**.
3. Une catégorie d'erreur n'est comptabilisée que si elle figure dans `error_categories`.
4. Une réponse n'est associée à une cause que si elle possède une correspondance explicite dans `error_category_map` et que cette catégorie est déclarée dans `error_categories`.
5. Une réponse inconnue, un mapping absent ou une catégorie non déclarée reste non catégorisé.
6. Le système ne déduit jamais une cause psychologique, grammaticale ou pédagogique à partir d'une réponse incorrecte.
7. Les questions sans métadonnées restent analysables au niveau des réponses, du taux de réussite et des points, mais pas au niveau d'une compétence ou d'une cause d'erreur non renseignée.

## 3. Exigences — Module Quiz

### 3.1 Création et édition

L'éditeur de questions permet à l'enseignant de renseigner :
- la compétence ;
- le code stable de compétence ;
- les catégories d'erreurs, sous forme de liste ;
- le mapping réponse → catégorie, avec validation JSON.

Les quatre propriétés doivent être conservées lors de l'enregistrement, de l'export et de l'import JSON. Une propriété absente dans un ancien quiz doit rester absente, sans valeur inventée.

### 3.2 Analyse des résultats

Le tableau de bord enseignant doit pouvoir présenter :
- le nombre de réponses analysées par compétence ;
- le taux de maîtrise par compétence ;
- le détail par question ;
- les catégories d'erreurs explicitement renseignées ;
- le nombre d'occurrences de chaque catégorie ;
- les élèves ou tentatives nécessitant un accompagnement, selon le seuil de maîtrise configuré.

Les calculs s'appuient sur les réponses et les points enregistrés. Une cause d'erreur n'est jamais affichée si elle n'est pas documentée dans le JSON de la question.

### 3.3 Fidélité de la version évaluée

Pour les quiz privés utilisant le parcours de présence stricte :
- PostgreSQL capture les questions lors de la création du lancement ;
- cette copie reste inchangée si l'enseignant modifie ensuite le quiz ;
- le parcours étudiant reçoit une projection sans corrigés ;
- la correction serveur et le diagnostic enseignant utilisent la copie complète du lancement ;
- une seconde chance rattachée au même lancement conserve la même version des questions.

Pour les lancements stricts déjà actifs au moment du déploiement et dépourvus de snapshot, le parcours étudiant utilise un fallback assaini sur la version actuelle du quiz.

Pour le parcours public/legacy sans ligne de lancement suivie, la soumission utilise les questions présentes en base au moment de la soumission. Le navigateur ne peut pas imposer son propre snapshot. La garantie stricte « version exacte au lancement » est donc limitée au parcours de présence stricte.

## 4. Exigences — Module Exercices

Les questions d'exercices peuvent utiliser les mêmes quatre propriétés pédagogiques dans le JSON de l'exercice.

Le diagnostic existant doit :
- regrouper les questions par version d'exercice et identifiant de question ;
- utiliser les questions et détails conservés dans les tentatives ;
- calculer les résultats par compétence et par question ;
- compter uniquement les catégories explicitement autorisées ;
- afficher « Compétence à renseigner » en l'absence de compétence ;
- conserver le comportement historique pour les exercices sans métadonnées.

Les tentatives historiques ne doivent pas être artificiellement enrichies avec des compétences ou des causes qui n'étaient pas connues au moment de leur création.

## 5. Modèle de données et persistance

### 5.1 Quiz

Deux snapshots JSONB nullable sont utilisés :

- `quiz_launches.questions_snapshot` : copie serveur des questions avec leurs corrigés, capturée au lancement ;
- `quiz_submissions.questions_snapshot` : copie associée à la soumission, utilisée pour reconstruire le contexte pédagogique de la tentative.

La soumission conserve également son `launch_id` lorsqu'elle appartient à un lancement suivi.

### 5.2 Compatibilité historique

- Les colonnes sont ajoutées de façon additive et nullable.
- Aucune ligne historique n'est backfillée.
- Les anciennes soumissions gardent `questions_snapshot = NULL`.
- Le tableau de bord doit continuer à fonctionner avec les soumissions historiques en utilisant le quiz courant comme fallback lorsqu'aucun snapshot n'existe.
- Les anciens JSON restent valides.

### 5.3 Sécurité

Les snapshots complets contiennent des corrigés et des mappings réservés à l'enseignant :
- les élèves ne peuvent pas lire directement les colonnes de snapshot ;
- les élèves reçoivent une projection assainie des questions ;
- la fonction d'assainissement retire notamment `correct_answer`, `answers`, `explanation`, les données de correction de phrases et `error_category_map` ;
- l'enseignant récupère les soumissions complètes via la RPC `get_teacher_quiz_submissions`, qui vérifie son rôle ;
- les élèves gardent l'accès aux seules colonnes nécessaires à leurs propres résultats.

Le serveur ne fait pas confiance à un snapshot envoyé par le navigateur : il privilégie celui du lancement. Hors lancement suivi, il reprend les questions depuis la base.

## 6. Performance et expérience utilisateur

- La capture consiste en une copie JSONB par lancement, pas en une requête par question.
- La soumission associe le snapshot existant au lieu de reconstruire les questions côté client.
- Le rendu et la navigation des questions restent côté client.
- Aucun changement n'est apporté au chronomètre, aux règles de navigation ou à la logique de présence.
- Les tableaux de bord effectuent leurs regroupements à partir des données déjà chargées ; aucun appel réseau supplémentaire par question n'est requis.

Le surcoût attendu est proportionnel à la taille du JSON des questions et au nombre de lancements. Il doit être surveillé sur les gros quiz, mais ne change pas le nombre de requêtes pendant la réponse aux questions.

## 7. Migration et déploiement

Migration concernée :

`supabase/migrations/20261120150000_add_quiz_submission_questions_snapshot.sql`

Elle doit être appliquée après revue et validation :
1. vérifier que la base cible possède les tables et fonctions prérequises ;
2. appliquer la migration dans un environnement de test ;
3. vérifier les privilèges et projections élèves/professeur ;
4. vérifier le lancement, la modification du quiz en cours de tentative et la soumission ;
5. appliquer en production pendant une période sans quiz actif, après accord explicite.

**La migration n'a pas été appliquée à la base Supabase de production dans le cadre de cette PR.**

## 8. Plan de tests et critères d'acceptation

### Tests automatisés
- import/export des métadonnées de question ;
- calculs par compétence et par question ;
- comptage exclusif des catégories déclarées ;
- absence d'inférence de cause d'erreur ;
- compatibilité des questions sans métadonnées ;
- capture serveur au lancement ;
- modification du quiz après lancement sans altération du snapshot ;
- correction serveur depuis le snapshot ;
- seconde chance sur le même lancement ;
- fallback pour un lancement actif antérieur à la migration ;
- absence de backfill des soumissions historiques ;
- refus de lecture directe des snapshots complets par les élèves ;
- masquage des corrigés et de `error_category_map` dans les projections élèves ;
- accès aux snapshots complets réservé au professeur.

### Critères d'acceptation
La fonctionnalité est acceptable lorsque :
1. l'enseignant peut définir les métadonnées sans casser les anciens quiz ;
2. les résultats sont regroupés par compétence et par question ;
3. seules les causes explicitement documentées sont comptées ;
4. une modification du quiz après lancement ne change pas la référence de correction du parcours présence stricte ;
5. les élèves ne peuvent pas récupérer les corrigés ni les mappings privés ;
6. les données historiques restent intactes ;
7. les tests unitaires, TypeScript et PostgreSQL passent.

## 9. Hors périmètre

- Génération automatique de compétences ou de causes d'erreurs par IA.
- Inférence de profils psychologiques ou de difficultés non documentées.
- Reconstitution artificielle des snapshots historiques.
- Modification des règles de chronométrage, de navigation ou de présence.
- Garantie de snapshot au lancement pour le parcours public/legacy non suivi dans cette version.
