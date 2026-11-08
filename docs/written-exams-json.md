# Créer un sujet d’examen écrit au format JSON / JSONC

Ce guide décrit le format accepté par l’importateur **Importer JSONC** de l’espace enseignant (Examens écrits). Il concerne les examens écrits composites, indépendants des quiz et des examens oraux.

- **JSON** : format standard, sans commentaires ni virgule finale.
- **JSONC** : même structure, avec commentaires `//` ou `/* ... */` et virgules finales autorisés par l’importateur.
- Le fichier doit être encodé en UTF-8 et porter l’extension `.json` ou `.jsonc`.
- L’import crée un **nouveau brouillon**. Il ne publie pas le sujet et ne remplace pas une version déjà publiée.

Les PDF peuvent servir de référence pédagogique, mais l’import PDF automatique n’est pas pris en charge. Il faut recopier le contenu dans le JSON ou le saisir dans l’éditeur. Un document support peut être fourni sous forme de texte ou de lien HTTP/HTTPS.

## 1. Structure générale

Un sujet contient des paramètres généraux, puis un tableau `sections`. Chaque section contient ses consignes et ses questions.

```json
{
  "title": "Verifica A1",
  "description": "Examen écrit de compréhension et de langue.",
  "level": "A1",
  "target_language": "it",
  "instruction_language": "fr",
  "duration_minutes": 120,
  "class_ids": ["UUID_REEL_DE_CLASSE"],
  "opens_at": null,
  "closes_at": null,
  "display_scale": 100,
  "max_attempts": 1,
  "shuffle_sections": true,
  "shuffle_questions": true,
  "shuffle_options": true,
  "navigation_mode": "sequential",
  "show_score_after_publish": true,
  "show_corrections_after_publish": false,
  "integrity_settings": {
    "fullscreen": false,
    "warn_on_tab_switch": true,
    "watermark": false
  },
  "sections": [
    {
      "id": "comprehension",
      "title": "Compréhension écrite",
      "instructions": "Leggi il testo e rispondi alle domande.",
      "category": "Compréhension",
      "group_name": "Partie 1 – Lecture",
      "points": 15,
      "shuffle": true,
      "fixed_position": false,
      "support_text": "Marco vive a Roma. Ha vent'anni.",
      "support_url": "",
      "questions": []
    }
  ]
}
```

## 2. Paramètres du sujet

| Champ | Type | Règle / rôle |
|---|---|---|
| `title` | chaîne | Obligatoire : titre du sujet. |
| `description` | chaîne | Description facultative. |
| `level` | chaîne | Niveau, par exemple `A1`, `A2`, `B1`. |
| `target_language` | chaîne | Langue évaluée ; `it` pour l’italien. |
| `instruction_language` | chaîne | Langue des consignes ; par exemple `fr`. |
| `duration_minutes` | entier | Obligatoire, strictement supérieur à zéro. |
| `class_ids` | tableau de chaînes | Identifiants réels des classes ciblées. Au moins une classe doit être sélectionnée avant l’enregistrement. |
| `opens_at` | chaîne ISO 8601 ou `null` | Date/heure d’ouverture, facultative. |
| `closes_at` | chaîne ISO 8601 ou `null` | Date/heure de fermeture, facultative et postérieure à l’ouverture. |
| `display_scale` | nombre ou `null` | Échelle de présentation facultative, par exemple `100`. `null` conserve la note brute. |
| `max_attempts` | entier | Nombre de tentatives, de 1 à 10. |
| `shuffle_sections` | booléen | Autorise le mélange des sections. |
| `shuffle_questions` | booléen | Conservé pour compatibilité JSON ; le mélange des questions est désormais obligatoire et propre à chaque tentative. |
| `shuffle_options` | booléen | Autorise le mélange des options et des éléments à réordonner. |
| `navigation_mode` | chaîne | Conservé pour compatibilité ; l’examen utilise désormais une progression séquentielle sans retour. |
| `show_score_after_publish` | booléen | Autorise l’affichage du score après publication des résultats. |
| `show_corrections_after_publish` | booléen | Autorise l’affichage des corrections après publication. |
| `integrity_settings` | objet | Paramètres de suivi décrits ci-dessous. |
| `sections` | tableau | Obligatoire : au moins une section contenant des questions. |

### Paramètres d’intégrité

- `fullscreen` : propose le mode plein écran.
- `warn_on_tab_switch` : journalise les changements d’onglet ou de focus.
- `watermark` : active le filigrane dissuasif.

Ces options ne remplacent pas une surveillance physique et ne garantissent pas à elles seules l’absence de fraude.

## 3. Structure d’une section

| Champ | Type | Règle / rôle |
|---|---|---|
| `id` | chaîne | Identifiant stable et unique dans le sujet. |
| `title` | chaîne | Obligatoire : titre de la section. |
| `instructions` | chaîne | Consignes facultatives. |
| `category` | chaîne | Catégorie libre, par exemple « Conjugaison ». |
| `group_name` | chaîne | Groupe facultatif pour regrouper visuellement plusieurs sections et les mélanger ensemble. |
| `points` | nombre | Plafond indicatif de la section ; `0` signifie sans plafond. |
| `shuffle` | booléen | Conservé pour compatibilité ; les questions sont mélangées automatiquement dans chaque section. |
| `fixed_position` | booléen | Si `true`, conserve la position de la section. |
| `support_text` | chaîne | Texte partagé par les questions de la section. |
| `support_url` | chaîne | Lien HTTP ou HTTPS vers un document externe. |
| `questions` | tableau | Obligatoire : au moins une question. |

Un même texte de compréhension peut être placé dans `support_text` plutôt que répété dans chaque énoncé. Le lien `support_url` est facultatif ; les fichiers locaux et les téléversements directs de PDF ne sont pas pris en charge par ce champ.

## 4. Les trois types de questions

Chaque question possède au minimum :

- `id` : identifiant stable et unique ;
- `type` : `qcm`, `text` ou `reorder` ;
- `prompt` : énoncé non vide ;
- `points` : nombre strictement supérieur à zéro ;
- `time_limit_seconds` : temps individuel en secondes (1 à 3600 ; 30 secondes par défaut si le champ est absent) ;
- `answer_key` : clé de correction, sauf question explicitement corrigée manuellement.

### Temps individuel et ordre anti-triche

Chaque question dispose de son propre compte à rebours via `time_limit_seconds`. À la fin du délai, la réponse déjà saisie est conservée et l’application passe automatiquement à la question suivante. Le chronomètre reprend au bon endroit si l’élève recharge la page ou reprend une tentative. La durée globale de l’examen reste une limite supérieure : si elle expire avant les chronomètres individuels, l’épreuve est remise.

L’ordre des questions est mélangé côté serveur à chaque tentative, indépendamment pour chaque élève. La progression est séquentielle : une seule question à la fois, sans retour en arrière ni accès direct à une autre question. Le corrigé n’est jamais envoyé pendant l’épreuve.

Exemple de question avec 12 secondes :

```json
{
  "id": "qcm_rapide",
  "type": "qcm",
  "prompt": "Scegli la risposta corretta.",
  "points": 1,
  "time_limit_seconds": 12,
  "options": [
    { "id": "a", "label": "Opzione A" },
    { "id": "b", "label": "Opzione B" }
  ],
  "answer_key": { "correctOptionId": "a" }
}
```

Lorsqu’un quiz est copié dans un examen, sa valeur `time_limit_seconds` est conservée. Si le quiz n’en définit pas, la valeur par défaut est de 30 secondes. Le professeur peut ensuite ajuster le temps de chaque question dans l’éditeur.

### 4.1. QCM et vrai/faux — `qcm`

Il faut au moins deux options. Chaque option possède un identifiant unique et un libellé. La bonne réponse est indiquée par l’identifiant de l’option, pas par son texte.

```json
{
  "id": "qcm_01",
  "type": "qcm",
  "prompt": "Marco vive a Roma. Vero o falso?",
  "points": 2,
  "options": [
    { "id": "vero", "label": "Vero" },
    { "id": "falso", "label": "Falso" }
  ],
  "answer_key": {
    "correctOptionId": "vero"
  },
  "explanation": "Il testo indica che Marco vive a Roma."
}
```

Champs supplémentaires :
- `options` : tableau d’objets `{ "id": "...", "label": "..." }`.
- `answer_key.correctOptionId` : identifiant d’une option existante.
- `explanation` : explication facultative, affichable avec la correction selon les paramètres de publication.

### 4.2. Réponse texte — `text`

À utiliser pour les réponses courtes, traductions, conjugaisons, articles, prépositions, possessifs, antonymes et phrases à compléter.

**Réponse courte avec variantes acceptées :**

```json
{
  "id": "text_01",
  "type": "text",
  "prompt": "Quanti anni ha Marco?",
  "points": 1,
  "answer_key": {
    "acceptedAnswers": ["venti", "20"]
  }
}
```

`acceptedAnswers` est une liste de réponses acceptées. Plusieurs variantes peuvent être proposées. La comparaison normalise notamment la casse et les espaces.

**Question à plusieurs trous :**

```json
{
  "id": "text_02",
  "type": "text",
  "prompt": "Completa: Io ___ italiano e ___ un libro.",
  "points": 2,
  "blank_count": 2,
  "answer_key": {
    "answers": [
      ["sono"],
      ["ho"]
    ]
  }
}
```

Règles des questions à trous :
- `blank_count` indique le nombre de trous et doit être un entier positif.
- `answer_key.answers` contient exactement une liste de réponses pour chaque trou.
- Chaque liste peut contenir plusieurs variantes acceptées : par exemple `["un'amica", "un’amica"]`.
- Respecter l’ordre des trous dans l’énoncé.

### 4.3. Remise en ordre — `reorder`

Chaque élément possède un identifiant. La correction donne la séquence des identifiants dans l’ordre attendu.

```json
{
  "id": "reorder_01",
  "type": "reorder",
  "prompt": "Rimetti le parole nella frase corretta.",
  "points": 2,
  "items": [
    { "id": "mot_1", "text": "Io" },
    { "id": "mot_2", "text": "studio" },
    { "id": "mot_3", "text": "italiano" }
  ],
  "answer_key": {
    "correctOrder": ["mot_1", "mot_2", "mot_3"]
  }
}
```

Règles :
- Il faut au moins deux éléments.
- Les identifiants des éléments doivent être uniques.
- `correctOrder` doit contenir tous les identifiants, une seule fois chacun.
- La notation est partielle selon les positions correctement placées.

## 5. Correction manuelle

Pour une réponse qui nécessite l’appréciation de l’enseignant (par exemple une réponse de compréhension rédigée en quelques mots), ajouter :

```json
{
  "id": "comprehension_01",
  "type": "text",
  "prompt": "Perché Marco prende l'autobus?",
  "points": 2,
  "manual_review": true,
  "answer_key": {}
}
```

Avec `manual_review: true`, la question est envoyée à la correction de l’enseignant. Il n’est pas nécessaire de fournir une réponse automatique dans `answer_key`. Prévoir un barème clair dans l’énoncé ou les consignes pour faciliter une correction cohérente.

**Sécurité :** les clés `answer_key` et les explications ne sont pas envoyées au navigateur de l’élève pendant l’épreuve. Elles sont conservées séparément côté base de données.

## 6. Réutiliser une question d’un quiz

L’interface enseignant permet de copier les questions d’un quiz existant dans une section. Le sujet conserve une copie du contenu, des options/éléments, du barème et des réponses attendues. Les champs facultatifs `source_quiz_id` et `source_question_id` peuvent servir de références ; ils ne sont pas nécessaires pour créer un sujet JSON. Une modification ultérieure du quiz source ne modifie pas la version déjà copiée dans le sujet.

## 7. Exemple complet minimal

Cet exemple peut être enregistré sous `examen-a1.json`. Remplacer `UUID_REEL_DE_CLASSE` par l’identifiant d’une classe existante avant l’enregistrement.

```json
{
  "title": "Mini-verifica A1",
  "description": "Exemple de sujet court.",
  "level": "A1",
  "target_language": "it",
  "instruction_language": "fr",
  "duration_minutes": 20,
  "class_ids": ["UUID_REEL_DE_CLASSE"],
  "opens_at": null,
  "closes_at": null,
  "display_scale": null,
  "max_attempts": 1,
  "shuffle_sections": false,
  "shuffle_questions": false,
  "shuffle_options": false,
  "navigation_mode": "free",
  "show_score_after_publish": true,
  "show_corrections_after_publish": false,
  "integrity_settings": {
    "fullscreen": false,
    "warn_on_tab_switch": true,
    "watermark": false
  },
  "sections": [
    {
      "id": "grammaire",
      "title": "Grammaire",
      "instructions": "Scegli la risposta corretta e completa la frase.",
      "category": "Grammaire",
      "group_name": "",
      "points": 3,
      "shuffle": false,
      "fixed_position": false,
      "support_text": "",
      "support_url": "",
      "questions": [
        {
          "id": "qcm_articolo",
          "type": "qcm",
          "prompt": "___ libro è interessante.",
          "points": 1,
          "options": [
            { "id": "il", "label": "il" },
            { "id": "la", "label": "la" },
            { "id": "lo", "label": "lo" }
          ],
          "answer_key": {
            "correctOptionId": "il"
          }
        },
        {
          "id": "text_verbo",
          "type": "text",
          "prompt": "Noi ___ (parlare) italiano.",
          "points": 1,
          "answer_key": {
            "acceptedAnswers": ["parliamo"]
          }
        },
        {
          "id": "reorder_frase",
          "type": "reorder",
          "prompt": "Rimetti la frase in ordine.",
          "points": 1,
          "items": [
            { "id": "a", "text": "italiano" },
            { "id": "b", "text": "Studio" },
            { "id": "c", "text": "io" }
          ],
          "answer_key": {
            "correctOrder": ["b", "c", "a"]
          }
        }
      ]
    }
  ]
}
```

## 8. Barème et calcul des points

- Le total brut du sujet est la somme des points des questions réellement présentes.
- Le champ `sections[].points` est un plafond indicatif. La valeur `0` signifie qu’aucun plafond n’est appliqué.
- Si le nombre de points des questions dépasse un plafond de section supérieur à zéro, la validation refuse le sujet.
- La note normalisée est facultative. Exemple : pour un total brut de 65 points et `display_scale: 100`, le résultat est ramené sur 100.
- Les questions corrigées manuellement sont évaluées par l’enseignant ; prévoir le temps nécessaire à cette correction.

## 9. Modèles fournis dans l’application

- **L135** : 90 points et 90 minutes. Le canevas comporte 20 points de compréhension écrite, 50 points de grammaire, 10 points de vocabulaire et 10 points de réordonnement. Le texte source et les questions de compréhension sont à compléter avant publication. La production écrite et la production orale ne font pas partie de ce module.
- **A1** : 65 points et 120 minutes, avec une échelle /100 facultative. Le modèle contient compréhension, grammaire, vocabulaire et phrases à compléter. Il n’inclut pas de production écrite longue ni d’expression orale.

Le total réel reste calculé à partir des questions présentes. Si vous supprimez ou ajoutez des questions, vérifiez à nouveau le barème et la durée.

## 10. Importer le fichier dans l’application

1. Ouvrir l’espace enseignant, puis **Examens écrits**.
2. Cliquer sur **Nouvel examen**.
3. Dans l’éditeur, cliquer sur **Importer / coller JSON** pour ouvrir la zone d’importation.
4. Pour importer un fichier, utiliser **Fichier JSON/JSONC** et sélectionner le fichier `.json` ou `.jsonc` ; pour coller le contenu, copier le texte JSON/JSONC depuis votre éditeur, le coller dans la grande zone de texte, puis cliquer sur **Charger le sujet**.
5. Consulter le **Guide rapide** affiché dans cette zone ou ouvrir le guide complet si nécessaire.
6. Vérifier le titre, le niveau, la durée, les classes et les dates.
7. Vérifier chaque section, chaque énoncé, les points et les clés de correction.
8. Enregistrer le brouillon, puis utiliser l’action de publication lorsque le sujet est prêt.

L’importateur analyse le contenu JSON/JSONC, mais ne remplace pas la validation pédagogique : relisez systématiquement les réponses attendues, les variantes, le nombre de trous, les identifiants et le barème avant de publier.


## 11. Question « Verbes à trous avec banque » — `verbes_trous`

Ce type de question peut être utilisé dans `sections[].questions[]`. Il présente une banque de verbes : l’élève place un verbe dans chaque phrase, puis saisit sa conjugaison. La banque contient au moins autant de verbes que de phrases; les verbes supplémentaires sont des pièges.

### Structure JSON

Dans un examen composite, les données de présentation et la clé de correction sont séparées. La propriété `verbes_trous` contient les informations nécessaires à l’affichage. La propriété `answer_key.phrases` contient les réponses attendues, repérées par le même `id`.

```json
{
  "id": "verbes_01",
  "type": "verbes_trous",
  "prompt": "Presente indicativo – completa le frasi",
  "points": 6,
  "verbes_trous": {
    "titre": "Presente indicativo",
    "consigne": "Scegli un verbo dalla banca, poi scrivi la forma corretta.",
    "points_par_phrase": 3,
    "banque": ["parlare", "leggere", "dormire", "scrivere"],
    "phrases": [
      { "id": 1, "debut": "Io ", "fin": " italiano." },
      { "id": 2, "debut": "Noi ", "fin": " un libro." }
    ]
  },
  "answer_key": {
    "phrases": [
      { "id": 1, "verbe": "parlare", "reponses": ["parlo", "io parlo"] },
      { "id": 2, "verbe": "leggere", "reponses": ["leggiamo"] }
    ]
  }
}
```

### Règles et validation

- `verbes_trous.titre` et `verbes_trous.consigne` sont des chaînes de caractères.
- `points_par_phrase` vaut **3**. Le champ global `points` vaut donc le nombre de phrases multiplié par 3.
- `banque` est une liste de verbes sans doublon.
- `phrases` contient au moins une phrase et la banque contient au moins autant de verbes que de phrases.
- Chaque phrase possède un `id` unique, un `debut` et une `fin`.
- Chaque identifiant de phrase possède une entrée correspondante dans `answer_key.phrases` avec un `verbe` attendu et au moins une `reponses` acceptée.
- Chaque verbe attendu apparaît une seule fois et doit être présent dans la banque.
- Les réponses sont comparées sans tenir compte de la casse ni des espaces superflus; les accents restent significatifs.

### Barème

Chaque phrase rapporte 3 points : **1 point** si le verbe attendu est correctement placé et **2 points** si la conjugaison correspond à l’une des réponses acceptées. Une phrase sans verbe placé rapporte zéro. Les verbes pièges non utilisés ne rapportent aucun point.

Pour le format détaillé, le comportement de l’exercice et le diagramme de séquence, consultez [le guide Verbes à trous avec banque](verbes-trous.md).
