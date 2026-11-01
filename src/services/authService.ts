import { isValidEmail, normalizeEmail } from '../utils/email';
import { normalizeFirstName, normalizeLastName } from '../utils/personName';
import { ClassRoom, Student } from '../types';
import type { Session } from '@supabase/supabase-js';
import { supabaseService } from './supabaseService';
import { dataService } from './dataService';

/**
 * Service d'authentification et de contrôle d'accès multi-rôles pour Esame :
 * 1. Professeur : compte Supabase Auth associé à l'adresse administrateur.
 * 2. Étudiants : Inscription autonome, connexion, espace personnel de quiz et notes.
 */

const ENC_EMAIL = 'YWluYXBlcmNreUBnbWFpbC5jb20=';
const ENC_NAME = 'QWluYVBlcmNreQ==';

export const ADMIN_EMAIL = atob(ENC_EMAIL);
export const AUTHORIZED_EMAIL = ADMIN_EMAIL;
export const ADMIN_NAME = atob(ENC_NAME);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  gender?: 'homme' | 'femme';
  role: 'admin' | 'student';
  student_id?: string;
  student_number?: string | null;
  class_id?: string;
  class_name?: string;
  avatar?: string;
  loginAt: string;
}

/** Point d'extension unique pour séparer ultérieurement Admin et Professeur. */
export function canManageLessons(user: Pick<AuthUser, 'role'> | null | undefined): boolean {
  return user?.role === 'admin' || (user?.role as string) === 'teacher';
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000; // 30s

const listeners: Array<() => void> = [];
let currentUser: AuthUser | null = null;
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
        name: `${student.first_name} ${student.last_name}`,
        gender: student.gender || 'homme'
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

  async restoreFromSupabaseSession(session: Session): Promise<AuthUser> {
    const email = normalizeEmail(session.user.email || '');
    if (!email) throw new Error('La session Supabase ne contient aucune adresse e-mail.');

    let user: AuthUser;
    if (email === ADMIN_EMAIL.toLowerCase()) {
      user = {
        id: session.user.id,
        email,
        name: `${ADMIN_NAME} (Professeur)`,
        role: 'admin',
        loginAt: session.user.last_sign_in_at || new Date().toISOString()
      };
    } else {
      const student = await supabaseService.getStudentForAuthEmail(email);
      user = {
        id: `session_${student.id}`,
        email: student.email,
        name: `${student.first_name} ${student.last_name}`,
        gender: student.gender || 'homme',
        role: 'student',
        student_id: student.id,
        student_number: student.student_number,
        class_id: student.class_id,
        class_name: student.class_name,
        avatar: student.avatar_url || undefined,
        loginAt: session.user.last_sign_in_at || new Date().toISOString()
      };
    }

    currentUser = user;
    notifyAuthChange();
    return user;
  },

  clearCurrentUser(): void {
    currentUser = null;
    notifyAuthChange();
  },

  async updateAdminPassword(password: string): Promise<void> {
    if (currentUser?.role !== 'admin') throw new Error('Seul le compte professeur peut modifier ce mot de passe.');
    if (password.trim().length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
    await supabaseService.updateAuthenticatedUserPassword(password);
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
      return { success: false, error: 'Veuillez saisir votre mot de passe.' };
    }

    // 1. Détection automatique : Compte Administrateur / Enseignant (AinaPercky)
    const isAdminCandidate = cleanId === ADMIN_EMAIL.toLowerCase() || cleanId === 'ainapercky' || cleanId === ADMIN_NAME.toLowerCase();
    if (isAdminCandidate) {
      return this.loginAdmin(cleanId, passwordOrCode);
    }

    if (!supabaseService.isConfigured()) {
      return { success: false, error: 'Supabase n’est pas configuré. Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.' };
    }

    try {
      const student = await supabaseService.authenticateStudent(cleanId, passwordOrCode);

      // Statut de validation contrôlé directement depuis Supabase online (sans local storage)
      const valStatus = student.validation_status || 'approved';
      if (valStatus === 'pending') {
        await supabaseService.signOutStudent().catch(() => {});
        return {
          success: false,
          error: 'Votre inscription est en attente de validation par le professeur dans la base de données. Vous pourrez vous connecter dès son approbation.'
        };
      }

      if (valStatus === 'rejected') {
        await supabaseService.signOutStudent().catch(() => {});
        return {
          success: false,
          error: 'Votre inscription a été refusée par le professeur dans la base de données. Veuillez contacter l’enseignant pour plus d’informations.'
        };
      }

      const user: AuthUser = {
        id: `session_${student.id}`,
        email: student.email,
        name: `${student.first_name} ${student.last_name}`,
        gender: student.gender || 'homme',
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
  async loginAdmin(emailOrUsername: string, password: string): Promise<{ success: boolean; error?: string; user?: AuthUser }> {
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
    const isMatch = cleanInput === cleanAdminEmail || cleanInput === cleanAdminName || cleanInput === 'ainapercky';
    if (!isMatch) {
      this.recordFailedAttempt();
      return {
        success: false,
        error: `Identifiant professeur non reconnu. Utilisez ${ADMIN_EMAIL} ou ${ADMIN_NAME}.`
      };
    }

    try {
      const authUser = await supabaseService.authenticateAdmin(ADMIN_EMAIL, password);
      this.resetFailedAttempts();
      const user: AuthUser = {
        id: authUser.id,
        email: authUser.email,
        name: `${ADMIN_NAME} (Professeur)`,
        role: 'admin',
        loginAt: new Date().toISOString()
      };
      currentUser = user;
      notifyAuthChange();
      return { success: true, user };
    } catch (error) {
      const failInfo = this.recordFailedAttempt();
      if (failInfo.isLocked) {
        return {
          success: false,
          error: `Trop de tentatives erronées. Compte temporairement verrouillé pour ${failInfo.remainingSeconds}s.`
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connexion professeur Supabase Auth impossible.'
      };
    }
  },

  /**
   * Inscription d'un nouvel élève
   */
  async registerStudent(params: {
    firstName: string;
    lastName: string;
    gender: 'homme' | 'femme';
    studentNumber: string;
    classId: string;
    className?: string;
    email: string;
    password: string;
    existingStudentId?: string;
  }): Promise<{ success: boolean; error?: string; user?: AuthUser; confirmationRequired?: boolean }> {
    const firstName = normalizeFirstName(params.firstName);
    const lastName = normalizeLastName(params.lastName);
    const gender = params.gender === 'femme' ? 'femme' : 'homme';
    const studentNumber = params.studentNumber.trim();
    const classId = params.classId.trim();
    const email = normalizeEmail(params.email);
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
          gender,
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

  updateStudentProfile(studentId: string, updates: { firstName?: string; lastName?: string; studentNumber?: string; gender?: 'homme' | 'femme'; avatar?: string }): boolean {
    if (!currentUser || currentUser.role !== 'student' || currentUser.student_id !== studentId) return false;

    currentUser = {
      ...currentUser,
      name: `${normalizeFirstName(updates.firstName || currentUser.name.split(' ')[0])} ${normalizeLastName(updates.lastName || currentUser.name.split(' ').slice(1).join(' '))}`.trim(),
      student_number: updates.studentNumber || currentUser.student_number,
      gender: updates.gender || currentUser.gender || 'homme',
      avatar: updates.avatar !== undefined ? updates.avatar : currentUser.avatar
    };
    notifyAuthChange();
    return true;
  },

  async logout(): Promise<void> {
    try {
      await supabaseService.signOutStudent();
    } catch (error) {
      console.error('Déconnexion Supabase impossible :', error);
    }
    currentUser = null;
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
