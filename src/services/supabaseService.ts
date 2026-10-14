import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ClassRoom,
  Exam,
  Student,
  ExamRubric,
  Evaluation,
  PassOrderItem,
  Quiz,
  QuizSubmission
} from '../types';

export function cleanSupabaseUrl(url: string): string {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

/**
 * Génère un identifiant UUID v4 conforme PostgreSQL
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isUUID(str: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Garantit qu'un ID est au format UUID (sinon en génère un nouveau)
 */
export function ensureUUID(id?: string): string {
  if (id && isUUID(id)) return id;
  return generateUUID();
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    classesCount?: number;
    studentsCount?: number;
    examsCount?: number;
    evaluationsCount?: number;
    quizzesCount?: number;
    quizSubmissionsCount?: number;
    tablesCreated?: boolean;
  };
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private currentConfig: SupabaseConfig = this.loadConfig();
  private quizWriteQueues = new Map<string, Promise<void>>();

  public loadConfig(): SupabaseConfig {
    const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

    return {
      url: cleanSupabaseUrl(envUrl),
      anonKey: envKey.trim()
    };
  }

  public saveConfig(config: SupabaseConfig): void {
    this.currentConfig = {
      url: cleanSupabaseUrl(config.url),
      anonKey: config.anonKey.trim()
    };
    this.client = null; // Réinitialise l'instance client
  }

  public isConfigured(): boolean {
    const { url, anonKey } = this.currentConfig;
    return Boolean(
      url && 
      anonKey && 
      !url.includes('your-project-id') &&
      !url.includes('placeholder') &&
      url.startsWith('https://')
    );
  }

  public getClient(): SupabaseClient | null {
    if (!this.isConfigured()) return null;
    if (!this.client) {
      try {
        this.client = createClient(this.currentConfig.url, this.currentConfig.anonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        });
      } catch (e) {
        console.error('Erreur initialisation client Supabase:', e);
        return null;
      }

    }
    return this.client;
  }

  public async authenticateStudent(email: string, password: string): Promise<Student> {
    const client = this.getClient();
    if (!client) throw new Error('La connexion Supabase est indisponible.');

    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    if (error) {
      const details = error.message.toLowerCase();
      if (details.includes('email not confirmed')) {
        throw new Error('Cette adresse e-mail n’a pas encore été confirmée. Consultez le message envoyé par Supabase.');
      }
      if (details.includes('invalid login credentials')) {
        throw new Error('Compte Supabase Auth introuvable ou mot de passe incorrect. Une fiche dans public.students ne crée pas automatiquement un compte de connexion.');
      }
      throw new Error(`Échec de connexion Supabase Auth : ${error.message}`);
    }
    if (!data.user) throw new Error('Supabase n’a retourné aucun compte étudiant.');

    const { data: student, error: studentError } = await client
      .from('students')
      .select('id, class_id, first_name, last_name, email, student_number, created_at, updated_at')
      .ilike('email', email.trim().toLowerCase().replace(/[\\%_]/g, '\\$&'))
      .maybeSingle();
    if (studentError) {
      await client.auth.signOut();
      throw new Error(`Impossible de charger la fiche élève : ${studentError.message}`);
    }
    if (!student) {
      await client.auth.signOut();
      throw new Error('Aucune fiche élève ne correspond à ce compte. Contactez votre enseignant.');
    }

    const { data: classroom, error: classError } = await client
      .from('classes')
      .select('name')
      .eq('id', student.class_id)
      .maybeSingle();
    if (classError) {
      await client.auth.signOut();
      throw new Error(`Impossible de charger la classe de l’élève : ${classError.message}`);
    }

    return { ...student, class_name: classroom?.name } as Student;
  }

  public async registerStudentAuth(email: string, password: string, studentId: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) throw new Error('La connexion Supabase est indisponible.');

    const { data, error } = await client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { role: 'student', student_id: studentId }
      }
    });
    if (error) {
      throw new Error(error.message.toLowerCase().includes('already registered')
        ? 'Cette adresse possède déjà un compte. Connectez-vous avec votre mot de passe.'
        : `Inscription Supabase impossible : ${error.message}`);
    }
    if (!data.user) throw new Error('Supabase n’a pas créé le compte étudiant.');
    return data.session !== null;
  }

  public async signOutStudent(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw new Error(`Déconnexion Supabase impossible : ${error.message}`);
  }

  /**
   * Teste la connectivité réelle avec le projet Supabase
   */
  public async testConnection(overrideConfig?: SupabaseConfig): Promise<ConnectionTestResult> {
    const configToTest = overrideConfig || this.currentConfig;
    const url = cleanSupabaseUrl(configToTest.url);
    const key = configToTest.anonKey.trim();

    if (!url || !key) {
      return {
        success: false,
        message: "Veuillez renseigner l'URL de votre projet Supabase et votre clé API anon."
      };
    }

    if (url.includes('your-project-id') || !url.startsWith('https://') || !url.includes('.supabase.co')) {
      return {
        success: false,
        message: "L'URL renseignée est invalide. Elle doit ressembler à https://abcdefghijklm.supabase.co"
      };
    }

    try {
      const testClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      // Test 1: Vérification de l'accès à la table classes
      const { data: classesData, error: classesError, count: classesCount } = await testClient
        .from('classes')
        .select('*', { count: 'exact', head: false })
        .limit(5);

      if (classesError) {
        if (classesError.code === '42P01' || classesError.message?.toLowerCase().includes('does not exist') || classesError.message?.includes('relation "public.classes" does not exist')) {
          return {
            success: false,
            message: "Connexion établie avec succès à votre projet Supabase, mais les tables n'ont pas encore été créées dans la base de données. Veuillez copier et exécuter le script SQL fourni dans l'éditeur SQL de votre tableau de bord Supabase.",
            details: { tablesCreated: false }
          };
        }

        if (classesError.code === 'PGRST301' || classesError.message?.includes('JWT') || classesError.message?.includes('apikey')) {
          return {
            success: false,
            message: "Échec d'authentification : La clé API 'anon' fournie est invalide ou expirée."
          };
        }

        return {
          success: false,
          message: `Erreur retournée par Supabase : ${classesError.message} (code: ${classesError.code})`
        };
      }

      // Test 2: Compter les autres tables
      const { count: studentsCount } = await testClient.from('students').select('*', { count: 'exact', head: true });
      const { count: examsCount } = await testClient.from('exams').select('*', { count: 'exact', head: true });
      const { count: evalsCount } = await testClient.from('evaluations').select('*', { count: 'exact', head: true });
      const { count: quizzesCount, error: quizzesError } = await testClient
        .from('quizzes')
        .select('*', { count: 'exact', head: true });
      const { count: quizSubmissionsCount, error: submissionsError } = await testClient
        .from('quiz_submissions')
        .select('*', { count: 'exact', head: true });

      if (quizzesError || submissionsError) {
        return {
          success: false,
          message: "La connexion Supabase fonctionne, mais les tables des quiz sont absentes ou inaccessibles. Copiez et exécutez la migration « Ajouter les tables Quiz » depuis ce panneau Paramètres."
        };
      }

      return {
        success: true,
        message: `Connexion Supabase réussie. Tables des quiz et résultats vérifiées.`,
        details: {
          tablesCreated: true,
          classesCount: classesCount || 0,
          studentsCount: studentsCount || 0,
          examsCount: examsCount || 0,
          evaluationsCount: evalsCount || 0,
          quizzesCount: quizzesCount || 0,
          quizSubmissionsCount: quizSubmissionsCount || 0
        }
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Impossible de joindre le serveur Supabase : ${err.message || 'Vérifiez votre connexion internet et l\'URL.'}`
      };
    }
  }

  // =========================================================================
  // OPÉRATIONS CRUD DIRECTES EN TEMPS RÉEL (CLOUD PERSISTENCE)
  // =========================================================================

  // --- CLASSES ---
  public async saveClass(c: ClassRoom): Promise<void> {
    const client = this.getClient();
    if (!client || !isUUID(c.id)) return;
    try {
      await client.from('classes').upsert({
        id: c.id,
        name: c.name,
        created_at: c.created_at || new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (e) {
      console.error('Supabase saveClass error:', e);
    }
  }

  public async deleteClass(id: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      throw new Error('Suppression impossible : Supabase n’est pas configuré ou accessible.');
    }
    if (!isUUID(id)) {
      throw new Error('Suppression impossible dans Supabase : identifiant de classe invalide.');
    }

    const failOnError = (operation: string, error: { message: string } | null) => {
      if (error) {
        throw new Error(`Suppression Supabase (${operation}) impossible : ${error.message}`);
      }
    };

    const { data: students, error: studentsError } = await client
      .from('students')
      .select('id, avatar_url')
      .eq('class_id', id);
    failOnError('chargement des élèves', studentsError);

    const { data: exams, error: examsError } = await client
      .from('exams')
      .select('id')
      .eq('class_id', id);
    failOnError('chargement des examens', examsError);

    const studentIds = (students || []).map(student => student.id);
    const examIds = (exams || []).map(exam => exam.id);
    const evaluationIds = new Set<string>();

    if (studentIds.length > 0) {
      const { data: studentEvaluations, error } = await client
        .from('evaluations')
        .select('id')
        .in('student_id', studentIds);
      failOnError('chargement des évaluations des élèves', error);
      (studentEvaluations || []).forEach(evaluation => evaluationIds.add(evaluation.id));
    }
    if (examIds.length > 0) {
      const { data: examEvaluations, error } = await client
        .from('evaluations')
        .select('id')
        .in('exam_id', examIds);
      failOnError('chargement des évaluations des examens', error);
      (examEvaluations || []).forEach(evaluation => evaluationIds.add(evaluation.id));
    }

    const avatarPaths = (students || [])
      .filter(student => student.avatar_url && isUUID(student.id))
      .map(student => `avatars/${student.id}.jpg`);
    if (avatarPaths.length > 0) {
      const { error } = await client.storage.from('student-avatars').remove(avatarPaths);
      failOnError('suppression des photos de profil', error);
    }

    const { error: submissionsError } = await client
      .from('quiz_submissions')
      .delete()
      .eq('class_id', id);
    failOnError('suppression des résultats de quiz', submissionsError);

    const { error: quizzesError } = await client
      .from('quizzes')
      .delete()
      .eq('class_id', id);
    failOnError('suppression des quiz', quizzesError);

    if (evaluationIds.size > 0) {
      const { error } = await client
        .from('evaluation_details')
        .delete()
        .in('evaluation_id', Array.from(evaluationIds));
      failOnError('suppression des détails d’évaluation', error);

      const { error: evaluationsError } = await client
        .from('evaluations')
        .delete()
        .in('id', Array.from(evaluationIds));
      failOnError('suppression des évaluations orales', evaluationsError);
    }

    if (studentIds.length > 0) {
      const { error } = await client
        .from('exam_pass_order')
        .delete()
        .in('student_id', studentIds);
      failOnError('suppression des ordres de passage des élèves', error);
    }

    if (examIds.length > 0) {
      const { error: passOrderError } = await client
        .from('exam_pass_order')
        .delete()
        .in('exam_id', examIds);
      failOnError('suppression des ordres de passage des examens', passOrderError);

      const { error: rubricsError } = await client
        .from('exam_rubrics')
        .delete()
        .in('exam_id', examIds);
      failOnError('suppression des rubriques', rubricsError);
    }

    const { error: deleteStudentsError } = await client
      .from('students')
      .delete()
      .eq('class_id', id);
    failOnError('suppression des élèves', deleteStudentsError);

    const { error: deleteExamsError } = await client
      .from('exams')
      .delete()
      .eq('class_id', id);
    failOnError('suppression des examens', deleteExamsError);

    const { data: deletedClass, error: deleteClassError } = await client
      .from('classes')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    failOnError('suppression de la classe', deleteClassError);
    if (!deletedClass) {
      throw new Error('Suppression Supabase impossible : classe introuvable ou droits de suppression insuffisants.');
    }
  }

  // --- STUDENTS ---
  public async saveStudent(s: Student): Promise<void> {
    return this.saveStudents([s]);
  }

  public async assertStudentEmailAvailable(email: string, excludeStudentId?: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const normalizedEmail = email.trim().toLowerCase();
    let query = client
      .from('students')
      .select('id')
      .eq('email', normalizedEmail);
    if (excludeStudentId && isUUID(excludeStudentId)) {
      query = query.neq('id', excludeStudentId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Vérification de l’e-mail dans Supabase impossible : ${error.message}`);
    if (data) throw new Error('Cette adresse e-mail est déjà utilisée par un autre élève.');
  }

  public async saveStudents(students: Student[]): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const payload = students
      .filter(student => isUUID(student.id) && isUUID(student.class_id))
      .map(student => ({
        id: student.id,
        class_id: student.class_id,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email.trim().toLowerCase(),
        student_number: student.student_number || null,
        avatar_url: student.avatar_url || null,
        created_at: student.created_at || new Date().toISOString(),
        updated_at: student.updated_at || new Date().toISOString()
      }));
    if (payload.length === 0) return;
    const { error } = await client.from('students').upsert(payload, { onConflict: 'id' });
    if (error) {
      if (error.code === '23505') {
        throw new Error('Cette adresse e-mail est déjà utilisée par un autre élève.');
      }
      throw new Error(`Enregistrement de l’élève dans Supabase impossible : ${error.message}`);
    }
  }

  public async deleteStudent(id: string): Promise<void> {
    const client = this.getClient();
    if (!client || !isUUID(id)) return;
    try {
      await client.from('students').delete().eq('id', id);
    } catch (e) {
      console.error('Supabase deleteStudent error:', e);
    }
  }

  public async saveStudentAvatar(studentId: string, imageDataUrl: string | null): Promise<string | null> {
    const client = this.getClient();
    if (!client) throw new Error("Supabase n'est pas configuré.");
    if (!isUUID(studentId)) throw new Error("La fiche élève n'a pas d'identifiant Supabase valide.");

    const path = `avatars/${studentId}.jpg`;
    let avatarUrl: string | null = null;

    if (imageDataUrl) {
      if (!imageDataUrl.startsWith('data:image/jpeg;base64,')) {
        throw new Error("Le format de la photo est invalide. Sélectionnez à nouveau une image.");
      }

      const imageResponse = await fetch(imageDataUrl);
      if (!imageResponse.ok) throw new Error("Impossible de préparer la photo sélectionnée.");
      const imageBlob = await imageResponse.blob();
      if (imageBlob.size > 500 * 1024) {
        throw new Error('La photo dépasse la limite autorisée de 500 Ko. Sélectionnez-la à nouveau pour la compresser.');
      }

      const { error: uploadError } = await client.storage
        .from('student-avatars')
        .upload(path, imageBlob, {
          cacheControl: '3600',
          contentType: 'image/jpeg',
          upsert: true
        });
      if (uploadError) {
        throw new Error(`Envoi de la photo vers Supabase impossible : ${uploadError.message}`);
      }

      const { data } = client.storage.from('student-avatars').getPublicUrl(path);
      avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const { data: updatedStudent, error: updateError } = await client
      .from('students')
      .update({ avatar_url: avatarUrl })
      .eq('id', studentId)
      .select('id')
      .maybeSingle();

    if (updateError) {
      throw new Error(`Enregistrement de la photo sur la fiche élève impossible : ${updateError.message}`);
    }
    if (!updatedStudent) {
      throw new Error("Aucune fiche élève correspondante n'a été trouvée dans Supabase.");
    }

    if (!imageDataUrl) {
      const { error: removeError } = await client.storage
        .from('student-avatars')
        .remove([path]);
      if (removeError) {
        console.error('Supabase removeStudentAvatar error:', removeError);
      }
    }

    return avatarUrl;
  }

  // --- EXAMS & RUBRICS ---
  public async saveExam(exam: Exam, rubrics?: ExamRubric[]): Promise<void> {
    const client = this.getClient();
    if (!client || !isUUID(exam.id) || !isUUID(exam.class_id)) return;
    try {
      await client.from('exams').upsert({
        id: exam.id,
        class_id: exam.class_id,
        title: exam.title,
        description: exam.description || null,
        exam_date: exam.exam_date || new Date().toISOString().split('T')[0],
        status: exam.status || 'in_progress',
        created_at: exam.created_at || new Date().toISOString()
      }, { onConflict: 'id' });

      if (rubrics && rubrics.length > 0) {
        await this.saveRubrics(rubrics);
      }
    } catch (e) {
      console.error('Supabase saveExam error:', e);
    }
  }

  public async deleteExam(id: string): Promise<void> {
    const client = this.getClient();
    if (!client || !isUUID(id)) return;
    try {
      await client.from('exams').delete().eq('id', id);
    } catch (e) {
      console.error('Supabase deleteExam error:', e);
    }
  }

  public async saveRubrics(rubrics: ExamRubric[]): Promise<void> {
    const client = this.getClient();
    if (!client || rubrics.length === 0) return;
    try {
      const validRubrics = rubrics
        .filter(r => isUUID(r.id) && isUUID(r.exam_id))
        .map(r => ({
          id: r.id,
          exam_id: r.exam_id,
          title: r.title,
          question: r.question,
          example_sentence: r.example_sentence,
          points: Number(r.points) || 1,
          position: r.position
        }));

      if (validRubrics.length > 0) {
        await client.from('exam_rubrics').upsert(validRubrics, { onConflict: 'id' });
      }
    } catch (e) {
      console.error('Supabase saveRubrics error:', e);
    }
  }

  // --- EVALUATIONS & DETAILS ---
  public async saveEvaluation(ev: Evaluation): Promise<void> {
    const client = this.getClient();
    if (!client || !isUUID(ev.id) || !isUUID(ev.exam_id) || !isUUID(ev.student_id)) return;
    try {
      // 1. Sauvegarde l'en-tête de l'évaluation
      await client.from('evaluations').upsert({
        id: ev.id,
        exam_id: ev.exam_id,
        student_id: ev.student_id,
        total_score: ev.total_score,
        status: ev.status || 'completed',
        max_duration_seconds: ev.max_duration_seconds || 180,
        duration_used_seconds: ev.duration_used_seconds || 0,
        timer_status: ev.timer_status || 'stopped_manually',
        created_at: ev.created_at || new Date().toISOString(),
        updated_at: ev.updated_at || new Date().toISOString()
      }, { onConflict: 'id' });

      // 2. Sauvegarde les détails de chaque critère/rubrique
      if (ev.details && ev.details.length > 0) {
        const detailsPayload = ev.details
          .filter(d => isUUID(d.rubric_id))
          .map(d => ({
            evaluation_id: ev.id,
            rubric_id: d.rubric_id,
            is_validated: Boolean(d.is_validated),
            awarded_points: Number(d.awarded_points) || 0,
            error_note: d.error_note || null
          }));

        if (detailsPayload.length > 0) {
          await client.from('evaluation_details').upsert(detailsPayload, { 
            onConflict: 'evaluation_id,rubric_id' 
          });
        }
      }
    } catch (e) {
      console.error('Supabase saveEvaluation error:', e);
    }
  }

  public async deleteEvaluation(id: string): Promise<void> {
    const client = this.getClient();
    if (!client || !isUUID(id)) return;
    try {
      await client.from('evaluations').delete().eq('id', id);
    } catch (e) {
      console.error('Supabase deleteEvaluation error:', e);
    }
  }

  public async deleteEvaluationByExamAndStudent(examId: string, studentId: string): Promise<void> {
    const client = this.getClient();
    if (!client || !isUUID(examId) || !isUUID(studentId)) return;
    try {
      await client.from('evaluations').delete().eq('exam_id', examId).eq('student_id', studentId);
    } catch (e) {
      console.error('Supabase deleteEvaluationByExamAndStudent error:', e);
    }
  }

  // --- PASS ORDER ---
  public async savePassOrder(passOrder: PassOrderItem[]): Promise<void> {
    const client = this.getClient();
    if (!client || passOrder.length === 0) return;
    try {
      const validItems = passOrder
        .filter(po => isUUID(po.id) && isUUID(po.exam_id) && isUUID(po.student_id))
        .map(po => ({
          id: po.id,
          exam_id: po.exam_id,
          student_id: po.student_id,
          position: po.position,
          status: po.status || 'waiting',
          created_at: po.created_at || new Date().toISOString()
        }));

      if (validItems.length > 0) {
        await client.from('exam_pass_order').upsert(validItems, { onConflict: 'id' });
      }
    } catch (e) {
      console.error('Supabase savePassOrder error:', e);
    }
  }

  public async saveQuiz(quiz: Quiz): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const previousWrite = this.quizWriteQueues.get(quiz.id) || Promise.resolve();
    const write = previousWrite.catch(() => undefined).then(async () => {
      const { error } = await client.from('quizzes').upsert({
        id: quiz.id,
        class_id: quiz.class_id,
        title: quiz.title,
        description: quiz.description || null,
        created_at: quiz.created_at || new Date().toISOString(),
        duration_minutes: quiz.duration_minutes || 10,
        status: quiz.status || 'draft',
        launched_at: quiz.launched_at || null,
        expires_at: quiz.expires_at || null,
        questions: quiz.questions || [],
        total_points: Number(quiz.total_points) || 20
      }, { onConflict: 'id' });

      if (error) throw new Error(`Quiz « ${quiz.title} » : ${error.message}`);
    });

    this.quizWriteQueues.set(quiz.id, write);
    try {
      await write;
    } finally {
      if (this.quizWriteQueues.get(quiz.id) === write) {
        this.quizWriteQueues.delete(quiz.id);
      }
    }
  }

  public async deleteQuiz(id: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const { error } = await client.from('quizzes').delete().eq('id', id);
    if (error) throw new Error(`Suppression du quiz : ${error.message}`);
  }

  public async saveQuizSubmission(submission: QuizSubmission): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const { error } = await client.from('quiz_submissions').upsert({
      id: submission.id,
      quiz_id: submission.quiz_id,
      quiz_title: submission.quiz_title,
      student_id: submission.student_id,
      student_name: submission.student_name,
      student_number: submission.student_number || null,
      class_id: submission.class_id,
      class_name: submission.class_name || null,
      started_at: submission.started_at,
      submitted_at: submission.submitted_at || null,
      answers: submission.answers || {},
      score: Number(submission.score) || 0,
      max_score: Number(submission.max_score) || 20,
      score_20: Number(submission.score_20) || 0,
      status: submission.status,
      feedback: submission.feedback || {},
      date: submission.date
    }, { onConflict: 'quiz_id,student_id' });

    if (error) throw new Error(`Résultat du quiz « ${submission.quiz_title} » : ${error.message}`);
  }

  public async syncQuizData(quizzes: Quiz[] = [], submissions: QuizSubmission[] = []): Promise<void> {
    for (const quiz of quizzes) {
      await this.saveQuiz(quiz);
    }
    for (const submission of submissions) {
      await this.saveQuizSubmission(submission);
    }
  }

  /**
   * Synchronise (exporte) les données locales vers Supabase PostgreSQL
   */
  public async syncLocalToSupabase(localState: {
    classes: ClassRoom[];
    students: Student[];
    exams: Exam[];
    evaluations: Evaluation[];
    passOrder: PassOrderItem[];
    quizzes?: Quiz[];
    quizSubmissions?: QuizSubmission[];
  }): Promise<{ success: boolean; message: string }> {
    const client = this.getClient();
    if (!client) {
      return {
        success: false,
        message: "Supabase n'est pas encore configuré. Renseignez d'abord l'URL et la clé."
      };
    }

    try {
      // 1. Classes
      if (localState.classes.length > 0) {
        const classesPayload = localState.classes
          .filter(c => isUUID(c.id))
          .map(c => ({
            id: c.id,
            name: c.name,
            created_at: c.created_at || new Date().toISOString()
          }));
        if (classesPayload.length > 0) {
          const { error: errClasses } = await client.from('classes').upsert(classesPayload, { onConflict: 'id' });
          if (errClasses) throw new Error(`Classes: ${errClasses.message}`);
        }
      }

      // 2. Students
      if (localState.students.length > 0) {
        const studentsPayload = localState.students
          .filter(s => isUUID(s.id) && isUUID(s.class_id))
          .map(s => ({
            id: s.id,
            class_id: s.class_id,
            first_name: s.first_name,
            last_name: s.last_name,
            email: s.email.trim().toLowerCase(),
            student_number: s.student_number || null,
            avatar_url: s.avatar_url || null,
            created_at: s.created_at || new Date().toISOString(),
            updated_at: s.updated_at || new Date().toISOString()
          }));
        if (studentsPayload.length > 0) {
          const { error: errStudents } = await client.from('students').upsert(studentsPayload, { onConflict: 'id' });
          if (errStudents) throw new Error(`Élèves: ${errStudents.message}`);
        }
      }

      // 3. Exams & Rubrics
      if (localState.exams.length > 0) {
        const examsPayload = localState.exams
          .filter(e => isUUID(e.id) && isUUID(e.class_id))
          .map(e => ({
            id: e.id,
            class_id: e.class_id,
            title: e.title,
            description: e.description || null,
            exam_date: e.exam_date || new Date().toISOString().split('T')[0],
            status: e.status || 'in_progress',
            created_at: e.created_at || new Date().toISOString()
          }));
        if (examsPayload.length > 0) {
          const { error: errExams } = await client.from('exams').upsert(examsPayload, { onConflict: 'id' });
          if (errExams) throw new Error(`Examens: ${errExams.message}`);
        }

        const allRubrics: any[] = [];
        localState.exams.forEach(e => {
          if (e.rubrics && e.rubrics.length > 0) {
            e.rubrics.forEach(r => {
              if (isUUID(r.id) && isUUID(e.id)) {
                allRubrics.push({
                  id: r.id,
                  exam_id: e.id,
                  title: r.title,
                  question: r.question,
                  example_sentence: r.example_sentence,
                  points: Number(r.points) || 1,
                  position: r.position
                });
              }
            });
          }
        });

        if (allRubrics.length > 0) {
          const { error: errRubrics } = await client.from('exam_rubrics').upsert(allRubrics, { onConflict: 'id' });
          if (errRubrics) throw new Error(`Rubriques: ${errRubrics.message}`);
        }
      }

      // 4. Evaluations & Details
      if (localState.evaluations.length > 0) {
        const evalsPayload = localState.evaluations
          .filter(ev => isUUID(ev.id) && isUUID(ev.exam_id) && isUUID(ev.student_id))
          .map(ev => ({
            id: ev.id,
            exam_id: ev.exam_id,
            student_id: ev.student_id,
            total_score: ev.total_score,
            status: ev.status || 'completed',
            max_duration_seconds: ev.max_duration_seconds || 180,
            duration_used_seconds: ev.duration_used_seconds || 0,
            timer_status: ev.timer_status || 'stopped_manually',
            created_at: ev.created_at || new Date().toISOString(),
            updated_at: ev.updated_at || new Date().toISOString()
          }));

        if (evalsPayload.length > 0) {
          const { error: errEvals } = await client.from('evaluations').upsert(evalsPayload, { onConflict: 'id' });
          if (errEvals) throw new Error(`Évaluations: ${errEvals.message}`);
        }

        const allDetails: any[] = [];
        localState.evaluations.forEach(ev => {
          if (ev.details && ev.details.length > 0 && isUUID(ev.id)) {
            ev.details.forEach(d => {
              if (isUUID(d.rubric_id)) {
                allDetails.push({
                  evaluation_id: ev.id,
                  rubric_id: d.rubric_id,
                  is_validated: Boolean(d.is_validated),
                  awarded_points: Number(d.awarded_points) || 0,
                  error_note: d.error_note || null
                });
              }
            });
          }
        });

        if (allDetails.length > 0) {
          const { error: errDetails } = await client.from('evaluation_details').upsert(allDetails, { 
            onConflict: 'evaluation_id,rubric_id' 
          });
          if (errDetails) throw new Error(`Détails d'évaluations: ${errDetails.message}`);
        }
      }

      // 5. Pass Order
      if (localState.passOrder.length > 0) {
        const poPayload = localState.passOrder
          .filter(po => isUUID(po.id) && isUUID(po.exam_id) && isUUID(po.student_id))
          .map(po => ({
            id: po.id,
            exam_id: po.exam_id,
            student_id: po.student_id,
            position: po.position,
            status: po.status || 'waiting',
            created_at: po.created_at || new Date().toISOString()
          }));
        if (poPayload.length > 0) {
          const { error: errPO } = await client.from('exam_pass_order').upsert(poPayload, { onConflict: 'id' });
          if (errPO) throw new Error(`Ordre de passage: ${errPO.message}`);
        }
      }

      await this.syncQuizData(localState.quizzes, localState.quizSubmissions);

      return {
        success: true,
        message: `Synchronisation réussie : données sauvegardées dans Supabase.`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Erreur lors de la synchronisation Supabase : ${e.message}`
      };
    }
  }

  /**
   * Importe les données depuis Supabase vers l'application locale
   */
  public async importFromSupabase(): Promise<{
    success: boolean;
    message: string;
    state?: {
      classes: ClassRoom[];
      students: Student[];
      exams: Exam[];
      evaluations: Evaluation[];
      passOrder: PassOrderItem[];
      quizzes: Quiz[];
      quizSubmissions: QuizSubmission[];
    };
  }> {
    const client = this.getClient();
    if (!client) {
      return {
        success: false,
        message: "Supabase n'est pas encore configuré."
      };
    }

    try {
      const [
        { data: classesData, error: errC },
        { data: studentsData, error: errS },
        { data: examsData, error: errE },
        { data: rubricsData, error: errR },
        { data: evalsData, error: errEv },
        { data: detailsData, error: errD },
        { data: passOrderData, error: errPO },
        { data: quizzesData, error: errQ },
        { data: quizSubmissionsData, error: errQS }
      ] = await Promise.all([
        client.from('classes').select('*'),
        client.from('students').select('*'),
        client.from('exams').select('*'),
        client.from('exam_rubrics').select('*'),
        client.from('evaluations').select('*'),
        client.from('evaluation_details').select('*'),
        client.from('exam_pass_order').select('*'),
        client.from('quizzes').select('*'),
        client.from('quiz_submissions').select('*')
      ]);

      if (errC) throw new Error(`Classes: ${errC.message}`);
      if (errS) throw new Error(`Students: ${errS.message}`);
      if (errE) throw new Error(`Exams: ${errE.message}`);
      if (errQ) throw new Error(`Quiz (migration requise si la table est absente) : ${errQ.message}`);
      if (errQS) throw new Error(`Résultats des quiz (migration requise si la table est absente) : ${errQS.message}`);

      const classes: ClassRoom[] = (classesData || []).map(c => ({
        id: c.id,
        name: c.name,
        created_at: c.created_at
      }));

      const students: Student[] = (studentsData || []).map(s => ({
        id: s.id,
        class_id: s.class_id,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        student_number: s.student_number,
        avatar_url: s.avatar_url || null,
        created_at: s.created_at,
        updated_at: s.updated_at
      }));

      const rubricsList: ExamRubric[] = (rubricsData || []).map(r => ({
        id: r.id,
        exam_id: r.exam_id,
        title: r.title,
        question: r.question,
        example_sentence: r.example_sentence,
        points: Number(r.points) || 1,
        position: r.position
      }));

      const exams: Exam[] = (examsData || []).map(e => ({
        id: e.id,
        class_id: e.class_id,
        title: e.title,
        description: e.description,
        exam_date: e.exam_date,
        status: e.status,
        created_at: e.created_at,
        rubrics: rubricsList.filter(r => r.exam_id === e.id)
      }));

      const evaluations: Evaluation[] = (evalsData || []).map(ev => {
        const details = (detailsData || [])
          .filter(d => d.evaluation_id === ev.id)
          .map(d => ({
            rubric_id: d.rubric_id,
            is_validated: Boolean(d.is_validated),
            awarded_points: Number(d.awarded_points) || 0,
            error_note: d.error_note || undefined
          }));

        return {
          id: ev.id,
          exam_id: ev.exam_id,
          student_id: ev.student_id,
          total_score: Number(ev.total_score) || 0,
          status: ev.status,
          max_duration_seconds: ev.max_duration_seconds || 180,
          duration_used_seconds: ev.duration_used_seconds || 0,
          timer_status: ev.timer_status,
          created_at: ev.created_at,
          updated_at: ev.updated_at,
          details
        };
      });

      const passOrder: PassOrderItem[] = (passOrderData || []).map(po => ({
        id: po.id,
        exam_id: po.exam_id,
        student_id: po.student_id,
        position: po.position,
        status: po.status,
        created_at: po.created_at
      }));

      const quizzes: Quiz[] = (quizzesData || []).map(q => ({
        id: q.id,
        class_id: q.class_id,
        title: q.title,
        description: q.description || undefined,
        created_at: q.created_at,
        duration_minutes: Number(q.duration_minutes) || 10,
        status: q.status,
        launched_at: q.launched_at || undefined,
        expires_at: q.expires_at || undefined,
        questions: Array.isArray(q.questions) ? q.questions : [],
        total_points: Number(q.total_points) || 20
      }));

      const quizSubmissions: QuizSubmission[] = (quizSubmissionsData || []).map(s => ({
        id: s.id,
        quiz_id: s.quiz_id,
        quiz_title: s.quiz_title,
        student_id: s.student_id,
        student_name: s.student_name,
        student_number: s.student_number,
        class_id: s.class_id,
        class_name: s.class_name || undefined,
        started_at: s.started_at,
        submitted_at: s.submitted_at || undefined,
        answers: s.answers || {},
        score: Number(s.score) || 0,
        max_score: Number(s.max_score) || 20,
        score_20: Number(s.score_20) || 0,
        status: s.status,
        feedback: s.feedback || {},
        date: s.date
      }));

      return {
        success: true,
        message: `Import Supabase réussi : ${classes.length} classes, ${students.length} élèves, ${exams.length} examens, ${quizzes.length} quiz et ${quizSubmissions.length} résultats récupérés.`,
        state: {
          classes,
          students,
          exams,
          evaluations,
          passOrder,
          quizzes,
          quizSubmissions
        }
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Erreur lors de l'import Supabase : ${e.message}`
      };
    }
  }
}

export const supabaseService = new SupabaseService();
