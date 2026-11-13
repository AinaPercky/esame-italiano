require('dotenv').config();

let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {
  // @supabase/supabase-js will be loaded if installed
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

let supabase = null;
const isConfigured = Boolean(
  createClient &&
  process.env.SUPABASE_URL && 
  process.env.SUPABASE_URL !== 'https://placeholder-project.supabase.co' &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
);

if (isConfigured && createClient) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
  } catch (err) {
    console.warn('Erreur initialisation Supabase client:', err.message);
  }
}

const createAuthenticatedClient = (accessToken) => {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!createClient || !supabaseUrl || !anonKey || !accessToken) return null;
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
};

module.exports = {
  supabase,
  isConfigured,
  createAuthenticatedClient
};
