-- Link the A1 regular-present lesson to an existing multi-blank text quiz.
-- This is a content migration only: no table or column changes are required.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE slug = 'il-presente-indicativo-tre-coniugazioni-a1'
  ) THEN
    RAISE EXCEPTION 'La leçon A1 sur les trois conjugaisons est introuvable.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.classes
    WHERE id = 'ee8365c2-e7c8-44b1-8d01-c4dbef8b4df6'::uuid
  ) THEN
    RAISE EXCEPTION 'La classe A1-lifemada est introuvable.';
  END IF;
END $$;

INSERT INTO public.quizzes (
  id,
  class_id,
  class_ids,
  title,
  description,
  duration_minutes,
  status,
  questions,
  total_points,
  is_public,
  category,
  attendance_mode,
  presence_window_seconds,
  level
)
VALUES (
  'quiz-presente-indicativo-terminazioni-a1',
  'ee8365c2-e7c8-44b1-8d01-c4dbef8b4df6',
  ARRAY['ee8365c2-e7c8-44b1-8d01-c4dbef8b4df6'],
  'Presente indicativo – Verbi regolari: completa le desinenze',
  'Tre esercizi sui verbi regolari in -ARE, -ERE e -IRE. Il radicale è già indicato: completa soltanto la desinenza.',
  6,
  'draft',
  $questions$
  [
    {
      "id": "presente-are",
      "type": "text",
      "question": "-ARE — Completa solo la desinenza: Io parl___ italiano ogni giorno. · Tu lavor___ in ufficio. · Sara abit___ a Tana. · Noi ascolt___ la musica. · Voi guard___ un film. · Loro compr___ i libri.",
      "correct_answer": "",
      "answers": ["o", "i", "a", "iamo", "ate", "ano"],
      "blank_count": 6,
      "points": 6,
      "time_limit_seconds": 120,
      "competency": "Conjuguer les verbes réguliers en -ARE au présent",
      "skill_code": "PRESENTE_INDICATIVO",
      "explanation": "Le radical reste stable. Ajoute les terminaisons : -o, -i, -a, -iamo, -ate, -ano."
    },
    {
      "id": "presente-ere",
      "type": "text",
      "question": "-ERE — Completa solo la desinenza: Io legg___ un libro. · Tu scriv___ una mail. · Marco prend___ l'autobus. · Noi vend___ libri. · Voi viv___ a Tana. · Loro ricev___ una lettera.",
      "correct_answer": "",
      "answers": ["o", "i", "e", "iamo", "ete", "ono"],
      "blank_count": 6,
      "points": 6,
      "time_limit_seconds": 120,
      "competency": "Conjuguer les verbes réguliers en -ERE au présent",
      "skill_code": "PRESENTE_INDICATIVO",
      "explanation": "Ajoute les terminaisons : -o, -i, -e, -iamo, -ete, -ono."
    },
    {
      "id": "presente-ire",
      "type": "text",
      "question": "-IRE — Completa solo la desinenza: Io dorm___ otto ore. · Tu part___ domani. · Luca apr___ la porta. · Noi sent___ la musica. · Voi segu___ il corso. · Loro copr___ il tavolo.",
      "correct_answer": "",
      "answers": ["o", "i", "e", "iamo", "ite", "ono"],
      "blank_count": 6,
      "points": 6,
      "time_limit_seconds": 120,
      "competency": "Conjuguer les verbes réguliers en -IRE sans -isc- au présent",
      "skill_code": "PRESENTE_INDICATIVO",
      "explanation": "Ces verbes en -IRE n'ajoutent pas -isc-. Ajoute les terminaisons : -o, -i, -e, -iamo, -ite, -ono."
    }
  ]
  $questions$::jsonb,
  18,
  false,
  'Conjugaison',
  'legacy',
  10,
  'A1'
)
ON CONFLICT (id) DO UPDATE SET
  class_id = EXCLUDED.class_id,
  class_ids = EXCLUDED.class_ids,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  duration_minutes = EXCLUDED.duration_minutes,
  questions = EXCLUDED.questions,
  total_points = EXCLUDED.total_points,
  category = EXCLUDED.category,
  level = EXCLUDED.level;

UPDATE public.lessons
SET quiz_ref = 'quiz-presente-indicativo-terminazioni-a1',
    updated_at = now()
WHERE slug = 'il-presente-indicativo-tre-coniugazioni-a1';
