-- Ajout non destructif de la catégorie des quiz existants.
-- Les quiz déjà créés reçoivent la catégorie générique « Autre ».
ALTER TABLE public.quizzes
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Autre';

-- Actualise la cache de schéma PostgREST utilisée par l’API Supabase.
NOTIFY pgrst, 'reload schema';
