# Tests des examens écrits

## Commandes

- `npm test` : lance toute la suite Node/tsx, y compris les tests unitaires existants, les tests de génération PDF et `src/services/writtenExamService.integration.test.ts`.
- `npm run lint` : vérifie les types TypeScript.
- `npm run build` : vérifie la compilation de production.

## Couverture automatisée

| Parcours | Fichier | Vérifications |
| --- | --- | --- |
| Canevas et règles métier | `src/utils/writtenExam.test.ts` | Création indépendante A1/L135, barèmes, durée, validation, ordre aléatoire, chronomètres |
| Service professeur/élève | `src/services/writtenExamService.integration.test.ts` | Sauvegarde du sujet, publication, liste des examens disponibles, démarrage, timer serveur, réponse/validation, remise, correction, publication des résultats, récupération des corrigés et erreurs serveur |
| Copie professeur | `src/components/WrittenExamCopy.test.ts` | Calculs et rendu de la copie corrigée |
| Copie étudiant | `src/components/WrittenExamStudentCopy.test.ts` | Génération d'un PDF non vide et conservation de la réponse originale |

Les tests du service utilisent un faux client Supabase RPC déterministe. Ils vérifient le contrat entre l'application et les fonctions RPC, l'ordre des appels et la propagation des erreurs. Ils ne remplacent pas un test réel des fonctions PostgreSQL, des politiques RLS, ni un test navigateur.

## Recette d'intégration réelle sur un projet Supabase de test

À exécuter uniquement sur un projet de staging isolé, avec deux comptes de test (un professeur et un élève approuvé) et une classe de test. Ne pas utiliser les données de production.

1. Appliquer toutes les migrations du dossier `supabase/migrations` au staging.
2. Avec le professeur, créer un sujet à partir du canevas A1, l'affecter à la classe de test et enregistrer comme brouillon.
3. Recharger l'application : le brouillon doit être retrouvé depuis Supabase, avec ses sections, questions, clés de correction, limites de temps et classe.
4. Publier le sujet. Vérifier qu'il est visible par l'élève affecté et absent pour un élève non affecté.
5. Démarrer avec l'élève : vérifier la création d'une seule tentative active, l'ordre de questions retourné par le serveur et l'initialisation du timer.
6. Répondre à plusieurs types de questions (QCM, texte à trous, réordonnement, verbes à trous). Valider une question : elle ne doit plus être accessible ensuite. Recharger la page et vérifier la reprise des réponses et du chronomètre.
7. Soumettre la copie. Vérifier côté professeur la présence de la tentative et les réponses enregistrées.
8. Corriger les réponses automatiques et une réponse à correction manuelle. Si le sujet prévoit une expression écrite, saisir sa note. Vérifier les totaux brut et normalisé ainsi que la note nulle si une tentative a été disqualifiée.
9. Publier les résultats. Avant publication, l'élève ne doit pas accéder au corrigé détaillé. Après publication, vérifier la note, chaque réponse, la réponse attendue, les points et les états correct/faux/absent/en attente.
10. Télécharger le PDF depuis le compte professeur puis depuis le compte élève. Ouvrir les deux fichiers et contrôler identité, sujet, réponses, corrigés et notes.
11. Vérifier les refus serveur : élève d'une autre classe, tentative expirée, réponse d'une question non active, publication avec correction manuelle ou expression écrite incomplète, et accès aux corrigés d'un autre élève.
12. Supprimer les données de test à la fin, sans toucher aux examens ni aux élèves réels.

## Limite actuelle

Le test d'intégration automatisé du service simule les réponses RPC : il n'ouvre pas de navigateur, ne se connecte pas à une vraie base de staging et ne prouve donc pas l'exécution réelle des migrations/RLS. La recette ci-dessus doit être exécutée sur un projet Supabase de test pour valider ces éléments de bout en bout.
