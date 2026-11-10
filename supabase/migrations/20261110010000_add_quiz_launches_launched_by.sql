-- Ajoute la colonne manquante dans les bases où quiz_launches existait déjà.
-- CREATE TABLE IF NOT EXISTS ne modifie pas la structure d'une table existante.
ALTER TABLE public.quiz_launches
  ADD COLUMN IF NOT EXISTS launched_by UUID;

NOTIFY pgrst, 'reload schema';
