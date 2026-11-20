# Enrichissement des quiz existants — PR #155

## Résultat vérifié sur Supabase

Projet : `italian_exam`  
Date : 20 novembre 2026

- 52 quiz présents dans `public.quizzes`.
- 1 001 questions au total.
- 1 001 questions possèdent maintenant `competency` et `skill_code`.
- 0 question n'a reçu automatiquement de `error_categories` ou `error_category_map`.
- Les statuts des quiz ne sont pas modifiés.

## Méthode

La migration `20261120160000_enrich_existing_quiz_diagnostic_metadata.sql` ajoute uniquement les deux métadonnées de compétence absentes, en fonction du titre du quiz, de sa catégorie et d'indices pédagogiques présents dans l'énoncé ou l'explication.

Les champs existants sont conservés. La mise à jour ne réécrit ni l'énoncé, ni les options, ni le corrigé, ni les points, ni les limites de temps. Les propriétés déjà présentes sont conservées.

Les codes sont stables et partagés par les questions évaluant une même compétence. Pour les quiz « Passato prossimo », des règles distinguent notamment le choix de l'auxiliaire, les participes, les verbes réfléchis et l'accord avec les pronoms.

## Limite volontaire : catégories d'erreurs

Aucune cause d'erreur n'est déduite automatiquement. Les propriétés `error_categories` et `error_category_map` restent absentes partout après cet enrichissement. Un enseignant doit identifier et valider les erreurs typiques avant que le tableau de bord puisse compter ces catégories.

Les questions à réponse libre ne sont pas artificiellement classées à partir d'une réponse erronée quelconque.

## Portée

Cette opération concerne uniquement les quiz existants. Les exercices ne sont pas modifiés par cette migration. Les tentatives et soumissions historiques ne sont ni recalculées ni enrichies rétroactivement.

## Vérification SQL

Le contrôle post-mise-à-jour a confirmé :
- `quiz_count = 52`
- `question_count = 1001`
- `fully_tagged_questions = 1001`
- `questions_with_error_metadata = 0`
- `launched_quizzes = 4`

Les quatre quiz lancés ont reçu uniquement des métadonnées JSON supplémentaires ; leur statut n'a pas changé.
