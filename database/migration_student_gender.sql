-- Migration non destructive : sexe et accord du message de bienvenue
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'homme'
    CHECK (gender IN ('homme', 'femme'));
