# PerckyLingua — revue UI/UX

Date : 2026-11-19  
Périmètre : application React/TypeScript, espace enseignant et espace étudiant.  
Méthode : revue statique du dépôt GitHub (README, shell `App.tsx`, `Header`, `Sidebar`, `MobileBottomNav`, `DashboardView`, `StudentSpaceView`, `OralEvaluationView`, styles globaux). Aucun navigateur ni environnement Supabase de test n'a été exécuté ; les constats visuels en runtime restent à confirmer.

## Synthèse exécutive

PerckyLingua dispose déjà d'une base UI cohérente : palette bleu nuit/vert, composants React réutilisés, navigation par rôle, vues métier dédiées et attention réelle au mobile. Le principal problème structurel est la dispersion de la navigation, surtout sur mobile, tandis que le tableau de bord enseignant met fortement en avant le parcours d'examen oral sans offrir la même lisibilité aux autres activités pédagogiques du produit.

## Points à préserver

- Identité bleu profond, bleu clair et vert, adaptée à un outil pédagogique.
- Séparation nette des espaces professeur et étudiant.
- Actions métier concrètes sur le dashboard (ordre de passage, évaluation, résultats).
- Navigation accessible nommée, boutons natifs et plusieurs états de focus visibles dans les styles.
- Composants d'évaluation et de quiz spécialisés plutôt qu'une interface générique.

## Scorecard (0–4)

| Dimension | Score | Motif |
|---|---:|---|
| Clarté du produit | 3 | Le rôle professeur/étudiant est identifiable ; la promesse globale pourrait mieux couvrir cours, exercices, quiz et examens. |
| Hiérarchie et composition | 2 | Le dashboard est clair mais fortement centré sur l'examen oral ; navigation répétée dans plusieurs zones. |
| Parcours et feedback | 2 | Les actions principales existent ; la densité des entrées et leur duplication augmentent le coût de repérage. |
| Typographie et lisibilité | 2 | Plusieurs libellés mobiles sont rendus en 8–10 px ; lisibilité fragile sur petits écrans. |
| Cohérence visuelle | 3 | Palette cohérente, mais CSS global très étendu et styles isolés de modules à surveiller. |
| Responsive | 2 | Des adaptations mobiles sont présentes ; la densité des navigations et les très petites étiquettes méritent un test réel. |
| Accessibilité | 2 | Des labels et focus sont présents ; taille des cibles, ordre de tabulation et lecteurs d'écran non vérifiés. |
| États et données réelles | 2 | État d'erreur de connexion prévu ; couverture visuelle complète des états vides/chargement/permission non vérifiée. |
| Crédibilité métier | 3 | Les écrans et actions correspondent à de vrais processus d'enseignement et d'évaluation. |

## Constats et recommandations

| ID | Sévérité | Zone / preuve | Comportement actuel | Correction proposée | Impact |
|---|---|---|---|---|---|
| UX-01 | HIGH | Navigation enseignant : `src/components/Header.tsx`, `src/components/Sidebar.tsx`, `src/components/MobileBottomNav.tsx`, montage dans `src/App.tsx` | Le même espace propose une barre horizontale mobile avec de nombreux liens, un menu mobile, une sidebar desktop et une barre inférieure à 8 entrées. Les destinations ne sont pas toutes identiques entre ces systèmes. | Définir une seule architecture par breakpoint : desktop = sidebar + barre supérieure réduite ; mobile = barre inférieure limitée à 4–5 destinations prioritaires et menu « Plus » pour le reste. Supprimer les voies redondantes. | Réduit la surcharge, les hésitations et les incohérences de navigation. |
| UX-02 | HIGH | Navigation étudiant : `src/views/StudentSpaceView.tsx` et règles mobiles de `src/index.css` | Sept onglets sont forcés sur une grille de sept colonnes sur téléphone ; les libellés courts et les tailles d'icônes descendent jusqu'à 7–10 px selon la largeur. | Utiliser 4 onglets principaux maximum (Accueil/Apprendre/Évaluations/Progression) et un menu « Plus » ; conserver les libellés complets dans les vues secondaires. Prévoir une taille de texte confortable et des zones tactiles d'au moins 44 px pour les actions fréquentes. | Améliore la lisibilité, la précision tactile et la découvrabilité des modules. |
| UX-03 | MEDIUM | Dashboard : `src/views/DashboardView.tsx` | Le hero et ses trois actions guident surtout vers ordre de passage → évaluation orale → résultats, alors que l'application comprend aussi quiz, exercices, leçons et examens écrits. | Faire du dashboard un véritable centre d'activité : prochaine action recommandée, examens/quiz en cours, inscriptions à valider et raccourcis regroupés par tâche. Garder le parcours oral comme un bloc prioritaire lorsqu'un examen est sélectionné, pas comme unique récit du produit. | Rend la valeur globale de PerckyLingua plus visible et réduit les clics vers les autres modules. |
| UX-04 | MEDIUM | Sidebar : `src/components/Sidebar.tsx` | L'en-tête affiche en dur « Session Italienne 2026 » et un statut « Actif », qui peuvent devenir obsolètes ou donner une information non liée à l'état réel. | Retirer la session codée en dur ou la lire depuis une configuration réelle ; ne montrer un statut que s'il reflète une vérification effective et datée. | Évite une information trompeuse et les corrections annuelles manuelles. |
| UX-05 | MEDIUM | Styles : `src/index.css` | La feuille globale contient des règles très larges ciblant des classes Tailwind par sélecteurs d'attributs, ainsi que de longues sections spécifiques aux modules. | À terme, extraire des composants/tokens sémantiques (surface, texte, bordure, action, état) et limiter les styles aux scopes de chaque module. Éviter de modifier indirectement toutes les cartes ou tous les champs par sélecteurs globaux. | Réduit les régressions visuelles et rend les évolutions plus prévisibles. |
| UX-06 | LOW | `src/components/Header.tsx`, `src/components/MobileBottomNav.tsx`, `src/views/StudentSpaceView.tsx` | Les styles prévoient certains focus, mais le parcours complet au clavier, le focus du menu mobile et les annonces d'état ne sont pas démontrés par la revue statique. | Vérifier ouverture/fermeture du menu, échappement, restitution du focus, état actif annoncé, focus visible, zoom 200 % et reflow à 320 px. Corriger uniquement les défauts observés. | Renforce l'accessibilité sans ajouter d'ARIA inutile. |

## Plan priorisé

### Maintenant
1. Unifier les systèmes de navigation enseignant et étudiant, avec une stratégie mobile simple.
2. Revoir la grille d'onglets étudiant et les tailles de texte/touch targets.
3. Retirer ou rendre dynamique le libellé de session codé en dur.

### Ensuite
4. Recomposer le dashboard autour des activités réelles (cours, exercices, quiz, examens) et des actions à traiter.
5. Introduire progressivement des tokens UI et composants partagés pour les cartes, champs, badges et états.

### Plus tard
6. Vérifier les états de chargement, vide, erreur, permissions et données longues sur chaque vue principale.
7. Réaliser une passe clavier/lecteur d'écran et des captures comparatives aux largeurs 320, 390, 768 et 1440 px.

## Vérification et limites

- Effectué : lecture statique des fichiers listés dans le périmètre et comparaison des structures de navigation.
- Non effectué : démarrage Vite, capture navigateur, tests tactiles sur appareil, navigation clavier, lecteur d'écran, zoom 200 %, vérification de contraste calculée, données Supabase réelles.
- Les sévérités HIGH reflètent le risque UX structurel visible dans le code, pas une preuve de blocage fonctionnel ; à confirmer sur appareils réels avant de traiter comme défaut d'accessibilité.
- Aucune modification des fichiers applicatifs n'a été effectuée dans cette revue.

## Verdict

**Needs changes** — les fondations sont solides, mais la navigation mobile et la hiérarchie globale méritent une refonte ciblée avant d'ajouter davantage de modules.
