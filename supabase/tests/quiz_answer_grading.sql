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
  IF NOT public.quiz_text_matches('ventitre' || U&'\\0301', 'ventitré') THEN
    RAISE EXCEPTION 'Quiz matcher rejected canonically equivalent NFC/NFD accents.';
  END IF;
  IF public.quiz_text_matches('venti', 'ventitré / 23') THEN
    RAISE EXCEPTION 'Quiz matcher accepted an incomplete answer.';
  END IF;
  IF public.quiz_text_matches('caffe', 'caffè') THEN
    RAISE EXCEPTION 'Quiz matcher incorrectly removed a meaningful accent.';
  END IF;
END
$test$;
