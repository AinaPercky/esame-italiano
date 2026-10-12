import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Mail, 
  KeyRound, 
  ShieldCheck, 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2, 
  BookOpen, 
  Eye, 
  EyeOff, 
  Clock, 
  UserPlus, 
  GraduationCap, 
  UserCheck, 
  Sparkles,
  ArrowLeft,
  Phone
} from 'lucide-react';
import { authService, ADMIN_EMAIL } from '../services/authService';
import { dataService } from '../services/dataService';
import { ClassRoom } from '../types';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  // Mode : 'login' (page unique pour tous) ou 'register' (création compte élève)
  const [viewMode, setViewMode] = useState<'login' | 'register'>('login');

  // Unified Form State (Email + Mot de passe)
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Student Registration Form State
  const [regFirstName, setRegFirstName] = useState<string>('');
  const [regLastName, setRegLastName] = useState<string>('');
  const [regStudentNumber, setRegStudentNumber] = useState<string>('');
  const [regClassId, setRegClassId] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regConfirmPassword, setRegConfirmPassword] = useState<string>('');
  const [showRegPassword, setShowRegPassword] = useState<boolean>(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState<boolean>(false);

  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  useEffect(() => {
    const cls = dataService.getClasses();
    setClasses(cls);
    if (cls.length > 0 && !regClassId) {
      setRegClassId(cls[0].id);
    }
  }, []);

  // Décompte de verrouillage temporaire anti-bruteforce
  useEffect(() => {
    const status = authService.getLockoutStatus();
    if (status.isLocked) {
      setLockoutSeconds(status.remainingSeconds);
    }
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // Connexion Unique : le système identifie automatiquement enseignant ou étudiant
  const handleUnifiedLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setErrorMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      const result = authService.login(email, password);
      setIsLoading(false);

      if (result.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(result.error || 'Adresse email ou mot de passe incorrect.');
        const status = authService.getLockoutStatus();
        if (status.isLocked) {
          setLockoutSeconds(status.remainingSeconds);
        }
      }
    }, 300);
  };

  // Inscription Étudiant
  const handleStudentRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Les mots de passe ne correspondent pas.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    const targetClass = classes.find(c => c.id === regClassId);

    setTimeout(() => {
      const result = authService.registerStudent({
        firstName: regFirstName,
        lastName: regLastName,
        studentNumber: regStudentNumber,
        classId: regClassId,
        className: targetClass?.name,
        email: regEmail,
        phone: regPhone,
        password: regPassword
      });

      setIsLoading(false);

      if (result.success) {
        try {
          dataService.createStudent(regFirstName, regLastName, regClassId, regStudentNumber);
        } catch (e) {
          console.warn('Note:', e);
        }
        onLoginSuccess();
      } else {
        setErrorMessage(result.error || 'Erreur lors de l\'inscription.');
      }
    }, 300);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        {/* Emblem / Logo */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 shadow-xl shadow-amber-900/40 flex items-center justify-center">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
              <span className="font-display font-black text-2xl text-amber-400 tracking-wider">
                E
              </span>
            </div>
          </div>
        </div>

        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-white">
          Esame
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-300">
          Portail officiel d'examens & quiz de langue italienne
        </p>

        {/* Security Badge */}
        <div className="mt-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-amber-400/10 text-amber-300 border border-amber-400/20 shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Portail Unique • Redirection Automatique selon le Profil</span>
          </span>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/90 backdrop-blur-xl py-7 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-700/60">
          
          {/* Error Message */}
          {errorMessage && (
            <div className="mb-4 p-3.5 bg-rose-950/80 border border-rose-500/40 rounded-xl flex items-start gap-2.5 text-xs text-rose-200 animate-fade-in shadow-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-300">Erreur de connexion</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Lockout Warning */}
          {lockoutSeconds > 0 && (
            <div className="mb-4 p-3.5 bg-amber-950/80 border border-amber-500/40 rounded-xl flex items-start gap-3 text-xs text-amber-200 animate-fade-in">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="font-semibold text-amber-300">Sécurité activée</p>
                <p>Trop de tentatives infructueuses. Réessayez dans <strong className="font-mono text-white">{lockoutSeconds}s</strong>.</p>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 1. FORMULAIRE DE CONNEXION UNIQUE (ENSEIGNANT & ÉTUDIANT)    */}
          {/* ============================================================ */}
          {viewMode === 'login' && (
            <form onSubmit={handleUnifiedLogin} className="space-y-4">
              
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Adresse Email ou Numéro de téléphone
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre.email@domaine.fr ou 06XXXXXXXX"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mot de passe / Code d'accès
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || lockoutSeconds > 0}
                  className="w-full py-3 px-4 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>Se connecter</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Notice explicative automatique */}
              <div className="pt-3 border-t border-slate-800/80 text-center space-y-2">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Le système identifie automatiquement votre rôle (<strong>Enseignant</strong> ou <strong>Étudiant</strong>) et charge votre espace approprié.
                </p>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('register');
                      setErrorMessage(null);
                    }}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Nouvel élève ? Créer mon compte étudiant</span>
                  </button>
                </div>
              </div>

            </form>
          )}

          {/* ============================================================ */}
          {/* 2. FORMULAIRE D'INSCRIPTION ÉTUDIANT                         */}
          {/* ============================================================ */}
          {viewMode === 'register' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('login');
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Retour à la connexion</span>
                </button>
                <span className="text-xs font-bold text-amber-400">
                  Inscription Élève
                </span>
              </div>

              <form onSubmit={handleStudentRegister} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Prénom *
                    </label>
                    <input
                      type="text"
                      required
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="Jean"
                      className="w-full p-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Nom *
                    </label>
                    <input
                      type="text"
                      required
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="Rakoto"
                      className="w-full p-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Numéro d'élève (ex: 1, 2) *
                    </label>
                    <input
                      type="text"
                      required
                      value={regStudentNumber}
                      onChange={(e) => setRegStudentNumber(e.target.value)}
                      placeholder="ex: 3"
                      className="w-full p-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Classe *
                    </label>
                    <select
                      value={regClassId}
                      onChange={(e) => setRegClassId(e.target.value)}
                      className="w-full p-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    >
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Adresse Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="votre.email@ecole.fr"
                    className="w-full p-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Numéro de téléphone (optionnel)
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="06 12 34 56 78"
                      className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Mot de passe *
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimum 4 caractères"
                      className="w-full p-2 pr-9 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Confirmer le mot de passe *
                  </label>
                  <div className="relative">
                    <input
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Confirmez le mot de passe"
                      className="w-full p-2 pr-9 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showRegConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Créer mon compte et accéder directement</span>
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Esame • Lingua e Cultura Italiana
        </p>
      </div>

    </div>
  );
};
