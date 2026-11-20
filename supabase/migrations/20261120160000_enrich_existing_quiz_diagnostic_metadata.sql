-- Enrichissement rétrocompatible des quiz existants pour le diagnostic pédagogique (#155).
-- Seules competency et skill_code sont ajoutées : aucun corrigé, barème, texte,
-- option, ordre, durée ou résultat historique n'est modifié.
-- Les catégories d'erreurs ne sont PAS générées automatiquement : elles exigent
-- une validation explicite de l'enseignant dans error_categories/error_category_map.

WITH quiz_questions AS (
  SELECT
    q.id,
    q.questions,
    q.title,
    q.category,
    jsonb_agg(
      CASE
        WHEN COALESCE(question.value ? 'competency', false)
          AND COALESCE(question.value ? 'skill_code', false)
          THEN question.value
        ELSE
          jsonb_strip_nulls(
            question.value
            || jsonb_build_object(
              'competency',
              COALESCE(
                NULLIF(question.value ->> 'competency', ''),
                CASE
                  WHEN lower(q.title) LIKE '%passato prossimo%' THEN
                    CASE
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation',''))
                           ~ '(pronome|pronomi|\bli\b|\ble\b|accordo.*participio|participio.*accordo)'
                        THEN 'Accord du participe passé et pronoms directs'
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation',''))
                           ~ '(riflessiv|pronominal|\bsi è\b|\bmi sono\b|\bci siamo\b|\bti sei\b)'
                        THEN 'Verbes réfléchis au passato prossimo'
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation',''))
                           ~ '(ausiliaire|ausiliari|essere|avere)'
                        THEN 'Choix de l’auxiliaire au passato prossimo'
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation',''))
                           ~ '(participio|particip.*irregolar|participio passato)'
                        THEN 'Formation du participe passé'
                      ELSE 'Formation et emploi du passato prossimo'
                    END
                  WHEN lower(q.title) LIKE '%possessiv%' THEN 'Adjectifs possessifs : forme et accord'
                  WHEN lower(q.title) LIKE '%dimostrativ%' THEN 'Adjectifs démonstratifs : questo et quello'
                  WHEN lower(q.title) LIKE '%articol%' THEN 'Articles définis et indéfinis'
                  WHEN lower(q.title) LIKE '%preposizion%' THEN 'Choix et emploi des prépositions italiennes'
                  WHEN lower(q.title) LIKE '%pronomi dirett%' OR lower(q.title) LIKE '%pronomi%indirett%' THEN 'Pronoms directs et indirects'
                  WHEN lower(q.title) LIKE '%interrogativ%' THEN 'Mots et expressions interrogatifs'
                  WHEN lower(q.title) LIKE '%piacere%' THEN 'Construction du verbe piacere'
                  WHEN lower(q.title) LIKE '%presente progressivo%' AND lower(COALESCE(question.value ->> 'question','')) ~ '(imperativ|\btu\b|\bvoi\b|\bnoi\b)'
                    THEN 'Impératif italien'
                  WHEN lower(q.title) LIKE '%presente progressivo%' THEN 'Présent progressif : stare + gerundio'
                  WHEN lower(q.title) LIKE '%imperativ%' OR lower(COALESCE(question.value ->> 'question','')) ~ '(imperativo|imperativ)' THEN 'Formation et emploi de l’impératif'
                  WHEN lower(q.title) LIKE '%presente%' OR lower(q.title) LIKE '%verbi regolari%' THEN 'Conjugaison au présent de l’indicatif'
                  WHEN lower(q.title) LIKE '%verbi a2%' OR lower(q.title) LIKE '%tempi misti%' OR lower(q.title) LIKE '%verbi e verbi riflessivi%' THEN 'Choix du temps verbal et conjugaison'
                  WHEN lower(q.title) LIKE '%che ore%' OR lower(q.title) LIKE '%lettura dell''ora%' THEN 'Lire et exprimer l’heure'
                  WHEN lower(q.title) LIKE '%descrivere una persona%' THEN 'Vocabulaire et description des personnes'
                  WHEN lower(q.title) LIKE '%animali%' THEN 'Vocabulaire des animaux et caractéristiques'
                  WHEN lower(q.title) LIKE '%cucina%' OR lower(q.title) LIKE '%ricette%' THEN
                    CASE
                      WHEN lower(COALESCE(question.value ->> 'question','')) ~ '(imperativo|imperativ|istruzioni|ordine corretto)' THEN 'Comprendre et organiser des consignes culinaires'
                      ELSE 'Vocabulaire et compréhension du thème de la cuisine'
                    END
                  WHEN lower(q.title) LIKE '%numeri%' OR lower(q.title) LIKE '%operazioni%' THEN 'Nombres et opérations en italien'
                  WHEN lower(q.title) LIKE '%economia%' THEN 'Vocabulaire et notions économiques'
                  WHEN lower(q.title) LIKE '%politica%' OR lower(q.title) LIKE '%geopolitica%' THEN 'Vocabulaire politique et géopolitique'
                  WHEN lower(q.title) LIKE '%cultura generale%' OR lower(q.title) LIKE '%italia%' THEN 'Culture générale et géographie de l’Italie'
                  WHEN lower(q.title) LIKE '%100 nomi%' THEN 'Vocabulaire : noms italiens courants'
                  WHEN lower(q.title) LIKE '%ladro%' OR lower(q.title) LIKE '%furto%' THEN 'Vocabulaire du vol et de la criminalité'
                  WHEN lower(q.title) LIKE '%scuola per maghi%' THEN 'Vocabulaire thématique : école et magie'
                  WHEN q.category = 'Vocabulaire' THEN 'Compréhension et acquisition du vocabulaire thématique'
                  WHEN q.category = 'Thème' THEN 'Compréhension du thème et connaissances culturelles'
                  WHEN q.category = 'Conjugaison' THEN 'Conjugaison et emploi des formes verbales'
                  WHEN q.category = 'Grammaire' THEN 'Structures grammaticales italiennes'
                  ELSE 'Compétence linguistique générale'
                END
              ),
              'skill_code',
              COALESCE(
                NULLIF(question.value ->> 'skill_code', ''),
                CASE
                  WHEN lower(q.title) LIKE '%passato prossimo%' THEN
                    CASE
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation','')) ~ '(pronome|pronomi|\bli\b|\ble\b|accordo.*participio|participio.*accordo)' THEN 'PASSATO_PROSSIMO_COD_AGREEMENT'
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation','')) ~ '(riflessiv|pronominal|\bsi è\b|\bmi sono\b|\bci siamo\b|\bti sei\b)' THEN 'PASSATO_PROSSIMO_REFLEXIVE'
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation','')) ~ '(ausiliaire|ausiliari|essere|avere)' THEN 'PASSATO_PROSSIMO_AUX'
                      WHEN lower(COALESCE(question.value ->> 'question','') || ' ' || COALESCE(question.value ->> 'explanation','')) ~ '(participio|particip.*irregolar)' THEN 'PASSATO_PROSSIMO_PARTICIPLE'
                      ELSE 'PASSATO_PROSSIMO_USAGE'
                    END
                  WHEN lower(q.title) LIKE '%possessiv%' THEN 'AGGETTIVI_POSSESSIVI'
                  WHEN lower(q.title) LIKE '%dimostrativ%' THEN 'AGGETTIVI_DIMOSTRATIVI'
                  WHEN lower(q.title) LIKE '%articol%' THEN 'ARTICOLI'
                  WHEN lower(q.title) LIKE '%preposizion%' THEN 'PREPOSIZIONI'
                  WHEN lower(q.title) LIKE '%pronomi dirett%' OR lower(q.title) LIKE '%pronomi%indirett%' THEN 'PRONOMI_DIRETTI_INDIRETTI'
                  WHEN lower(q.title) LIKE '%interrogativ%' THEN 'PAROLE_INTERROGATIVE'
                  WHEN lower(q.title) LIKE '%piacere%' THEN 'VERBO_PIACERE'
                  WHEN lower(q.title) LIKE '%presente progressivo%' AND lower(COALESCE(question.value ->> 'question','')) ~ '(imperativ|\btu\b|\bvoi\b|\bnoi\b)' THEN 'IMPERATIVO'
                  WHEN lower(q.title) LIKE '%presente progressivo%' THEN 'PRESENTE_PROGRESSIVO'
                  WHEN lower(q.title) LIKE '%imperativ%' OR lower(COALESCE(question.value ->> 'question','')) ~ '(imperativo|imperativ)' THEN 'IMPERATIVO'
                  WHEN lower(q.title) LIKE '%presente%' OR lower(q.title) LIKE '%verbi regolari%' THEN 'PRESENTE_INDICATIVO'
                  WHEN lower(q.title) LIKE '%verbi a2%' OR lower(q.title) LIKE '%tempi misti%' OR lower(q.title) LIKE '%verbi e verbi riflessivi%' THEN 'CONIUGAZIONE_TEMPI_MISTI'
                  WHEN lower(q.title) LIKE '%che ore%' OR lower(q.title) LIKE '%lettura dell''ora%' THEN 'ORARIO'
                  WHEN lower(q.title) LIKE '%descrivere una persona%' THEN 'LESSICO_DESCRIZIONE_PERSONE'
                  WHEN lower(q.title) LIKE '%animali%' THEN 'LESSICO_ANIMALI'
                  WHEN lower(q.title) LIKE '%cucina%' OR lower(q.title) LIKE '%ricette%' THEN 'LESSICO_CUCINA'
                  WHEN lower(q.title) LIKE '%numeri%' OR lower(q.title) LIKE '%operazioni%' THEN 'NUMERI_OPERAZIONI'
                  WHEN lower(q.title) LIKE '%economia%' THEN 'LESSICO_ECONOMIA'
                  WHEN lower(q.title) LIKE '%politica%' OR lower(q.title) LIKE '%geopolitica%' THEN 'LESSICO_POLITICA_GEOPOLITICA'
                  WHEN lower(q.title) LIKE '%cultura generale%' OR lower(q.title) LIKE '%italia%' THEN 'CULTURA_ITALIANA'
                  WHEN lower(q.title) LIKE '%100 nomi%' THEN 'LESSICO_NOMI'
                  WHEN lower(q.title) LIKE '%ladro%' OR lower(q.title) LIKE '%furto%' THEN 'LESSICO_CRIMINALITA'
                  WHEN lower(q.title) LIKE '%scuola per maghi%' THEN 'LESSICO_SCOLASTICO_FANTASTICO'
                  WHEN q.category = 'Vocabulaire' THEN 'LESSICO_TEMATICO'
                  WHEN q.category = 'Thème' THEN 'COMPRENSIONE_TEMATICA'
                  WHEN q.category = 'Conjugaison' THEN 'CONIUGAZIONE'
                  WHEN q.category = 'Grammaire' THEN 'GRAMMATICA'
                  ELSE 'COMPETENZA_LINGUISTICA_GENERALE'
                END
              )
            )
          )
      END
      ORDER BY question.ordinality
    ) AS enriched_questions
  FROM public.quizzes AS q
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(q.questions, '[]'::jsonb))
    WITH ORDINALITY AS question(value, ordinality)
  GROUP BY q.id, q.questions, q.title, q.category
)
UPDATE public.quizzes AS target
SET questions = source.enriched_questions
FROM quiz_questions AS source
WHERE target.id = source.id
  AND target.questions IS DISTINCT FROM source.enriched_questions;

-- Les questions sont enrichies sans inventer de causes d'erreur.
-- Les enseignants pourront ajouter error_categories et error_category_map au cas par cas.
