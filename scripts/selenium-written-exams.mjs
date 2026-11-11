import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

const required = [
  'E2E_BASE_URL',
  'E2E_TEACHER_EMAIL',
  'E2E_TEACHER_PASSWORD',
  'E2E_STUDENT_EMAIL',
  'E2E_STUDENT_PASSWORD',
  'E2E_CLASS_ID',
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Variable obligatoire absente : ${key}`);
}

const baseUrl = process.env.E2E_BASE_URL.replace(/\/$/, '');
const timeout = Number(process.env.E2E_TIMEOUT_MS || 30000);
const runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const examTitle = `[E2E Selenium] Cycle écrit ${runId}`;
const downloadDir = path.resolve(process.env.E2E_DOWNLOAD_DIR || 'e2e-downloads');
await fs.mkdir(downloadDir, { recursive: true });

const options = new chrome.Options();
options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1100');
options.setUserPreferences({
  'download.default_directory': downloadDir,
  'download.prompt_for_download': false,
  'download.directory_upgrade': true,
  'plugins.always_open_pdf_externally': true,
});
const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

const exactButton = label => By.xpath(`//button[normalize-space(.)=${JSON.stringify(label)}]`);
async function clickButton(label, root = driver) {
  const element = await root.wait(until.elementLocated(exactButton(label)), timeout);
  await root.wait(until.elementIsVisible(element), timeout);
  await root.wait(until.elementIsEnabled(element), timeout);
  await element.click();
  return element;
}
async function login(email, password) {
  await driver.get(baseUrl);
  const emailInput = await driver.wait(until.elementLocated(By.id('login-email')), timeout);
  await emailInput.clear();
  await emailInput.sendKeys(email);
  const passwordInput = await driver.findElement(By.id('login-password'));
  await passwordInput.clear();
  await passwordInput.sendKeys(password);
  await driver.findElement(By.css('form[aria-label="Connexion"] button[type="submit"]')).click();
  await driver.wait(async () => !(await driver.findElements(By.id('login-email'))).length, timeout);
  await driver.sleep(700);
}
async function logout(role) {
  const selector = role === 'student'
    ? 'button[aria-label="Se déconnecter"]'
    : 'button[aria-label="Déconnexion"]';
  const button = await driver.wait(until.elementLocated(By.css(selector)), timeout);
  await button.click();
  await driver.wait(until.elementLocated(By.id('login-email')), timeout);
}
async function waitForDownload(prefix) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const files = await fs.readdir(downloadDir);
    const match = files.find(file => file.startsWith(prefix) && file.endsWith('.pdf'));
    const partial = files.some(file => file.endsWith('.crdownload'));
    if (match && !partial) {
      const stat = await fs.stat(path.join(downloadDir, match));
      assert.ok(stat.size > 500, `Le PDF ${match} ne doit pas être vide.`);
      return match;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Téléchargement PDF non détecté : ${prefix}`);
}
async function pageContains(text) {
  return (await driver.getPageSource()).includes(text);
}
async function openStudentWrittenExams() {
  await clickButton('Examens écrits');
  await driver.wait(until.elementLocated(By.xpath("//h1[normalize-space(.)='Examens écrits']")), timeout);
}
async function createAndPublishExam() {
  await openStudentWrittenExams(); // professeur : le libellé du menu est identique
  await clickButton('Nouvel examen');
  await clickButton('Importer / coller JSON');
  const definition = {
    title: examTitle,
    description: 'Sujet temporaire créé par le test automatisé Selenium.',
    level: 'A1',
    target_language: 'it',
    instruction_language: 'fr',
    duration_minutes: 10,
    class_ids: [process.env.E2E_CLASS_ID],
    display_scale: 100,
    max_attempts: 1,
    shuffle_sections: false,
    shuffle_questions: false,
    shuffle_options: false,
    navigation_mode: 'sequential',
    show_score_after_publish: true,
    show_corrections_after_publish: true,
    integrity_settings: { fullscreen: false, warn_on_tab_switch: false, watermark: false },
    sections: [{
      id: 'selenium-section',
      title: 'Vérification automatique',
      instructions: 'Choisissez la bonne réponse.',
      category: 'Grammaire',
      points: 2,
      shuffle: false,
      fixed_position: true,
      questions: [
        {
          id: 'selenium-q1',
          type: 'qcm',
          prompt: 'Test Selenium : quale parola significa « maison » ?',
          points: 1,
          time_limit_seconds: 120,
          options: [{ id: 'q1-a', label: 'casa' }, { id: 'q1-b', label: 'libro' }],
          answer_key: { correctOptionId: 'q1-a' },
          explanation: 'Casa signifie maison.'
        },
        {
          id: 'selenium-q2',
          type: 'qcm',
          prompt: 'Test Selenium : quale parola significa « eau » ?',
          points: 1,
          time_limit_seconds: 120,
          options: [{ id: 'q2-a', label: 'acqua' }, { id: 'q2-b', label: 'pane' }],
          answer_key: { correctOptionId: 'q2-a' },
          explanation: 'Acqua signifie eau.'
        }
      ]
    }]
  };
  const json = await driver.findElement(By.css('textarea[aria-label="Contenu JSON ou JSONC du sujet"]'));
  await json.sendKeys(JSON.stringify(definition));
  await clickButton('Charger le sujet');
  await driver.wait(until.elementLocated(By.xpath(`//*[contains(normalize-space(.), ${JSON.stringify(examTitle)})]`)), timeout);
  await clickButton('Publier');
  await driver.wait(until.elementLocated(By.xpath(`//p[normalize-space(.)=${JSON.stringify(examTitle)}]`)), timeout);
  console.log('OK — professeur : création du sujet depuis JSON et publication.');
}
async function takeExamAsStudent() {
  await openStudentWrittenExams();
  const card = await driver.wait(until.elementLocated(By.xpath(`//article[.//h2[normalize-space(.)=${JSON.stringify(examTitle)}]]`)), timeout);
  await clickButton('Commencer l’examen', card);
  for (let index = 1; index <= 2; index++) {
    await driver.wait(until.elementLocated(By.xpath(`//h2[contains(normalize-space(.), 'Test Selenium :')]`)), timeout);
    const radios = await driver.findElements(By.css('input[type="radio"]'));
    assert.ok(radios.length >= 2, `Question ${index} : options QCM visibles.`);
    await radios[0].click();
    if (index === 1) {
      await clickButton('Valider et continuer');
    } else {
      await clickButton('Valider et remettre');
      await driver.wait(until.elementLocated(By.xpath("//h2[normalize-space(.)='Copie remise']")), timeout);
    }
  }
  await clickButton('Retour aux examens');
  await driver.wait(until.elementLocated(By.xpath(`//article[.//h2[normalize-space(.)=${JSON.stringify(examTitle)}]]`)), timeout);
  assert.equal(await driver.findElements(By.xpath("//button[contains(.,'Consulter ma feuille de copie détaillée')]")).then(x => x.length), 0,
    'La copie corrigée ne doit pas être visible avant la publication des résultats.');
  console.log('OK — élève : tentative, réponses, validation séquentielle et remise de la copie.');
}
async function correctPublishAndDownloadAsTeacher() {
  await logout('student');
  await login(process.env.E2E_TEACHER_EMAIL, process.env.E2E_TEACHER_PASSWORD);
  await openStudentWrittenExams();
  const examRow = await driver.wait(until.elementLocated(By.xpath(`//p[normalize-space(.)=${JSON.stringify(examTitle)}]/ancestor::div[contains(@class,'py-4')][1]`)), timeout);
  await clickButton('Résultats', examRow);
  await driver.wait(until.elementLocated(By.xpath("//h2[normalize-space(.)='Résultats, corrections et intégrité']")), timeout);
  await clickButton('Détails');
  await driver.wait(until.elementLocated(By.xpath("//button[normalize-space(.)='Télécharger la feuille PDF']")), timeout);
  await clickButton('Télécharger la feuille PDF');
  const teacherPdf = await waitForDownload('feuille-copie-');
  await clickButton('Publier les résultats');
  await driver.wait(until.elementLocated(By.xpath("//*[contains(normalize-space(.),'Résultats publiés')]")), timeout);
  console.log(`OK — professeur : consultation de la copie, PDF (${teacherPdf}) et publication des résultats.`);
}
async function verifyStudentCorrectionsAndPdf() {
  await logout('teacher');
  await login(process.env.E2E_STUDENT_EMAIL, process.env.E2E_STUDENT_PASSWORD);
  await openStudentWrittenExams();
  const card = await driver.wait(until.elementLocated(By.xpath(`//article[.//h2[normalize-space(.)=${JSON.stringify(examTitle)}]]`)), timeout);
  await clickButton('Consulter ma feuille de copie détaillée', card);
  await driver.wait(until.elementLocated(By.xpath("//h3[normalize-space(.)='Résultats et corrigés détaillés']")), timeout);
  assert.ok(await pageContains('Réponse vraie / attendue'), 'Le corrigé détaillé doit être affiché.');
  await clickButton('Télécharger le PDF', card);
  const studentPdf = await waitForDownload('feuille-copie-corrigee');
  console.log(`OK — élève : résultats publiés, corrigé détaillé et PDF (${studentPdf}).`);
}

try {
  await login(process.env.E2E_TEACHER_EMAIL, process.env.E2E_TEACHER_PASSWORD);
  assert.ok(await pageContains('Espace Enseignant') || await pageContains('PerckyLingua'), 'Session professeur ouverte.');
  await createAndPublishExam();
  await logout('teacher');
  await login(process.env.E2E_STUDENT_EMAIL, process.env.E2E_STUDENT_PASSWORD);
  await takeExamAsStudent();
  await correctPublishAndDownloadAsTeacher();
  await verifyStudentCorrectionsAndPdf();
  console.log('SUCCÈS — cycle complet professeur → élève → correction/publication → PDF.');
} catch (error) {
  try {
    await fs.writeFile('selenium-failure.png', await driver.takeScreenshot());
    await fs.writeFile('selenium-failure.html', await driver.getPageSource());
  } catch {}
  throw error;
} finally {
  await driver.quit();
}
