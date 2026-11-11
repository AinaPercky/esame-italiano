import assert from 'node:assert/strict';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
const required=['E2E_BASE_URL','E2E_TEACHER_EMAIL','E2E_TEACHER_PASSWORD','E2E_STUDENT_EMAIL','E2E_STUDENT_PASSWORD'];
for(const key of required) if(!process.env[key]) throw new Error(`Variable obligatoire absente : ${key}`);
const baseUrl=process.env.E2E_BASE_URL.replace(/\/$/,'');
const timeout=Number(process.env.E2E_TIMEOUT_MS||20000);
const options=new chrome.Options();
options.addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,1000');
const driver=await new Builder().forBrowser('chrome').setChromeOptions(options).build();
async function visibleButton(label){const xpath=`//button[contains(normalize-space(.), ${JSON.stringify(label)})]`;const el=await driver.wait(until.elementLocated(By.xpath(xpath)),timeout);await driver.wait(until.elementIsVisible(el),timeout);return el;}
async function login(email,password){await driver.get(baseUrl);const emailInput=await driver.wait(until.elementLocated(By.id('login-email')),timeout);await emailInput.clear();await emailInput.sendKeys(email);const passwordInput=await driver.findElement(By.id('login-password'));await passwordInput.clear();await passwordInput.sendKeys(password);await driver.findElement(By.css('form[aria-label="Connexion"] button[type="submit"]')).click();await driver.wait(async()=>!(await driver.findElements(By.id('login-email'))).length,timeout);await driver.sleep(1000);}
async function logout(){const buttons=await driver.findElements(By.css('button[aria-label="Déconnexion"]'));if(buttons.length){await buttons[0].click();await driver.wait(until.elementLocated(By.id('login-email')),timeout);}}
try{
 await login(process.env.E2E_TEACHER_EMAIL,process.env.E2E_TEACHER_PASSWORD);
 await (await visibleButton('Examens écrits')).click();
 await driver.wait(until.elementLocated(By.xpath("//h1[contains(.,'Examens écrits')]")),timeout);
 assert.ok((await driver.getPageSource()).includes('Examens enregistrés'),'La liste des examens professeur doit être affichée.');
 console.log('OK — professeur : connexion et ouverture du module Examens écrits.');
 await logout();
 await login(process.env.E2E_STUDENT_EMAIL,process.env.E2E_STUDENT_PASSWORD);
 await (await visibleButton('Examens écrits')).click();
 await driver.wait(until.elementLocated(By.xpath("//*[contains(normalize-space(.),'Examens écrits')]")),timeout);
 const page=await driver.getPageSource();
 assert.ok(page.includes('Examens écrits'),'L’espace examens écrits doit être accessible à l’élève.');
 if(process.env.E2E_WRITTEN_EXAM_TITLE) assert.ok(page.includes(process.env.E2E_WRITTEN_EXAM_TITLE),'L’examen affecté doit être visible pour l’élève.');
 console.log('OK — élève : connexion et ouverture de l’espace Examens écrits.');
 console.log('Limite : ce scénario couvre les écrans d’accès, pas encore création, remise, correction, publication et PDF.');
}catch(error){try{const fs=await import('node:fs/promises');await fs.writeFile('selenium-failure.png',await driver.takeScreenshot(),'base64');}catch{}throw error;}finally{await driver.quit();}
