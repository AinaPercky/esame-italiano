-- Réconciliation additive du schéma de présence PerckyLingua.
-- Les anciennes versions utilisaient un schéma différent pour les mêmes tables.
-- CREATE TABLE IF NOT EXISTS ne met jamais à niveau une table déjà existante.
-- Cette migration conserve les lignes historiques et ajoute les colonnes attendues
-- par les RPC actuelles. Les launch_id historiques restent NULL car leur rattachement
-- à un lancement précis ne peut pas être déduit sans ambiguïté.

CREATE TABLE IF NOT EXISTS public.quiz_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  launched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  launched_by UUID,
  presence_deadline_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'launched',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_launches
  ADD COLUMN IF NOT EXISTS launched_by UUID,
  ADD COLUMN IF NOT EXISTS presence_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'launched',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.quiz_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID,
  quiz_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  class_id TEXT,
  presence_status TEXT NOT NULL DEFAULT 'pending',
  presence_confirmed_at TIMESTAMPTZ,
  presence_deadline_at TIMESTAMPTZ,
  attendance_locked_at TIMESTAMPTZ,
  final_status TEXT,
  final_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_participants
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS quiz_id TEXT,
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS class_id TEXT,
  ADD COLUMN IF NOT EXISTS presence_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS presence_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS presence_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_status TEXT,
  ADD COLUMN IF NOT EXISTS final_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.quiz_participants SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.quiz_participants ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.quiz_participants ALTER COLUMN id SET NOT NULL;

-- L'ancien schéma limitait presence_status à pending/present/absent.
-- Remplacer uniquement les CHECK portant sur cette colonne; les données restent intactes.
DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.quiz_participants'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%presence_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.quiz_participants DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.quiz_participants
  ADD CONSTRAINT quiz_participants_presence_status_check
  CHECK (presence_status IN ('pending', 'present', 'absent', 'completed', 'timeout', 'retry_authorized'))
  NOT VALID;

CREATE TABLE IF NOT EXISTS public.quiz_retry_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  granted_by UUID,
  reason TEXT,
  launch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  max_attempts INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.quiz_retry_grants
  ADD COLUMN IF NOT EXISTS granted_by UUID,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id TEXT NOT NULL,
  launch_id UUID,
  participant_id UUID,
  student_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC(7,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(7,2) NOT NULL DEFAULT 20,
  score_20 NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS participant_id UUID,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS score NUMERIC(7,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(7,2) DEFAULT 20,
  ADD COLUMN IF NOT EXISTS score_20 NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS feedback JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.quiz_submissions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  quiz_title TEXT,
  student_id TEXT NOT NULL,
  student_name TEXT,
  student_number TEXT,
  class_id TEXT,
  class_name TEXT,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC DEFAULT 0,
  max_score NUMERIC DEFAULT 20,
  score_20 NUMERIC DEFAULT 0,
  status TEXT,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  date DATE DEFAULT current_date
);

ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS launch_id UUID,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_counted BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS attendance_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS retry_grant_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_participants_launch_student
  ON public.quiz_participants (launch_id, student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_participants_launch_status
  ON public.quiz_participants (launch_id, presence_status);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_launch_student
  ON public.quiz_attempts (launch_id, student_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_quiz_retry_grants_launch_student
  ON public.quiz_retry_grants (launch_id, student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_launches_quiz_status
  ON public.quiz_launches (quiz_id, status, launched_at DESC);

NOTIFY pgrst, 'reload schema';
