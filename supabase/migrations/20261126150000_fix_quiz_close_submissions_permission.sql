-- Fix quiz closure after quiz_submissions was hardened with RLS/table privileges.
-- The RPC must perform the multi-table close atomically without granting direct
-- write access to quiz_submissions to the client. SECURITY DEFINER runs with the
-- migration/function owner's table privileges; quiz_is_teacher() remains the
-- authorization boundary.

CREATE OR REPLACE FUNCTION public.close_quiz_and_mark_missed(p_quiz_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quiz public.quizzes%ROWTYPE;
    v_submissions JSONB;
BEGIN
    IF NOT public.quiz_is_teacher() THEN
        RAISE EXCEPTION 'Autorisation professeur requise.';
    END IF;

    SELECT * INTO v_quiz
    FROM public.quizzes
    WHERE id = p_quiz_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz introuvable: %', p_quiz_id;
    END IF;

    UPDATE public.quizzes
    SET status = 'closed'
    WHERE id = p_quiz_id
    RETURNING * INTO v_quiz;

    -- Insert only missing copies. Existing student answers, grades and manual
    -- corrections are preserved, including when closure races with submission.
    INSERT INTO public.quiz_submissions (
        id, quiz_id, quiz_title, student_id, student_name, student_number,
        class_id, class_name, started_at, submitted_at, answers,
        score, max_score, score_20, status, feedback, date
    )
    SELECT
        'sub_missed_' || v_quiz.id || '_' || s.id::text,
        v_quiz.id,
        v_quiz.title,
        s.id::text,
        concat_ws(' ', s.first_name, s.last_name),
        s.student_number,
        s.class_id::text,
        c.name,
        coalesce(v_quiz.launched_at, now()),
        now(),
        '{}'::jsonb,
        0,
        coalesce(v_quiz.total_points, 20),
        0,
        'missed',
        '{}'::jsonb,
        current_date
    FROM public.students AS s
    LEFT JOIN public.classes AS c ON c.id::text = s.class_id::text
    WHERE s.class_id::text = ANY (
        coalesce(nullif(v_quiz.class_ids, ARRAY[]::text[]), ARRAY[v_quiz.class_id])
    )
    ON CONFLICT (quiz_id, student_id) DO NOTHING;

    SELECT coalesce(jsonb_agg(to_jsonb(sub) ORDER BY sub.student_name), '[]'::jsonb)
    INTO v_submissions
    FROM public.quiz_submissions AS sub
    WHERE sub.quiz_id = p_quiz_id;

    RETURN jsonb_build_object(
        'quiz', to_jsonb(v_quiz),
        'submissions', v_submissions
    );
END;
$$;

-- Do not expose this privileged RPC to anonymous callers. Authenticated teachers
-- can close quizzes; non-teachers are rejected by quiz_is_teacher() above.
REVOKE ALL ON FUNCTION public.close_quiz_and_mark_missed(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_quiz_and_mark_missed(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
