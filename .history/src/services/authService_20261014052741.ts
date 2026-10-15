import { isValidEmail, normalizeEmail } from '../utils/email';
import { ClassRoom, Student } from '../types';
import { supabaseService } from './supabaseService';

/**
 * Service d'authentification et de contrôle d'accès multi-rôles pour Esame :
 * 1. Admin par défaut : AinaPercky (ainapercky@gmail.com, code: user1234)
 * 2. Étudiants : Inscription autonome, connexion, espace personnel de quiz et notes.
 */

const ENC_EMAIL = 'YWluYXBlcmNreUBnbWFpbC5jb20=';
const ENC_NAME = 'QWluYVBlcmNreQ==';
const ENC_CODE = 'dXNlcjEyMzQ=';

export const ADMIN_EMAIL = atob(ENC_EMAIL);
export const AUTHORIZED_EMAIL = ADMIN_EMAIL;
export const ADMIN_NAME = atob(ENC_NAME);
export const DEFAULT_ACCESS_CODE = atob(ENC_CODE);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student';
  student_id?: string;
  student_number?: string | null;
  class_id?: string;
  class_name?: string;
  avatar?: string;
  loginAt: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000; // 30s

const listeners: Array<() => void> = [];
let currentUser: AuthUser | null = null;
let accessCode = DEFAULT_ACCESS_CODE;
let failedAttempts = { count: 0, lockedUntil: 0 };

function notifyAuthChange() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}

export const authService = {
  removeStudentAccountByEmail(email: string): void {
    if (currentUser?.role === 'student' && normalizeEmail(currentUser.email) === normalizeEmail(email)) {
      this.logout();
    }
  },

  removeStudentAccountsForClass(classId: string): void {
    if (currentUser?.role === 'student' && currentUser.class_id === classId) {
      this.logout();
    }
  },

  clearStudentAccounts(): void {
    if (currentUser?.role === 'student') {
      this.logout();
    }
  },

  synchronizeStudentAccountsWithRoster(students: Student[], classes: ClassRoom[]): void {
    const studentsByEmail = new Map(students.map(student => [normalizeEmail(student.email), student]));
    const classNamesById = new Map(classes.map(classroom => [classroom.id, classroom.name]));
    if (currentUser?.role === 'student') {
      const student = studentsByEmail.get(normalizeEmail(currentUser.email));
      if (!student) {
        this.logout();
        return;
      }
      const updatedUser: AuthUser = {
        ...currentUser,
        student_id: student.id,
        student_number: student.student_number,
        class_id: student.class_id,
        class_name: classNamesById.get(student.class_id) || currentUser.class_name,
        name: `${student.first_name} ${student.last_name}`
      };
      currentUser = updatedUser;
      notifyAuthChange();
    }
  },

  getAdminEmail(): string {
    return ADMIN_EMAIL;
  },

  getAuthorizedEmail(): string {
    return ADMIN_EMAIL;
  },

  getAdminName(): string {
    return ADMIN_NAME;
  },

  getAccessCode(): string {
    return accessCode;
  },

  setAccessCode(newCode: string): boolean {
    if (!newCode || newCode.trim().length < 4) return false;
    accessCode = newCode.trim();
    return true;
  },

  resetAccessCodeToDefault(): void {
    accessCode = DEFAULT_ACCESS_CODE;
  },

  getLockoutStatus(): { isLocked: boolean; remainingSeconds: number } {
    const now = Date.now();
    if (failedAttempts.lockedUntil > now) {
      return { isLocked: true, remainingSeconds: Math.ceil((failedAttempts.lockedUntil - now) / 1000) };
    }
    return { isLocked: false, remainingSeconds: 0 };
  },

  recordFailedAttempt(): { isLocked: boolean; remainingSeconds: number; attemptsLeft: number } {
    failedAttempts.count += 1;
    if (failedAttempts.count >= MAX_FAILED_ATTEMPTS) {
      failedAttempts.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      return { isLocked: true, remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000), attemptsLeft: 0 };
    }
    return { isLocked: false, remainingSeconds: 0, attemptsLeft: MAX_FAILED_ATTEMPTS - failedAttempts.count };
  },

  resetFailedAttempts(): void {
    failedAttempts = { count: 0, lockedUntil: 0 };
  },

  getCurrentUser(): AuthUser | null {
    return currentUser;
  },

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  },

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'admin';
  },

  isStudent(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'student';
  },

  /**
   * Connexion unifiée :
   * L'utilisateur saisit son adresse email et son mot de passe.
   * Le système identifie automatiquement s'il s'agit de l'enseignant (Admin) ou d'un étudiant.
   */
  async login(identifier: string, passwordOrCode: string): Promise<{ success: boolean; error?: string; user?: AuthUser }> {
    const cleanId = normalizeEmail(identifier || '');

    if (!cleanId) {
      return { success: false, error: 'Veuillez renseigner votre adresse e-mail.' };
    }
    if (!passwordOrCode) {
      return { success: false, error: 'Veuillez saisir votre mot de passe ou code d\'accès.' };
    }

    // 1. Détection automatique : Compte Administrateur / Enseignant (AinaPercky)
    const isAdminCandidate = cleanId === ADMIN_EMAIL.toLowerCase() || cleanId === 'ainapercky' || cleanId === ADMIN_NAME.toLowerCase();
    if (isAdminCandidate) {
      return this.loginAdmin(cleanId, passwordOrCode.trim());
    }

    if (!supabaseService.isConfigured()) {
      return { success: false, error: 'Supabase n’est pas configuré. Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.' };
    }

    try {
      const student = await supabaseService.authenticateStudent(cleanId, passwordOrCode);
      const user: AuthUser = {
        id: `session_${student.id}`,
        email: student.email,
        name: `${student.first_name} ${student.last_name}`,
        role: 'student',
        student_id: student.id,
        student_number: student.student_number,
        class_id: student.class_id,
        class_name: student.class_name,
        avatar: student.avatar_url || undefined,
        loginAt: new Date().toISOString()
      };
      currentUser = user;
      notifyAuthChange();
      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connexion Supabase impossible.'
      };
    }
  },

  /**
   * Connexion Administrateur / Professeur (AinaPercky)
   */
  loginAdmin(emailOrUsername: string, code: string): { success: boolean; error?: string; user?: AuthUser } {
    const lockout = this.getLockoutStatus();
    if (lockout.isLocked) {
      return {
        success: false,
        error: `Trop de tentatives erronées. Compte temporairement verrouillé pour ${lockout.remainingSeconds}s.`
      };
    }

    const cleanInput = (emailOrUsername || '').trim().toLowerCase();
    const cleanAdminEmail = ADMIN_EMAIL.toLowerCase();
    const cleanAdminName = ADMIN_NAME.toLowerCase();
    const expectedCode = this.getAccessCode();

    if (!cleanInput) {
      return { success: false, error: 'Veuillez saisir votre identifiant admin (email ou nom).' };
    }

    const isMatch = cleanInput === cleanAdminEmail || cleanInput === cleanAdminName || cleanInput === 'ainapercky';
    if (!isMatch) {
      this.recordFailedAttempt();
      return {
        success: false,
        error: `Identifiant administrateur non reconnu. Utilisez ${ADMIN_EMAIL} ou ${ADMIN_NAME}.`
      };
    }

    if (!code || code.trim() !== expectedCode) {
      const failInfo = this.recordFailedAttempt();
      if (failInfo.isLocked) {
        return {
          success: false,
          error: `Code d'accès erroné. Compte verrouillé pour ${failInfo.remainingSeconds}s.`
        };
      }
      return {
        success: false,
        error: `Code d'accès incorrect (${failInfo.attemptsLeft} tentative(s) restante(s)).`
      };
    }

    this.resetFailedAttempts();

    const user: AuthUser = {
      id: 'admin_ainapercky',
      email: ADMIN_EMAIL,
      name: 'AinaPercky (Professeur)',
      role: 'admin',
      loginAt: new Date().toISOString()
    };

    currentUser = user;
    notifyAuthChange();
    return { success: true, user };
  },

  /**
   * Inscription d'un nouvel élève
   */
  async registerStudent(params: {
    firstName: string;
    lastName: string;
    studentNumber: string;
    classId: string;
    className?: string;
    email: string;
    phone?: string;
    password: string;
    existingStudentId?: string;
  }): Promise<{ success: boolean; error?: string; user?: AuthUser; confirmationRequired?: boolean }> {
    const firstName = params.firstName.trim();
    const lastName = params.lastName.trim();
    const studentNumber = params.studentNumber.trim();
    const classId = params.classId.trim();
    const email = normalizeEmail(params.email);
    const phone = params.phone ? params.phone.trim() : undefined;
    const password = params.password;

    if (!firstName || !lastName) {
      return { success: false, error: 'Le prénom et le nom sont obligatoires.' };
    }
    if (!classId) {
      return { success: false, error: 'Veuillez sélectionner votre classe.' };
    }
    if (!isValidEmail(email)) {
      return { success: false, error: 'Une adresse email valide est obligatoire.' };
    }
    if (!password || password.length < 4) {
      return { success: false, error: 'Le mot de passe doit comporter au moins 4 caractères.' };
    }

    const studentId = params.existingStudentId || (
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `student_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    );

    if (supabaseService.isConfigured()) {
      try {
        const sessionCreated = await supabaseService.registerStudentAuth(email, password, studentId);
        if (!sessionCreated) {
          return {
            success: true,
            confirmationRequired: true
          };
        }

        const user: AuthUser = {
          id: `session_${studentId}`,
          email,
          name: `${firstName} ${lastName}`,
          role: 'student',
          student_id: studentId,
          student_number: studentNumber || null,
          class_id: classId,
          class_name: params.className || 'Classe',
          loginAt: new Date().toISOString()
        };
        currentUser = user;
        notifyAuthChange();
        return { success: true, user };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur lors de la création du compte Supabase.'
        };
      }
    }

    return {
      success: false,
      error: 'Supabase n’est pas configuré. La création de compte étudiant nécessite Supabase Auth.'
    };
  },

  /**
   * Connexion Étudiant par Adresse Email + Mot de passe
   */
  loginStudent(email: string, password: string): { success: boolean; error?: string; user?: AuthUser } {
    const cleanEmail = normalizeEmail(email || '');
    const cleanPass = (password || '').trim();

    if (!cleanEmail) {
      return { success: false, error: 'Veuillez saisir votre adresse email.' };
    }

    const accounts = getStoredStudentAccounts();
    const matched = accounts.find(a => a.email.toLowerCase() === cleanEmail);

    if (matched) {
      if (cleanPass && matched.password_hash !== cleanPass) {
        return { success: false, error: 'Mot de passe incorrect.' };
      }

      const user: AuthUser = {
        id: matched.id,
        email: matched.email,
        name: `${matched.first_name} ${matched.last_name}`,
        role: 'student',
        student_id: matched.student_id,
        student_number: matched.student_number,
        class_id: matched.class_id,
        avatar: matched.avatar,
        loginAt: new Date().toISOString()
      };

      try {
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
      } catch (e) {
        console.warn('Erreur stockage session étudiant:', e);
      }

      notifyAuthChange();
      return { success: true, user };
    }

    return {
      success: false,
      error: 'Aucun compte étudiant associé à cette adresse email. Veuillez créer un compte ci-dessous.'
    };
  },

  /**
   * Connexion directe pour un élève existant de la base de données (Démo / Accès direct)
   */
  loginAsRosterStudent(student: { id: string; first_name: string; last_name: string; email: string; student_number?: string | null; class_id: string; class_name?: string }): AuthUser {
    const user: AuthUser = {
      id: `session_${student.id}`,
      email: student.email,
      name: `${student.first_name} ${student.last_name}`,
      role: 'student',
      student_id: student.id,
      student_number: student.student_number || '1',
      class_id: student.class_id,
      class_name: student.class_name,
      loginAt: new Date().toISOString()
    };

    try {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn('Erreur stockage session:', e);
    }

    notifyAuthChange();
    return user;
  },

  /**
   * Mise à jour des identifiants par l'étudiant lui-même dans son espace
   */
  updateStudentProfile(studentId: string, updates: { firstName?: string; lastName?: string; studentNumber?: string; email?: string; phone?: string; avatar?: string }): boolean {
    const currentUser = this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') return false;

    const accounts = getStoredStudentAccounts();
    const idx = accounts.findIndex(a => a.student_id === studentId || a.id === currentUser.id);
    if (updates.email) {
      const normalizedEmail = normalizeEmail(updates.email);
      if (!isValidEmail(normalizedEmail)) return false;
      if (accounts.some(account =>
        account.id !== currentUser.id &&
        normalizeEmail(account.email) === normalizedEmail
      )) return false;
    }
    if (idx !== -1) {
      if (updates.firstName) accounts[idx].first_name = updates.firstName.trim();
      if (updates.lastName) accounts[idx].last_name = updates.lastName.trim();
      if (updates.studentNumber) accounts[idx].student_number = updates.studentNumber.trim();
      if (updates.email) accounts[idx].email = normalizeEmail(updates.email);
      if (updates.phone !== undefined) accounts[idx].phone = updates.phone.trim();
      if (updates.avatar !== undefined) accounts[idx].avatar = updates.avatar.trim();
      saveStudentAccounts(accounts);
    }

    // Mettre à jour l'utilisateur courant en session
    const updatedUser: AuthUser = {
      ...currentUser,
      name: `${updates.firstName || accounts[idx]?.first_name || currentUser.name.split(' ')[0]} ${updates.lastName || accounts[idx]?.last_name || currentUser.name.split(' ')[1] || ''}`.trim(),
      email: updates.email || currentUser.email,
      student_number: updates.studentNumber || currentUser.student_number,
      avatar: updates.avatar !== undefined ? updates.avatar : (accounts[idx]?.avatar || currentUser.avatar)
    };

    try {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updatedUser));
    } catch (e) {
      console.error(e);
    }

    notifyAuthChange();
    return true;
  },

  logout(): void {
    supabaseService.signOutStudent().catch(error => {
      console.error('Déconnexion Supabase impossible :', error);
    });
    try {
      localStorage.removeItem(STORAGE_USER_KEY);
    } catch (e) {
      console.warn('Could not clear auth session from localStorage', e);
    }
    notifyAuthChange();
  },

  subscribe(callback: () => void): () => void {
    listeners.push(callback);
    return () => {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }
};
