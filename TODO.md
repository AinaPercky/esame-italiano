# Correctifs des sujets d’examen écrits — état

## Résultats implémentés dans la branche

- [x] En cas d’absence du RPC `save_written_exam_question_time_limits`, diagnostiquer `PGRST202`, indiquer la migration précise, signaler que le brouillon a été enregistré avant l’échec et expliquer comment le réenregistrer après réparation.
- [x] Assigner un sujet à une ou plusieurs classes avec des cases adaptées au mobile; une nouvelle affectation s’applique à la nouvelle version, sans déplacer les anciennes tentatives de leur classe/version.
- [x] Mettre à jour les modèles L135 et A1 pour la compréhension écrite, accepter des réponses en phrase complète et enregistrer des variantes correctes; les réponses longues ambiguës restent corrigées manuellement.
- [x] Fournir dans l’administration la remise à zéro explicite de toutes les tentatives d’un sujet clôturé (`closed` ou `grading` en attente de correction), avec suppression en cascade des réponses, notes, résultats et journaux, mais conservation du sujet, des versions et des classes.
- [x] Valider les changements localement : 84 tests réussis, typage TypeScript, build Vite et `git diff --check`.

## Reste à faire dans le projet Supabase / l’application déployée

- [ ] Appliquer les migrations en attente, notamment `20261110000000_written_exam_question_timers.sql` et `20261112000000_reset_written_exam_attempts.sql`.
- [ ] Sur chacun des deux sujets existants (L135 puis A1), clôturer le sujet, confirmer la suppression des tentatives, puis ouvrir « Modifier / version », appliquer le modèle mis à jour, choisir une ou plusieurs classes et publier la nouvelle version.
- [ ] Vérifier avec un compte élève de test qu’il voit le sujet dans sa classe et qu’une réponse complète correcte est acceptée.

Aucune migration ni suppression n’a été exécutée sur la base Supabase partagée depuis cette branche.
