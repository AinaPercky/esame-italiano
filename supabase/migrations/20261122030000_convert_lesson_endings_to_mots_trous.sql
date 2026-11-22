-- Remplace le composant de saisie spécifique par le type natif mots_trous.
-- Les étudiants choisissent les désinences dans la banque existante, par glisser-déposer ou toucher.
UPDATE public.lesson_blocks lb
SET content = jsonb_set(
  lb.content,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' = 'inductive_fill_are' THEN
          jsonb_set(jsonb_set(step, '{kind}', to_jsonb('mots_trous'::text)), '{data}',
            jsonb_build_object('mots_trous', jsonb_build_object(
              'titre','Verbi regolari in -ARE · parlare',
              'consigne','Completa ogni forma con la desinenza corretta. Trascina la desinenza dalla banca nel posto vuoto.',
              'points_par_phrase',1,
              'banque',jsonb_build_array('-o','-i','-a','-iamo','-ate','-ano'),
              'phrases',jsonb_build_array(
                jsonb_build_object('id','are_io','debut','io parl','fin','.','mot','-o'),
                jsonb_build_object('id','are_tu','debut','tu parl','fin','.','mot','-i'),
                jsonb_build_object('id','are_lui','debut','lui / lei parl','fin','.','mot','-a'),
                jsonb_build_object('id','are_noi','debut','noi parl','fin','.','mot','-iamo'),
                jsonb_build_object('id','are_voi','debut','voi parl','fin','.','mot','-ate'),
                jsonb_build_object('id','are_loro','debut','loro parl','fin','.','mot','-ano')
              )
            )), true)
        WHEN step->>'id' = 'inductive_fill_ere' THEN
          jsonb_set(jsonb_set(step, '{kind}', to_jsonb('mots_trous'::text)), '{data}',
            jsonb_build_object('mots_trous', jsonb_build_object(
              'titre','Verbi regolari in -ERE · leggere',
              'consigne','Completa ogni forma con la desinenza corretta. Trascina la desinenza dalla banca nel posto vuoto.',
              'points_par_phrase',1,
              'banque',jsonb_build_array('-o','-i','-e','-iamo','-ete','-ono'),
              'phrases',jsonb_build_array(
                jsonb_build_object('id','ere_io','debut','io legg','fin','.','mot','-o'),
                jsonb_build_object('id','ere_tu','debut','tu legg','fin','.','mot','-i'),
                jsonb_build_object('id','ere_lui','debut','lui / lei legg','fin','.','mot','-e'),
                jsonb_build_object('id','ere_noi','debut','noi legg','fin','.','mot','-iamo'),
                jsonb_build_object('id','ere_voi','debut','voi legg','fin','.','mot','-ete'),
                jsonb_build_object('id','ere_loro','debut','loro legg','fin','.','mot','-ono')
              )
            )), true)
        WHEN step->>'id' = 'inductive_fill_ire' THEN
          jsonb_set(jsonb_set(step, '{kind}', to_jsonb('mots_trous'::text)), '{data}',
            jsonb_build_object('mots_trous', jsonb_build_object(
              'titre','Verbi regolari in -IRE · dormire',
              'consigne','Completa ogni forma con la desinenza corretta. Trascina la desinenza dalla banca nel posto vuoto.',
              'points_par_phrase',1,
              'banque',jsonb_build_array('-o','-i','-e','-iamo','-ite','-ono'),
              'phrases',jsonb_build_array(
                jsonb_build_object('id','ire_io','debut','io dorm','fin','.','mot','-o'),
                jsonb_build_object('id','ire_tu','debut','tu dorm','fin','.','mot','-i'),
                jsonb_build_object('id','ire_lui','debut','lui / lei dorm','fin','.','mot','-e'),
                jsonb_build_object('id','ire_noi','debut','noi dorm','fin','.','mot','-iamo'),
                jsonb_build_object('id','ire_voi','debut','voi dorm','fin','.','mot','-ite'),
                jsonb_build_object('id','ire_loro','debut','loro dorm','fin','.','mot','-ono')
              )
            )), true)
        ELSE step
      END
      ORDER BY ordinality
    )
    FROM jsonb_array_elements(lb.content->'steps') WITH ORDINALITY AS expanded(step, ordinality)
  ),
  true
)
WHERE lb.id = '2e360684-2867-4377-ae75-763e6726d58b';

DO $$
DECLARE
  count_mots_trous integer;
  count_old integer;
BEGIN
  SELECT count(*) FILTER (WHERE step->>'kind'='mots_trous' AND step->>'id' IN ('inductive_fill_are','inductive_fill_ere','inductive_fill_ire')),
         count(*) FILTER (WHERE step->>'kind'='fill_blanks')
  INTO count_mots_trous, count_old
  FROM public.lesson_blocks lb, LATERAL jsonb_array_elements(lb.content->'steps') step
  WHERE lb.id='2e360684-2867-4377-ae75-763e6726d58b';
  IF count_mots_trous <> 3 OR count_old <> 0 THEN
    RAISE EXCEPTION 'La conversion des trois exercices vers mots_trous a échoué.';
  END IF;
END $$;