import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Database, 
  FileSpreadsheet, 
  FileCode, 
  Printer, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  ExternalLink,
  UploadCloud,
  DownloadCloud,
  Loader2,
  HelpCircle,
  Save,
  ShieldCheck,
  LogOut,
  UserCheck,
  KeyRound
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { supabaseService, ConnectionTestResult } from '../services/supabaseService';
import {
  QUIZ_SUPABASE_MIGRATION_SQL,
  STUDENT_AVATAR_MIGRATION_SQL,
  STUDENT_EMAIL_IDENTITY_MIGRATION_SQL,
  SUPABASE_SQL_SCHEMA
} from '../data/supabaseSqlSchema';
import { authService, AUTHORIZED_EMAIL, DEFAULT_ACCESS_CODE, AuthUser } from '../services/authService';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface SettingsViewProps {
  onResetData: () => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onResetData, currentUser, onLogout }) => {
  const initialConfig = supabaseService.loadConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(initialConfig.url);
  const [supabaseKey, setSupabaseKey] = useState(initialConfig.anonKey);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedQuizMigration, setCopiedQuizMigration] = useState(false);
  const [copiedAvatarMigration, setCopiedAvatarMigration] = useState(false);
  const [copiedStudentEmailMigration, setCopiedStudentEmailMigration] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showSqlGuide, setShowSqlGuide] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary' | 'success';
    action?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });
  
  // Gestion du code d'accès
  const [currentCode, setCurrentCode] = useState<string>(authService.getAccessCode());
  const [newCodeInput, setNewCodeInput] = useState<string>('');
  const [codeSuccessMessage, setCodeSuccessMessage] = useState<string | null>(null);
  const [codeErrorMessage, setCodeErrorMessage] = useState<string | null>(null);

  const handleUpdateCode = (e: React.FormEvent) => {
    e.preventDefault();
    setCodeSuccessMessage(null);
    setCodeErrorMessage(null);

    if (!newCodeInput || newCodeInput.trim().length < 4) {
      setCodeErrorMessage('Le code d\'accès doit contenir au moins 4 caractères.');
      return;
    }

    const success = authService.setAccessCode(newCodeInput.trim());
    if (success) {
      setCurrentCode(newCodeInput.trim());
      setNewCodeInput('');
      setCodeSuccessMessage('Code d\'accès mis à jour avec succès.');
      setTimeout(() => setCodeSuccessMessage(null), 3500);
    } else {
      setCodeErrorMessage('Impossible de modifier le code d\'accès.');
    }
  };

  const handleResetDefaultCode = () => {
    authService.resetAccessCodeToDefault();
    setCurrentCode(DEFAULT_ACCESS_CODE);
    setNewCodeInput('');
    setCodeSuccessMessage('Code d\'accès réinitialisé à la valeur par défaut (user1234).');
    setTimeout(() => setCodeSuccessMessage(null), 3500);
  };

  // Copier le script SQL complet prêt à être exécuté dans Supabase SQL Editor
  const handleCopyFullSql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch (e) {
      console.error('Erreur copie presse-papier:', e);
    }
  };

  const handleCopyQuizMigration = async () => {
    try {
      await navigator.clipboard.writeText(QUIZ_SUPABASE_MIGRATION_SQL);
      setCopiedQuizMigration(true);
      setTimeout(() => setCopiedQuizMigration(false), 2500);
    } catch (e) {
      console.error('Erreur copie migration Quiz:', e);
    }
  };

  const handleCopyAvatarMigration = async () => {
    try {
      await navigator.clipboard.writeText(STUDENT_AVATAR_MIGRATION_SQL);
      setCopiedAvatarMigration(true);
      setTimeout(() => setCopiedAvatarMigration(false), 2500);
    } catch (e) {
      console.error('Erreur copie migration photo de profil:', e);
      setActionMessage({ type: 'error', text: 'Impossible de copier la migration photo. Autorisez l’accès au presse-papiers puis réessayez.' });
    }
  };

  const handleCopyStudentEmailMigration = async () => {
    try {
      await navigator.clipboard.writeText(STUDENT_EMAIL_IDENTITY_MIGRATION_SQL);
      setCopiedStudentEmailMigration(true);
      setTimeout(() => setCopiedStudentEmailMigration(false), 2500);
    } catch (e) {
      console.error('Erreur copie migration identité e-mail:', e);
      setActionMessage({ type: 'error', text: 'Impossible de copier la migration e-mail. Autorisez l’accès au presse-papiers puis réessayez.' });
    }
  };

  // Enregistrer la configuration
  const handleSaveConfig = () => {
    supabaseService.saveConfig({
      url: supabaseUrl,
      anonKey: supabaseKey
    });
    setActionMessage({
      type: 'success',
      text: 'Configuration active pour cet onglet. Pour la conserver au déploiement, définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.'
    });
    setTimeout(() => setActionMessage(null), 3500);
  };

  // Tester la connexion réelle à Supabase
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setActionMessage(null);

    // Enregistrer d'abord
    supabaseService.saveConfig({
      url: supabaseUrl,
      anonKey: supabaseKey
    });

    const result = await supabaseService.testConnection({
      url: supabaseUrl,
      anonKey: supabaseKey
    });

    setIsTesting(false);
    setTestResult(result);
  };

  // Synchroniser (exporter) les données locales vers Supabase
  const handleSyncToSupabase = async () => {
    setIsSyncing(true);
    setActionMessage(null);

    supabaseService.saveConfig({
      url: supabaseUrl,
      anonKey: supabaseKey
    });

    const rawState = dataService.getRawState();
    const result = await supabaseService.syncLocalToSupabase(rawState);

    setIsSyncing(false);
    setActionMessage({
      type: result.success ? 'success' : 'error',
      text: result.message
    });
  };

  // Importer les données depuis Supabase vers l'application locale
  const executeImportFromSupabase = async () => {
    setIsImporting(true);
    setActionMessage(null);

    supabaseService.saveConfig({
      url: supabaseUrl,
      anonKey: supabaseKey
    });

    const result = await supabaseService.importFromSupabase();
    setIsImporting(false);

    if (result.success && result.state) {
      dataService.setImportedState(result.state);
      onResetData();
      setActionMessage({
        type: 'success',
        text: result.message
      });
    } else {
      setActionMessage({
        type: 'error',
        text: result.message
      });
    }
  };

  const handleImportFromSupabase = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Importer depuis Supabase',
      message: 'Attention : Cette action va remplacer les données locales par celles présentes sur votre base de données Supabase. Continuer ?',
      confirmLabel: 'Importer et Écraser',
      variant: 'warning',
      action: () => {
        executeImportFromSupabase();
      }
    });
  };

  const isConfigured = supabaseService.isConfigured();

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
          Paramètres & Base de Données
        </h2>
        <p className="text-sm text-slate-500">
          Gestion du stockage local, connectivité Supabase PostgreSQL et exportations de données.
        </p>
      </div>

      {/* Carte Compte Examinateur & Sécurité d'Accès */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
                  Compte Examinateur Agréé
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 uppercase font-mono tracking-wider">
                  Accès Restreint
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Connecté en tant que <strong className="font-mono text-slate-900">{currentUser?.email || AUTHORIZED_EMAIL}</strong> ({currentUser?.role || 'Examinateur & Enseignant'}).
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Cette plateforme est strictement réservée à l'examinateur officiel <strong className="text-slate-600">{AUTHORIZED_EMAIL}</strong>.
              </p>
            </div>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors shrink-0 min-h-[40px] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Verrouiller / Déconnexion</span>
            </button>
          )}
        </div>

        {/* Section Code d'Accès */}
        <div className="pt-3.5 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-800" />
                <span className="text-xs font-semibold text-slate-800">Code d'accès actuel :</span>
                <span className="font-mono font-bold text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                  {currentCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Code requis lors de la connexion pour déverrouiller l'application.
              </p>
            </div>

            <form onSubmit={handleUpdateCode} className="flex items-center gap-2">
              <input
                type="text"
                value={newCodeInput}
                onChange={(e) => setNewCodeInput(e.target.value)}
                placeholder="Nouveau code..."
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-800 max-w-[140px]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
              >
                Modifier
              </button>
              {currentCode !== DEFAULT_ACCESS_CODE && (
                <button
                  type="button"
                  onClick={handleResetDefaultCode}
                  className="px-2 py-1.5 text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
                  title="Rétablir le code par défaut (user1234)"
                >
                  Rétablir user1234
                </button>
              )}
            </form>
          </div>

          {codeSuccessMessage && (
            <p className="text-xs text-emerald-700 font-medium mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{codeSuccessMessage}</span>
            </p>
          )}

          {codeErrorMessage && (
            <p className="text-xs text-rose-700 font-medium mt-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{codeErrorMessage}</span>
            </p>
          )}
        </div>
      </div>

      {/* Bannière de statut de la base de données */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs ${
        isConfigured && testResult?.success
          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
          : isConfigured && testResult && !testResult.success
            ? 'bg-rose-50/80 border-rose-200 text-rose-950'
            : 'bg-amber-50/80 border-amber-200 text-amber-950'
      }`}>
        <div className="flex items-start gap-3">
          <Database className={`w-5 h-5 shrink-0 mt-0.5 ${
            isConfigured && testResult?.success ? 'text-emerald-700' : isConfigured && testResult && !testResult.success ? 'text-rose-700' : 'text-amber-800'
          }`} />
          <div>
            <div className="font-semibold text-sm flex items-center gap-2">
              <span>Mode de persistance actuel :</span>
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                isConfigured && testResult?.success
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {isConfigured && testResult?.success ? 'Supabase PostgreSQL + Cache Local' : 'Stockage Local Sécurisé (Navigateur)'}
              </span>
            </div>
            <p className="text-xs opacity-90 mt-0.5">
              {isConfigured && testResult?.success
                ? 'Votre application est connectée à Supabase. Vos données peuvent être synchronisées dans le Cloud.'
                : "Vos données d'évaluation sont automatiquement sauvegardées en temps réel dans votre navigateur. Vous pouvez également connecter Supabase pour un hébergement Cloud."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSqlGuide(!showSqlGuide)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 self-start sm:self-auto shrink-0 shadow-2xs cursor-pointer min-h-[36px]"
        >
          <HelpCircle className="w-3.5 h-3.5 text-amber-800" />
          <span>{showSqlGuide ? 'Masquer le guide' : 'Guide de configuration Supabase'}</span>
        </button>
      </div>

      {/* Guide Pas à Pas pour configurer Supabase */}
      {showSqlGuide && (
        <div className="p-4 sm:p-5 bg-white border border-amber-200 rounded-xl shadow-xs space-y-3.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <span>🚀 Comment connecter Supabase en 3 étapes simples :</span>
            </h4>
            <a
              href="https://supabase.com/dashboard" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs font-semibold text-amber-800 hover:text-amber-900 inline-flex items-center gap-1"
            >
              <span>Ouvrir Supabase</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-mono text-[11px]">1</span>
                <span>Créer un projet</span>
              </div>
              <p>Connectez-vous sur <strong>supabase.com</strong> et créez un nouveau projet PostgreSQL gratuit.</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-mono text-[11px]">2</span>
                <span>Exécuter le script SQL</span>
              </div>
              <p>Pour un projet déjà utilisé, exécutez la migration d’identité e-mail ci-dessous : elle supprime les anciens élèves, leurs évaluations orales, ordres de passage et soumissions de quiz. Le script complet réinitialise davantage de tables.</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-mono text-[11px]">3</span>
                <span>Copier URL & Clé API</span>
              </div>
              <p>Dans <strong>Project Settings &gt; API</strong>, copiez l'<strong>URL</strong> et la clé <strong>anon public</strong> dans les champs ci-dessous.</p>
            </div>
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyStudentEmailMigration}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-xs transition-colors cursor-pointer min-h-[38px]"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedStudentEmailMigration ? '✓ Migration e-mail copiée !' : 'Migration e-mail (efface les anciens élèves)'}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyAvatarMigration}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-xs transition-colors cursor-pointer min-h-[38px]"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedAvatarMigration ? '✓ Migration photo copiée !' : 'Copier la migration Photo (sans effacer les données)'}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyQuizMigration}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 rounded-lg shadow-xs transition-colors cursor-pointer min-h-[38px]"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedQuizMigration ? '✓ Migration Quiz copiée !' : 'Copier la migration Quiz (sans effacer les données)'}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyFullSql}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 active:bg-amber-950 rounded-lg shadow-xs transition-colors cursor-pointer min-h-[38px]"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedSql ? '✓ Script SQL copié dans le presse-papier !' : 'Copier le script SQL complet (schema.sql)'}</span>
            </button>
            <span className="text-[11px] text-slate-500 italic">
              La migration Photo ajoute le bucket et la colonne nécessaires sans supprimer les données existantes.
            </span>
          </div>
        </div>
      )}

      {/* 2. Configuration Supabase PostgreSQL */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-slate-900 text-sm">
              Configuration Supabase PostgreSQL
            </h3>
          </div>
          <span className="text-xs font-mono font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
            SDK @supabase/supabase-js v2
          </span>
        </div>

        <p className="text-xs text-slate-600">
          Renseignez les identifiants de votre projet Supabase pour synchroniser les quiz, leurs résultats, les classes, élèves, examens et évaluations.
        </p>

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              URL du projet Supabase :
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://votre-projet.supabase.co"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Clé publique anonyme (SUPABASE_ANON_KEY) :
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 flex-wrap">
            <button
              type="button"
              onClick={handleSaveConfig}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg min-h-[40px] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Enregistrer la clé</span>
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-4 py-2 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 rounded-lg min-h-[40px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              <span>{isTesting ? 'Test en cours...' : 'Tester la connexion'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyFullSql}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 min-h-[40px] cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedSql ? '✓ Script SQL copié !' : 'Copier script schema.sql'}</span>
            </button>
          </div>

          {/* Résultat du test de connexion */}
          {testResult && (
            <div className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-start gap-2 font-semibold">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>

              {testResult.details && testResult.success && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                  <div className="p-1.5 bg-white/70 rounded">Classes : <strong>{testResult.details.classesCount}</strong></div>
                  <div className="p-1.5 bg-white/70 rounded">Élèves : <strong>{testResult.details.studentsCount}</strong></div>
                  <div className="p-1.5 bg-white/70 rounded">Examens : <strong>{testResult.details.examsCount}</strong></div>
                  <div className="p-1.5 bg-white/70 rounded">Évaluations : <strong>{testResult.details.evaluationsCount}</strong></div>
                  <div className="p-1.5 bg-white/70 rounded">Quiz : <strong>{testResult.details.quizzesCount}</strong></div>
                  <div className="p-1.5 bg-white/70 rounded">Résultats quiz : <strong>{testResult.details.quizSubmissionsCount}</strong></div>
                </div>
              )}
            </div>
          )}

          {/* Actions de synchronisation */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleSyncToSupabase}
              disabled={isSyncing || !supabaseUrl || !supabaseKey}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 rounded-lg shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[42px] cursor-pointer"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              <span>{isSyncing ? 'Synchronisation vers Supabase...' : 'Synchroniser les données locales vers Supabase'}</span>
            </button>

            <button
              type="button"
              onClick={handleImportFromSupabase}
              disabled={isImporting || !supabaseUrl || !supabaseKey}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[42px] cursor-pointer"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
              <span>{isImporting ? 'Importation...' : 'Importer depuis Supabase'}</span>
            </button>
          </div>

          {actionMessage && (
            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
              actionMessage.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* 1. Zone d'Exportation Globale */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            Exportation des Résultats & Statistiques
          </h3>
          <p className="text-xs text-slate-500">
            Téléchargez l'intégralité des données d'évaluation sous différents formats standards.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => {
              const evals = dataService.getEvaluations();
              const headers = ['Nom', 'Prenom', 'Classe', 'Examen', 'Date', 'Note', 'Note_Max', 'Pourcentage'];
              const rows = evals.map(e => [
                e.student_name,
                e.class_name,
                `"${e.exam_title}"`,
                e.exam_date,
                e.total_score,
                e.max_score,
                `${e.percentage}%`
              ].join(','));
              const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
              const link = document.createElement('a');
              link.href = encodeURI(csv);
              link.download = `export_oral_exams_${new Date().toISOString().split('T')[0]}.csv`;
              link.click();
            }}
            className="p-4 border border-slate-200 rounded-lg hover:border-amber-700 bg-slate-50/50 hover:bg-amber-50/30 text-left transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-700 mb-2" />
            <div className="font-semibold text-slate-900 text-xs">Format CSV</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Compatible Excel et Google Sheets</div>
          </button>

          <button
            type="button"
            onClick={() => {
              const evals = dataService.getEvaluations();
              const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(evals, null, 2));
              const link = document.createElement('a');
              link.href = jsonStr;
              link.download = `export_oral_exams_${new Date().toISOString().split('T')[0]}.json`;
              link.click();
            }}
            className="p-4 border border-slate-200 rounded-lg hover:border-amber-700 bg-slate-50/50 hover:bg-amber-50/30 text-left transition-all cursor-pointer"
          >
            <FileCode className="w-5 h-5 text-amber-800 mb-2" />
            <div className="font-semibold text-slate-900 text-xs">Format JSON</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Structure complète avec détail des rubriques</div>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="p-4 border border-slate-200 rounded-lg hover:border-amber-700 bg-slate-50/50 hover:bg-amber-50/30 text-left transition-all cursor-pointer"
          >
            <Printer className="w-5 h-5 text-slate-700 mb-2" />
            <div className="font-semibold text-slate-900 text-xs">Impression / PDF</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Rapport récapitulatif prêt à imprimer</div>
          </button>
        </div>
      </div>

      {/* 3. Réinitialisation des Données de Démo */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            Réinitialiser les données d'exemple
          </h3>
          <p className="text-xs text-slate-500">
            Recharge les classes A1/B1, l'examen officiel « Lo zébu », et les 3 évaluations de référence.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setConfirmDialog({
              isOpen: true,
              title: 'Réinitialiser les données',
              message: 'Voulez-vous réinitialiser toutes les données aux valeurs de démonstration ?\nCette action recharge les classes de test A1/B1 et l\'examen officiel.',
              confirmLabel: 'Réinitialiser',
              variant: 'danger',
              action: () => {
                dataService.resetToDefault();
                onResetData();
                setActionMessage({
                  type: 'success',
                  text: 'Données réinitialisées avec succès aux valeurs de démonstration !'
                });
              }
            });
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-lg transition-colors min-h-[44px] shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Réinitialiser</span>
        </button>
      </div>

      {/* In-App Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => {
          if (confirmDialog.action) confirmDialog.action();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
