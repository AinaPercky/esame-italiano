-- Isolated fixtures for the ordered Phase A -> Phase B integration workflow only.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$roles$;

CREATE OR REPLACE FUNCTION public.get_public_quiz_catalog()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '[]'::jsonb $$;
CREATE OR REPLACE FUNCTION public.get_public_quiz(p_quiz_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.evaluate_public_quiz_question(p_quiz_id text, p_question_id text, p_answer text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.prepare_student_registration(
  p_first_name text, p_last_name text, p_gender text, p_student_number text, p_class_id uuid, p_email text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.get_public_oral_report(
  p_exam_id uuid, p_student_id uuid, p_lookup text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.written_exam_auto_question_score(p_attempt_id uuid, p_answers jsonb)
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0 $$;

GRANT EXECUTE ON FUNCTION public.get_public_quiz_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_quiz(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_public_quiz_question(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_student_registration(text,text,text,text,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_oral_report(uuid,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.written_exam_auto_question_score(uuid,jsonb) TO anon, authenticated, service_role;

CREATE TABLE public.security_integration_trigger_probe (
  id integer PRIMARY KEY,
  touched boolean NOT NULL DEFAULT false
);
CREATE OR REPLACE FUNCTION public.security_integration_probe_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  NEW.touched := true;
  RETURN NEW;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.security_integration_probe_trigger() TO anon, authenticated;
CREATE TRIGGER security_integration_probe_before_insert
BEFORE INSERT ON public.security_integration_trigger_probe
FOR EACH ROW EXECUTE FUNCTION public.security_integration_probe_trigger();
