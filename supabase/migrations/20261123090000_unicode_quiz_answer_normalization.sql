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
      chr(39) || '\s+', chr(39), 'g'
    ),
    '\s+', ' ', 'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.quiz_text_matches(p_student TEXT, p_expected TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_student TEXT := public.quiz_norm_answer(p_student);
  v_expected TEXT := public.quiz_norm_answer(p_expected);
  v_student_nopunct TEXT;
  v_expected_nopunct TEXT;
  v_alt TEXT;
  v_alt_count INTEGER := 0;
BEGIN
  IF v_student = '' OR v_expected = '' THEN
    RETURN FALSE;
  END IF;
  IF v_student = v_expected THEN
    RETURN TRUE;
  END IF;
  v_student_nopunct := btrim(regexp_replace(v_student, '[.?!;:]+$', ''));
  v_expected_nopunct := btrim(regexp_replace(v_expected, '[.?!;:]+$', ''));
  IF v_student_nopunct <> '' AND v_student_nopunct = v_expected_nopunct THEN
    RETURN TRUE;
  END IF;
  FOR v_alt IN
    SELECT btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', ''))
    FROM regexp_split_to_table(coalesce(p_expected, ''), '\s*[/;|]\s*') AS part
  LOOP
    IF v_alt <> '' THEN
      v_alt_count := v_alt_count + 1;
    END IF;
  END LOOP;
  IF v_alt_count > 1 THEN
    RETURN EXISTS (
      SELECT 1
      FROM regexp_split_to_table(coalesce(p_expected, ''), '\s*[/;|]\s*') AS part
      WHERE btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', '')) = v_student_nopunct
        AND btrim(part) <> ''
    );
  END IF;
  RETURN FALSE;
END;
$fn$;

NOTIFY pgrst, 'reload schema';
