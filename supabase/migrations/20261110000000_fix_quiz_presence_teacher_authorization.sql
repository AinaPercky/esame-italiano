-- Corrige l'autorisation du lancement de quiz avec présence.
-- Le flux de connexion actuel identifie le professeur par ADMIN_EMAIL et ne
-- renseigne pas app_metadata.role. On vérifie donc l'e-mail du JWT côté serveur.
-- Ne jamais remplacer cette vérification par user_metadata, modifiable par l'utilisateur.

CREATE OR REPLACE FUNCTION public.quiz_is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'ainapercky@gmail.com';
$$;

NOTIFY pgrst, 'reload schema';
