-- Extend quiz launch, retry and submission flows to all active class enrollments.
-- Historical attempts and submissions are not modified.
CREATE OR REPLACE FUNCTION public.launch_quiz_with_presence(p_quiz_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
BEGIN
  IF NOT public.quiz_is_teacher() THEN RAISE EXCEPTION 'Autorisation professeur requise.'; END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable.'; END IF;

  INSERT INTO public.quiz_launches (quiz_id, launched_by, status)
  VALUES (p_quiz_id, auth.uid(), 'launched')
  RETURNING * INTO v_launch;

  -- Les autorisations accordées après une clôture sont attachées au nouveau lancement.
  UPDATE public.quiz_retry_grants
  SET launch_id = v_launch.id
  WHERE quiz_id = p_quiz_id AND launch_id IS NULL AND used_at IS NULL
    AND (expires_at IS NULL OR expires_at > clock_timestamp());

  INSERT INTO public.quiz_participants (launch_id, quiz_id, student_id, class_id, presence_status)
  SELECT v_launch.id, p_quiz_id, s.id::text, ce.class_id::text,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.quiz_retry_grants g
      WHERE g.quiz_id = p_quiz_id AND g.student_id = s.id::text
        AND g.launch_id = v_launch.id AND g.used_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
    ) THEN 'retry_authorized' ELSE 'pending' END
  FROM public.students s
  JOIN LATERAL (
    SELECT e.class_id FROM public.class_enrollments e
    WHERE e.student_id=s.id AND e.status='active'
      AND e.class_id::text=ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
    ORDER BY e.started_at DESC LIMIT 1
  ) ce ON TRUE
  WHERE ((NOT EXISTS (
      SELECT 1 FROM public.quiz_participants old_p
      WHERE old_p.quiz_id = p_quiz_id AND old_p.student_id = s.id::text AND old_p.presence_status = 'absent'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.quiz_submissions prior_submission
      WHERE prior_submission.quiz_id = p_quiz_id AND prior_submission.student_id = s.id::text
        AND prior_submission.status IN ('completed', 'timeout', 'missed')
    ) AND NOT EXISTS (
      SELECT 1 FROM public.quiz_attempts prior_attempt
      WHERE prior_attempt.quiz_id = p_quiz_id AND prior_attempt.student_id = s.id::text
        AND prior_attempt.status IN ('completed', 'timeout', 'missed')
    )) OR EXISTS (
      SELECT 1 FROM public.quiz_retry_grants g
      WHERE g.quiz_id = p_quiz_id AND g.student_id = s.id::text
        AND g.launch_id = v_launch.id AND g.used_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
    ))
  ON CONFLICT (launch_id, student_id) DO NOTHING;

  UPDATE public.quizzes
  SET status = 'launched', launched_at = v_launch.launched_at, expires_at = NULL,
      attendance_mode = CASE WHEN is_public THEN 'legacy' ELSE 'strict_presence' END
  WHERE id = p_quiz_id
  RETURNING * INTO v_quiz;

  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'launch', to_jsonb(v_launch));
END;
$function$;

CREATE OR REPLACE FUNCTION public.launch_quiz_and_clear_missed(p_quiz_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE q public.quizzes%ROWTYPE; l public.quiz_launches%ROWTYPE; BEGIN IF NOT public.is_quiz_teacher() THEN RAISE EXCEPTION 'Seul le professeur peut lancer un quiz.'; END IF; SELECT * INTO q FROM public.quizzes WHERE id=p_quiz_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %',p_quiz_id; END IF; IF coalesce(q.attendance_mode,'legacy')='strict_presence' THEN INSERT INTO public.quiz_launches(quiz_id,launched_at,presence_deadline_at,status) VALUES(p_quiz_id,now(),now()+make_interval(secs=>coalesce(q.presence_window_seconds,10)),'launched') RETURNING * INTO l; INSERT INTO public.quiz_participants(quiz_id,student_id,launch_id,class_id,presence_status)
 SELECT p_quiz_id,s.id::text,l.id,ce.class_id::text,'pending'
 FROM public.students s
 JOIN LATERAL (SELECT e.class_id FROM public.class_enrollments e WHERE e.student_id=s.id AND e.status='active'
   AND e.class_id::text=ANY(coalesce(nullif(q.class_ids,ARRAY[]::text[]),ARRAY[q.class_id]))
   ORDER BY e.started_at DESC LIMIT 1) ce ON TRUE
 ON CONFLICT(quiz_id,student_id) DO NOTHING; ELSE DELETE FROM public.quiz_submissions WHERE quiz_id=p_quiz_id AND status='missed'; END IF; UPDATE public.quizzes SET status='launched',launched_at=now(),expires_at=NULL WHERE id=p_quiz_id RETURNING * INTO q; RETURN jsonb_build_object('quiz',to_jsonb(q),'launch_id',to_jsonb(l)); END; $function$;

CREATE OR REPLACE FUNCTION public.close_quiz_and_mark_missed(p_quiz_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE q public.quizzes%ROWTYPE; r JSONB; BEGIN IF NOT public.is_quiz_teacher() THEN RAISE EXCEPTION 'Seul le professeur peut clôturer un quiz.'; END IF; SELECT * INTO q FROM public.quizzes WHERE id=p_quiz_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable: %',p_quiz_id; END IF; UPDATE public.quizzes SET status='closed' WHERE id=p_quiz_id RETURNING * INTO q; IF coalesce(q.attendance_mode,'legacy')='strict_presence' THEN UPDATE public.quiz_participants SET presence_status='absent',attendance_locked_at=now(),updated_at=now() WHERE quiz_id=p_quiz_id AND presence_status='pending'; UPDATE public.quiz_participants SET attendance_locked_at=now(),updated_at=now() WHERE quiz_id=p_quiz_id AND presence_status='present' AND attendance_locked_at IS NULL; UPDATE public.quiz_launches SET status='closed',closed_at=now() WHERE quiz_id=p_quiz_id AND status='launched'; INSERT INTO public.quiz_submissions(id,quiz_id,quiz_title,student_id,student_name,student_number,class_id,class_name,started_at,submitted_at,answers,score,max_score,score_20,status,feedback,date,attempt_number,launch_id,attendance_status,is_counted) SELECT 'sub_missed_'||q.id||'_'||p.student_id,q.id,q.title,p.student_id,concat_ws(' ',s.first_name,s.last_name),s.student_number,p.class_id,c.name,coalesce(q.launched_at,now()),now(),'{}',0,coalesce(q.total_points,20),0,CASE WHEN p.presence_status='present' THEN 'timeout' ELSE 'missed' END,'{}',current_date,1,p.launch_id,CASE WHEN p.presence_status='present' THEN 'present' ELSE 'absent' END,true FROM public.quiz_participants p JOIN public.students s ON s.id::text=p.student_id LEFT JOIN public.classes c ON c.id::text=p.class_id WHERE p.quiz_id=p_quiz_id AND NOT EXISTS(SELECT 1 FROM public.quiz_submissions x WHERE x.quiz_id=p_quiz_id AND x.student_id=p.student_id); ELSE INSERT INTO public.quiz_submissions(id,quiz_id,quiz_title,student_id,student_name,student_number,class_id,class_name,started_at,submitted_at,answers,score,max_score,score_20,status,feedback,date,attempt_number,attendance_status,is_counted) SELECT 'sub_missed_'||q.id||'_'||s.id::text,q.id,q.title,s.id::text,concat_ws(' ',s.first_name,s.last_name),s.student_number,ce.class_id::text,c.name,coalesce(q.launched_at,now()),now(),'{}',0,coalesce(q.total_points,20),0,'missed','{}',current_date,1,'unknown',true FROM public.students s JOIN LATERAL (SELECT e.class_id FROM public.class_enrollments e WHERE e.student_id=s.id AND e.status='active' AND e.class_id::text=ANY(coalesce(nullif(q.class_ids,ARRAY[]::text[]),ARRAY[q.class_id])) ORDER BY e.started_at DESC LIMIT 1) ce ON TRUE LEFT JOIN public.classes c ON c.id=ce.class_id WHERE NOT EXISTS(SELECT 1 FROM public.quiz_submissions x WHERE x.quiz_id=p_quiz_id AND x.student_id=s.id::text); END IF; SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.student_name),'[]') INTO r FROM public.quiz_submissions x WHERE x.quiz_id=p_quiz_id; RETURN jsonb_build_object('quiz',to_jsonb(q),'submissions',r); END; $function$;

CREATE OR REPLACE FUNCTION public.close_quiz_with_presence(p_quiz_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_launch public.quiz_launches%ROWTYPE;
  v_quiz public.quizzes%ROWTYPE;
  v_submissions JSONB;
  v_closed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF NOT public.quiz_is_teacher() THEN RAISE EXCEPTION 'Autorisation professeur requise.'; END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable.'; END IF;
  SELECT * INTO v_launch FROM public.quiz_launches
  WHERE quiz_id = p_quiz_id AND status = 'launched'
  ORDER BY launched_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun lancement actif.'; END IF;

  UPDATE public.quiz_participants
  SET presence_status = CASE
        WHEN presence_status = 'pending' OR (presence_status = 'retry_authorized' AND presence_confirmed_at IS NULL) THEN 'absent'
        WHEN presence_status = 'retry_authorized' AND presence_confirmed_at IS NOT NULL THEN 'timeout'
        ELSE presence_status
      END,
      final_status = CASE
        WHEN presence_status = 'pending' OR (presence_status = 'retry_authorized' AND presence_confirmed_at IS NULL) THEN 'missed'
        WHEN presence_status = 'retry_authorized' AND presence_confirmed_at IS NOT NULL THEN 'timeout'
        ELSE final_status
      END,
      attendance_locked_at = coalesce(attendance_locked_at, v_closed_at),
      final_score = CASE WHEN presence_status IN ('pending', 'present', 'retry_authorized') THEN 0 ELSE final_score END
  WHERE launch_id = v_launch.id;

  INSERT INTO public.quiz_attempts (
    quiz_id, launch_id, participant_id, student_id, attempt_number, status, score, max_score,
    score_20, started_at, submitted_at
  )
  SELECT p.quiz_id, p.launch_id, p.id, p.student_id,
    coalesce((SELECT max(a.attempt_number) + 1 FROM public.quiz_attempts a
              WHERE a.quiz_id = p.quiz_id AND a.student_id = p.student_id), 1),
    'missed', 0, coalesce(v_quiz.total_points, 20), 0, v_launch.launched_at, v_closed_at
  FROM public.quiz_participants p
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'absent'
    AND NOT EXISTS (SELECT 1 FROM public.quiz_attempts a
                    WHERE a.participant_id = p.id AND a.launch_id = v_launch.id AND a.status = 'missed');

  UPDATE public.quiz_participants
  SET presence_status = 'timeout', final_status = 'timeout'
  WHERE launch_id = v_launch.id AND presence_status = 'present';

  INSERT INTO public.quiz_attempts (
    quiz_id, launch_id, participant_id, student_id, attempt_number, status, score, max_score,
    score_20, started_at, submitted_at
  )
  SELECT p.quiz_id, p.launch_id, p.id, p.student_id,
    coalesce((SELECT max(a.attempt_number) + 1 FROM public.quiz_attempts a
              WHERE a.quiz_id = p.quiz_id AND a.student_id = p.student_id), 1),
    'timeout', 0, coalesce(v_quiz.total_points, 20), 0,
    coalesce(p.presence_confirmed_at, v_launch.launched_at), v_closed_at
  FROM public.quiz_participants p
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'timeout'
    AND NOT EXISTS (
      SELECT 1 FROM public.quiz_attempts a
      WHERE a.participant_id = p.id AND a.launch_id = v_launch.id
        AND a.status IN ('completed', 'timeout')
        AND (p.presence_confirmed_at IS NULL OR a.started_at >= p.presence_confirmed_at)
    );

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  )
  SELECT 'sub_missed_' || v_quiz.id || '_' || p.student_id || '_' || a.attempt_number,
    v_quiz.id, v_quiz.title, p.student_id, concat_ws(' ', s.first_name, s.last_name),
    s.student_number, p.class_id, c.name, v_launch.launched_at, v_closed_at,
    '{}'::jsonb, 0, coalesce(v_quiz.total_points, 20), 0, 'missed', '{}'::jsonb, current_date,
    a.attempt_number,
    NOT EXISTS (SELECT 1 FROM public.quiz_submissions prior
                WHERE prior.quiz_id = v_quiz.id AND prior.student_id = p.student_id AND prior.is_counted = TRUE)
  FROM public.quiz_participants p
  JOIN public.students s ON s.id::text = p.student_id
  LEFT JOIN public.classes c ON c.id::text = p.class_id
  JOIN LATERAL (
    SELECT attempt_number FROM public.quiz_attempts
    WHERE participant_id = p.id AND launch_id = v_launch.id AND status = 'missed'
    ORDER BY attempt_number DESC LIMIT 1
  ) a ON TRUE
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'absent'
  ON CONFLICT (quiz_id, student_id, attempt_number) DO NOTHING;

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  )
  SELECT 'sub_timeout_' || v_quiz.id || '_' || p.student_id || '_' || a.attempt_number,
    v_quiz.id, v_quiz.title, p.student_id, concat_ws(' ', s.first_name, s.last_name),
    s.student_number, p.class_id, c.name,
    coalesce(p.presence_confirmed_at, v_launch.launched_at), v_closed_at, '{}'::jsonb, 0,
    coalesce(v_quiz.total_points, 20), 0, 'timeout', '{}'::jsonb, current_date,
    a.attempt_number,
    NOT EXISTS (SELECT 1 FROM public.quiz_submissions prior
                WHERE prior.quiz_id = v_quiz.id AND prior.student_id = p.student_id AND prior.is_counted = TRUE)
  FROM public.quiz_participants p
  JOIN public.students s ON s.id::text = p.student_id
  LEFT JOIN public.classes c ON c.id::text = p.class_id
  JOIN LATERAL (
    SELECT attempt_number FROM public.quiz_attempts
    WHERE participant_id = p.id AND launch_id = v_launch.id AND status = 'timeout'
    ORDER BY attempt_number DESC LIMIT 1
  ) a ON TRUE
  WHERE p.launch_id = v_launch.id AND p.presence_status = 'timeout'
  ON CONFLICT (quiz_id, student_id, attempt_number) DO NOTHING;

  UPDATE public.quiz_retry_grants SET launch_id = NULL
  WHERE quiz_id = p_quiz_id AND launch_id = v_launch.id AND used_at IS NULL;
  UPDATE public.quiz_launches SET status = 'closed', closed_at = v_closed_at
  WHERE id = v_launch.id RETURNING * INTO v_launch;
  UPDATE public.quizzes SET status = 'closed' WHERE id = p_quiz_id RETURNING * INTO v_quiz;
  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_submissions
  FROM public.quiz_submissions s WHERE s.quiz_id = p_quiz_id;
  RETURN jsonb_build_object('quiz', to_jsonb(v_quiz), 'launch', to_jsonb(v_launch), 'submissions', v_submissions);
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_quiz_retry(p_quiz_id text, p_student_id text, p_reason text, p_launch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grant public.quiz_retry_grants%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_class_id TEXT;
BEGIN
  IF NOT public.quiz_is_teacher() THEN
    RAISE EXCEPTION 'Autorisation professeur requise.';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Le motif est obligatoire.';
  END IF;

  SELECT ce.class_id::text INTO v_class_id
  FROM public.class_enrollments ce
  JOIN public.quizzes q ON q.id = p_quiz_id
  WHERE ce.student_id::text = p_student_id AND ce.status = 'active'
    AND ce.class_id::text = ANY(coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id]))
  ORDER BY ce.started_at DESC LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Cet élève n’appartient pas aux classes de ce quiz.';
  END IF;

  IF p_launch_id IS NOT NULL THEN
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE id = p_launch_id AND quiz_id = p_quiz_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Le lancement ciblé ne correspond pas à ce quiz.';
    END IF;
    IF v_launch.status <> 'launched' THEN
      v_launch.id := NULL;
    END IF;
  ELSE
    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE quiz_id = p_quiz_id AND status = 'launched'
    ORDER BY launched_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  INSERT INTO public.quiz_retry_grants (
    quiz_id, student_id, granted_by, reason, launch_id
  )
  VALUES (
    p_quiz_id, p_student_id, auth.uid(), btrim(p_reason), v_launch.id
  )
  RETURNING * INTO v_grant;

  IF v_launch.id IS NULL THEN
    -- Réouvrir le quiz par la RPC officielle; elle rattache les autorisations
    -- sans lancement à la nouvelle session et crée les participants autorisés.
    PERFORM public.launch_quiz_with_presence(p_quiz_id);

    SELECT * INTO v_launch
    FROM public.quiz_launches
    WHERE quiz_id = p_quiz_id AND status = 'launched'
    ORDER BY launched_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Impossible de créer un nouveau lancement pour cette seconde chance.';
    END IF;

    UPDATE public.quiz_retry_grants
    SET launch_id = v_launch.id
    WHERE id = v_grant.id
    RETURNING * INTO v_grant;
  END IF;

  INSERT INTO public.quiz_participants (
    launch_id, quiz_id, student_id, class_id, presence_status
  )
  VALUES (
    v_launch.id, p_quiz_id, p_student_id, v_class_id, 'retry_authorized'
  )
  ON CONFLICT (launch_id, student_id)
  DO UPDATE SET presence_status = 'retry_authorized';

  UPDATE public.quizzes
  SET status = 'launched', launched_at = v_launch.launched_at, expires_at = NULL
  WHERE id = p_quiz_id;

  RETURN jsonb_build_object(
    'id', v_grant.id,
    'quiz_id', v_grant.quiz_id,
    'student_id', v_grant.student_id,
    'launch_id', v_launch.id,
    'granted', 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_quiz_retry_for_class(p_quiz_id text, p_class_id text, p_reason text DEFAULT NULL::text, p_max_attempts integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE v_student TEXT; v_count INTEGER := 0; BEGIN IF NOT public.is_quiz_teacher() THEN RAISE EXCEPTION 'Seul le professeur peut accorder une seconde chance.'; END IF; IF NOT EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = p_quiz_id AND p_class_id = ANY(coalesce(nullif(q.class_ids, ARRAY[]::text[]), ARRAY[q.class_id]))) THEN RAISE EXCEPTION 'Cette classe ne fait pas partie du quiz sélectionné.'; END IF; FOR v_student IN SELECT ce.student_id::text FROM public.class_enrollments ce WHERE ce.class_id::text = p_class_id AND ce.status = 'active' LOOP IF NOT EXISTS (SELECT 1 FROM public.quiz_retry_grants g WHERE g.quiz_id = p_quiz_id AND g.student_id = v_student AND g.revoked_at IS NULL AND g.used_attempts < g.max_attempts) THEN INSERT INTO public.quiz_retry_grants (quiz_id, student_id, granted_by, reason, max_attempts) VALUES (p_quiz_id, v_student, auth.uid(), nullif(trim(p_reason), ''), greatest(1, p_max_attempts)); v_count := v_count + 1; END IF; END LOOP; RETURN jsonb_build_object('granted', v_count); END; $function$;

CREATE OR REPLACE FUNCTION public.submit_quiz_presence_submission(p_submission jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student TEXT := public.quiz_current_student_id();
  v_quiz public.quizzes%ROWTYPE;
  v_participant public.quiz_participants%ROWTYPE;
  v_launch public.quiz_launches%ROWTYPE;
  v_attempt_no INTEGER;
  v_status TEXT := coalesce(p_submission ->> 'status', 'completed');
  v_score NUMERIC := coalesce((p_submission ->> 'score')::numeric, 0);
  v_max NUMERIC := coalesce((p_submission ->> 'max_score')::numeric, 20);
  v_score20 NUMERIC := coalesce((p_submission ->> 'score_20')::numeric, 0);
  v_is_counted BOOLEAN;
  v_existing public.quiz_attempts%ROWTYPE;
  v_attempt public.quiz_attempts%ROWTYPE;
  v_class_name TEXT;
BEGIN
  SELECT * INTO v_quiz
  FROM public.quizzes
  WHERE id = p_submission ->> 'quiz_id'
  FOR UPDATE;
  IF NOT FOUND OR v_quiz.status <> 'launched' THEN
    RAISE EXCEPTION 'Quiz non lancé.';
  END IF;

  SELECT * INTO v_launch
  FROM public.quiz_launches
  WHERE quiz_id = v_quiz.id AND status = 'launched'
  ORDER BY launched_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun lancement actif.'; END IF;

  SELECT * INTO v_participant
  FROM public.quiz_participants
  WHERE launch_id = v_launch.id AND student_id = v_student
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participation introuvable pour ce lancement.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    WHERE ce.student_id::text=v_student AND ce.status='active'
      AND ce.class_id::text=ANY(coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id]))
  ) THEN RAISE EXCEPTION 'Vous n’êtes plus inscrit dans une classe autorisée pour ce quiz.'; END IF;
  SELECT c.name INTO v_class_name FROM public.classes c WHERE c.id::text=v_participant.class_id;

  -- Un nouvel essai dans le même lancement n'est possible qu'après autorisation.
  -- En revanche, un nouvel envoi réseau après succès retourne le résultat déjà créé.
  IF v_participant.presence_status IN ('completed', 'timeout') THEN
    SELECT * INTO v_existing
    FROM public.quiz_attempts
    WHERE participant_id = v_participant.id
      AND status IN ('completed', 'timeout')
    ORDER BY attempt_number DESC
    LIMIT 1;
    IF FOUND THEN RETURN to_jsonb(v_existing); END IF;
  END IF;

  IF v_participant.presence_status NOT IN ('present', 'retry_authorized') THEN
    RAISE EXCEPTION 'Présence non confirmée ou participation verrouillée.';
  END IF;
  IF v_participant.presence_confirmed_at IS NULL
     OR v_participant.presence_deadline_at IS NULL
     OR clock_timestamp() < v_participant.presence_deadline_at THEN
    RAISE EXCEPTION 'La fenêtre d’initialisation de la présence n’est pas terminée.';
  END IF;
  IF v_status NOT IN ('completed', 'timeout') THEN
    RAISE EXCEPTION 'Statut de soumission invalide.';
  END IF;
  IF v_participant.presence_status = 'present' AND EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student
  ) THEN
    RAISE EXCEPTION 'Une tentative existe déjà; une autorisation est requise.';
  END IF;

  SELECT greatest(
    coalesce((SELECT max(a.attempt_number) FROM public.quiz_attempts a
              WHERE a.quiz_id = v_quiz.id AND a.student_id = v_student), 0),
    coalesce((SELECT max(s.attempt_number) FROM public.quiz_submissions s
              WHERE s.quiz_id = v_quiz.id AND s.student_id = v_student), 0)
  ) + 1 INTO v_attempt_no;

  -- Une seule tentative est comptabilisée pour ce quiz/élève : on conserve le meilleur
  -- score; en cas d'égalité, le nouvel essai remplace le statut de missed/timeout.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.quiz_submissions s
    WHERE s.quiz_id = v_quiz.id AND s.student_id = v_student
      AND s.is_counted = TRUE AND s.score_20 > v_score20
  ) INTO v_is_counted;

  INSERT INTO public.quiz_attempts (
    quiz_id, launch_id, participant_id, student_id, attempt_number, answers, score, max_score,
    score_20, status, feedback, started_at, submitted_at
  ) VALUES (
    v_quiz.id, v_launch.id, v_participant.id, v_student, v_attempt_no,
    coalesce(p_submission -> 'answers', '{}'::jsonb), v_score, v_max, v_score20, v_status,
    coalesce(p_submission -> 'feedback', '{}'::jsonb),
    coalesce(nullif(p_submission ->> 'started_at', '')::timestamptz, v_participant.presence_confirmed_at),
    clock_timestamp()
  ) RETURNING * INTO v_attempt;

  UPDATE public.quiz_participants
  SET presence_status = CASE WHEN v_status = 'timeout' THEN 'timeout' ELSE 'completed' END,
      final_status = v_status,
      final_score = v_score20
  WHERE id = v_participant.id;

  IF v_participant.presence_status = 'retry_authorized' THEN
    UPDATE public.quiz_retry_grants
    SET used_at = coalesce(used_at, clock_timestamp())
    WHERE id = (
      SELECT id FROM public.quiz_retry_grants
      WHERE quiz_id = v_quiz.id AND student_id = v_student AND used_at IS NULL
        AND (launch_id IS NULL OR launch_id = v_launch.id)
      ORDER BY created_at
      LIMIT 1
    );
  END IF;

  IF v_is_counted THEN
    UPDATE public.quiz_submissions
    SET is_counted = FALSE
    WHERE quiz_id = v_quiz.id AND student_id = v_student AND is_counted = TRUE;
  END IF;

  INSERT INTO public.quiz_submissions (
    id, quiz_id, quiz_title, student_id, student_name, student_number, class_id, class_name,
    started_at, submitted_at, answers, score, max_score, score_20, status, feedback, date,
    attempt_number, is_counted
  ) VALUES (
    coalesce(nullif(p_submission ->> 'id', ''), 'sub_' || v_attempt.id::text),
    v_quiz.id, v_quiz.title, v_student,
    coalesce(p_submission ->> 'student_name', ''), p_submission ->> 'student_number',
    coalesce(v_participant.class_id,p_submission ->> 'class_id'), coalesce(v_class_name,p_submission ->> 'class_name'),
    v_attempt.started_at, v_attempt.submitted_at,
    coalesce(p_submission -> 'answers', '{}'::jsonb), v_score, v_max, v_score20, v_status,
    coalesce(p_submission -> 'feedback', '{}'::jsonb), current_date,
    v_attempt_no, v_is_counted
  )
  ON CONFLICT (quiz_id, student_id, attempt_number) DO UPDATE SET
    quiz_title = EXCLUDED.quiz_title,
    student_name = EXCLUDED.student_name,
    student_number = EXCLUDED.student_number,
    class_id = EXCLUDED.class_id,
    class_name = EXCLUDED.class_name,
    started_at = EXCLUDED.started_at,
    submitted_at = EXCLUDED.submitted_at,
    answers = EXCLUDED.answers,
    score = EXCLUDED.score,
    max_score = EXCLUDED.max_score,
    score_20 = EXCLUDED.score_20,
    status = EXCLUDED.status,
    feedback = EXCLUDED.feedback,
    date = EXCLUDED.date,
    is_counted = EXCLUDED.is_counted;

  RETURN to_jsonb(v_attempt);
END;
$function$;
do $checks$
declare v_definition text;
begin
 select pg_get_functiondef('public.launch_quiz_with_presence(text)'::regprocedure) into v_definition;
 if position('class_enrollments' in v_definition)=0 then raise exception 'launch_quiz_with_presence not multi-class aware'; end if;
 select pg_get_functiondef('public.grant_quiz_retry_for_class(text,text,text,integer)'::regprocedure) into v_definition;
 if position('class_enrollments' in v_definition)=0 then raise exception 'grant_quiz_retry_for_class not multi-class aware'; end if;
end;
$checks$;
