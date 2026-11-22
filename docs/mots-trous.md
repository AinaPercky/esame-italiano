# Mots à trous avec banque (`mots_trous`)

Le type `mots_trous` permet de compléter plusieurs phrases à trou en choisissant par **glisser-déposer** (ou sélection tactile / clavier) le mot approprié depuis une banque commune. Contrairement à `verbes_trous`, aucune saisie de conjugaison n’est demandée : l’élève associe directement chaque mot manquant à sa phrase.

## Création dans l'éditeur

Dans l'éditeur d'un **Quiz**, d'un **Exercice** ou d'un **Examen écrit**, choisir **Mots à trous avec banque** (`mots_trous`), puis renseigner :

- le titre et la consigne (facultatifs) ;
- les points par phrase (`points_par_phrase`, entier >= 1 ; `1` par défaut) ;
- la banque de mots (un mot par ligne, mots pièges autorisés) ;
- pour chaque phrase : `debut` (texte avant le trou), `fin` (texte après le trou) et `mot` (mot attendu parmi ceux de la banque).

Règles de validation :

- au moins une phrase ;
- `banque.length >= phrases.length` ;
- aucun mot vide ni doublon dans la banque ;
- aucun mot attendu répété entre deux phrases ;
- chaque mot attendu doit être présent dans `banque` ;
- le total `points` de la question est égal à `phrases.length × points_par_phrase` ;
- durée par défaut si `time_limit_seconds` est omis : **32 secondes**.

## Format JSON d'un quiz et d'un exercice

```json
{
  "type": "mots_trous",
  "question": "Complète les phrases avec les mots de la banque.",
  "points": 3,
  "time_limit_seconds": 32,
  "mots_trous": {
    "titre": "Al bar in Italia",
    "consigne": "Glisse chaque mot dans le trou de la phrase correspondante.",
    "points_par_phrase": 1,
    "banque": ["caffè", "cornetto", "succo", "tè", "acqua"],
    "phrases": [
      {
        "id": 1,
        "debut": "La mattina bevo un ",
        "fin": " caldo.",
        "mot": "caffè"
      },
      {
        "id": 2,
        "debut": "Mangio un ",
        "fin": " alla crema.",
        "mot": "cornetto"
      },
      {
        "id": 3,
        "debut": "Preferisco un ",
        "fin": " d'arancia.",
        "mot": "succo"
      }
    ]
  },
  "explanation": "caffè, cornetto e succo fanno parte della colazione."
}
```

Remarque sur l’import JSON : l’importateur accepte aussi le format aplati (`titre`, `consigne`, `points_par_phrase`, `banque`, `phrases` directement à la racine de la question) et le normalise automatiquement vers l’objet imbriqué `mots_trous`.

## Format JSON d'un examen composite

Dans `sections[].questions[]`, utiliser :

- `type: "mots_trous"`
- `prompt` : titre/énoncé affiché dans l'examen ;
- `points` : `phrases.length × points_par_phrase` ;
- `time_limit_seconds` : temps individuel en secondes (32 s par défaut) ;
- `mots_trous` : les champs publics `titre`, `consigne`, `points_par_phrase`, `banque`, et `phrases` avec uniquement `id`, `debut`, `fin` ;
- `answer_key.phrases` : les objets `{ "id": ..., "mot": "..." }` attendus.

```json
{
  "id": "mots_01",
  "type": "mots_trous",
  "prompt": "Al bar – completa le frasi",
  "points": 3,
  "time_limit_seconds": 32,
  "mots_trous": {
    "titre": "Al bar in Italia",
    "consigne": "Glisse chaque mot dans le trou de la phrase correspondante.",
    "points_par_phrase": 1,
    "banque": ["caffè", "cornetto", "succo", "acqua"],
    "phrases": [
      { "id": 1, "debut": "La mattina bevo un ", "fin": " caldo." },
      { "id": 2, "debut": "Mangio un ", "fin": " alla crema." },
      { "id": 3, "debut": "Preferisco un ", "fin": " d'arancia." }
    ]
  },
  "answer_key": {
    "phrases": [
      { "id": 1, "mot": "caffè" },
      { "id": 2, "mot": "cornetto" },
      { "id": 3, "mot": "succo" }
    ]
  }
}
```

Les données envoyées au navigateur de l’élève pendant l’épreuve (quiz, exercice ou examen écrit) ne contiennent jamais le champ `mot` ni `answer_key`.

## Format de réponse élève et barème

- La réponse sérialisée envoyée au serveur est un objet JSON indexé par l’identifiant de phrase : `{"1": "caffè", "2": "cornetto", "3": "succo"}`.
- Interactions disponibles :
  - glisser-déposer bureau (de la banque vers un trou, d’un trou vers un autre pour déplacer/échanger, ou du trou vers la banque pour retirer) ;
  - glisser-déposer tactile sur mobile ;
  - sélection en 2 gestes (toucher un mot ou un trou, puis toucher la cible) et navigation clavier (`Entrée`/`Espace` pour placer ou échanger, `Suppr`/`Retour arrière` pour retirer).
- Barème : chaque phrase exacte rapporte `points_par_phrase` point(s) (1 par défaut). Chaque mot ne peut compter qu’une seule fois et doit appartenir à la banque. La comparaison ignore la casse, les espaces superflus et les variantes d’apostrophes (`’` / `'`), tout en conservant les accents significatifs.
