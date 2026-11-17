-- Optimize authenticated per-question quiz grading.
-- Keep the response contract and all existing attendance/grading rules.

CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_text_active
  ON public.class_enrollments ((student_id::text), class_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_students_id_text_class_lookup
  ON public.students ((id::text))
  INCLUDE (class_id)
  WHERE class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_student_attempt
  ON public.quiz_attempts (quiz_id, student_id, attempt_number DESC);

CREATE OR REPLACE FUNCTION public.evaluate_quiz_question(
  p_quiz_id TEXT,
  p_question_id TEXT,
  p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  sid TEXT := public.quiz_current_student_id();
  q public.quizzes%ROWTYPE;
  cids TEXT[];
  question JSONB;
  l public.quiz_launches%ROWTYPE;
  part public.quiz_participants%ROWTYPE;
  attempt_no INTEGER;
  result JSONB;
BEGIN
  IF auth.uid() IS NULL OR coalesce(sid, '') = '' THEN
    RAISE EXCEPTION 'Session étudiant authentifiée requise.';
  END IF;
  IF public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Cette fonction est réservée aux comptes étudiants.';
  END IF;

  -- Fetch only fields used by the grading path, not the full quiz row.
  SELECT id, status, class_id, class_ids, attendance_mode, is_public, questions
  INTO q
  FROM public.quizzes
  WHERE id = p_quiz_id;

  IF NOT FOUND OR q.status <> 'launched' THEN
    RAISE EXCEPTION 'Quiz non disponible.';
  END IF;

  SELECT array_agg(DISTINCT class_id::text)
  INTO cids
  FROM public.class_enrollments
  WHERE student_id::text = sid AND status = 'active';

  IF coalesce(array_length(cids, 1), 0) = 0 THEN
    SELECT ARRAY[class_id::text]
    INTO cids
    FROM public.students
    WHERE id::text = sid;
  END IF;

  IF NOT (coalesce(cids, ARRAY[]::text[])
          && coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id])) THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  IF q.attendance_mode = 'strict_presence' AND NOT coalesce(q.is_public, FALSE) THEN
    SELECT *
    INTO l
    FROM public.quiz_launches
    WHERE quiz_id = q.id AND status = 'launched'
    ORDER BY launched_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aucun lancement actif.';
    END IF;

    SELECT *
    INTO part
    FROM public.quiz_participants
    WHERE launch_id = l.id AND student_id = sid;

    IF NOT FOUND OR part.presence_status NOT IN ('present', 'retry_authorized') THEN
      RAISE EXCEPTION 'Présence non confirmée.';
    END IF;

    IF part.presence_deadline_at IS NOT NULL
       AND clock_timestamp() < part.presence_deadline_at THEN
      RAISE EXCEPTION 'Fenêtre de présence encore ouverte.';
    END IF;
  END IF;

  SELECT value
  INTO question
  FROM jsonb_array_elements(coalesce(q.questions, '[]'::jsonb))
  WHERE value ->> 'id' = p_question_id
  LIMIT 1;

  IF question IS NULL THEN
    RAISE EXCEPTION 'Question introuvable.';
  END IF;

  SELECT greatest(
    coalesce((
      SELECT max(a.attempt_number)
      FROM public.quiz_attempts a
      WHERE a.quiz_id = q.id AND a.student_id = sid
    ), 0),
    coalesce((
      SELECT max(s.attempt_number)
      FROM public.quiz_submissions s
      WHERE s.quiz_id = q.id AND s.student_id = sid
    ), 0)
  ) + 1
  INTO attempt_no;

  result := public.quiz_grade_question(question, p_answer);

  INSERT INTO public.quiz_question_evaluations(
    quiz_id, student_id, attempt_number, question_id, answer, feedback
  )
  VALUES (
    q.id, sid, attempt_no, p_question_id, coalesce(p_answer, ''), result
  )
  ON CONFLICT (quiz_id, student_id, attempt_number, question_id) DO NOTHING;

  SELECT feedback
  INTO result
  FROM public.quiz_question_evaluations
  WHERE quiz_id = q.id
    AND student_id = sid
    AND attempt_number = attempt_no
    AND question_id = p_question_id;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_quiz_question(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_quiz_question(TEXT, TEXT, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
