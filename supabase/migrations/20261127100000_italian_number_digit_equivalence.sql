-- Convertit les cardinaux italiens de 0 à 999 en valeur numérique.
CREATE OR REPLACE FUNCTION public.quiz_italian_under_100(p_number INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_units TEXT[] := ARRAY[
    'zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove',
    'dieci','undici','dodici','tredici','quattordici','quindici','sedici',
    'diciassette','diciotto','diciannove'
  ];
  v_tens TEXT[] := ARRAY['','','venti','trenta','quaranta','cinquanta','sessanta','settanta','ottanta','novanta'];
  v_tens_word TEXT;
  v_unit INTEGER;
BEGIN
  IF p_number IS NULL OR p_number < 0 OR p_number > 99 THEN RETURN NULL; END IF;
  IF p_number < 20 THEN RETURN v_units[p_number + 1]; END IF;
  v_tens_word := v_tens[(p_number / 10) + 1];
  v_unit := p_number % 10;
  IF v_unit = 0 THEN RETURN v_tens_word; END IF;
  IF v_unit IN (1, 8) THEN
    v_tens_word := left(v_tens_word, length(v_tens_word) - 1);
  END IF;
  RETURN v_tens_word || CASE WHEN v_unit = 3 THEN 'tré' ELSE v_units[v_unit + 1] END;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_italian_number_words(p_number INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_units TEXT[] := ARRAY['zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove'];
  v_hundreds INTEGER;
  v_remainder INTEGER;
  v_prefix TEXT;
  v_suffix TEXT;
BEGIN
  IF p_number IS NULL OR p_number < 0 OR p_number > 999 THEN RETURN NULL; END IF;
  IF p_number < 100 THEN RETURN public.quiz_italian_under_100(p_number); END IF;

  v_hundreds := p_number / 100;
  v_remainder := p_number % 100;
  v_prefix := CASE WHEN v_hundreds = 1 THEN 'cento' ELSE v_units[v_hundreds + 1] || 'cento' END;
  IF v_remainder = 0 THEN RETURN v_prefix; END IF;

  v_suffix := public.quiz_italian_under_100(v_remainder);
  IF v_suffix LIKE 'otto%' OR v_suffix LIKE 'ottant%' THEN
    v_prefix := left(v_prefix, length(v_prefix) - 1);
  END IF;
  RETURN v_prefix || v_suffix;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_italian_number_value(p_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT := public.quiz_norm_answer(p_text);
  v_value INTEGER;
BEGIN
  -- « euro » est un complément monétaire facultatif, pas une partie du nombre.
  v_text := regexp_replace(v_text, '\s+euro$', '');
  IF v_text ~ '^[0-9]{1,3}$' THEN
    RETURN v_text::INTEGER;
  END IF;

  SELECT n INTO v_value
  FROM generate_series(0, 999) AS n
  WHERE public.quiz_italian_number_words(n) = v_text
  LIMIT 1;
  RETURN v_value;
END;
$$;

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
  v_student_number INTEGER;
  v_expected_number INTEGER;
  v_alternative_pattern CONSTANT TEXT := '(?i)\s*[/;|]\s*|\s+(ou|oppure|o)\s+';
BEGIN
  IF v_student = '' OR v_expected = '' THEN RETURN FALSE; END IF;
  IF v_student = v_expected THEN RETURN TRUE; END IF;
  v_student_nopunct := btrim(regexp_replace(v_student, '[.?!;:]+$', ''));
  v_expected_nopunct := btrim(regexp_replace(v_expected, '[.?!;:]+$', ''));
  IF v_student_nopunct <> '' AND v_student_nopunct = v_expected_nopunct THEN RETURN TRUE; END IF;

  -- Équivalence sémantique exacte : « novantadue » = « 92 ».
  v_student_number := public.quiz_italian_number_value(v_student_nopunct);
  v_expected_number := public.quiz_italian_number_value(v_expected_nopunct);
  IF v_student_number IS NOT NULL AND v_student_number = v_expected_number THEN
    RETURN TRUE;
  END IF;

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
        OR (
          v_student_number IS NOT NULL
          AND public.quiz_italian_number_value(
            btrim(regexp_replace(public.quiz_norm_answer(part), '[.?!;:]+$', ''))
          ) = v_student_number
        )
    );
  END IF;
  RETURN FALSE;
END;
$$;

NOTIFY pgrst, 'reload schema';
