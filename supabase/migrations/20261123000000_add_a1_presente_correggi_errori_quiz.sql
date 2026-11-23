-- Esercizio 09: quiz A1 di correzione degli errori al presente indicativo.
-- Migration de contenu uniquement : le schéma existant de public.quizzes suffit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = 'ee8365c2-e7c8-44b1-8d01-c4dbef8b4df6'::uuid
  ) THEN
    RAISE EXCEPTION 'La classe A1-lifemada est introuvable.';
  END IF;
END $$;

INSERT INTO public.quizzes (
  id, class_id, class_ids, title, description, duration_minutes, status,
  questions, total_points, is_public, category, attendance_mode,
  presence_window_seconds, level
)
VALUES (
  'quiz-presente-indicativo-correggi-errori-a1',
  'ee8365c2-e7c8-44b1-8d01-c4dbef8b4df6',
  ARRAY['ee8365c2-e7c8-44b1-8d01-c4dbef8b4df6'],
  'Presente indicativo – Le tre coniugazioni | Esercizio 09',
  'Correggi gli errori: 20 domande sulle tre coniugazioni, le forme in -ISC-, i verbi in -CARE/-GARE e gli ausiliari ESSERE e AVERE.',
  10,
  'draft',
  $questions$
[
  {
    "id": "correggi-q01",
    "type": "qcm",
    "question": "Correggi la frase: «Tu cerci le chiavi». Qual è la forma corretta?",
    "options": [
      "Tu cerchi le chiavi.",
      "Tu cerci le chiavi.",
      "Tu cerchi le chiave.",
      "Tu cerca le chiavi."
    ],
    "correct_answer": "Tu cerchi le chiavi.",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Corriger les verbes en -CARE",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Cercare conserve le son dur /k/ devant i grâce au h : tu cerchi."
  },
  {
    "id": "correggi-q02",
    "type": "qcm",
    "question": "Qual è la forma corretta? «Tu ___ il conto al ristorante» (pagare).",
    "options": [
      "paghi",
      "pago",
      "paga",
      "pagate"
    ],
    "correct_answer": "paghi",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Corriger les verbes en -GARE",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Pagare devient paghi avec tu : le h conserve le son dur /g/ devant i."
  },
  {
    "id": "correggi-q03",
    "type": "qcm",
    "question": "Scegli la frase corretta: «Voi ___ a calcio il sabato» (giocare).",
    "options": [
      "giochi",
      "giocano",
      "giocate",
      "giocete"
    ],
    "correct_answer": "giocate",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer les verbes en -CARE",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Avec voi, giocare se conjugue giocate. Le h n'est pas nécessaire devant a."
  },
  {
    "id": "correggi-q04",
    "type": "qcm",
    "question": "Quale forma corregge «Lui spiegie la regola»?",
    "options": [
      "spiega",
      "spieghi",
      "spiegie",
      "spiegano"
    ],
    "correct_answer": "spiega",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer les verbes en -GARE",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "La troisième personne du singulier de spiegare est spiega."
  },
  {
    "id": "correggi-q05",
    "type": "qcm",
    "question": "Correggi: «Io capi la domanda». Qual è la forma corretta?",
    "options": [
      "capo",
      "capisco",
      "capisca",
      "capite"
    ],
    "correct_answer": "capisco",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer les verbes en -IRE avec -ISC-",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Capire ajoute -isc- à io : io capisco."
  },
  {
    "id": "correggi-q06",
    "type": "qcm",
    "question": "Scegli la forma corretta: «Tu ___ presto il lavoro» (finire).",
    "options": [
      "fini",
      "finisci",
      "finisce",
      "finisciamo"
    ],
    "correct_answer": "finisci",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer les verbes en -IRE avec -ISC-",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Finire prend -isc- avec tu : tu finisci."
  },
  {
    "id": "correggi-q07",
    "type": "qcm",
    "question": "Qual è la forma corretta di preferire con «noi»?",
    "options": [
      "preferiamo",
      "preferiscono",
      "preferite",
      "preferisce"
    ],
    "correct_answer": "preferiamo",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Distinguer les personnes avec les verbes en -ISC-",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Les verbes en -isc- ne prennent pas -isc- à noi : noi preferiamo."
  },
  {
    "id": "correggi-q08",
    "type": "qcm",
    "question": "Correggi: «Loro dorme otto ore». Qual è la forma corretta?",
    "options": [
      "dormono",
      "dormiamo",
      "dormite",
      "dorme"
    ],
    "correct_answer": "dormono",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer les verbes réguliers en -IRE",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Avec loro, dormire prend la terminaison -ono : dormono."
  },
  {
    "id": "correggi-q09",
    "type": "qcm",
    "question": "Quale forma è corretta con «voi»? (leggere)",
    "options": [
      "leggono",
      "leggete",
      "legge",
      "leggiamo"
    ],
    "correct_answer": "leggete",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer les verbes réguliers en -ERE",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "La terminaison de voi pour les verbes réguliers en -ERE est -ete : leggete."
  },
  {
    "id": "correggi-q10",
    "type": "qcm",
    "question": "Correggi: «Lei scrivono una lettera».",
    "options": [
      "Lei scrive una lettera.",
      "Lei scrivi una lettera.",
      "Lei scrivete una lettera.",
      "Lei scrivo una lettera."
    ],
    "correct_answer": "Lei scrive una lettera.",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Accorder le verbe avec le sujet",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "Lei correspond à la troisième personne du singulier : scrive."
  },
  {
    "id": "correggi-q11",
    "type": "qcm",
    "question": "Qual è la forma corretta di ESSERE con «noi»?",
    "options": [
      "siamo",
      "siete",
      "sono",
      "è"
    ],
    "correct_answer": "siamo",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer l'auxiliaire ESSERE",
    "skill_code": "PRESENTE_INDICATIVO_AUSILIARI",
    "explanation": "Au présent, essere se conjugue : io sono, tu sei, lui/lei è, noi siamo."
  },
  {
    "id": "correggi-q12",
    "type": "qcm",
    "question": "Correggi: «Loro ha due fratelli». Qual è la forma corretta?",
    "options": [
      "Loro hanno due fratelli.",
      "Loro abbiamo due fratelli.",
      "Loro avete due fratelli.",
      "Loro è due fratelli."
    ],
    "correct_answer": "Loro hanno due fratelli.",
    "points": 1,
    "time_limit_seconds": 25,
    "competency": "Conjuguer l'auxiliaire AVERE",
    "skill_code": "PRESENTE_INDICATIVO_AUSILIARI",
    "explanation": "Avec loro, avere se conjugue hanno."
  },
  {
    "id": "correggi-q13",
    "type": "text",
    "question": "Correggi la frase «Tu cerci un lavoro». Scrivi soltanto la forma corretta del verbo.",
    "correct_answer": "cerchi",
    "points": 1,
    "time_limit_seconds": 40,
    "competency": "Corriger l'orthographe des verbes en -CARE",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "La forme correcte est cerchi : le h conserve le son dur /k/ devant i."
  },
  {
    "id": "correggi-q14",
    "type": "text",
    "question": "Correggi la frase «Io capi tutto». Scrivi soltanto la forma corretta del verbo.",
    "correct_answer": "capisco",
    "points": 1,
    "time_limit_seconds": 40,
    "competency": "Corriger les verbes en -IRE avec -ISC-",
    "skill_code": "PRESENTE_INDICATIVO",
    "explanation": "La première personne de capire est capisco."
  },
  {
    "id": "correggi-q15",
    "type": "text",
    "question": "Correggi la frase «Noi è pronti». Scrivi soltanto la forma corretta di ESSERE.",
    "correct_answer": "siamo",
    "points": 1,
    "time_limit_seconds": 40,
    "competency": "Corriger l'auxiliaire ESSERE",
    "skill_code": "PRESENTE_INDICATIVO_AUSILIARI",
    "explanation": "Avec noi, essere devient siamo."
  },
  {
    "id": "correggi-q16",
    "type": "text",
    "question": "Correggi la frase «Loro avete due sorelle». Scrivi soltanto la forma corretta di AVERE.",
    "correct_answer": "hanno",
    "points": 1,
    "time_limit_seconds": 40,
    "competency": "Corriger l'auxiliaire AVERE",
    "skill_code": "PRESENTE_INDICATIVO_AUSILIARI",
    "explanation": "Avec loro, avere devient hanno."
  },
  {
    "id": "correggi-q17",
    "type": "mots_trous",
    "question": "Correggi la frase scegliendo la forma corretta dalla banca.",
    "points": 1,
    "time_limit_seconds": 30,
    "competency": "Corriger les verbes en -CARE",
    "skill_code": "PRESENTE_INDICATIVO",
    "mots_trous": {
      "titre": "Cercare",
      "consigne": "Glisse la bonne forme dans la phrase.",
      "points_par_phrase": 1,
      "banque": [
        "cerchi",
        "cerco",
        "cerca"
      ],
      "phrases": [
        {
          "id": "p1",
          "debut": "Tu ",
          "fin": " le quaderno.",
          "mot": "cerchi"
        }
      ]
    },
    "explanation": "Tu cerchi : le h maintient le son dur de c devant i."
  },
  {
    "id": "correggi-q18",
    "type": "mots_trous",
    "question": "Correggi la frase scegliendo la forma corretta dalla banca.",
    "points": 1,
    "time_limit_seconds": 30,
    "competency": "Corriger les verbes en -GARE",
    "skill_code": "PRESENTE_INDICATIVO",
    "mots_trous": {
      "titre": "Pagare",
      "consigne": "Glisse la bonne forme dans la phrase.",
      "points_par_phrase": 1,
      "banque": [
        "paghi",
        "pago",
        "paga"
      ],
      "phrases": [
        {
          "id": "p1",
          "debut": "Tu ",
          "fin": " il biglietto.",
          "mot": "paghi"
        }
      ]
    },
    "explanation": "Tu paghi : le h maintient le son dur de g devant i."
  },
  {
    "id": "correggi-q19",
    "type": "mots_trous",
    "question": "Correggi la frase scegliendo la forma corretta dalla banca.",
    "points": 1,
    "time_limit_seconds": 30,
    "competency": "Corriger les verbes en -IRE avec -ISC-",
    "skill_code": "PRESENTE_INDICATIVO",
    "mots_trous": {
      "titre": "Finire",
      "consigne": "Glisse la bonne forme dans la phrase.",
      "points_par_phrase": 1,
      "banque": [
        "finisci",
        "finisco",
        "finiscono"
      ],
      "phrases": [
        {
          "id": "p1",
          "debut": "Tu ",
          "fin": " il compito.",
          "mot": "finisci"
        }
      ]
    },
    "explanation": "Avec tu, finire prend -isc- : finisci."
  },
  {
    "id": "correggi-q20",
    "type": "mots_trous",
    "question": "Correggi la frase scegliendo la forma corretta dalla banca.",
    "points": 1,
    "time_limit_seconds": 30,
    "competency": "Corriger l'auxiliaire ESSERE",
    "skill_code": "PRESENTE_INDICATIVO_AUSILIARI",
    "mots_trous": {
      "titre": "Essere",
      "consigne": "Glisse la bonne forme dans la phrase.",
      "points_par_phrase": 1,
      "banque": [
        "siete",
        "siamo",
        "sono"
      ],
      "phrases": [
        {
          "id": "p1",
          "debut": "Voi ",
          "fin": " pronti.",
          "mot": "siete"
        }
      ]
    },
    "explanation": "Avec voi, essere se conjugue siete."
  }
]
  $questions$::jsonb,
  20,
  false,
  'Conjugaison',
  'legacy',
  10,
  'A1'
)
ON CONFLICT (id) DO UPDATE SET
  class_id = EXCLUDED.class_id,
  class_ids = EXCLUDED.class_ids,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  duration_minutes = EXCLUDED.duration_minutes,
  status = 'draft',
  questions = EXCLUDED.questions,
  total_points = EXCLUDED.total_points,
  is_public = false,
  category = EXCLUDED.category,
  level = EXCLUDED.level;
