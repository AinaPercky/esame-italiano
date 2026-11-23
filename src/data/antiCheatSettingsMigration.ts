export const ANTI_CHEAT_SETTINGS_MIGRATION_SQL = `-- PerckyLingua — Paramètres globaux Anti-Triche (PostgreSQL / Supabase)
-- Migration additive et idempotente :
-- 1. Stocke uniquement les préférences booléennes d'anti-triche (aucune donnée personnelle).
-- 2. Lecture autorisée à anon/authenticated pour appliquer le règlement sur chaque épreuve.
-- 3. Modification strictement réservée au compte enseignant authentifié.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  anti_cheat_screenshot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  anti_cheat_tab_switch_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.app_settings (id, anti_cheat_screenshot_enabled, anti_cheat_tab_switch_enabled)
VALUES ('global', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_settings FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.app_settings FROM authenticated;
GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;

DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
CREATE POLICY "app_settings_read_all"
  ON public.app_settings FOR SELECT TO anon, authenticated
  USING (id = 'global');

DROP POLICY IF EXISTS "app_settings_teacher_manage" ON public.app_settings;
CREATE POLICY "app_settings_teacher_manage"
  ON public.app_settings FOR ALL TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'ainapercky@gmail.com'
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'ainapercky@gmail.com'
  );

CREATE OR REPLACE FUNCTION public.save_anti_cheat_settings(
  p_screenshot_enabled BOOLEAN,
  p_tab_switch_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.app_settings%ROWTYPE;
BEGIN
  IF auth.role() <> 'authenticated'
     OR lower(coalesce(auth.jwt() ->> 'email', '')) <> 'ainapercky@gmail.com' THEN
    RAISE EXCEPTION 'Action réservée à l''enseignant.';
  END IF;

  INSERT INTO public.app_settings (
    id,
    anti_cheat_screenshot_enabled,
    anti_cheat_tab_switch_enabled,
    updated_at
  )
  VALUES (
    'global',
    coalesce(p_screenshot_enabled, TRUE),
    coalesce(p_tab_switch_enabled, TRUE),
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE
  SET anti_cheat_screenshot_enabled = EXCLUDED.anti_cheat_screenshot_enabled,
      anti_cheat_tab_switch_enabled = EXCLUDED.anti_cheat_tab_switch_enabled,
      updated_at = timezone('utc'::text, now())
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_anti_cheat_settings(BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_anti_cheat_settings(BOOLEAN, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
`;
