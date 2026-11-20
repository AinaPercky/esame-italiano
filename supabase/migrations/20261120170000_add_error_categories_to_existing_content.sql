-- Complete diagnostic metadata for existing quiz and exercise question banks.
-- Categories are authored pedagogical hypotheses based on the question's assessed skill.
-- Only explicit QCM distractors are mapped. Free-text answers are never classified
-- automatically because an incorrect response can have several different causes.

WITH quiz_enriched AS (
  SELECT q.id,
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(question.value->'options') = 'array'
          AND question.value ? 'correct_answer'
        THEN
          question.value
          || jsonb_build_object(
            'error_categories',
            COALESCE(
              question.value->'error_categories',
              jsonb_build_array(
                CASE
                  WHEN question.value->>'skill_code' LIKE 'PASSATO_PROSSIMO%' THEN 'Erreur de formation du passato prossimo'
                  WHEN question.value->>'skill_code' IN ('PRESENTE_INDICATIVO','IMPERATIVO','PRESENTE_PROGRESSIVO','CONIUGAZIONE','CONIUGAZIONE_TEMPI_MISTI') THEN 'Erreur de conjugaison ou de forme verbale'
                  WHEN question.value->>'skill_code' IN ('ARTICOLI','AGGETTIVI_POSSESSIVI','AGGETTIVI_DIMOSTRATIVI') THEN 'Erreur de choix ou d’accord grammatical'
                  WHEN question.value->>'skill_code' IN ('PREPOSIZIONI') THEN 'Confusion dans le choix de la préposition'
                  WHEN question.value->>'skill_code' IN ('PRONOMI_DIRETTI_INDIRETTI') THEN 'Confusion entre pronoms directs et indirects'
                  WHEN question.value->>'skill_code' IN ('VERBO_PIACERE') THEN 'Erreur dans la construction du verbe piacere'
                  WHEN question.value->>'skill_code' LIKE 'LESSICO%' THEN 'Confusion de vocabulaire ou de sens'
                  WHEN question.value->>'skill_code' IN ('ORARIO','NUMERI_OPERAZIONI') THEN 'Confusion de valeur ou de forme numérique'
                  ELSE 'Confusion entre notions ou réponses proches'
                END
              )
            ),
            'error_category_map',
            COALESCE(question.value->'error_category_map','{}'::jsonb)
            || COALESCE((
              SELECT jsonb_object_agg(opt, category_name)
              FROM jsonb_array_elements_text(question.value->'options') opt
              CROSS JOIN LATERAL (
                SELECT CASE
                  WHEN question.value->>'skill_code' LIKE 'PASSATO_PROSSIMO%' THEN 'Erreur de formation du passato prossimo'
                  WHEN question.value->>'skill_code' IN ('PRESENTE_INDICATIVO','IMPERATIVO','PRESENTE_PROGRESSIVO','CONIUGAZIONE','CONIUGAZIONE_TEMPI_MISTI') THEN 'Erreur de conjugaison ou de forme verbale'
                  WHEN question.value->>'skill_code' IN ('ARTICOLI','AGGETTIVI_POSSESSIVI','AGGETTIVI_DIMOSTRATIVI') THEN 'Erreur de choix ou d’accord grammatical'
                  WHEN question.value->>'skill_code' = 'PREPOSIZIONI' THEN 'Confusion dans le choix de la préposition'
                  WHEN question.value->>'skill_code' = 'PRONOMI_DIRETTI_INDIRETTI' THEN 'Confusion entre pronoms directs et indirects'
                  WHEN question.value->>'skill_code' = 'VERBO_PIACERE' THEN 'Erreur dans la construction du verbe piacere'
                  WHEN question.value->>'skill_code' LIKE 'LESSICO%' THEN 'Confusion de vocabulaire ou de sens'
                  WHEN question.value->>'skill_code' IN ('ORARIO','NUMERI_OPERAZIONI') THEN 'Confusion de valeur ou de forme numérique'
                  ELSE 'Confusion entre notions ou réponses proches'
                END AS category_name
              ) c
              WHERE lower(trim(opt)) <> lower(trim(question.value->>'correct_answer'))
            ),'{}'::jsonb)
          )
        ELSE
          question.value
          || jsonb_build_object(
            'error_categories',
            COALESCE(
              question.value->'error_categories',
              jsonb_build_array(
                CASE
                  WHEN question.value->>'skill_code' LIKE 'PASSATO_PROSSIMO%' THEN 'Erreur de formation du passato prossimo'
                  WHEN question.value->>'skill_code' IN ('PRESENTE_INDICATIVO','IMPERATIVO','PRESENTE_PROGRESSIVO','CONIUGAZIONE','CONIUGAZIONE_TEMPI_MISTI') THEN 'Erreur de conjugaison ou de forme verbale'
                  WHEN question.value->>'skill_code' IN ('ARTICOLI','AGGETTIVI_POSSESSIVI','AGGETTIVI_DIMOSTRATIVI') THEN 'Erreur de choix ou d’accord grammatical'
                  WHEN question.value->>'skill_code' = 'PREPOSIZIONI' THEN 'Confusion dans le choix de la préposition'
                  WHEN question.value->>'skill_code' = 'PRONOMI_DIRETTI_INDIRETTI' THEN 'Confusion entre pronoms directs et indirects'
                  WHEN question.value->>'skill_code' = 'VERBO_PIACERE' THEN 'Erreur dans la construction du verbe piacere'
                  WHEN question.value->>'skill_code' LIKE 'LESSICO%' THEN 'Confusion de vocabulaire ou de sens'
                  WHEN question.value->>'skill_code' IN ('ORARIO','NUMERI_OPERAZIONI') THEN 'Confusion de valeur ou de forme numérique'
                  ELSE 'Confusion entre notions ou réponses proches'
                END
              )
            ),
            'error_category_map', COALESCE(question.value->'error_category_map','{}'::jsonb)
          )
      END ORDER BY question.ordinality
    ) AS questions
  FROM public.quizzes q
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(q.questions,'[]'::jsonb))
    WITH ORDINALITY question(value, ordinality)
  GROUP BY q.id
)
UPDATE public.quizzes q
SET questions = e.questions
FROM quiz_enriched e
WHERE q.id=e.id AND q.questions IS DISTINCT FROM e.questions;

WITH exercise_enriched AS (
  SELECT v.id,
    jsonb_set(
      v.content,
      '{questions}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(question.value->'options')='array'
              AND question.value ? 'correct_answer'
            THEN
              question.value
              || jsonb_build_object(
                'error_categories',
                COALESCE(question.value->'error_categories',
                  jsonb_build_array(
                    CASE
                      WHEN lower(e.title) LIKE '%passato prossimo%' THEN 'Erreur de formation du passato prossimo'
                      WHEN lower(e.title) LIKE '%numeri%' OR lower(e.title) LIKE '%operazioni%' THEN 'Confusion de valeur ou de forme numérique'
                      WHEN lower(e.title) LIKE '%economia%' THEN 'Confusion de vocabulaire ou de notion économique'
                      ELSE 'Confusion de vocabulaire ou de structure'
                    END
                  )
                ),
                'error_category_map',
                COALESCE(question.value->'error_category_map','{}'::jsonb)
                || COALESCE((
                  SELECT jsonb_object_agg(opt,
                    CASE
                      WHEN lower(e.title) LIKE '%passato prossimo%' THEN
                        CASE
                          WHEN lower(opt) ~ '^(sono|sei|è|siamo|siete|sono)( |$)' AND lower(question.value->>'explanation') LIKE '%avere%' THEN 'Confusion entre essere et avere'
                          WHEN lower(opt) ~ '^(ho|hai|ha|abbiamo|avete|hanno)( |$)' AND lower(question.value->>'explanation') LIKE '%essere%' THEN 'Confusion entre essere et avere'
                          WHEN lower(question.value->>'explanation') LIKE '%particip%' THEN 'Erreur de formation du participe passé'
                          ELSE 'Erreur de conjugaison ou d’accord'
                        END
                      WHEN lower(e.title) LIKE '%numeri%' OR lower(e.title) LIKE '%operazioni%' THEN 'Erreur d’orthographe ou de formation du nombre'
                      ELSE 'Confusion de vocabulaire ou de sens'
                    END
                  )
                  FROM jsonb_array_elements_text(question.value->'options') opt
                  WHERE lower(trim(opt)) <> lower(trim(question.value->>'correct_answer'))
                ),'{}'::jsonb)
              )
            ELSE
              question.value
              || jsonb_build_object(
                'error_categories',
                COALESCE(question.value->'error_categories',
                  jsonb_build_array(
                    CASE
                      WHEN lower(e.title) LIKE '%passato prossimo%' THEN 'Erreur de formation du passato prossimo'
                      WHEN lower(e.title) LIKE '%numeri%' OR lower(e.title) LIKE '%operazioni%' THEN 'Confusion de valeur ou de forme numérique'
                      WHEN lower(e.title) LIKE '%economia%' THEN 'Confusion de vocabulaire ou de notion économique'
                      ELSE 'Confusion de vocabulaire ou de structure'
                    END
                  )
                ),
                'error_category_map', COALESCE(question.value->'error_category_map','{}'::jsonb)
              )
          END ORDER BY question.ordinality
        )
        FROM jsonb_array_elements(COALESCE(v.content->'questions','[]'::jsonb))
          WITH ORDINALITY question(value, ordinality)
      ),
      true
    ) AS content
  FROM public.exercise_versions v
  JOIN public.exercises e ON e.id=v.exercise_id
)
UPDATE public.exercise_versions v
SET content=e.content
FROM exercise_enriched e
WHERE v.id=e.id AND v.content IS DISTINCT FROM e.content;
