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

  const inputCls = 'auth-input w-full';
  const inputSmCls = 'auth-input w-full';

  // Keep these as render helpers, not nested React components: each keystroke
  // updates LoginView, and remounting a nested component would drop input focus.
  const renderBrandingPanel = ({ mobile = false }: { mobile?: boolean } = {}) => (
    mobile ? (
      <header className="auth-mobile-brand">
        <div className="auth-mobile-lockup">
          <img src="/percky-lingua-logo.png" alt="" className="auth-mobile-logo" />
          <div>
            <p className="auth-wordmark auth-wordmark-mobile">PerckyLingua</p>
            <div className="auth-tricolour auth-tricolour-mobile" aria-hidden="true"><i /><i /><i /></div>
          </div>
        </div>
        <div className="auth-mobile-mascot-wrap">
          <span className="auth-mobile-glow" />
          <img src="/student-learning-sticker.png" alt="Un élève prêt à apprendre l’italien" className="auth-mobile-mascot" draggable={false} />
        </div>
      </header>
    ) : (
      <section className="auth-visual" aria-label="PerckyLingua, apprendre l’italien avec confiance">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <div className="auth-deco auth-deco-green" />
        <div className="auth-deco auth-deco-red" />
        <div className="auth-brand-lockup">
          <img src="/percky-lingua-logo.png" alt="" className="auth-brand-logo" />
          <div>
            <p className="auth-wordmark">PerckyLingua</p>
            <div className="auth-tricolour" aria-hidden="true"><i /><i /><i /></div>
            <p className="auth-tagline">Lingua e Cultura Italiana</p>
          </div>
        </div>
        <div className="auth-illustration-wrap">
          <div className="auth-illustration-glow" />
          <span className="auth-spark auth-spark-left">✦</span>
          <span className="auth-spark auth-spark-right">✦</span>
          <img src="/student-learning-sticker.png" alt="Un élève souriant avec ses livres d’italien" className="auth-illustration" draggable={false} />
        </div>
        <div className="auth-visual-copy">
          <span className="auth-eyebrow"><span /> IMPARA · PARLA · PROGREDISCI</span>
          <h2>La lingua italiana,<br /><em>un passo alla volta.</em></h2>
          <p>Apprenez, entraînez-vous et suivez vos progrès avec confiance.</p>
        </div>
        <p className="auth-visual-footer">Fatto con passione per la lingua italiana <span>•</span> Dal Madagascar</p>
      </section>
    )
  );

  const renderFormContent = () => (
    <div className="auth-form-content">
      <div className="auth-form-heading">
        <p className="auth-kicker">{viewMode === 'login' ? 'VOTRE ESPACE D’APPRENTISSAGE' : 'REJOIGNEZ LA CLASSE'}</p>
        <h1>{viewMode === 'login' ? 'Ravi de vous revoir.' : 'Votre aventure italienne commence ici.'}</h1>
        <p className="auth-subtitle">
          {viewMode === 'login'
            ? 'Connectez-vous pour retrouver vos cours et votre progression.'
            : 'Créez votre compte élève pour apprendre et progresser en italien.'}
        </p>
      </div>

      {errorMessage && (
        <div className="auth-alert auth-alert-error" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div><p className="font-semibold">Vérifiez les informations saisies</p><p>{errorMessage}</p></div>
        </div>
      )}
      {successMessage && (
        <div className="auth-alert auth-alert-success" role="status">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{successMessage}</p>
        </div>
      )}
      {lockoutSeconds > 0 && (
        <div className="auth-alert auth-alert-lock" role="status">
          <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div><p className="font-semibold">Sécurité activée</p><p>Réessayez dans <strong className="font-mono">{lockoutSeconds}s</strong>.</p></div>
        </div>
      )}

      {viewMode === 'login' && (
        <form onSubmit={handleUnifiedLogin} className="auth-form" aria-label="Connexion">
          <div className="auth-field-group">
            <label htmlFor="login-email" className="auth-label">Adresse e-mail</label>
            <div className="auth-input-wrap">
              <Mail className="auth-input-icon" aria-hidden="true" />
              <input id="login-email" type="text" required value={email}
                onChange={e => setEmail(e.target.value)} placeholder="votre.email@domaine.fr"
                className={`${inputCls} auth-input-icon-space`} autoComplete="username" autoCapitalize="none" />
            </div>
          </div>
          <div className="auth-field-group">
            <label htmlFor="login-password" className="auth-label">Mot de passe / code d’accès</label>
            <div className="auth-input-wrap">
              <KeyRound className="auth-input-icon" aria-hidden="true" />
              <input id="login-password" type={showPassword ? 'text' : 'password'} required value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Votre mot de passe"
                className={`${inputCls} auth-input-icon-space auth-input-action-space`} autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="auth-visibility"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword}>
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={isLoading || lockoutSeconds > 0} className="auth-submit">
            <Lock className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>{isLoading ? 'Connexion…' : 'Se connecter'}</span>
            {!isLoading && <ArrowRight className="h-[18px] w-[18px] auth-submit-arrow" aria-hidden="true" />}
          </button>
          <div className="auth-divider"><span /> <span>ou</span> <span /></div>
          <div className="auth-switch-prompt">
            <p>Vous êtes nouvel élève ?</p>
            <button type="button" onClick={() => { setViewMode('register'); setErrorMessage(null); setSuccessMessage(null); }} className="auth-switch-button">
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Créer mon compte étudiant
            </button>
          </div>
        </form>
      )}

      {viewMode === 'register' && (
        <div className="auth-register">
          <button type="button" onClick={() => { setViewMode('login'); setErrorMessage(null); setSuccessMessage(null); }} className="auth-back-link">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à la connexion
          </button>
          <form onSubmit={handleStudentRegister} className="auth-form auth-register-form" aria-label="Inscription élève">
            <div className="auth-form-row">
              <div className="auth-field-group">
                <label htmlFor="register-first-name" className="auth-label">Prénom <span>*</span></label>
                <input id="register-first-name" type="text" required value={regFirstName} onChange={e => setRegFirstName(e.target.value)} placeholder="Jean" className={inputSmCls} autoComplete="given-name" />
              </div>
              <div className="auth-field-group">
                <label htmlFor="register-last-name" className="auth-label">Nom <span>*</span></label>
                <input id="register-last-name" type="text" required value={regLastName} onChange={e => setRegLastName(e.target.value)} placeholder="Rakoto" className={inputSmCls} autoComplete="family-name" />
              </div>
            </div>
            <div className="auth-form-row">
              <div className="auth-field-group">
                <label htmlFor="register-student-number" className="auth-label">N° élève</label>
                <input id="register-student-number" type="text" value={regStudentNumber} onChange={e => setRegStudentNumber(e.target.value)} placeholder="Ex. : 3" className={inputSmCls} />
              </div>
              <div className="auth-field-group">
                <label htmlFor="register-class" className="auth-label">Classe <span>*</span></label>
                <select id="register-class" required value={regClassId} onChange={e => setRegClassId(e.target.value)} className={`${inputSmCls} auth-select`}>
                  {classes.length === 0 && <option value="">Aucune classe disponible</option>}
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="auth-field-group">
              <label htmlFor="register-email" className="auth-label">Adresse e-mail <span>*</span></label>
              <div className="auth-input-wrap">
                <Mail className="auth-input-icon" aria-hidden="true" />
                <input id="register-email" type="email" required value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="votre.email@ecole.fr" className={`${inputSmCls} auth-input-icon-space`} autoComplete="email" inputMode="email" autoCapitalize="none" />
              </div>
            </div>
            <div className="auth-field-group">
              <label htmlFor="register-password" className="auth-label">Mot de passe <span>*</span></label>
              <div className="auth-input-wrap">
                <KeyRound className="auth-input-icon" aria-hidden="true" />
                <input id="register-password" type={showRegPassword ? 'text' : 'password'} required minLength={4} value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="4 caractères minimum" className={`${inputSmCls} auth-input-icon-space auth-input-action-space`} autoComplete="new-password" />
                <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="auth-visibility" aria-label={showRegPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showRegPassword}>
                  {showRegPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
              <p className="auth-hint">Utilisez au moins 4 caractères.</p>
            </div>
            <div className="auth-field-group">
              <label htmlFor="register-confirm-password" className="auth-label">Confirmer le mot de passe <span>*</span></label>
              <div className="auth-input-wrap">
                <KeyRound className="auth-input-icon" aria-hidden="true" />
                <input id="register-confirm-password" type={showRegConfirmPassword ? 'text' : 'password'} required minLength={4} value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)} placeholder="Saisissez-le à nouveau" className={`${inputSmCls} auth-input-icon-space auth-input-action-space`} autoComplete="new-password" />
                <button type="button" onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)} className="auth-visibility" aria-label={showRegConfirmPassword ? 'Masquer la confirmation' : 'Afficher la confirmation'} aria-pressed={showRegConfirmPassword}>
                  {showRegConfirmPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isLoading || classes.length === 0} className="auth-submit auth-register-submit">
              <UserPlus className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{isLoading ? 'Création du compte…' : 'Créer mon compte étudiant'}</span>
              {!isLoading && <ArrowRight className="h-[18px] w-[18px] auth-submit-arrow" aria-hidden="true" />}
            </button>
            <p className="auth-privacy-note">Vos informations seront utilisées pour votre suivi pédagogique.</p>
          </form>
        </div>
      )}
    </div>
  );

  return (
    <main className="auth-page">
      <div className="auth-mobile-top">{renderBrandingPanel({ mobile: true })}</div>
      <div className="auth-layout">
        <div className="auth-desktop-brand">{renderBrandingPanel()}</div>
        <section className="auth-main" aria-label={viewMode === 'login' ? 'Se connecter à PerckyLingua' : 'Créer un compte élève'}>
          <div className="auth-card">{renderFormContent()}</div>
          <footer className="auth-footer"><span>PerckyLingua</span><i aria-hidden="true">•</i> Lingua e Cultura Italiana</footer>
        </section>
      </div>
    </main>
  );
};
