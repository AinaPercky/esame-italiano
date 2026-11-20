-- Add stable competencies to every stored exercise version, preserving question content.
UPDATE public.exercise_versions v
SET content = jsonb_set(
  v.content,
  '{questions}',
  (
    SELECT jsonb_agg(
      question.value
      || jsonb_build_object(
        'competency',
        COALESCE(NULLIF(question.value->>'competency',''),
          CASE
            WHEN lower(e.title) LIKE '%passato prossimo%' THEN
              CASE
                WHEN lower(COALESCE(question.value->>'question','') || ' ' || COALESCE(question.value->>'explanation','')) ~ '(riflessiv|svegliarsi|mettersi)' THEN 'Verbes réfléchis au passato prossimo'
                WHEN lower(COALESCE(question.value->>'question','') || ' ' || COALESCE(question.value->>'explanation','')) ~ '(accord|femminile|maschile|plurale)' THEN 'Accord du participe passé avec le sujet'
                WHEN lower(COALESCE(question.value->>'explanation','')) ~ '(participio irregolare|participio passato)' THEN 'Formation du participe passé, y compris les formes irrégulières'
                WHEN lower(COALESCE(question.value->>'explanation','')) ~ '(prende essere|usa essere|con essere|essere)' THEN 'Choix de l’auxiliaire essere ou avere'
                ELSE 'Conjugaison et emploi du passato prossimo'
              END
            WHEN lower(e.title) LIKE '%numeri%' OR lower(e.title) LIKE '%operazioni%' THEN
              CASE
                WHEN lower(COALESCE(question.value->>'question','')) ~ '(calcola|\+|×|÷|−)' THEN 'Calcul et compréhension des opérations en italien'
                WHEN lower(COALESCE(question.value->>'question','')) ~ '(numero|scrive|scrivi|forma scritta)' THEN 'Lecture et orthographe des nombres en italien'
                ELSE 'Vocabulaire des nombres et des opérations'
              END
            WHEN lower(e.title) LIKE '%economia%' THEN
              CASE
                WHEN lower(COALESCE(question.value->>'question','')) ~ '(traduci|traduzione)' THEN 'Traduction du vocabulaire économique'
                WHEN lower(COALESCE(question.value->>'question','')) ~ '(calcola|profitto|ricavi|costi)' THEN 'Compréhension et calcul des indicateurs économiques'
                ELSE 'Compréhension du vocabulaire et des notions économiques'
              END
            ELSE 'Compétence linguistique liée au thème de l’exercice'
          END
        ),
        'skill_code',
        COALESCE(NULLIF(question.value->>'skill_code',''),
          CASE
            WHEN lower(e.title) LIKE '%passato prossimo%' THEN
              CASE
                WHEN lower(COALESCE(question.value->>'question','') || ' ' || COALESCE(question.value->>'explanation','')) ~ '(riflessiv|svegliarsi|mettersi)' THEN 'PASSATO_PROSSIMO_REFLEXIVE'
                WHEN lower(COALESCE(question.value->>'question','') || ' ' || COALESCE(question.value->>'explanation','')) ~ '(accord|femminile|maschile|plurale)' THEN 'PASSATO_PROSSIMO_AGREEMENT'
                WHEN lower(COALESCE(question.value->>'explanation','')) ~ '(participio irregolare|participio passato)' THEN 'PASSATO_PROSSIMO_PARTICIPLE'
                WHEN lower(COALESCE(question.value->>'explanation','')) ~ '(prende essere|usa essere|con essere|essere)' THEN 'PASSATO_PROSSIMO_AUX'
                ELSE 'PASSATO_PROSSIMO_USAGE'
              END
            WHEN lower(e.title) LIKE '%numeri%' OR lower(e.title) LIKE '%operazioni%' THEN
              CASE
                WHEN lower(COALESCE(question.value->>'question','')) ~ '(calcola|\+|×|÷|−)' THEN 'NUMERI_OPERAZIONI_CALCOLO'
                ELSE 'NUMERI_ORTHOGRAPHIE'
              END
            WHEN lower(e.title) LIKE '%economia%' THEN
              CASE
                WHEN lower(COALESCE(question.value->>'question','')) ~ '(traduci|traduzione)' THEN 'LESSICO_ECONOMIA_TRADUZIONE'
                WHEN lower(COALESCE(question.value->>'question','')) ~ '(calcola|profitto|ricavi|costi)' THEN 'ECONOMIA_CALCOLO'
                ELSE 'LESSICO_ECONOMIA'
              END
            ELSE 'COMPETENZA_TEMATICA'
          END
        )
      )
      ORDER BY question.ordinality
    )
    FROM jsonb_array_elements(COALESCE(v.content->'questions','[]'::jsonb))
      WITH ORDINALITY question(value, ordinality)
  ),
  true
)
FROM public.exercises e
WHERE e.id=v.exercise_id
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(v.content->'questions','[]'::jsonb)) q
  WHERE NOT (q ? 'competency' AND q ? 'skill_code')
);
