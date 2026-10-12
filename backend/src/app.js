const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares globaux
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Route de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Italian Oral Exam Manager API',
    timestamp: new Date().toISOString()
  });
});

// Monter l'API REST sous /api
app.use('/api', apiRoutes);

// Gestionnaire d'erreur 404
app.use((req, res) => {
  res.status(404).json({ error: `Route non trouvée: ${req.method} ${req.url}` });
});

// Gestionnaire d'erreurs globales
app.use((err, req, res, next) => {
  console.error('Erreur API:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erreur interne du serveur'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Serveur Italian Oral Exam Manager démarré sur http://localhost:${PORT}`);
  });
}

module.exports = app;
