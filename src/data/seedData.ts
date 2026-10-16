import { ClassRoom, Student, Exam, ExamRubric, Evaluation, PassOrderItem } from '../types';

export const SEED_CLASSES: ClassRoom[] = [
  { id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', name: 'Classe A1 - Débutants', created_at: '2026-09-01T08:00:00Z' },
  { id: '2f8d07e6-e4f5-5ede-aa59-ebe4ed99bdbf', name: 'Classe B1 - Intermédiaires', created_at: '2026-09-01T08:00:00Z' }
];

export const SEED_STUDENTS: Student[] = [
  { id: 'cc5a2fbf-5bd7-4b48-a9eb-79582de7ee8e', class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', first_name: 'Jean', last_name: 'Rakoto', email: 'jean.rakoto@eleve.esame.fr', student_number: '1', created_at: '2026-09-02T08:00:00Z', updated_at: '2026-09-02T08:00:00Z', validation_status: 'approved' },
  { id: '14a6ad2b-b2a2-41d9-a3ff-46ba9dce78f5', class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', first_name: 'Marie', last_name: 'Rabe', email: 'marie.rabe@eleve.esame.fr', student_number: '2', created_at: '2026-09-02T08:00:00Z', updated_at: '2026-09-02T08:00:00Z', validation_status: 'approved' },
  { id: '76c008f3-2fc0-4832-973f-3dd985bd24bb', class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', first_name: 'Paul', last_name: 'Rasoa', email: 'paul.rasoa@eleve.esame.fr', student_number: '3', created_at: '2026-09-02T08:00:00Z', updated_at: '2026-09-02T08:00:00Z', validation_status: 'approved' },
  { id: '3562ded9-6b6a-49bf-af3f-1cf30ef3f787', class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', first_name: 'Sarah', last_name: 'Ranaivo', email: 'sarah.ranaivo@eleve.esame.fr', student_number: '4', created_at: '2026-09-02T08:00:00Z', updated_at: '2026-09-02T08:00:00Z', validation_status: 'approved' },
  { id: '5b71efa8-4cb9-478e-95ba-2be41fa15ef1', class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', first_name: 'Lucas', last_name: 'Martin', email: 'lucas.martin@eleve.esame.fr', student_number: '5', created_at: '2026-09-03T08:00:00Z', updated_at: '2026-09-03T08:00:00Z', validation_status: 'approved' },
  { id: '6c82f0b9-5dc0-489f-a6cb-3cf520b26f02', class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', first_name: 'Giulia', last_name: 'Rossi', email: 'giulia.rossi@eleve.esame.fr', student_number: '6', created_at: '2026-09-03T08:00:00Z', updated_at: '2026-09-03T08:00:00Z', validation_status: 'approved' },
  { id: '7d9301ca-6ed1-49a0-b7dc-4da631c37013', class_id: '2f8d07e6-e4f5-5ede-aa59-ebe4ed99bdbf', first_name: 'Matteo', last_name: 'Conti', email: 'matteo.conti@eleve.esame.fr', student_number: '1', created_at: '2026-09-03T08:00:00Z', updated_at: '2026-09-03T08:00:00Z', validation_status: 'approved' },
  { id: '8ea412db-7fe2-40b1-c8ed-5eb742d48124', class_id: '2f8d07e6-e4f5-5ede-aa59-ebe4ed99bdbf', first_name: 'Elena', last_name: 'Bernard', email: 'elena.bernard@eleve.esame.fr', student_number: '2', created_at: '2026-09-03T08:00:00Z', updated_at: '2026-09-03T08:00:00Z', validation_status: 'approved' },
  { id: '9fa523ec-8fe3-41c2-d9fe-6fc853e59235', class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae', first_name: 'Alessio', last_name: 'Moretti', email: 'alessio.moretti@eleve.esame.fr', student_number: '7', created_at: '2026-10-15T09:20:00Z', updated_at: '2026-10-15T09:20:00Z', validation_status: 'pending' },
  { id: 'a0b634fd-90f4-42d3-ea0f-70d964f6a346', class_id: '2f8d07e6-e4f5-5ede-aa59-ebe4ed99bdbf', first_name: 'Sofia', last_name: 'Ricci', email: 'sofia.ricci@eleve.esame.fr', student_number: '3', created_at: '2026-10-15T11:45:00Z', updated_at: '2026-10-15T11:45:00Z', validation_status: 'pending' }
];

export const SEED_EXAMS: Exam[] = [
  {
    id: '657a2d18-23ed-483f-9095-9e4d6b650ff9',
    class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae',
    title: 'Présentation orale — Gli Animali (Sujet libre par élève)',
    description: 'Description orale en italien d\'un animal choisi individuellement par chaque élève selon la grille des 10 critères.',
    exam_date: '2026-09-27',
    status: 'in_progress',
    created_at: '2026-09-10T09:00:00Z'
  },
  {
    id: '768b3e29-34fe-5940-a106-af5e7b76100a',
    class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae',
    title: 'Présentation — I monumenti di Roma',
    description: "Description architecturale et historique d'un monument romain au choix.",
    exam_date: '2026-09-15',
    status: 'completed',
    created_at: '2026-09-05T09:00:00Z'
  }
];

export const ANIMAL_DEFAULT_RUBRICS: Omit<ExamRubric, 'id' | 'exam_id'>[] = [
  { position: 1, title: 'Identificazione', question: 'Che animale è?', example_sentence: 'Questo animale è…', points: 1 },
  { position: 2, title: 'Nome scientifico e significato', question: 'Qual è il suo nome scientifico?', example_sentence: 'Il suo nome scientifico è…', points: 1 },
  { position: 3, title: 'Aspetto fisico', question: "Com'è fatto?", example_sentence: 'Ha… / È ricoperto di…', points: 1 },
  { position: 4, title: 'Dimensioni e peso', question: 'Quanto è grande?', example_sentence: 'È lungo circa… / Pesa circa…', points: 1 },
  { position: 5, title: 'Habitat e distribuzione', question: 'Dove vive?', example_sentence: 'Vive soprattutto in…', points: 1 },
  { position: 6, title: 'Alimentazione', question: 'Che cosa mangia?', example_sentence: 'Si nutre di…', points: 1 },
  { position: 7, title: 'Comportamento', question: 'Come si comporta?', example_sentence: 'Di solito… / Spesso…', points: 1 },
  { position: 8, title: 'Particolarità', question: 'Che cosa lo rende speciale?', example_sentence: 'È particolare perché…', points: 1 },
  { position: 9, title: 'Curiosità', question: 'Qual è una curiosità interessante?', example_sentence: "Una cosa interessante è che…", points: 1 },
  { position: 10, title: 'Utilità e ruolo ecologico', question: 'Qual è la sua importanza ecologica o la sua utilità?', example_sentence: 'Ha un ruolo importante perché… / Può essere utile per…', points: 1 }
];

export const ZEBU_DEFAULT_RUBRICS = ANIMAL_DEFAULT_RUBRICS;

export const SEED_RUBRIC_IDS = [
  'f04130b3-d8dd-4431-be09-c8a4c670423f',
  'c38b9ee4-7827-487d-81e3-29971f80c349',
  'a7cd3ebb-37e0-4540-8eb7-9a4f2dfdb07d',
  '3b975ff7-0c2e-4679-8f94-a8ac0500584e',
  '3f902be8-266b-4bfe-b61b-219625068ea1',
  '3bb7e2e3-f8e8-40fe-a62b-75dc9abef0a2',
  'c866873f-b889-408b-a1eb-5d0e149bd5a4',
  'a0325c09-0bf9-43f9-9e70-febd1b731c8b',
  'f9686dc4-3686-4c56-a942-5ab9176a4fb8',
  'd63a2238-d0a8-46f3-a4df-7f22da7d90f1'
];

export const SEED_RUBRICS: ExamRubric[] = ANIMAL_DEFAULT_RUBRICS.map((r, idx) => ({
  id: SEED_RUBRIC_IDS[idx] || `r_${idx + 1}`,
  exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9',
  ...r
}));

export const SEED_EVALUATIONS: Evaluation[] = [
  {
    id: 'd6df26fb-995f-4507-ba69-8e6eee26dc40',
    exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9',
    student_id: 'cc5a2fbf-5bd7-4b48-a9eb-79582de7ee8e', // Jean Rakoto
    presented_animal: 'Il lupo appenninico',
    total_score: 8,
    status: 'completed',
    max_duration_seconds: 180,
    duration_used_seconds: 165,
    timer_status: 'stopped_manually',
    created_at: '2026-09-27T09:00:00Z',
    updated_at: '2026-09-27T09:00:00Z',
    details: [
      { rubric_id: SEED_RUBRIC_IDS[0], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[1], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[2], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[3], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[4], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[5], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[6], is_validated: false, awarded_points: 0, error_note: 'Esitazione sul verbo "cacciare in branco"' },
      { rubric_id: SEED_RUBRIC_IDS[7], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[8], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[9], is_validated: false, awarded_points: 0, error_note: 'Vocabolario ecologico da approfondire' }
    ]
  },
  {
    id: 'e7ef37ac-1160-4618-cb70-9f7fff37ed51',
    exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9',
    student_id: '14a6ad2b-b2a2-41d9-a3ff-46ba9dce78f5', // Marie Rabe
    presented_animal: "L'aquila reale",
    total_score: 9,
    status: 'completed',
    max_duration_seconds: 180,
    duration_used_seconds: 172,
    timer_status: 'stopped_manually',
    created_at: '2026-09-27T09:15:00Z',
    updated_at: '2026-09-27T09:15:00Z',
    details: [
      { rubric_id: SEED_RUBRIC_IDS[0], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[1], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[2], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[3], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[4], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[5], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[6], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[7], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[8], is_validated: true, awarded_points: 1 },
      { rubric_id: SEED_RUBRIC_IDS[9], is_validated: false, awarded_points: 0, error_note: 'Piccola confusione sulle specie protette' }
    ]
  },
  {
    id: 'f8fa48bd-2271-4729-dc81-008aaa48fe62',
    exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9',
    student_id: '76c008f3-2fc0-4832-973f-3dd985bd24bb', // Paul Rasoa
    presented_animal: 'Il delfino',
    total_score: 10,
    status: 'completed',
    max_duration_seconds: 180,
    duration_used_seconds: 178,
    timer_status: 'stopped_manually',
    created_at: '2026-09-27T09:30:00Z',
    updated_at: '2026-09-27T09:30:00Z',
    details: SEED_RUBRIC_IDS.map(id => ({ rubric_id: id, is_validated: true, awarded_points: 1 }))
  }
];

export const SEED_PASS_ORDER: PassOrderItem[] = [
  { id: 'd8a48b3e-52ef-42f2-8d54-d60d442945f1', exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9', student_id: '14a6ad2b-b2a2-41d9-a3ff-46ba9dce78f5', position: 1, status: 'completed' },
  { id: '211cbf5c-bf17-4940-b27b-a1054976755f', exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9', student_id: 'cc5a2fbf-5bd7-4b48-a9eb-79582de7ee8e', position: 2, status: 'completed' },
  { id: 'a2d2d568-9175-4d4a-a9d4-91d05b3e1c9f', exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9', student_id: '76c008f3-2fc0-4832-973f-3dd985bd24bb', position: 3, status: 'completed' },
  { id: '3a3198ea-f899-4f2e-b73d-b20d63f0eafe', exam_id: '657a2d18-23ed-483f-9095-9e4d6b650ff9', student_id: '3562ded9-6b6a-49bf-af3f-1cf30ef3f787', position: 4, status: 'waiting' }
];

// =========================================================================
// SEED QUIZZES & SUBMISSIONS (ESAME)
// =========================================================================

export const SEED_QUIZZES = [
  {
    id: 'quiz_animaux_01',
    title: 'Vocabolario & Descrizione: Gli Animali (Quiz Rapido)',
    description: 'Test de connaissances sur le lexique animalier et les caractéristiques physiques en italien.',
    class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae',
    class_name: 'Classe A1 - Débutants',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    duration_minutes: 10,
    status: 'launched' as const, // Quiz en cours de session
    launched_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // Lancé il y a 15 min
    expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // Expire dans 45 min (total 1h)
    total_points: 20,
    questions: [
      {
        id: 'q1_1',
        type: 'qcm' as const,
        question: 'Come si dice "le loup" in lingua italiana ?',
        options: ['Il cane', 'Il lupo', 'La volpe', "L'orso"],
        correct_answer: 'Il lupo',
        points: 5,
        explanation: '"Il lupo" désigne le loup en italien.'
      },
      {
        id: 'q1_2',
        type: 'text' as const,
        question: "Come si chiama il grande rapace simbolo di maestosità nelle Alpi ? (Indizio : L'aquila...)",
        correct_answer: 'aquila',
        points: 5,
        explanation: 'La réponse attendue est "aquila" (ou l\'aquila).'
      },
      {
        id: 'q1_3',
        type: 'qcm' as const,
        question: 'Quale termine descrive un animale che si nutre esclusivamente di vegetali ed erba ?',
        options: ['Carnivoro', 'Erbivoro', 'Onnivoro', 'Insettivoro'],
        correct_answer: 'Erbivoro',
        points: 5,
        explanation: 'Gli animali erbivori mangiano solo piante ed erba.'
      },
      {
        id: 'q1_4',
        type: 'text' as const,
        question: 'Completa la frase con una parola : "Il delfino è un mammifero che vive nel..."',
        correct_answer: 'mare',
        points: 5,
        explanation: 'Il delfino vive nel mare (o oceano).'
      }
    ]
  },
  {
    id: 'quiz_grammaire_02',
    title: 'Grammatica: I Verbi Regolari & Ausiliari al Presente',
    description: 'Vérification de la conjugaison des verbes usuels au présent de l\'indicatif.',
    class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae',
    class_name: 'Classe A1 - Débutants',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    duration_minutes: 8,
    status: 'draft' as const,
    total_points: 20,
    questions: [
      {
        id: 'q2_1',
        type: 'qcm' as const,
        question: 'Coniugazione corretta del verbo "Parlare" alla 1ª persona singolare (Io) :',
        options: ['Io parli', 'Io parlo', 'Io parla', 'Io parlano'],
        correct_answer: 'Io parlo',
        points: 5,
        explanation: 'I verbi in -are terminano con -o alla prima persona singolare.'
      },
      {
        id: 'q2_2',
        type: 'text' as const,
        question: 'Scrivi la forma del verbo "Essere" per il pronome "Noi" al presente (Noi ...) :',
        correct_answer: 'siamo',
        points: 5,
        explanation: 'Noi siamo.'
      },
      {
        id: 'q2_3',
        type: 'qcm' as const,
        question: 'Quale ausiliare si utilizza normalmente con il verbo di movimento "Andare" ?',
        options: ['Avere', 'Essere', 'Fare', 'Stare'],
        correct_answer: 'Essere',
        points: 5,
        explanation: 'I verbi di movimento utilizzano l\'ausiliare "Essere" (es: Sono andato).'
      },
      {
        id: 'q2_4',
        type: 'text' as const,
        question: 'Traduci in italiano la parola temporale "Aujourd\'hui" :',
        correct_answer: 'oggi',
        points: 5,
        explanation: '"Aujourd\'hui" se dit "Oggi" en italien.'
      }
    ]
  },
  {
    id: 'quiz_economie_03',
    public_id: 'eco-italia-2026',
    is_public: true,
    title: 'Economia & Commercio: Vocabolario dell\'Economia Italiana',
    description: 'Niveau B1 • Thème : Économie & Entreprise. Quiz sur le lexique économique, bancaire et commercial en italien.',
    class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae',
    class_name: 'Classe A1 - Débutants',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    duration_minutes: 10,
    status: 'launched' as const,
    launched_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
    total_points: 20,
    questions: [
      {
        id: 'qe_1',
        type: 'qcm' as const,
        question: 'Qual è la moneta ufficiale utilizzata in Italia dal 2002 ?',
        options: ['La Lira', "L'Euro", 'Il Franco', 'Il Marco'],
        correct_answer: "L'Euro",
        points: 4,
        explanation: "L'Euro è la valuta ufficiale in Italia dal 1° gennaio 2002."
      },
      {
        id: 'qe_2',
        type: 'text' as const,
        question: 'Come si chiama l\'istituto finanziario dove i clienti depositano denaro e richiedono prestiti ? (in italiano)',
        correct_answer: 'banca',
        points: 4,
        explanation: 'La parola esatta è "banca" (la banca).'
      },
      {
        id: 'qe_3',
        type: 'qcm' as const,
        question: 'In economia, come viene chiamato il fenomeno di aumento continuo e generale del livello dei prezzi ?',
        options: ['Deflazione', 'Inflazione', 'Recessione', 'Stagflazione'],
        correct_answer: 'Inflazione',
        points: 4,
        explanation: "L'inflazione corrisponde all'aumento generale dei prezzi al consumo."
      },
      {
        id: 'qe_4',
        type: 'text' as const,
        question: 'Qual è il termine italiano più comune per indicare una "entreprise" commerciale o industriale ?',
        correct_answer: 'azienda',
        points: 4,
        explanation: 'Il termine più utilizzato è "azienda" (oppure "impresa").'
      },
      {
        id: 'qe_5',
        type: 'qcm' as const,
        question: 'Quale istituzione europea con sede a Francoforte stabilisce i tassi di interesse nell\'Eurozona ?',
        options: ['La Banca Mondiale', 'La Banca Centrale Europea (BCE)', 'Il Fondo Monetario Internazionale', 'La Banca d\'Italia'],
        correct_answer: 'La Banca Centrale Europea (BCE)',
        points: 4,
        explanation: 'La Banca Centrale Europea (BCE) è responsabile della politica monetaria europea.'
      }
    ]
  }
];

export const SEED_QUIZ_SUBMISSIONS = [
  {
    id: 'sub_jean_01',
    quiz_id: 'quiz_animaux_01',
    quiz_title: 'Vocabolario & Descrizione: Gli Animali (Quiz Rapido)',
    student_id: 'cc5a2fbf-5bd7-4b48-a9eb-79582de7ee8e', // Jean Rakoto (n°1)
    student_name: 'Jean Rakoto',
    student_number: '1',
    class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae',
    class_name: 'Classe A1 - Débutants',
    started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    submitted_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    answers: {
      q1_1: 'Il lupo',
      q1_2: 'aquila',
      q1_3: 'Erbivoro',
      q1_4: 'mare'
    },
    score: 20,
    max_score: 20,
    score_20: 20,
    status: 'completed' as const,
    date: new Date().toISOString().split('T')[0]
  },
  {
    id: 'sub_marie_01',
    quiz_id: 'quiz_animaux_01',
    quiz_title: 'Vocabolario & Descrizione: Gli Animali (Quiz Rapido)',
    student_id: '14a6ad2b-b2a2-41d9-a3ff-46ba9dce78f5', // Marie Rabe (n°2)
    student_name: 'Marie Rabe',
    student_number: '2',
    class_id: '1e7c96f5-d3e4-4dcd-9948-dad3dc88acae',
    class_name: 'Classe A1 - Débutants',
    started_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    submitted_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    answers: {
      q1_1: 'Il lupo',
      q1_2: 'aquila',
      q1_3: 'Erbivoro',
      q1_4: 'lago'
    },
    score: 15,
    max_score: 20,
    score_20: 15,
    status: 'completed' as const,
    date: new Date().toISOString().split('T')[0]
  }
];
