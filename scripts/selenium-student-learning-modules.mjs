import assert from 'node:assert/strict';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

const required = ['E2E_BASE_URL', 'E2E_STUDENT_EMAIL', 'E2E_STUDENT_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Variable obligatoire absente : ${key}`);
}

const baseUrl = process.env.E2E_BASE_URL.replace(/\/$/, '');
const timeout = Number(process.env.E2E_TIMEOUT_MS || 30000);
const driver = await new Builder().forBrowser('chrome').setChromeOptions(
  new chrome.Options().addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1100')
).build();

async function waitVisible(locator, label) {
  const element = await driver.wait(until.elementLocated(locator), timeout, label);
  await driver.wait(until.elementIsVisible(element), timeout, label);
  return element;
}
async function click(locator, label) {
  const element = await waitVisible(locator, label);
  await driver.wait(until.elementIsEnabled(element), timeout, label);
  await element.click();
  return element;
}
async function login() {
  await driver.get(baseUrl);
  await (await waitVisible(By.id('login-email'), 'Formulaire de connexion étudiant')).sendKeys(process.env.E2E_STUDENT_EMAIL);
  await driver.findElement(By.id('login-password')).sendKeys(process.env.E2E_STUDENT_PASSWORD);
  await driver.findElement(By.css('form[aria-label="Connexion"] button[type="submit"]')).click();
  await driver.wait(until.elementLocated(By.css('nav[aria-label="Navigation de l’espace étudiant"]')), timeout);
}

async function testCourses() {
  await click(By.css('button[title="Leçons de cours"]'), 'Onglet Leçons de cours');
  await waitVisible(By.xpath("//h1[normalize-space(.)='Leçons de cours']"), 'Catalogue des cours');
  const lessonCard = await driver.wait(until.elementLocated(By.xpath(
    "//button[contains(.,'Commencer la leçon') or contains(.,'Continuer la leçon') or contains(.,'Relire la leçon')]"
  )), timeout, 'Au moins une leçon publiée et accessible');
  await lessonCard.click();
  await waitVisible(By.css('.lesson-player-shell, .lesson-direct-toolbar'), 'Ouverture du lecteur de leçon');
  assert.ok((await driver.findElements(By.css('.lesson-dialogue, .lesson-player-question, .lesson-reader'))).length > 0,
    'Le contenu pédagogique de la leçon doit être rendu.');
  await click(By.css('button[aria-label="Fermer la leçon"], button.lesson-direct-back'), 'Fermeture du lecteur de leçon');
  await waitVisible(By.xpath("//h1[normalize-space(.)='Leçons de cours']"), 'Retour au catalogue des cours');
  console.log('OK — cours : catalogue étudiant, ouverture du lecteur, rendu pédagogique et retour.');
}

async function testExercises() {
  await click(By.css('button[title="Exercices"]'), 'Onglet Exercices');
  await waitVisible(By.xpath("//h2[normalize-space(.)='Mes exercices']"), 'Catalogue des exercices');
  const start = await driver.wait(until.elementLocated(By.xpath("//button[.//span[normalize-space(.)='Nouvelle tentative']]")), timeout,
    'Au moins un exercice publié attribué à la classe de recette');
  await start.click();
  await waitVisible(By.xpath("//*[contains(normalize-space(.),'MODE ENTRAÎNEMENT')]"), 'Démarrage de la tentative');
  await waitVisible(By.css('button[aria-label="Mes exercices"], button[title="Mes exercices"]'), 'Action de sortie du lecteur');
  await click(By.xpath("//button[.//span[normalize-space(.)='Mes exercices']]"), 'Retour à Mes exercices');
  await waitVisible(By.xpath("//h2[normalize-space(.)='Mes exercices']"), 'Retour au catalogue des exercices');
  console.log('OK — exercices : accès par classe, création/reprise d’une tentative et sortie du lecteur.');
}

async function testWrittenExams() {
  await click(By.css('button[title="Examens écrits"]'), 'Onglet Examens écrits');
  await waitVisible(By.xpath("//*[self::h1 or self::h2][contains(normalize-space(.),'Examens écrits')]"), 'Espace examens écrits étudiant');
  assert.ok((await driver.findElements(By.xpath("//*[contains(normalize-space(.),'Examens écrits')]"))).length > 0,
    'Le module examens écrits doit être visible.');
  console.log('OK — examens : accès à l’espace étudiant des examens écrits.');
}

try {
  await login();
  await testCourses();
  await testExercises();
  await testWrittenExams();
  console.log('SUCCÈS — parcours fonctionnels étudiant : cours, exercices et accès examens.');
} catch (error) {
  try {
    const fs = await import('node:fs/promises');
    await fs.writeFile('student-modules-failure.png', await driver.takeScreenshot());
    await fs.writeFile('student-modules-failure.html', await driver.getPageSource());
  } catch {}
  throw error;
} finally {
  await driver.quit();
}
