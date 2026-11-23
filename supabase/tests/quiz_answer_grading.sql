-- Regression tests for server-side matching of free-text quiz answers.
DO $test$
BEGIN
  IF NOT public.quiz_text_matches('IO PARLO', 'io parlo / parlo') THEN
    RAISE EXCEPTION 'Quiz matcher rejected the first accepted alternative.';
  END IF;
  IF NOT public.quiz_text_matches('parlo', 'io parlo; parlo') THEN
    RAISE EXCEPTION 'Quiz matcher rejected a semicolon-separated alternative.';
  END IF;
  IF NOT public.quiz_text_matches('23', 'ventitré | 23') THEN
    RAISE EXCEPTION 'Quiz matcher rejected a pipe-separated alternative.';
  END IF;
  IF NOT public.quiz_text_matches('ventitre' || U&'\0301', 'ventitré') THEN
    RAISE EXCEPTION 'Quiz matcher rejected canonically equivalent NFC/NFD accents.';
  END IF;
  IF NOT public.quiz_text_matches('ventiquattro', 'ventiquattro ou ventiquattro euro') THEN
    RAISE EXCEPTION 'Quiz matcher rejected the French "ou" alternative connector.';
  END IF;
  IF NOT public.quiz_text_matches('ventiquattro euro', 'ventiquattro oppure ventiquattro euro') THEN
    RAISE EXCEPTION 'Quiz matcher rejected the Italian "oppure" alternative connector.';
  END IF;
  IF NOT public.quiz_text_matches('ventiquattro', 'ventiquattro o ventiquattro euro') THEN
    RAISE EXCEPTION 'Quiz matcher rejected the Italian "o" alternative connector.';
  END IF;
  IF public.quiz_text_matches('venticinque', 'ventiquattro ou ventiquattro euro') THEN
    RAISE EXCEPTION 'Quiz matcher accepted an undeclared alternative.';
  END IF;
  IF public.quiz_text_matches('venti', 'ventitré / 23') THEN
    RAISE EXCEPTION 'Quiz matcher accepted an incomplete answer.';
  END IF;
  IF NOT public.quiz_text_matches('92', 'novantadue') THEN
    RAISE EXCEPTION 'Quiz matcher rejected numeric digits for the Italian number novantadue.';
  END IF;
  IF NOT public.quiz_text_matches('novantadue', '92') THEN
    RAISE EXCEPTION 'Quiz matcher rejected Italian number words for numeric expected answer 92.';
  END IF;
  IF NOT public.quiz_text_matches('92', 'novantadue euro') THEN
    RAISE EXCEPTION 'Quiz matcher rejected numeric digits for a number followed by euro.';
  END IF;
  IF NOT public.quiz_text_matches('92 euro', 'novantadue') THEN
    RAISE EXCEPTION 'Quiz matcher rejected the optional euro suffix.';
  END IF;
  IF NOT public.quiz_text_matches('108', 'centotto') OR
     NOT public.quiz_text_matches('180', 'centottanta') OR
     NOT public.quiz_text_matches('223', 'duecentoventitré') THEN
    RAISE EXCEPTION 'Quiz matcher failed Italian compound-number conversion.';
  END IF;
  IF public.quiz_text_matches('93', 'novantadue') OR
     public.quiz_text_matches('92', 'novantatré') THEN
    RAISE EXCEPTION 'Quiz matcher accepted a different numeric value.';
  END IF;
  IF public.quiz_text_matches('1000', 'novantadue') THEN
    RAISE EXCEPTION 'Quiz matcher accepted a value outside the supported number range.';
  END IF;
  IF public.quiz_text_matches('caffe', 'caffè') THEN
    RAISE EXCEPTION 'Quiz matcher incorrectly removed a meaningful accent.';
  END IF;
END
$test$;
