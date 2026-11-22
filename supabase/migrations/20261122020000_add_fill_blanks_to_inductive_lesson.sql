-- Intègre trois exercices de terminaisons directement dans la découverte guidée de la leçon.
-- Les étudiants saisissent uniquement la désinence; aucune évaluation indépendante n'est créée.
WITH inserted_steps AS (
  SELECT 71::numeric AS sort_key,
    jsonb_build_object(
      'id','inductive_fill_are',
      'kind','fill_blanks',
      'prompt','Complète les formes des verbes réguliers en -ARE. Écris uniquement la terminaison manquante.',
      'data',jsonb_build_object('group_label','Verbi regolari in -ARE · parlare','items',jsonb_build_array(
        jsonb_build_object('id','are_io','subject','io','stem','parl','answer','o'),
        jsonb_build_object('id','are_tu','subject','tu','stem','parl','answer','i'),
        jsonb_build_object('id','are_lui','subject','lui / lei','stem','parl','answer','a'),
        jsonb_build_object('id','are_noi','subject','noi','stem','parl','answer','iamo'),
        jsonb_build_object('id','are_voi','subject','voi','stem','parl','answer','ate'),
        jsonb_build_object('id','are_loro','subject','loro','stem','parl','answer','ano')
      )),
      'hints',jsonb_build_array('Osserva la persona grammaticale e confronta le formes de parlare dans le dialogue.'),
      'ok','Perfetto! Hai individuato le sei desinenze dei verbi regolari in -ARE.',
      'ko','Controlla la persona grammaticale e scrivi soltanto la desinenza, senza ripetere il verbo.',
      'insight','Per i verbi regolari in -ARE: -o, -i, -a, -iamo, -ate, -ano.'
    ) AS step
  UNION ALL
  SELECT 72::numeric,
    jsonb_build_object(
      'id','inductive_fill_ere',
      'kind','fill_blanks',
      'prompt','Complète les formes des verbes réguliers en -ERE. Écris uniquement la terminaison manquante.',
      'data',jsonb_build_object('group_label','Verbi regolari in -ERE · leggere','items',jsonb_build_array(
        jsonb_build_object('id','ere_io','subject','io','stem','legg','answer','o'),
        jsonb_build_object('id','ere_tu','subject','tu','stem','legg','answer','i'),
        jsonb_build_object('id','ere_lui','subject','lui / lei','stem','legg','answer','e'),
        jsonb_build_object('id','ere_noi','subject','noi','stem','legg','answer','iamo'),
        jsonb_build_object('id','ere_voi','subject','voi','stem','legg','answer','ete'),
        jsonb_build_object('id','ere_loro','subject','loro','stem','legg','answer','ono')
      )),
      'hints',jsonb_build_array('Compare les terminaisons avec celles des verbes en -ARE.'),
      'ok','Ottimo! Hai riconosciuto le desinenze dei verbi regolari in -ERE.',
      'ko','Fais attention à la différence entre les formes de lui/lei, voi et loro.',
      'insight','Per i verbi regolari in -ERE: -o, -i, -e, -iamo, -ete, -ono.'
    ) AS step
  UNION ALL
  SELECT 73::numeric,
    jsonb_build_object(
      'id','inductive_fill_ire',
      'kind','fill_blanks',
      'prompt','Complète les formes des verbes réguliers en -IRE (sans -isc-). Écris uniquement la terminaison manquante.',
      'data',jsonb_build_object('group_label','Verbi regolari in -IRE · dormire','items',jsonb_build_array(
        jsonb_build_object('id','ire_io','subject','io','stem','dorm','answer','o'),
        jsonb_build_object('id','ire_tu','subject','tu','stem','dorm','answer','i'),
        jsonb_build_object('id','ire_lui','subject','lui / lei','stem','dorm','answer','e'),
        jsonb_build_object('id','ire_noi','subject','noi','stem','dorm','answer','iamo'),
        jsonb_build_object('id','ire_voi','subject','voi','stem','dorm','answer','ite'),
        jsonb_build_object('id','ire_loro','subject','loro','stem','dorm','answer','ono')
      )),
      'hints',jsonb_build_array('Observe la voyelle de la terminaison de voi et compare-la aux verbes en -ARE et -ERE.'),
      'ok','Benissimo! Hai completato le forme regolari in -IRE.',
      'ko','Reste sur les verbes réguliers en -IRE : aucune forme en -isc- dans cet exercice.',
      'insight','Per i verbi regolari in -IRE: -o, -i, -e, -iamo, -ite, -ono.'
    ) AS step
),
lesson_steps AS (
  SELECT (item.ordinality * 10)::numeric AS sort_key, item.step
  FROM public.lesson_blocks lb
  CROSS JOIN LATERAL jsonb_array_elements(lb.content->'steps') WITH ORDINALITY AS item(step, ordinality)
  WHERE lb.id = '2e360684-2867-4377-ae75-763e6726d58b'
    AND item.ordinality <= 7
  UNION ALL
  SELECT sort_key, step FROM inserted_steps
  UNION ALL
  SELECT (item.ordinality * 10)::numeric AS sort_key, item.step
  FROM public.lesson_blocks lb
  CROSS JOIN LATERAL jsonb_array_elements(lb.content->'steps') WITH ORDINALITY AS item(step, ordinality)
  WHERE lb.id = '2e360684-2867-4377-ae75-763e6726d58b'
    AND item.ordinality > 7
)
UPDATE public.lesson_blocks lb
SET content = jsonb_set(
  lb.content,
  '{steps}',
  (SELECT jsonb_agg(step ORDER BY sort_key) FROM lesson_steps),
  true
)
WHERE lb.id = '2e360684-2867-4377-ae75-763e6726d58b';

-- Le quiz autonome créé par erreur n'est plus relié à cette leçon.
UPDATE public.lessons
SET quiz_ref = NULL, updated_at = now()
WHERE slug = 'il-presente-indicativo-tre-coniugazioni-a1';

UPDATE public.quizzes
SET status = 'draft'
WHERE id = 'quiz-presente-indicativo-terminazioni-a1';

DO $$
DECLARE
  step_count integer;
BEGIN
  SELECT jsonb_array_length(content->'steps') INTO step_count
  FROM public.lesson_blocks
  WHERE id = '2e360684-2867-4377-ae75-763e6726d58b';
  IF step_count <> 15 OR NOT EXISTS (
    SELECT 1 FROM public.lesson_blocks lb,
      LATERAL jsonb_array_elements(lb.content->'steps') step
    WHERE lb.id = '2e360684-2867-4377-ae75-763e6726d58b'
      AND step->>'kind' = 'fill_blanks'
      AND step->>'id' IN ('inductive_fill_are','inductive_fill_ere','inductive_fill_ire')
    GROUP BY lb.id
    HAVING count(*) FILTER (WHERE step->>'kind' = 'fill_blanks') = 3
  ) THEN
    RAISE EXCEPTION 'Les trois exercices à trous ne sont pas correctement intégrés à la découverte guidée.';
  END IF;
END $$;