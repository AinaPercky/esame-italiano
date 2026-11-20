import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL = (__ENV.SUPABASE_URL || '').replace(/\\/+$/, '');
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const QUIZ_ID = __ENV.QUIZ_ID || '';
const VUS = Number(__ENV.VUS || 100);
const DRY_RUN = (__ENV.DRY_RUN || 'true').toLowerCase() === 'true';
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '60s';
const THINK_SECONDS = Number(__ENV.THINK_SECONDS || 5);

if (!BASE_URL || !ANON_KEY || !QUIZ_ID) throw new Error('Définissez SUPABASE_URL, SUPABASE_ANON_KEY et QUIZ_ID.');
if (!Number.isInteger(VUS) || VUS < 1 || VUS > 100) throw new Error('VUS doit être un entier entre 1 et 100.');

const students = new SharedArray('students', () => JSON.parse(open('./students.json')));
const answers = JSON.parse(open('./answers.json'));
if (students.length < VUS) throw new Error('Il faut au moins ' + VUS + ' comptes dans students.json.');
const emails = students.slice(0, VUS).map(s => String(s.email || '').trim().toLowerCase());
if (emails.some(email => !email) || new Set(emails).size !== VUS) throw new Error('students.json doit contenir un email unique et non vide par VU.');
if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('answers.json doit être un objet JSON.');

const loginDuration = new Trend('student_login_duration', true);
const rpcDuration = new Trend('quiz_rpc_duration', true);
const submissionDuration = new Trend('quiz_submission_duration', true);
const successfulSubmissions = new Rate('quiz_submission_success');
const studentsStarted = new Counter('students_quiz_started');
const studentsSubmitted = new Counter('students_quiz_submitted');

export const options = {
  scenarios: {
    one_hundred_students: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '30m',
      gracefulStop: '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<10000'],
    quiz_submission_success: ['rate==1'],
  },
};

function authHeaders(token) {
  return { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + token };
}

function rpc(name, payload, token, phase) {
  const response = http.post(BASE_URL + '/rest/v1/rpc/' + name, JSON.stringify(payload), {
    headers: authHeaders(token),
    timeout: REQUEST_TIMEOUT,
    tags: { endpoint: name, phase: phase },
  });
  rpcDuration.add(response.timings.duration, { endpoint: name });
  return response;
}

export default function () {
  const student = students[__VU - 1];

  // Même authentification Supabase que l'espace élève.
  const login = http.post(BASE_URL + '/auth/v1/token?grant_type=password',
    JSON.stringify({ email: student.email, password: student.password }), {
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      timeout: REQUEST_TIMEOUT,
      tags: { endpoint: 'auth_token', phase: 'login' },
    });
  loginDuration.add(login.timings.duration);
  if (!check(login, { 'auth: HTTP 200': r => r.status === 200 })) {
    console.error('VU ' + __VU + ': authentification refusée (' + login.status + '): ' + login.body);
    successfulSubmissions.add(false);
    return;
  }
  const token = login.json('access_token');
  if (!token) { console.error('VU ' + __VU + ': access_token absent.'); successfulSubmissions.add(false); return; }

  // Catalogue assaini : aucune clé de réponse n'est envoyée au navigateur.
  const catalogResponse = rpc('get_student_quiz_catalog', {}, token, 'catalog');
  if (!check(catalogResponse, { 'catalogue: HTTP 200': r => r.status === 200 })) {
    console.error('VU ' + __VU + ': catalogue indisponible (' + catalogResponse.status + '): ' + catalogResponse.body);
    successfulSubmissions.add(false); return;
  }
  const catalog = catalogResponse.json();
  const quiz = Array.isArray(catalog) ? catalog.find(q => String(q.id) === QUIZ_ID) : null;
  if (!quiz) {
    console.error('VU ' + __VU + ': quiz absent du catalogue étudiant; vérifier classe, validation et lancement.');
    successfulSubmissions.add(false); return;
  }
  if (quiz.status !== 'launched' || quiz.attendance_mode !== 'strict_presence' || quiz.is_public) {
    console.error('VU ' + __VU + ': cible attendue = quiz officiel lancé en présence stricte; status=' + quiz.status + ', mode=' + quiz.attendance_mode);
    successfulSubmissions.add(false); return;
  }

  const questionIds = new Set((quiz.questions || []).map(q => String(q.id)));
  const unknownIds = Object.keys(answers).filter(id => !questionIds.has(id));
  if (unknownIds.length) {
    console.error('VU ' + __VU + ': IDs inconnus dans answers.json: ' + unknownIds.join(', '));
    successfulSubmissions.add(false); return;
  }

  // Vérifier l'inscription au lancement actif.
  const activeResponse = rpc('get_student_active_launch', { p_quiz_id: QUIZ_ID }, token, 'active_launch');
  if (!check(activeResponse, { 'lancement actif: HTTP 200': r => r.status === 200 })) {
    console.error('VU ' + __VU + ': lecture du lancement impossible: ' + activeResponse.body);
    successfulSubmissions.add(false); return;
  }
  const active = activeResponse.json();
  if (!active || !active.launch || !active.participant) {
    console.error('VU ' + __VU + ': élève non inscrit au lancement actif.');
    successfulSubmissions.add(false); return;
  }

  if (DRY_RUN) {
    check(active, { 'dry-run: participant inscrit': a => Boolean(a.participant.id) });
    console.log('VU ' + __VU + ': dry-run OK (' + student.email + '), ' + quiz.questions.length + ' questions; aucune présence ni tentative créée.');
    return;
  }

  // Confirmation réelle de présence.
  const confirm = rpc('confirm_quiz_presence', { p_launch_id: active.launch.id }, token, 'confirm_presence');
  if (!check(confirm, { 'présence confirmée: HTTP 200': r => r.status === 200 })) {
    console.error('VU ' + __VU + ': confirmation refusée: ' + confirm.body);
    successfulSubmissions.add(false); return;
  }
  const participant = confirm.json();
  if (!participant || !participant.presence_deadline_at || !participant.presence_confirmed_at) {
    console.error('VU ' + __VU + ': horodatages de présence absents: ' + confirm.body);
    successfulSubmissions.add(false); return;
  }
  studentsStarted.add(1);

  // Attendre la fin de la fenêtre d'initialisation de 10 secondes calculée par la RPC.
  const remainingMs = Date.parse(participant.presence_deadline_at) - Date.now();
  if (remainingMs > 0) sleep(remainingMs / 1000 + 0.2);

  // Le frontend conserve les réponses localement : aucune RPC artificielle par question.
  const count = (quiz.questions || []).length;
  if (THINK_SECONDS > 0 && count > 0) sleep(THINK_SECONDS * count);

  // Remise groupée, identique à supabaseService.submitQuizPresenceSubmission().
  const submit = rpc('submit_quiz_presence_submission', {
    p_submission: {
      quiz_id: QUIZ_ID,
      student_name: student.name || student.email,
      student_number: student.student_number || null,
      class_id: student.class_id || null,
      class_name: student.class_name || null,
      started_at: participant.presence_confirmed_at,
      answers: answers,
      status: 'completed',
    },
  }, token, 'submit');

  const ok = check(submit, {
    'soumission acceptée: HTTP 200': r => r.status === 200,
    'note renvoyée par le serveur': r => {
      try { return Number.isFinite(Number(r.json('score_20'))); } catch (_) { return false; }
    },
  });
  successfulSubmissions.add(ok);
  if (!ok) { console.error('VU ' + __VU + ': soumission refusée: ' + submit.body); return; }

  submissionDuration.add(submit.timings.duration);
  studentsSubmitted.add(1);
  console.log('VU ' + __VU + ': tentative enregistrée (' + student.email + '), note /20=' + submit.json('score_20'));
}
