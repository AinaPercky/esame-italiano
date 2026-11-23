-- Unifie les représentations Unicode canoniquement équivalentes des réponses saisies.
-- Exemple : « é » (U+00E9) et « e » + accent aigu (U+0065 U+0301).
-- La comparaison reste exacte après normalisation : aucune tolérance aux fautes ou aux réponses partielles.

CREATE OR REPLACE FUNCTION public.quiz_norm_answer(p_val TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      replace(
        translate(
          lower(normalize(btrim(coalesce(p_val, '')), NFC)),
          chr(8217) || chr(8216) || chr(96) || chr(171) || chr(187) || chr(8220) || chr(8221),
          repeat(chr(39), 3) || repeat(chr(34), 4)
        ),
        chr(160), ' '
      ),
      chr(39) || '\\s+', chr(39), 'g'
    ),
    '\\s+', ' ', 'g'
  );
$$;

NOTIFY pgrst, 'reload schema';
