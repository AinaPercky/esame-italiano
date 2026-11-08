# Format JSON/JSONC – Examens écrits composites

Les PDF servent de modèles pédagogiques. L'import PDF automatique n'est pas inclus : l'enseignant peut composer dans l'interface ou importer un fichier JSON/JSONC.

## Structure générale

```json
{
  "title": "Verifica A1",
  "description": "Examen écrit sans production écrite ni orale.",
  "level": "A1",
  "target_language": "it",
  "instruction_language": "fr",
  "duration_minutes": 120,
  "class_ids": ["UUID_DE_CLASSE"],
  "opens_at": null,
  "closes_at": null,
  "display_scale": 100,
  "max_attempts": 1,
  "shuffle_sections": true,
  "shuffle_questions": true,
  "shuffle_options": true,\n  "navigation_mode": "free",
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
      "category": "Compréhension",\n      "group_name": "Partie 1 – Lecture",
      "instructions": "Leggi il testo e rispondi.",
      "points": 15,
      "shuffle": true,
      "fixed_position": false,
      "support_text": "Marco vive a Roma. Ha vent'anni.",
      "support_url": "https://example.com/supporto.pdf",
      "questions": [
        {
          "id": "q1",
          "type": "qcm",
          "prompt": "Marco vive a Roma. Vero o falso?",
          "points": 2,
          "options": [
            { "id": "true", "label": "Vero" },
            { "id": "false", "label": "Falso" }
          ],
          "answer_key": { "correctOptionId": "true" },
          "explanation": "Il testo indica che Marco vive a Roma."
        },
        {
          "id": "q2",
          "type": "text",
          "prompt": "Quanti anni ha Marco?",
          "points": 1,
          "answer_key": { "acceptedAnswers": ["venti", "20"] }
        },
        {
          "id": "q3",
          "type": "text",
          "prompt": "Completa: Io ___ italiano e ___ un libro.",
          "points": 2,
          "blank_count": 2,
          "answer_key": { "answers": [["sono"], ["ho"]] }
        },
        {
          "id": "q4",
          "type": "reorder",
          "prompt": "Rimetti le parole nella frase corretta.",
          "points": 2,
          "items": [
            { "id": "i1", "text": "Io" },
            { "id": "i2", "text": "studio" },
            { "id": "i3", "text": "italiano" }
          ],
          "answer_key": { "correctOrder": ["i1", "i2", "i3"] }
        }
      ]
    }
  ]
}
```

## Types de questions

- `qcm` : QCM et vrai/faux. `options` est une liste d'objets à identifiants stables. `answer_key.correctOptionId` référence l'identifiant de l'option, jamais son libellé affiché.
- `text` : réponse courte, traduction, conjugaison, article, préposition, possessif, antonyme ou phrase à compléter. `answer_key.acceptedAnswers` contient les variantes acceptées (casse et espaces normalisés). Pour les trous multiples, utiliser `blank_count` et `answer_key.answers`, une liste par trou; chaque liste peut contenir plusieurs variantes.
- `reorder` : remise en ordre. `items` contient les éléments; `answer_key.correctOrder` référence leurs identifiants dans l'ordre correct. La notation est partielle par position.

Une section peut utiliser `group_name` pour regrouper visuellement plusieurs sections et les conserver ensemble lors du mélange. `navigation_mode` vaut `free` (retour et accès direct) ou `sequential` (progression sans retour). Chaque section peut aussi partager un texte (`support_text`) ou un lien de document (`support_url`).\n\nUne question peut utiliser `manual_review: true` pour demander une correction enseignant. Le navigateur ne reçoit jamais `answer_key` ni `explanation` pendant l'épreuve. Les clés sont séparées dans la table privée `written_exam_answer_keys`.

## Réutilisation des quiz

L'interface peut copier une question d'un quiz existant. Le sujet conserve un instantané du texte, des options/éléments, du barème et des réponses attendues, ainsi que `source_quiz_id` et `source_question_id` à titre de référence. Une modification du quiz source ne change pas la version publiée.

## Profils de départ

- **L135** : allocations initiales 20 + 50 + 10 + 10 = 90 points, durée 90 minutes. Les 50 points de grammaire peuvent être répartis entre articles, conjugaison, COD/COI, prépositions et possessifs. Les 20 points de production écrite sont exclus.
- **A1** : allocations initiales 15 + 25 + 15 + 10 = 65 points, durée 120 minutes. La normalisation /100 est facultative : score brut / 65 × 100. Les 15 points de production écrite et 20 points de production orale sont exclus.

Le total brut réel est la somme des points des questions conservées. Les plafonds des sections ne forcent pas le total : si une question ou une section est retirée, le barème réel change. Le professeur peut réallouer les points ou choisir une échelle normalisée. Ne pas créer de questions de production écrite longue ou d'expression orale dans ce module.
