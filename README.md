# Italian Oral Exam Manager (Gestionnaire d'examens oraux d'italien)

Application web professionnelle complète pour enseignants d'italien permettant d'organiser, évaluer et analyser les examens oraux en temps réel selon des grilles de rubriques prédéfinies ou personnalisées.

---

## 1. Présentation du Projet

Lors d'un examen oral (par exemple la description de l'animal « Lo zébu »), l'élève doit aborder 10 rubriques prédéfinies en italien. L'enseignant écoute et valide d'un simple clic les critères maîtrisés. L'application calcule immédiatement la note sur 10, enregistre le résultat dans la base de données PostgreSQL / Supabase, met à jour les statistiques de la classe et organise l'ordre de passage des candidats.

### Fonctionnalités Clés :
- **Gestion des classes & élèves** : ajout individuel, import CSV / JSON avec détection de doublons.
- **Grilles de rubriques en italien** : modèle officiel « Lo zébu » (10 rubriques) et création libre.
- **Évaluation en direct en 1 clic** : calcul instantané de la note, des points, du % de réussite.
- **Tirage au sort de l'ordre de passage** : algorithme Fisher-Yates avec suivi des statuts (*En attente, Évalué, Absent*).
- **Quiz en ligne** : création et lancement des quiz, enregistrement des réponses et des notes, suivi des résultats et classement journalier.
- **Dashboard statistique** : indicateurs clés, histogramme des notes, taux de réussite par rubrique linguistique.
- **Fiches individuelles & Exports** : consultation détaillée, exports CSV, JSON et impression PDF.

---

## 2. Architecture Technique

| Composant | Technologie | Description |
|---|---|---|
| **Frontend Live & Web** | React 19 + TypeScript + Vite | Interface réactive, Tailwind CSS, accessible tablette & desktop |
| **Frontend Python** | Python 3.10+ & Streamlit | Interface analytique alternative (`frontend/app.py`) |
| **Backend REST API** | Node.js + Express.js | Architecture MVC (`backend/src/`) |
| **Base de Données** | Supabase (PostgreSQL 15+) | Schéma normalisé avec triggers & RLS (`database/schema.sql`) |
| **Authentification** | Supabase Auth (JWT) | Sécurité par rôles enseignants |

---

## 3. Structure des Dossiers

```text
italian-oral-exam/
├── database/
│   └── schema.sql                 # Schéma PostgreSQL complet, déclencheurs & RLS
├── backend/
│   ├── src/
│   │   ├── config/supabase.js     # Connexion Supabase
│   │   ├── controllers/           # Logique métier (classes, élèves, notes, tirage)
│   │   ├── middlewares/auth.js    # Vérification JWT Bearer
│   │   ├── routes/index.js        # Routes de l'API REST
│   │   └── app.js                 # Serveur Express
│   ├── tests/evaluation.test.js   # Tests automatisés (notes, unicité, moyenne)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── app.py                     # Point d'entrée Streamlit
│   ├── pages/                     # Pages Streamlit (Dashboard, Évaluation, etc.)
│   ├── services/api_client.py     # Client HTTP pour l'API REST
│   └── requirements.txt
├── src/                           # Application Web React & TypeScript complète
├── index.html
└── metadata.json
```

---

## 4. Installation & Démarrage

### Prérequis
- Node.js 18+ et npm
- Python 3.10+ (pour le frontend Streamlit optionnel)
- Compte Supabase (ou exécution locale)

### 4.1. Base de données Supabase
1. Créez un projet sur [Supabase](https://supabase.com).
2. Ouvrez l'éditeur SQL de votre tableau de bord Supabase.
3. Pour un projet neuf, copiez et exécutez le script contenu dans `database/schema.sql`. Il crée notamment `quizzes` et `quiz_submissions`.

Pour un projet Supabase déjà utilisé, ne relancez pas `database/schema.sql` : il contient des instructions `DROP TABLE`. Dans l'application, ouvrez **Paramètres & Sécurité > Copier la migration Quiz**, collez le SQL dans **Supabase > SQL Editor > New query**, puis cliquez sur **Run**. Cette migration non destructive crée `public.quizzes` et `public.quiz_submissions`, leurs index et les politiques RLS nécessaires. Revenez ensuite dans l'application, enregistrez l'URL du projet et sa clé publique `anon` dans **Paramètres & Sécurité**, puis cliquez sur **Tester la connexion**. La clé `service_role` ne doit jamais être utilisée dans l'application web.

### 4.2. Lancement du Backend Node.js
```bash
cd backend
npm install
cp .env.example .env
# Renseignez SUPABASE_URL et SUPABASE_ANON_KEY dans .env
npm start
```
Le serveur REST démarre sur `http://localhost:5000`.

### 4.3. Lancement de l'application Web React
```bash
Copy-Item .env.example .env.local
# Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local,
# ou configurez-les dans Paramètres & Sécurité de l'application.
npm install
npm run dev
```
Sous Windows PowerShell, ces commandes sont à exécuter depuis la racine du dépôt. L'application démarre sur `http://localhost:3000`. Le fichier `.env.local` est ignoré par Git; ne publiez pas vos clés.

### 4.4. Vérifier l'enregistrement des quiz et des notes
1. Dans **Paramètres & Sécurité**, testez la connexion Supabase et synchronisez les données locales si elles doivent être conservées.
2. Créez un quiz depuis l'espace enseignant, puis lancez-le.
3. Faites-le passer à un élève et soumettez ses réponses.
4. Dans Supabase **Table Editor**, vérifiez le quiz dans `public.quizzes` et sa soumission/note dans `public.quiz_submissions`. La colonne `score_20` contient la note sur 20.

Les créations, mises à jour, lancements et fermetures de quiz sont synchronisés vers Supabase. Les soumissions sont enregistrées par couple quiz/élève afin d'éviter les doublons. Si le test de connexion signale des tables Quiz absentes, exécutez la migration de l'étape 4.1 avant de créer ou synchroniser des quiz.

### 4.5. Lancement du Frontend Python Streamlit (optionnel)
```bash
cd frontend
pip install -r requirements.txt
streamlit run app.py
```

---

## 5. Exécution des Tests Automatisés

Pour valider l'intégrité du calcul des notes, la gestion des moyennes sans fausser par les absents, et l'unicité des évaluations :

```bash
node backend/tests/evaluation.test.js
```
Tous les 5 tests s'exécutent avec succès :
- Calcul des points par rubrique cochée (0 si décochée).
- Calcul exact du barème pour le modèle *Lo zébu* (7/10).
- Moyenne calculée exclusivement sur les élèves évalués.
- Mise à jour cohérente sans doublon pour le même examen.
- Mélange aléatoire Fisher-Yates sans perte d'élève.

---

## 6. Variables d'Environnement (`.env.example`)

```env
PORT=5000
NODE_ENV=production
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre-cle-anonyme
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role
```

---

## 7. Licence
Apache-2.0
