# Rapport QA — refonte du générateur PDF

## Périmètre

Le contrôle porte sur le générateur `src/utils/lessonPdf.ts` et le PDF de démonstration `docs/lesson-pdf-demo.pdf`.

## Résultats fonctionnels

- Les blocs `dialogue` et `discovery` restent disponibles pour la leçon interactive mais sont exclus de l’export PDF.
- Les blocs sont réordonnés selon une structure éditoriale : vocabulaire, grammaire et formules, tableaux, règles particulières, exemples, conseils, synthèse.
- Les titres de sections sont numérotés.
- Les exemples bilingues utilisent deux colonnes : italien à gauche, français à droite.
- Les tableaux ont des en-têtes bleu profond, du texte blanc, des filets fins et des lignes alternées discrètes.
- Les encadrés Objectif, Conseil, Attention, Exception et À retenir possèdent des styles distincts.
- La pagination affiche le titre courant et `Page X sur Y`.
- Le PDF de démonstration est au format A4 et comporte deux pages.

## Vérifications effectuées

```text
npm run lint                                  PASS
npx tsx --test src/utils/lessonPdf.test.ts    PASS — 3 tests
npm run build                                 PASS
pdfinfo docs/lesson-pdf-demo.pdf              PASS — A4, 2 pages
pdftotext                                    PASS — rubriques interactives absentes
pdffonts                                     PASS — export lisible
Inspection visuelle des 2 pages              PASS — aucun chevauchement détecté
```

## Limites connues

Le moteur `jsPDF` utilisé par l’application ne produit pas encore de PDF balisé (`Tagged: no`) avec une arborescence complète de lecture pour les lecteurs d’écran. La langue `fr-FR`, les métadonnées et les polices Noto Sans sont préparées côté export navigateur, mais une migration vers un moteur de composition produisant des balises PDF serait nécessaire pour une accessibilité PDF complète (PDF/UA).

Le PDF de démonstration généré dans l’environnement Node utilise les polices PDF standard du moteur. Dans l’application navigateur, les fichiers `public/fonts/NotoSans-Regular.ttf` et `public/fonts/NotoSans-Bold.ttf` sont chargés et intégrés lorsque les ressources statiques sont disponibles.
