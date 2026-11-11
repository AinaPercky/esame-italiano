# Tests des examens écrits

## Commandes
- `npm test` : suite Node/tsx, y compris les tests unitaires, PDF et l'intégration du service.
- `npm run lint` : vérification TypeScript.
- `npm run build` : compilation de production.

## Couverture automatisée
- `src/utils/writtenExam.test.ts` : canevas A1/L135, barèmes, validation, ordre et chronomètres.
- `src/services/writtenExamService.integration.test.ts` : sauvegarde et publication professeur, examens disponibles, démarrage élève, timer serveur, réponse/validation, remise, correction, publication des résultats, lecture du corrigé et propagation des erreurs.
- `src/components/WrittenExamCopy.test.ts` : génération PDF professeur.
- `src/components/WrittenExamStudentCopy.test.ts` : génération PDF élève et conservation de la réponse originale.

Le test du service utilise un client Supabase RPC simulé. Il vérifie le contrat de service et les appels RPC, mais ne valide pas les fonctions PostgreSQL/RLS sur une base réelle et n'automatise pas le navigateur.

## Recette réelle sur Supabase staging
À faire exclusivement sur un projet isolé avec un compte professeur, un élève approuvé, un élève non affecté et une classe de test. Ne pas utiliser les données de production.

1. Appliquer toutes les migrations du dossier `supabase/migrations`.
2. Créer un examen A1 depuis le compte professeur, l'affecter à la classe et l'enregistrer en brouillon.
3. Recharger : le brouillon, sections, questions, corrigés, minuteries et affectations doivent être restaurés depuis Supabase.
4. Publier : l'élève affecté voit le sujet, l'élève non affecté ne le voit pas.
5. Démarrer côté élève : vérifier la tentative, l'ordre aléatoire et le timer serveur.
6. Tester QCM, texte à trous, réordonnement et verbes à trous. Valider une question, puis vérifier qu'il est impossible d'y revenir. Recharger et contrôler la reprise des réponses et du temps.
7. Remettre la copie et vérifier les réponses dans le compte professeur.
8. Corriger automatiquement et manuellement, saisir la note d'expression écrite si elle existe et contrôler les notes brutes/normalisées et la disqualification éventuelle.
9. Avant publication, vérifier que le corrigé est inaccessible à l'élève. Après publication, contrôler réponses, réponses attendues, points, statuts et note.
10. Télécharger les PDF professeur et élève et vérifier leur contenu.
11. Tester les refus : élève non affecté, réponse après expiration, question inactive, publication incomplète et accès au corrigé d'un autre élève.
12. Supprimer uniquement les données de test.

Cette recette de staging est nécessaire pour certifier les migrations, les fonctions SQL, les politiques RLS et le parcours navigateur réel.
