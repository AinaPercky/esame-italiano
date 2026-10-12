const { supabase, isConfigured } = require('../config/supabase');

/**
 * Middleware d'authentification vérifiant le jeton Supabase JWT
 */
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Si Supabase n'est pas encore configuré (mode développement local sans clés), on autorise en mode enseignant démo
  if (!isConfigured) {
    req.user = { id: 'teacher-demo-id', email: 'prof@scuola.it', role: 'teacher' };
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Accès non autorisé : jeton d\'authentification manquant.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors de la vérification de l\'authentification.' });
  }
};

module.exports = { requireAuth };
