import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  KeyRound,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Clock,
  UserPlus,
  ArrowLeft
} from 'lucide-react';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { ClassRoom } from '../types';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [viewMode, setViewMode] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [regFirstName, setRegFirstName] = useState<string>('');
  const [regLastName, setRegLastName] = useState<string>('');
  const [regStudentNumber, setRegStudentNumber] = useState<string>('');
  const [regClassId, setRegClassId] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regConfirmPassword, setRegConfirmPassword] = useState<string>('');
  const [showRegPassword, setShowRegPassword] = useState<boolean>(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState<boolean>(false);

  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  useEffect(() => {
    const refreshClasses = () => {
      const latestClasses = dataService.getClasses();
      setClasses(latestClasses);
      setRegClassId(current =>
        latestClasses.some(c => c.id === current) ? current : latestClasses[0]?.id || ''
      );
    };
    refreshClasses();
    return dataService.subscribe(refreshClasses);
  }, []);

  useEffect(() => {
    const status = authService.getLockoutStatus();
    if (status.isLocked) setLockoutSeconds(status.remainingSeconds);
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) { clearInterval(interval); setErrorMessage(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const handleUnifiedLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const result = await authService.login(email, password);
      if (result.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(result.error || 'Adresse email ou mot de passe incorrect.');
        const status = authService.getLockoutStatus();
        if (status.isLocked) setLockoutSeconds(status.remainingSeconds);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Connexion impossible. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Les mots de passe ne correspondent pas.');
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      let rosterStudent = dataService.getStudentByEmail(regEmail);
      const targetClass = classes.find(c => c.id === (rosterStudent?.class_id || regClassId));

      if (!rosterStudent && supabaseService.isConfigured()) {
        rosterStudent = await dataService.createStudent(
          regFirstName, regLastName, regClassId, regEmail, regStudentNumber
        );
      }

      const result = await authService.registerStudent({
        firstName: rosterStudent?.first_name || regFirstName,
        lastName: rosterStudent?.last_name || regLastName,
        studentNumber: rosterStudent?.student_number || regStudentNumber,
        classId: rosterStudent?.class_id || regClassId,
        className: targetClass?.name,
        email: regEmail,
        password: regPassword,
        existingStudentId: rosterStudent?.id
      });

      if (!result.success) {
        setErrorMessage(result.error || "Erreur lors de l'inscription.");
        return;
      }

      if (result.confirmationRequired) {
        setEmail(regEmail.trim().toLowerCase());
        setViewMode('login');
        setSuccessMessage('Compte créé. Confirmez votre adresse e-mail avec le lien reçu, puis connectez-vous.');
        return;
      }

      const createdStudentId = result.user?.student_id || rosterStudent?.id;
      if (!rosterStudent && createdStudentId) {
        await dataService.createStudent(regFirstName, regLastName, regClassId, regEmail, regStudentNumber, createdStudentId);
      } else if (rosterStudent) {
        await dataService.updateStudent(rosterStudent.id, { validation_status: 'pending' });
      }

      authService.logout();
      setViewMode('login');
      setEmail(regEmail.trim().toLowerCase());
      setPassword('');
      setSuccessMessage(
        'Votre inscription a été enregistrée avec succès ! Votre compte est en attente de validation par le professeur. Vous pourrez vous connecter dès son approbation.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer le compte étudiant.');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Couleur bleue marine partagée ────────────────────────────────────────
  const NAVY = '#1a2f4e';

  // ─── Classes champs ────────────────────────────────────────────────────────
  const inputCls =
    'w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1a2f4e]/40 focus:border-[#1a2f4e] transition-colors';
  const inputSmCls =
    'w-full pl-3 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1a2f4e]/40 focus:border-[#1a2f4e] transition-colors';

  // ─── Panneau Branding (logo + mascotte) — partagé desktop/mobile ──────────
  const BrandingPanel = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col items-center ${mobile ? 'pt-10 pb-6 px-6' : 'justify-center h-full px-10'}`}>
      {/* Logo + Titre */}
      <div className="flex flex-col items-center gap-2 mb-5">
        <div className={`rounded-2xl bg-white shadow-lg border border-white/60 flex items-center justify-center ${mobile ? 'w-16 h-16' : 'w-20 h-20'}`}>
          <img
            src="/percky-lingua-logo.png"
            alt="PerckyLingua"
            className={`object-contain ${mobile ? 'w-12 h-12' : 'w-14 h-14'}`}
          />
        </div>
        <h1
          className={`font-extrabold tracking-tight text-center leading-tight ${mobile ? 'text-3xl' : 'text-4xl xl:text-5xl'}`}
          style={{ color: NAVY, fontFamily: 'Georgia, serif' }}
        >
          PerckyLingua
        </h1>
        {/* Trait tricolore */}
        <div className="flex w-36 mx-auto">
          <div className="h-1 flex-1 bg-emerald-500 rounded-l-full" />
          <div className="h-1 flex-1 bg-white" />
          <div className="h-1 flex-1 bg-red-500 rounded-r-full" />
        </div>
        <p className="text-slate-500 font-light tracking-wide text-sm text-center">
          Lingua e Cultura Italiana
        </p>
      </div>

      {/* Mascotte avec blob + tirets */}
      <div className="relative flex items-center justify-center">
        {/* Blob derrière */}
        <div
          className="absolute rounded-full opacity-60"
          style={{
            width: mobile ? 160 : 280,
            height: mobile ? 160 : 280,
            background: 'radial-gradient(circle, #b8e0d8 0%, #d0ecf0 60%, transparent 100%)',
          }}
        />
        {/* Tirets décoratifs */}
        <div className="absolute top-[15%] left-[-8%] w-5 h-1.5 bg-emerald-500 rounded-full rotate-[-30deg] opacity-80" />
        <div className="absolute top-[22%] left-[-4%]  w-3 h-1   bg-red-500   rounded-full rotate-[-30deg] opacity-70" />
        <div className="absolute top-[15%] right-[-8%] w-5 h-1.5 bg-red-500   rounded-full rotate-[30deg]  opacity-80" />
        <div className="absolute top-[22%] right-[-4%] w-3 h-1   bg-emerald-500 rounded-full rotate-[30deg] opacity-70" />

        <img
          src="/student-learning-sticker.png"
          alt="Mascotte PerckyLingua"
          className={`relative z-10 drop-shadow-xl select-none ${mobile ? 'w-40' : 'w-64 xl:w-72'}`}
          draggable={false}
        />
      </div>
    </div>
  );

  // ─── Contenu du formulaire (partagé) ──────────────────────────────────────
  const FormContent = () => (
    <div className="w-full">
      {/* Alertes */}
      {errorMessage && (
        <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Erreur de connexion</p>
            <p>{errorMessage}</p>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p>{successMessage}</p>
        </div>
      )}
      {lockoutSeconds > 0 && (
        <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
          <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <p className="font-semibold">Sécurité activée</p>
            <p>Réessayez dans <strong className="font-mono">{lockoutSeconds}s</strong>.</p>
          </div>
        </div>
      )}

      {/* ── CONNEXION ── */}
      {viewMode === 'login' && (
        <form onSubmit={handleUnifiedLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              Adresse e-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre.email@domaine.fr"
                className={inputCls}
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              Mot de passe / Code d'accès
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputCls} pr-11`}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-1">
            <button type="submit" disabled={isLoading || lockoutSeconds > 0}
              className="w-full py-3.5 px-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2.5 transition-all shadow-md disabled:opacity-60"
              style={{ background: NAVY }}>
              <Lock className="w-4 h-4" />
              <span>{isLoading ? 'Connexion…' : 'Se connecter'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">ou</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="text-center">
            <button type="button"
              onClick={() => { setViewMode('register'); setErrorMessage(null); setSuccessMessage(null); }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-2 transition-colors">
              <UserPlus className="w-4 h-4" />
              <span>Nouvel élève ? Créer mon compte étudiant</span>
            </button>
          </div>
        </form>
      )}

      {/* ── INSCRIPTION ── */}
      {viewMode === 'register' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <button type="button"
              onClick={() => { setViewMode('login'); setErrorMessage(null); setSuccessMessage(null); }}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#1a2f4e] transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retour</span>
            </button>
            <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">
              Inscription Élève
            </span>
          </div>

          <form onSubmit={handleStudentRegister} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Prénom *</label>
                <input type="text" required value={regFirstName}
                  onChange={e => setRegFirstName(e.target.value)} placeholder="Jean"
                  className={inputSmCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Nom *</label>
                <input type="text" required value={regLastName}
                  onChange={e => setRegLastName(e.target.value)} placeholder="Rakoto"
                  className={inputSmCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">N° élève</label>
                <input type="text" value={regStudentNumber}
                  onChange={e => setRegStudentNumber(e.target.value)} placeholder="ex: 3"
                  className={`${inputSmCls} font-mono`} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Classe *</label>
                <select value={regClassId} onChange={e => setRegClassId(e.target.value)} className={inputSmCls}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Adresse e-mail *</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type="email" required value={regEmail}
                  onChange={e => setRegEmail(e.target.value)} placeholder="votre.email@ecole.fr"
                  className={`${inputSmCls} pl-9`} />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Mot de passe *</label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type={showRegPassword ? 'text' : 'password'} required minLength={4}
                  value={regPassword} onChange={e => setRegPassword(e.target.value)}
                  placeholder="Minimum 4 caractères" className={`${inputSmCls} pl-9 pr-9`} />
                <button type="button" onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Confirmer le mot de passe *</label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type={showRegConfirmPassword ? 'text' : 'password'} required minLength={4}
                  value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)}
                  placeholder="Confirmez le mot de passe" className={`${inputSmCls} pl-9 pr-9`} />
                <button type="button" onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  {showRegConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button type="submit" disabled={isLoading}
                className="w-full py-3 px-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-60"
                style={{ background: NAVY }}>
                <UserPlus className="w-4 h-4" />
                <span>{isLoading ? 'Création…' : 'Créer mon compte'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );

  // ─── RENDU PRINCIPAL ──────────────────────────────────────────────────────
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          MOBILE  (< lg) : layout vertical pleine largeur
      ══════════════════════════════════════════════════════════════ */}
      <div
        className="lg:hidden min-h-screen flex flex-col"
        style={{ background: 'linear-gradient(160deg, #e8f5f0 0%, #d4eee8 35%, #c8e8f0 100%)' }}
      >
        {/* Branding + mascotte */}
        <BrandingPanel mobile />

        {/* Carte formulaire blanche */}
        <div className="flex-1 flex flex-col">
          <div className="mx-4 mb-4 bg-white rounded-3xl shadow-xl border border-slate-100 p-6">
            <FormContent />
          </div>
          <p className="text-center text-[11px] text-slate-500 pb-6">
            PerckyLingua • Lingua e Cultura Italiana
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP (≥ lg) : layout 2 colonnes
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex min-h-screen">

        {/* Colonne gauche — Branding */}
        <div
          className="w-[48%] xl:w-[44%] flex flex-col items-center justify-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #e8f5f0 0%, #d4eee8 40%, #c8e8f0 100%)' }}
        >
          <BrandingPanel />
        </div>

        {/* Colonne droite — Formulaire */}
        <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 xl:px-16 py-10 overflow-y-auto">
          <div className="w-full max-w-sm">
            <FormContent />
          </div>
          <p className="mt-8 text-center text-[11px] text-slate-400">
            PerckyLingua • Lingua e Cultura Italiana
          </p>
        </div>

      </div>
    </>
  );
};
