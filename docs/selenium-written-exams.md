# Tests navigateur Selenium — examens écrits

## Installation et exécution
```bash
npm ci
E2E_BASE_URL=https://staging.example.com \
E2E_TEACHER_EMAIL=teacher@example.com \
E2E_TEACHER_PASSWORD='...' \
E2E_STUDENT_EMAIL=student@example.com \
E2E_STUDENT_PASSWORD='...' \
npm run test:e2e:selenium
```

Le scénario ouvre Chrome headless avec Selenium WebDriver. Il vérifie l'authentification du professeur, l'ouverture du module « Examens écrits », puis une session élève indépendante et l'accès à son onglet des examens écrits. `E2E_WRITTEN_EXAM_TITLE` est facultatif et vérifie la visibilité d'un examen affecté à l'élève.

## GitHub Actions
Ajouter dans Settings → Secrets and variables → Actions : `E2E_BASE_URL`, `E2E_TEACHER_EMAIL`, `E2E_TEACHER_PASSWORD`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD`. `E2E_WRITTEN_EXAM_TITLE` est facultatif.

Utiliser exclusivement une application et une base Supabase de staging avec des comptes dédiés. Le workflow ne démarre que si les cinq secrets obligatoires sont configurés.

## Périmètre actuel
Ce premier scénario Selenium valide l'exécution navigateur, l'authentification des deux rôles et les écrans d'entrée. Il ne valide pas encore la création d'un examen, la remise d'une tentative, la correction, la publication des résultats ni le téléchargement du PDF. Ces opérations nécessitent un jeu de données de test contrôlé et des sélecteurs stables ; elles ne doivent pas être exécutées sur la base de production.
