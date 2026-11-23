-- Supporte les connecteurs naturels utilisés pour déclarer plusieurs réponses acceptées.
-- Exemples : "ventiquattro / ventiquattro euro", "ventiquattro ou ventiquattro euro",
-- "ventiquattro o ventiquattro euro" et "ventiquattro oppure ventiquattro euro".
-- La comparaison reste exacte après séparation des variantes.

CREATE OR REPLACE FUNCTION public.quiz_text_matches(p_student TEXT, p_expected TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_student TEXT := public.quiz_norm_answer(p_student);
  v_expected TEXT := public.quiz_norm_answer(p_expected);
  v_student_nopunct TEXT;
  v_expected_nopunct TEXT;
  v_alt TEXT;
  v_alt_count INTEGER := 0;
  v_alternative_pattern CONSTANT TEXT := '(?i)\\s*[/;|]\\s*|\\s+(ou|oppure|o)\\s+';
BEGIN
  IF v_student = '' OR v_expected = '' THEN RETURN FALSE; END IF;
  IF v_student = v_expected THEN RETURN TRUE; END IF;
  v_student_nopunct := btrim(regexp_replace(v_student, '[.?!;:]+$', ''));
  v_expected_nopunct := btrim(regexp_replace(v_expected, '[.?!;:]+$', ''));
  IF v_student_nopunct <> '' AND v_student_nopunct = v_expected_nopunct THEN RETURN TRUE; END IF;
  FOR v_alt IN
    SELECT btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', ''))
    FROM regexp_split_to_table(coalesce(p_expected, ''), v_alternative_pattern) AS part
  LOOP
    IF v_alt <> '' THEN v_alt_count := v_alt_count + 1; END IF;
  END LOOP;
  IF v_alt_count > 1 THEN
    RETURN EXISTS (
      SELECT 1
      FROM regexp_split_to_table(coalesce(p_expected, ''), v_alternative_pattern) AS part
      WHERE btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', '')) = v_student_nopunct
        AND btrim(part) <> ''
    );
  END IF;
  RETURN FALSE;
END;
$$;

NOTIFY pgrst, 'reload schema';
