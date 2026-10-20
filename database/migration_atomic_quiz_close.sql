-- RPC transactionnelles pour sérialiser lancement, clôture et remise des quiz.
-- À exécuter une fois dans Supabase > SQL Editor avant de déployer le client.

ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS public_id UUID;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS class_ids TEXT[];

CREATE OR REPLACE FUNCTION public.launch_quiz_and_clear_missed(p_quiz_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_quiz public.quizzes%ROWTYPE;
BEGIN
    SELECT * INTO v_quiz
    FROM public.quizzes
    WHERE id = p_quiz_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz introuvable: %', p_quiz_id;
    END IF;

    -- Une relance remet uniquement les absences précédentes à zéro;
    -- les notes réelles (completed/timeout) ne sont jamais supprimées.
    DELETE FROM public.quiz_submissions
    WHERE quiz_id = p_quiz_id AND status = 'missed';

    UPDATE public.quizzes
    SET status = 'launched', launched_at = now(), expires_at = NULL
    WHERE id = p_quiz_id
    RETURNING * INTO v_quiz;

    RETURN to_jsonb(v_quiz);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_quiz_and_mark_missed(p_quiz_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_quiz public.quizzes%ROWTYPE;
    v_submissions JSONB;
BEGIN
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

    -- DO NOTHING protège toute copie déjà enregistrée contre l'écrasement,
    -- même si son insertion s'est produite en concurrence.
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

CREATE OR REPLACE FUNCTION public.submit_quiz_submission(p_submission JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_quiz_id TEXT := p_submission ->> 'quiz_id';
    v_quiz public.quizzes%ROWTYPE;
    v_submission_id TEXT;
BEGIN
    IF v_quiz_id IS NULL OR v_quiz_id = '' THEN
        RAISE EXCEPTION 'Identifiant de quiz manquant.';
    END IF;

    -- Le même verrou que les RPC de lancement/clôture définit sans course
    -- si la remise ou la clôture a lieu en premier.
    SELECT * INTO v_quiz
    FROM public.quizzes
    WHERE id = v_quiz_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz introuvable: %', v_quiz_id;
    END IF;

    IF v_quiz.status <> 'launched' THEN
        RAISE EXCEPTION 'Ce quiz est clôturé ou n''est pas lancé.';
    END IF;

    INSERT INTO public.quiz_submissions (
        id, quiz_id, quiz_title, student_id, student_name, student_number,
        class_id, class_name, started_at, submitted_at, answers,
        score, max_score, score_20, status, feedback, date
    ) VALUES (
        p_submission ->> 'id',
        v_quiz_id,
        coalesce(p_submission ->> 'quiz_title', v_quiz.title),
        p_submission ->> 'student_id',
        p_submission ->> 'student_name',
        p_submission ->> 'student_number',
        p_submission ->> 'class_id',
        p_submission ->> 'class_name',
        (p_submission ->> 'started_at')::timestamptz,
        nullif(p_submission ->> 'submitted_at', '')::timestamptz,
        coalesce(p_submission -> 'answers', '{}'::jsonb),
        coalesce((p_submission ->> 'score')::numeric, 0),
        coalesce((p_submission ->> 'max_score')::numeric, 20),
        coalesce((p_submission ->> 'score_20')::numeric, 0),
        p_submission ->> 'status',
        coalesce(p_submission -> 'feedback', '{}'::jsonb),
        (p_submission ->> 'date')::date
    )
    ON CONFLICT (quiz_id, student_id) DO NOTHING
    RETURNING id INTO v_submission_id;

    IF v_submission_id IS NULL THEN
        RAISE EXCEPTION 'Une soumission existe déjà pour cet élève et ce quiz.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.launch_quiz_and_clear_missed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_quiz_and_mark_missed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_submission(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.launch_quiz_and_clear_missed(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_quiz_and_mark_missed(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_submission(JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
