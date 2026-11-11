# Tests navigateur Selenium — examens écrits

## Ce que le scénario exécute

Le test Selenium utilise Chrome headless et Supabase réel de staging. Il réalise un cycle complet :
1. connexion du professeur ;
2. création d'un nouvel examen par import JSON, affectation à une classe de test et publication ;
3. connexion de l'élève affecté ;
4. réponse aux deux QCM, validation successive sans retour, puis remise ;
5. vérification que le corrigé est masqué avant publication ;
6. retour du professeur, ouverture des résultats, consultation de la copie et téléchargement du PDF ;
7. publication des résultats ;
8. retour de l'élève, consultation du corrigé détaillé et téléchargement du PDF élève.

Chaque exécution crée un examen de test nommé `[E2E Selenium] Cycle écrit <date>` dans la base de staging. Il est conservé pour audit ; supprimer ces examens de test depuis l'interface de staging après vérification.

## Prérequis

Créer une instance de staging de l'application connectée à un projet Supabase de test. Configurer :
- un compte professeur actif ;
- un compte élève approuvé ;
- une classe de test à laquelle l'élève appartient ;
- l'identifiant Supabase de cette classe.

Ne jamais utiliser la base de production.

## Exécution locale

Installer Chrome et les dépendances, puis définir les variables :

```bash
npm install
E2E_BASE_URL=https://staging.example.com \
E2E_TEACHER_EMAIL=teacher@example.com \
E2E_TEACHER_PASSWORD='...' \
E2E_STUDENT_EMAIL=student@example.com \
E2E_STUDENT_PASSWORD='...' \
E2E_CLASS_ID=uuid-de-la-classe \
npm run test:e2e:selenium
```

Les téléchargements PDF sont vérifiés dans `e2e-downloads/`. En cas d'échec, le script écrit `selenium-failure.png` et `selenium-failure.html`.

## GitHub Actions

Dans Settings → Secrets and variables → Actions, créer la variable `E2E_ENABLED=true` et les secrets :
- `E2E_BASE_URL`
- `E2E_TEACHER_EMAIL`
- `E2E_TEACHER_PASSWORD`
- `E2E_STUDENT_EMAIL`
- `E2E_STUDENT_PASSWORD`
- `E2E_CLASS_ID`

Le workflow est activable manuellement ou lors d'un push sur la branche de test, uniquement lorsque `E2E_ENABLED=true`. Le dépôt ne possède pas de `package-lock.json` ; le workflow utilise donc `npm install`.

## Limites

Le scénario vérifie le parcours standard avec deux QCM auto-corrigés. Il ne couvre pas encore toutes les variantes de questions, les notes d'expression écrite, les scénarios d'intégrité, les classes non affectées ou les tentatives multiples. Les tests de service simulés complètent ce parcours mais ne remplacent pas les tests SQL/RLS sur staging.
