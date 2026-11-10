import { 
  ClassRoom, 
  Student, 
  Exam, 
  ExamRubric, 
  Evaluation, 
  PassOrderItem, 
  ExamStatistics,
  Quiz,
  QuizCategory,
  QuizQuestion,
  QuizSubmission,
  DailyGrade
} from '../types';
import { supabaseService, generateUUID, isUUID } from './supabaseService';
import { authService } from './authService';
import { isValidEmail, normalizeEmail } from '../utils/email';
import { normalizeFirstName, normalizeLastName } from '../utils/personName';
import { formatCorrectReorderAnswer, formatReorderAnswer } from '../utils/quizReorder';
import { isQuestionAnswerCorrect, formatTextAnswerForDisplay, formatCorrectTextAnswerForDisplay, calculateQuestionPointsEarned, getQuestionExpectedAnswers } from '../utils/quizAnswerMatcher';
import { getQuestionTimeSeconds } from '../utils/quizTiming';
import { parseVerbesTrousAnswers } from '../utils/verbesTrous';

interface AppState {
  classes: ClassRoom[];
  students: Student[];
  exams: Exam[];
  rubrics: ExamRubric[];
  evaluations: Evaluation[];
  passOrder: PassOrderItem[];
  quizzes: Quiz[];
  quizSubmissions: QuizSubmission[];
}

type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

function notifySubscribers() {
  subscribers.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('Subscriber notify error:', e);
    }
  });
}

/**
 * Nettoyage et cohérence stricte des données :
 * - Aucune évaluation orpheline (sans élève ou sans examen existant)
 * - Aucun ordre de passage orphelin
 * - Tous les élèves rattachés à une classe existante
 */
function sanitizeState(appState: AppState): AppState {
  const classIds = new Set(appState.classes.map(c => c.id));
  const legacyStudentIds = new Set(
    appState.students.filter(student => !isValidEmail(student.email || '')).map(student => student.id)
  );
  const validStudents = appState.students
    .filter(s => classIds.has(s.class_id) && isValidEmail(s.email || ''))
    .map(s => {
      let num = s.student_number || '';
      if (num.toUpperCase().startsWith('STU-')) {
        num = num.replace(/^STU-0*/i, '');
      }
      return {
        ...s,
        first_name: normalizeFirstName(s.first_name),
        last_name: normalizeLastName(s.last_name),
        email: normalizeEmail(s.email),
        student_number: num || '1'
      };
    });
  const studentIds = new Set(validStudents.map(s => s.id));

  const validExams = appState.exams.filter(e => classIds.has(e.class_id));
  const examIds = new Set(validExams.map(e => e.id));

  const validRubrics = appState.rubrics.filter(r => examIds.has(r.exam_id));
  const validEvaluations = appState.evaluations.filter(ev => 
    studentIds.has(ev.student_id) && examIds.has(ev.exam_id)
  );
  const validPassOrder = appState.passOrder.filter(po => 
    studentIds.has(po.student_id) && examIds.has(po.exam_id)
  );

  const validQuizzes = (appState.quizzes || []).filter(q => classIds.has(q.class_id));
  // Ne conserver que les soumissions d'élèves actuellement enregistrés dans l'effectif
  const validSubmissions = (appState.quizSubmissions || []).filter(submission => {
    if (legacyStudentIds.has(submission.student_id)) return false;
    if (studentIds.size > 0 && !studentIds.has(submission.student_id)) return false;
    return true;
  });

  return {
    classes: appState.classes,
    students: validStudents,
    exams: validExams,
    rubrics: validRubrics,
    evaluations: validEvaluations,
    passOrder: validPassOrder,
    quizzes: validQuizzes,
    quizSubmissions: validSubmissions
  };
}

function loadInitialState(): AppState {
  // Aucun jeu de données de démonstration n'est utilisé comme solution de repli.
  // L'état est rempli exclusivement après un chargement réussi depuis Supabase.
  return {
    classes: [],
    students: [],
    exams: [],
    rubrics: [],
    evaluations: [],
    passOrder: [],
    quizzes: [],
    quizSubmissions: []
  };
}

let state: AppState = loadInitialState();

function persistState() {
  state = sanitizeState(state);
}

export const dataService = {
  subscribe(callback: Subscriber): () => void {
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  },

  getRawState(): AppState {
    return { ...state };
  },

  setImportedState(newState: {
    classes: ClassRoom[];
    students: Student[];
    exams: Exam[];
    evaluations: Evaluation[];
    passOrder: PassOrderItem[];
    quizzes?: Quiz[];
    quizSubmissions?: QuizSubmission[];
  }) {
    const rubrics: ExamRubric[] = [];
    newState.exams.forEach(e => {
      if (e.rubrics && e.rubrics.length > 0) {
        rubrics.push(...e.rubrics);
      }
    });

    state = sanitizeState({
      classes: newState.classes,
      students: newState.students,
      exams: newState.exams,
      rubrics: rubrics.length > 0 ? rubrics : state.rubrics,
      evaluations: newState.evaluations,
      passOrder: newState.passOrder,
      quizzes: newState.quizzes ?? state.quizzes ?? [],
      quizSubmissions: newState.quizSubmissions ?? state.quizSubmissions ?? []
    });

    persistState();
    notifySubscribers();
    return state;
  },

  /**
   * Synchronisation initiale avec Supabase Cloud au démarrage
   */
  async initFromCloud(): Promise<boolean> {
    if (!supabaseService.isConfigured()) {
      throw new Error('Supabase est obligatoire. Configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans les variables d’environnement de déploiement.');
    }
    const res = await supabaseService.importFromSupabase();
    if (!res.success || !res.state) {
      throw new Error(res.message || 'Le chargement des données depuis Supabase a échoué.');
    }
    this.setImportedState(res.state);
    authService.synchronizeStudentAccountsWithRoster(res.state.students, res.state.classes);
    return true;
  },

  // Recharger les données cloud; aucune réinitialisation locale de démonstration.
  async resetToDefault() {
    const res = await supabaseService.importFromSupabase();
    if (!res.success || !res.state) {
      throw new Error(res.message || 'Impossible de recharger les données Supabase.');
    }
    this.setImportedState(res.state);
    return state;
  },

  // =========================================================================
  // CLASSES
  // =========================================================================
  getClasses(): ClassRoom[] {
    return state.classes.map(c => {
      const studentCount = state.students.filter(s => s.class_id === c.id).length;
      const examCount = state.exams.filter(e => e.class_id === c.id).length;
      return { ...c, student_count: studentCount, exam_count: examCount };
    });
  },

  createClass(name: string): ClassRoom {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Le nom de la classe est requis');
    const newClass: ClassRoom = {
      id: generateUUID(),
      name: trimmed,
      created_at: new Date().toISOString()
    };
    state.classes.push(newClass);
    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.saveClass(newClass).catch(err => console.error('Cloud createClass error:', err));
    return newClass;
  },

  updateClass(id: string, name: string): ClassRoom {
    const idx = state.classes.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Classe introuvable');
    state.classes[idx].name = name.trim();
    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.saveClass(state.classes[idx]).catch(err => console.error('Cloud updateClass error:', err));
    return state.classes[idx];
  },

  async deleteClass(id: string): Promise<void> {
    await supabaseService.deleteClass(id);

    const classStudentIds = new Set(state.students.filter(s => s.class_id === id).map(s => s.id));
    const classExamIds = new Set(state.exams.filter(e => e.class_id === id).map(e => e.id));
    const classQuizIds = new Set((state.quizzes || []).filter(quiz => quiz.class_id === id).map(quiz => quiz.id));

    state.classes = state.classes.filter(c => c.id !== id);
    state.students = state.students.filter(s => s.class_id !== id);
    state.exams = state.exams.filter(e => e.class_id !== id);
    state.rubrics = state.rubrics.filter(r => !classExamIds.has(r.exam_id));
    state.evaluations = state.evaluations.filter(ev => !classExamIds.has(ev.exam_id) && !classStudentIds.has(ev.student_id));
    state.passOrder = state.passOrder.filter(po => !classExamIds.has(po.exam_id) && !classStudentIds.has(po.student_id));
    state.quizzes = (state.quizzes || []).filter(quiz => quiz.class_id !== id);
    state.quizSubmissions = (state.quizSubmissions || []).filter(submission =>
      submission.class_id !== id && !classQuizIds.has(submission.quiz_id) && !classStudentIds.has(submission.student_id)
    );
    authService.removeStudentAccountsForClass(id);

    persistState();
    notifySubscribers();
  },

  // =========================================================================
  // STUDENTS
  // =========================================================================
  getStudents(classId?: string, search?: string): Student[] {
    let list = [...state.students];
    if (classId) {
      list = list.filter(s => s.class_id === classId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => 
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.email.includes(q) ||
        (s.student_number && s.student_number.toLowerCase().includes(q))
      );
    }
    return list.map(s => {
      const cls = state.classes.find(c => c.id === s.class_id);
      return { ...s, class_name: cls ? cls.name : 'Inconnue' };
    });
  },

  getStudentById(id: string): (Student & { evaluations: Evaluation[] }) | null {
    const student = state.students.find(s => s.id === id);
    if (!student) return null;
    const cls = state.classes.find(c => c.id === student.class_id);
    const evals = this.getEvaluations(undefined, undefined, id);
    return {
      ...student,
      class_name: cls ? cls.name : 'Inconnue',
      evaluations: evals
    };
  },

  getStudentByEmail(email: string): Student | null {
    const normalizedEmail = normalizeEmail(email);
    return state.students.find(student => normalizeEmail(student.email) === normalizedEmail) || null;
  },

  async createStudent(
    firstName: string,
    lastName: string,
    classId: string,
    email: string,
    studentNumber?: string,
    id?: string,
    avatarUrl?: string | null,
    gender: Student['gender'] = 'homme'
  ): Promise<Student> {
    const normalizedFirstName = normalizeFirstName(firstName);
    const normalizedLastName = normalizeLastName(lastName);
    if (!normalizedFirstName || !normalizedLastName || !classId) {
      throw new Error('Prénom, nom et classe sont obligatoires');
    }
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) throw new Error('Une adresse e-mail valide est obligatoire.');
    if (state.students.some(student => normalizeEmail(student.email) === normalizedEmail)) {
      throw new Error('Cette adresse e-mail est déjà utilisée par un autre élève.');
    }
    const studentId = id || generateUUID();
    await supabaseService.assertStudentEmailAvailable(normalizedEmail, studentId);
    const newStudent: Student = {
      id: studentId,
      class_id: classId,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
      gender,
      email: normalizedEmail,
      student_number: studentNumber?.trim() || null,
      avatar_url: avatarUrl || null,
      avatar: avatarUrl || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      validation_status: 'pending' // Nouveaux inscrits en attente de validation
    };
    await supabaseService.saveStudent(newStudent);
    state.students.push(newStudent);
    persistState();
    notifySubscribers();
    return newStudent;
  },

  async updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
    const idx = state.students.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Élève introuvable');
    const normalizedEmail = normalizeEmail(updates.email ?? state.students[idx].email);
    if (!isValidEmail(normalizedEmail)) throw new Error('Une adresse e-mail valide est obligatoire.');
    if (state.students.some(student => student.id !== id && normalizeEmail(student.email) === normalizedEmail)) {
      throw new Error('Cette adresse e-mail est déjà utilisée par un autre élève.');
    }
    const updatedStudent = {
      ...state.students[idx],
      ...updates,
      first_name: normalizeFirstName(updates.first_name ?? state.students[idx].first_name),
      last_name: normalizeLastName(updates.last_name ?? state.students[idx].last_name),
      email: normalizedEmail,
      updated_at: new Date().toISOString()
    };
    await supabaseService.assertStudentEmailAvailable(normalizedEmail, id);
    await supabaseService.saveStudent(updatedStudent);
    state.students[idx] = updatedStudent;
    persistState();
    notifySubscribers();
    return updatedStudent;
  },

  async updateStudentValidationStatus(id: string, status: 'approved' | 'rejected' | 'pending'): Promise<Student> {
    const idx = state.students.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Élève introuvable');

    // 1. Mise à jour prioritaire en ligne directement dans la table Supabase
    if (supabaseService.isConfigured()) {
      await supabaseService.updateStudentValidationStatus(id, status);
    }

    const updatedStudent: Student = {
      ...state.students[idx],
      validation_status: status,
      updated_at: new Date().toISOString()
    };
    state.students[idx] = updatedStudent;
    persistState();
    notifySubscribers();
    return updatedStudent;
  },

  async bulkUpdateStudentValidationStatus(ids: string[], status: 'approved' | 'rejected' | 'pending'): Promise<number> {
    // 1. Mise à jour groupée en ligne directement dans Supabase
    if (supabaseService.isConfigured()) {
      await supabaseService.bulkUpdateStudentValidationStatus(ids, status);
    }

    let count = 0;
    for (const id of ids) {
      const idx = state.students.findIndex(s => s.id === id);
      if (idx !== -1) {
        state.students[idx] = {
          ...state.students[idx],
          validation_status: status,
          updated_at: new Date().toISOString()
        };
        count++;
      }
    }
    persistState();
    notifySubscribers();
    return count;
  },

  /**
   * Récupère la liste des élèves directement depuis la base Supabase en ligne
   */
  async syncStudentsFromCloud(): Promise<Student[]> {
    if (!supabaseService.isConfigured()) return state.students;
    try {
      const cloudStudents = await supabaseService.fetchStudentsDirect();
      // Une réponse vide est significative : elle doit remplacer l'état affiché,
      // et non laisser des données seed/locales à l'écran.
      state.students = cloudStudents;
      persistState();
      notifySubscribers();
      return state.students;
    } catch (err) {
      console.warn('Sync students from cloud error:', err);
      return state.students;
    }
  },

  async deleteStudent(id: string): Promise<void> {
    // Ne retirer les données locales qu’après réussite de la suppression cloud.
    await supabaseService.deleteStudent(id);
    state.students = state.students.filter(student => student.id !== id);
    authService.synchronizeStudentAccountsWithRoster(state.students, state.classes);
    state.evaluations = state.evaluations.filter(evaluation => evaluation.student_id !== id);
    state.passOrder = state.passOrder.filter(item => item.student_id !== id);
    state.quizSubmissions = (state.quizSubmissions || []).filter(submission => submission.student_id !== id);
    persistState();
    notifySubscribers();
  },

  async importStudents(rawList: Array<Record<string, any>>, defaultClassId?: string) {
    const imported: Student[] = [];
    const duplicates: Array<{ line: number; student: string }> = [];
    const errors: Array<{ line: number; reason: string }> = [];
    const seenEmails = new Set(state.students.map(student => normalizeEmail(student.email)));

    rawList.forEach((item, idx) => {
      const lineNum = idx + 1;
      const firstName = normalizeFirstName((item.prenom || item.first_name || item.Prenom || '').toString());
      const lastName = normalizeLastName((item.nom || item.last_name || item.Nom || '').toString());
      const email = normalizeEmail((item.email || item.courriel || item['e-mail'] || item.Email || '').toString());
      const studentNum = (item.numero || item.student_number || item.id || '').trim();

      let targetClassId = item.class_id || defaultClassId;
      if (!targetClassId && (item.classe || item.class_name)) {
        const cName = (item.classe || item.class_name).toLowerCase().trim();
        const foundClass = state.classes.find(c => 
          c.name.toLowerCase() === cName || c.name.toLowerCase().includes(cName)
        );
        if (foundClass) targetClassId = foundClass.id;
      }

      if (!firstName || !lastName) {
        errors.push({ line: lineNum, reason: 'Nom ou prénom manquant' });
        return;
      }

      if (!isValidEmail(email)) {
        errors.push({ line: lineNum, reason: 'Adresse e-mail manquante ou invalide' });
        return;
      }

      if (!targetClassId) {
        errors.push({ line: lineNum, reason: 'Classe non spécifiée ou introuvable' });
        return;
      }

      if (seenEmails.has(email)) {
        duplicates.push({ line: lineNum, student: email });
        return;
      }
      seenEmails.add(email);

      const newStudent: Student = {
        id: generateUUID(),
        class_id: targetClassId,
        first_name: firstName,
        last_name: lastName,
        email,
        student_number: studentNum || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        validation_status: 'pending' // Nouveaux inscrits en attente de validation par défaut
      };

      imported.push(newStudent);
    });

    await Promise.all(imported.map(student =>
      supabaseService.assertStudentEmailAvailable(student.email, student.id)
    ));
    await supabaseService.saveStudents(imported);
    state.students.push(...imported);
    persistState();
    notifySubscribers();

    return {
      total: rawList.length,
      importedCount: imported.length,
      duplicatesCount: duplicates.length,
      errorsCount: errors.length,
      imported,
      duplicates,
      errors
    };
  },

  // =========================================================================
  // EXAMS & RUBRICS
  // =========================================================================
  getExams(classId?: string): Exam[] {
    let list = [...state.exams];
    if (classId) {
      list = list.filter(e => e.class_id === classId);
    }
    return list.map(e => {
      const cls = state.classes.find(c => c.id === e.class_id);
      const rubrics = state.rubrics.filter(r => r.exam_id === e.id);
      const maxScore = rubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);
      const evals = state.evaluations.filter(ev => ev.exam_id === e.id);
      return {
        ...e,
        class_name: cls ? cls.name : 'Inconnue',
        rubrics,
        rubric_count: rubrics.length,
        max_score: maxScore,
        evaluations_count: evals.length
      };
    });
  },

  getExamById(id: string): Exam | null {
    const exam = state.exams.find(e => e.id === id);
    if (!exam) return null;
    const cls = state.classes.find(c => c.id === exam.class_id);
    const rubrics = state.rubrics
      .filter(r => r.exam_id === id)
      .sort((a, b) => a.position - b.position);
    const maxScore = rubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);
    const evals = state.evaluations.filter(ev => ev.exam_id === id);

    return {
      ...exam,
      class_name: cls ? cls.name : 'Inconnue',
      rubrics,
      rubric_count: rubrics.length,
      max_score: maxScore,
      evaluations_count: evals.length
    };
  },

  async createExam(title: string, classId: string, description: string = '', examDate?: string, _legacyUseZebuTemplate = false): Promise<Exam> {
    if (!title.trim() || !classId) throw new Error('Titre et classe obligatoires');
    const newExam: Exam = {
      id: generateUUID(),
      class_id: classId,
      title: title.trim(),
      description: description.trim(),
      exam_date: examDate || new Date().toISOString().split('T')[0],
      status: 'in_progress',
      created_at: new Date().toISOString()
    };

    // Un examen est volontairement créé sans grille implicite : les rubriques
    // sont définies explicitement par l'enseignant pour chaque sujet.
    await supabaseService.saveExam(newExam);
    state.exams.push(newExam);
    persistState();
    notifySubscribers();

    return this.getExamById(newExam.id)!;
  },

  updateExam(id: string, updates: Partial<Exam>): Exam {
    const idx = state.exams.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Examen introuvable');
    state.exams[idx] = { ...state.exams[idx], ...updates };
    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.saveExam(state.exams[idx]).catch(err => console.error('Cloud updateExam error:', err));
    return this.getExamById(id)!;
  },

  deleteExam(id: string) {
    state.exams = state.exams.filter(e => e.id !== id);
    state.rubrics = state.rubrics.filter(r => r.exam_id !== id);
    state.evaluations = state.evaluations.filter(ev => ev.exam_id !== id);
    state.passOrder = state.passOrder.filter(po => po.exam_id !== id);
    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.deleteExam(id).catch(err => console.error('Cloud deleteExam error:', err));
  },

  async updateExamRubrics(examId: string, rubrics: Array<Partial<ExamRubric> & Pick<ExamRubric, 'title' | 'question' | 'example_sentence' | 'points'>>): Promise<ExamRubric[]> {
    if (!state.exams.some(exam => exam.id === examId)) throw new Error('Examen introuvable');

    const newRubrics: ExamRubric[] = rubrics.map((rubric, idx) => ({
      id: rubric.id && isUUID(rubric.id) ? rubric.id : generateUUID(),
      exam_id: examId,
      title: rubric.title.trim(),
      question: rubric.question.trim(),
      example_sentence: rubric.example_sentence.trim(),
      points: Number(rubric.points) || 1,
      position: Number(rubric.position) || idx + 1
    }));

    // La base est mise à jour avant l'état local : un échec cloud ne doit pas
    // être présenté comme une sauvegarde réussie.
    await supabaseService.saveRubrics(newRubrics, examId);
    state.rubrics = state.rubrics.filter(r => r.exam_id !== examId);
    state.rubrics.push(...newRubrics);
    persistState();
    notifySubscribers();
    return newRubrics;
  },

  // =========================================================================
  // EVALUATIONS
  // =========================================================================
  getEvaluations(examId?: string, classId?: string, studentId?: string): Evaluation[] {
    let list = [...state.evaluations];
    if (examId) list = list.filter(e => e.exam_id === examId);
    if (studentId) list = list.filter(e => e.student_id === studentId);

    const validList = list.filter(ev => state.students.some(s => s.id === ev.student_id));

    const enriched = validList.map(ev => {
      const student = state.students.find(s => s.id === ev.student_id)!;
      const exam = state.exams.find(e => e.id === ev.exam_id);
      const cls = exam ? state.classes.find(c => c.id === exam.class_id) : null;
      const rubrics = state.rubrics.filter(r => r.exam_id === ev.exam_id);
      const maxScore = rubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);
      const validatedCount = ev.details ? ev.details.filter(d => d.is_validated).length : 0;

      return {
        ...ev,
        student_name: `${student.first_name} ${student.last_name}`,
        student_number: student.student_number || null,
        exam_title: exam ? exam.title : 'Examen inconnu',
        exam_date: exam ? exam.exam_date : '',
        class_name: cls ? cls.name : 'Inconnue',
        class_id: cls ? cls.id : undefined,
        max_score: maxScore,
        percentage: maxScore > 0 ? Math.round((ev.total_score / maxScore) * 100) : 0,
        validated_rubrics_count: validatedCount,
        total_rubrics_count: rubrics.length,
        max_duration_seconds: ev.max_duration_seconds || 180,
        duration_used_seconds: ev.duration_used_seconds !== undefined ? ev.duration_used_seconds : 0,
        timer_status: ev.timer_status || 'not_timed'
      };
    });

    if (classId) {
      return enriched.filter(e => e.class_id === classId);
    }
    return enriched;
  },

  saveEvaluation(
    examId: string, 
    studentId: string, 
    validatedMap: Record<string, boolean>,
    timing?: { duration_used_seconds?: number; max_duration_seconds?: number; timer_status?: 'completed' | 'stopped_manually' | 'not_timed' },
    errorNotesMap?: Record<string, string>
  ): Evaluation {
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) throw new Error('Examen introuvable');
    const student = state.students.find(s => s.id === studentId);
    if (!student) throw new Error('Élève introuvable');

    const rubrics = state.rubrics.filter(r => r.exam_id === examId);
    let totalScore = 0;

    const details = rubrics.map(r => {
      const errorNote = errorNotesMap ? (errorNotesMap[r.id] || '').trim() : '';
      const hasError = errorNote.length > 0;
      const isValidated = hasError ? false : Boolean(validatedMap[r.id]);
      const pts = isValidated ? (Number(r.points) || 1) : 0;
      totalScore += pts;
      return {
        rubric_id: r.id,
        is_validated: isValidated,
        awarded_points: pts,
        error_note: hasError ? errorNote : undefined
      };
    });

    const now = new Date().toISOString();
    const existingIndex = state.evaluations.findIndex(
      e => e.exam_id === examId && e.student_id === studentId
    );

    const maxDuration = timing?.max_duration_seconds ?? 180;
    const durationUsed = timing?.duration_used_seconds ?? (existingIndex !== -1 ? state.evaluations[existingIndex].duration_used_seconds : 0);
    const timerStatus = timing?.timer_status ?? (existingIndex !== -1 ? state.evaluations[existingIndex].timer_status : 'stopped_manually');
    let savedEval: Evaluation;

    if (existingIndex !== -1) {
      const currentId = state.evaluations[existingIndex].id;
      savedEval = {
        ...state.evaluations[existingIndex],
        id: isUUID(currentId) ? currentId : generateUUID(),
        total_score: totalScore,
        status: 'completed',
        details,
        max_duration_seconds: maxDuration,
        duration_used_seconds: durationUsed,
        timer_status: timerStatus,
        updated_at: now
      };
      state.evaluations[existingIndex] = savedEval;
    } else {
      savedEval = {
        id: generateUUID(),
        exam_id: examId,
        student_id: studentId,
        total_score: totalScore,
        status: 'completed',
        created_at: now,
        updated_at: now,
        details,
        max_duration_seconds: maxDuration,
        duration_used_seconds: durationUsed,
        timer_status: timerStatus
      };
      state.evaluations.push(savedEval);
    }

    // Mettre à jour l'ordre de passage si l'élève est dedans
    const passOrderIdx = state.passOrder.findIndex(
      po => po.exam_id === examId && po.student_id === studentId
    );
    if (passOrderIdx !== -1) {
      state.passOrder[passOrderIdx].status = 'completed';
    }

    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase en temps réel
    supabaseService.saveEvaluation(savedEval).catch(err => console.error('Cloud saveEvaluation error:', err));
    supabaseService.savePassOrder(state.passOrder).catch(err => console.error('Cloud savePassOrder error:', err));

    return savedEval;
  },

  deleteEvaluation(id: string) {
    state.evaluations = state.evaluations.filter(e => e.id !== id);
    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.deleteEvaluation(id).catch(err => console.error('Cloud deleteEvaluation error:', err));
  },

  // =========================================================================
  // PASS ORDER
  // =========================================================================
  getPassOrder(examId: string): PassOrderItem[] {
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) return [];

    const classStudents = state.students.filter(s => s.class_id === exam.class_id);
    const classStudentIds = new Set(classStudents.map(s => s.id));

    let existingOrders = state.passOrder
      .filter(po => po.exam_id === examId && classStudentIds.has(po.student_id))
      .sort((a, b) => a.position - b.position);

    const orderedStudentIds = new Set(existingOrders.map(po => po.student_id));
    let hasChanges = false;

    classStudents.forEach((student) => {
      if (!orderedStudentIds.has(student.id)) {
        hasChanges = true;
        const isEval = state.evaluations.some(ev => ev.exam_id === examId && ev.student_id === student.id);
        const item: PassOrderItem = {
          id: generateUUID(),
          exam_id: examId,
          student_id: student.id,
          position: existingOrders.length + 1,
          status: isEval ? 'completed' : 'waiting'
        };
        existingOrders.push(item);
        orderedStudentIds.add(student.id);
      }
    });

    existingOrders.forEach((item, idx) => {
      if (item.position !== idx + 1) {
        item.position = idx + 1;
        hasChanges = true;
      }
      const evalObj = state.evaluations.find(ev => ev.exam_id === examId && ev.student_id === item.student_id);
      if (evalObj && item.status !== 'completed' && item.status !== 'absent') {
        item.status = 'completed';
        hasChanges = true;
      }
    });

    if (hasChanges || existingOrders.length !== state.passOrder.filter(po => po.exam_id === examId).length) {
      state.passOrder = [
        ...state.passOrder.filter(po => po.exam_id !== examId),
        ...existingOrders
      ];
      persistState();
      supabaseService.savePassOrder(state.passOrder).catch(console.error);
    }

    return existingOrders.map(po => {
      const student = state.students.find(s => s.id === po.student_id);
      const evalObj = state.evaluations.find(ev => ev.exam_id === examId && ev.student_id === po.student_id);
      return {
        ...po,
        student_name: student ? `${student.first_name} ${student.last_name}` : 'Élève',
        student_number: student?.student_number || null,
        is_evaluated: Boolean(evalObj),
        evaluation_score: evalObj ? evalObj.total_score : null
      };
    });
  },

  randomizePassOrder(examId: string): PassOrderItem[] {
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) throw new Error('Examen introuvable');

    const classStudents = state.students.filter(s => s.class_id === exam.class_id);
    if (classStudents.length === 0) throw new Error('Aucun élève dans cette classe');

    // Fisher-Yates
    const shuffled = [...classStudents];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const previousOrders = [...state.passOrder.filter(po => po.exam_id === examId)];
    state.passOrder = state.passOrder.filter(po => po.exam_id !== examId);

    const newOrder: PassOrderItem[] = shuffled.map((student, idx) => {
      const evalObj = state.evaluations.find(ev => ev.exam_id === examId && ev.student_id === student.id);
      const prevPo = previousOrders.find(po => po.student_id === student.id);
      const item: PassOrderItem = {
        id: generateUUID(),
        exam_id: examId,
        student_id: student.id,
        position: idx + 1,
        status: evalObj ? 'completed' : (prevPo?.status === 'absent' ? 'absent' : 'waiting')
      };
      state.passOrder.push(item);
      return item;
    });

    persistState();
    notifySubscribers();

    supabaseService.savePassOrder(state.passOrder).catch(console.error);
    return this.getPassOrder(examId);
  },

  resetPassOrderToOriginal(examId: string): PassOrderItem[] {
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) throw new Error('Examen introuvable');

    const classStudents = state.students.filter(s => s.class_id === exam.class_id);
    if (classStudents.length === 0) throw new Error('Aucun élève dans cette classe');

    // Réinitialiser selon l'ordre d'origine de la liste des élèves :
    // 1. Matricule numérique (ETU-001, ETU-002, 1, 2, etc.)
    // 2. Date de création (created_at) ou index dans la liste des élèves
    const sorted = [...classStudents].sort((a, b) => {
      if (a.student_number && b.student_number) {
        const numA = parseInt(a.student_number.replace(/\D/g, ''), 10);
        const numB = parseInt(b.student_number.replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB;
        }
        const cmp = a.student_number.localeCompare(b.student_number, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
      }
      if (a.created_at && b.created_at && a.created_at !== b.created_at) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return state.students.indexOf(a) - state.students.indexOf(b);
    });

    const previousOrders = [...state.passOrder.filter(po => po.exam_id === examId)];
    state.passOrder = state.passOrder.filter(po => po.exam_id !== examId);

    const newOrder: PassOrderItem[] = sorted.map((student, idx) => {
      const evalObj = state.evaluations.find(ev => ev.exam_id === examId && ev.student_id === student.id);
      const prevPo = previousOrders.find(po => po.student_id === student.id);
      const item: PassOrderItem = {
        id: generateUUID(),
        exam_id: examId,
        student_id: student.id,
        position: idx + 1,
        status: evalObj ? 'completed' : (prevPo?.status === 'absent' ? 'absent' : 'waiting')
      };
      state.passOrder.push(item);
      return item;
    });

    persistState();
    notifySubscribers();

    supabaseService.savePassOrder(state.passOrder).catch(console.error);
    return this.getPassOrder(examId);
  },

  resetPassOrderToAlphabetical(examId: string): PassOrderItem[] {
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) throw new Error('Examen introuvable');

    const classStudents = state.students.filter(s => s.class_id === exam.class_id);
    if (classStudents.length === 0) throw new Error('Aucun élève dans cette classe');

    // Tri alphabétique par Nom de famille puis Prénom
    const sorted = [...classStudents].sort((a, b) => {
      const cmp = a.last_name.localeCompare(b.last_name, 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return a.first_name.localeCompare(b.first_name, 'fr', { sensitivity: 'base' });
    });

    const previousOrders = [...state.passOrder.filter(po => po.exam_id === examId)];
    state.passOrder = state.passOrder.filter(po => po.exam_id !== examId);

    const newOrder: PassOrderItem[] = sorted.map((student, idx) => {
      const evalObj = state.evaluations.find(ev => ev.exam_id === examId && ev.student_id === student.id);
      const prevPo = previousOrders.find(po => po.student_id === student.id);
      const item: PassOrderItem = {
        id: generateUUID(),
        exam_id: examId,
        student_id: student.id,
        position: idx + 1,
        status: evalObj ? 'completed' : (prevPo?.status === 'absent' ? 'absent' : 'waiting')
      };
      state.passOrder.push(item);
      return item;
    });

    persistState();
    notifySubscribers();

    supabaseService.savePassOrder(state.passOrder).catch(console.error);
    return this.getPassOrder(examId);
  },

  resetStudentPassStatus(examId: string, studentId: string): void {
    const idx = state.passOrder.findIndex(po => po.exam_id === examId && po.student_id === studentId);
    if (idx !== -1) {
      state.passOrder[idx].status = 'waiting';
      // Supprimer l'évaluation existante pour cet élève afin de permettre une réévaluation propre
      state.evaluations = state.evaluations.filter(ev => !(ev.exam_id === examId && ev.student_id === studentId));
      persistState();
      notifySubscribers();
      supabaseService.savePassOrder(state.passOrder).catch(console.error);
      supabaseService.deleteEvaluationByExamAndStudent(examId, studentId).catch(console.error);
    }
  },

  updatePassOrderStatus(examId: string, studentId: string, status: 'waiting' | 'current' | 'completed' | 'absent') {
    const idx = state.passOrder.findIndex(po => po.exam_id === examId && po.student_id === studentId);
    if (idx !== -1) {
      state.passOrder[idx].status = status;
      if (status === 'waiting') {
        // En cas de réinitialisation en attente, supprimer l'ancienne note pour permettre de recommencer
        state.evaluations = state.evaluations.filter(ev => !(ev.exam_id === examId && ev.student_id === studentId));
      }
      persistState();
      notifySubscribers();
      supabaseService.savePassOrder(state.passOrder).catch(console.error);
      if (status === 'waiting') {
        supabaseService.deleteEvaluationByExamAndStudent(examId, studentId).catch(console.error);
      }
    }
  },

  resetAllPassOrderStatus(examId: string, clearEvaluations: boolean = true): PassOrderItem[] {
    state.passOrder.forEach(po => {
      if (po.exam_id === examId) {
        po.status = 'waiting';
      }
    });

    if (clearEvaluations) {
      const removedEvals = state.evaluations.filter(ev => ev.exam_id === examId);
      state.evaluations = state.evaluations.filter(ev => ev.exam_id !== examId);
      removedEvals.forEach(ev => {
        supabaseService.deleteEvaluation(ev.id).catch(console.error);
      });
    }

    persistState();
    notifySubscribers();
    supabaseService.savePassOrder(state.passOrder).catch(console.error);
    return this.getPassOrder(examId);
  },

  // =========================================================================
  // STATISTICS
  // =========================================================================
  getStatistics(examId: string): ExamStatistics | null {
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) return null;

    const rubrics = state.rubrics
      .filter(r => r.exam_id === examId)
      .sort((a, b) => a.position - b.position);

    const maxScore = rubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);
    const classStudents = state.students.filter(s => s.class_id === exam.class_id);
    const classStudentIds = new Set(classStudents.map(s => s.id));
    const totalStudents = classStudents.length;

    const evaluations = state.evaluations.filter(ev => 
      ev.exam_id === examId && classStudentIds.has(ev.student_id)
    );
    const evaluatedCount = Math.min(totalStudents, evaluations.length);
    const unevaluatedCount = Math.max(0, totalStudents - evaluatedCount);

    let classAverage = 0;
    let minScore = 0;
    let maxObtainedScore = 0;
    let successRate = 0;

    if (evaluatedCount > 0) {
      const scores = evaluations.map(e => Number(e.total_score));
      const totalPoints = scores.reduce((sum, s) => sum + s, 0);
      classAverage = Number((totalPoints / evaluatedCount).toFixed(2));
      minScore = Math.min(...scores);
      maxObtainedScore = Math.max(...scores);

      const passThreshold = maxScore * 0.5;
      const passedCount = scores.filter(s => s >= passThreshold).length;
      successRate = Number(((passedCount / evaluatedCount) * 100).toFixed(1));
    }

    const distribution = [
      { label: '0 - 2 pts', count: 0 },
      { label: '3 - 4 pts', count: 0 },
      { label: '5 - 6 pts', count: 0 },
      { label: '7 - 8 pts', count: 0 },
      { label: '9 - 10 pts', count: 0 }
    ];

    evaluations.forEach(ev => {
      const s = Number(ev.total_score);
      if (s <= 2) distribution[0].count++;
      else if (s <= 4) distribution[1].count++;
      else if (s <= 6) distribution[2].count++;
      else if (s <= 8) distribution[3].count++;
      else distribution[4].count++;
    });

    const scoreFreqMap: Record<number, number> = {};
    for (let i = 0; i <= maxScore; i++) scoreFreqMap[i] = 0;
    evaluations.forEach(ev => {
      const s = Math.round(Number(ev.total_score));
      if (scoreFreqMap[s] !== undefined) scoreFreqMap[s]++;
    });

    const rubricPerformance = rubrics.map(r => {
      let validated = 0;
      evaluations.forEach(ev => {
        const d = ev.details.find(det => det.rubric_id === r.id);
        if (d && d.is_validated) validated++;
      });
      const pct = evaluatedCount > 0 ? Number(((validated / evaluatedCount) * 100).toFixed(1)) : 0;
      return {
        rubric_id: r.id,
        position: r.position,
        title: r.title,
        question: r.question,
        validated_count: validated,
        success_rate: pct
      };
    });

    const classExams = state.exams.filter(e => e.class_id === exam.class_id);
    const comparisons = classExams.map(ex => {
      const evals = state.evaluations.filter(ev => ev.exam_id === ex.id);
      const avg = evals.length > 0 
        ? Number((evals.reduce((sum, e) => sum + Number(e.total_score), 0) / evals.length).toFixed(2))
        : 0;
      return {
        exam_id: ex.id,
        title: ex.title,
        date: ex.exam_date,
        evaluated_count: evals.length,
        average_score: avg
      };
    });

    return {
      exam_id: examId,
      exam_title: exam.title,
      max_score: maxScore,
      indicators: {
        total_students: totalStudents,
        evaluated_students: evaluatedCount,
        unevaluated_students: unevaluatedCount,
        class_average: classAverage,
        min_score: minScore,
        max_score: maxObtainedScore,
        success_rate: successRate
      },
      charts: {
        distribution,
        score_frequency: Object.keys(scoreFreqMap).map(k => ({ score: Number(k), count: scoreFreqMap[Number(k)] })),
        rubric_performance: rubricPerformance,
        class_exams_comparison: comparisons
      }
    };
  },

  // =========================================================================
  // QUIZZES & ÉVALUATIONS JOURNALIÈRES (ESAME)
  // =========================================================================

  getQuizzes(classId?: string): Quiz[] {
    this.checkAndApplyExpiredQuizzes();
    let list = state.quizzes || [];
    if (classId) {
      // Filter quizzes that belong to the specified class (check class_ids array, fallback to class_id)
      list = list.filter(q => {
        // Check new class_ids array first, then fall back to class_id for backward compatibility
        const classIds = q.class_ids || [q.class_id];
        return classIds.includes(classId);
      });
    }
    return list.map(q => {
      // For display, show the first class name (or we could show all)
      const classIds = q.class_ids || [q.class_id];
      const firstClassId = classIds[0];
      const cls = state.classes.find(c => c.id === firstClassId);
      return {
        ...q,
        class_name: cls ? cls.name : 'Classe'
      };
    });
  },

  getQuizById(id: string): Quiz | null {
    this.checkAndApplyExpiredQuizzes();
    const q = (state.quizzes || []).find(x => x.id === id);
    if (!q) return null;
    // For display, show the first class name (or we could show all)
    const classIds = q.class_ids || [q.class_id];
    const firstClassId = classIds[0];
    const cls = state.classes.find(c => c.id === firstClassId);
    return {
      ...q,
      class_name: cls ? cls.name : 'Classe'
    };
  },

  getPublicQuiz(publicIdOrId: string): Quiz | null {
    this.checkAndApplyExpiredQuizzes();
    const clean = (publicIdOrId || '').trim();
    if (!clean) return null;

    // Chercher par public_id exact ou id exact parmi les quiz explicitement publics
    let q = (state.quizzes || []).find(x => 
      (x.public_id === clean || x.id === clean) && Boolean(x.is_public)
    );

    // Si non trouvé avec is_public strict, chercher par ID/public_id exact (au cas où l'état synchro met du temps)
    if (!q) {
      q = (state.quizzes || []).find(x => x.public_id === clean || x.id === clean);
    }

    if (!q) return null;

    const classIds = q.class_ids || [q.class_id];
    const firstClassId = classIds[0];
    const cls = state.classes.find(c => c.id === firstClassId);
    return {
      ...q,
      is_public: true,
      class_name: cls ? cls.name : 'Classe'
    };
  },

  createQuiz(data: {
    title: string;
    description?: string;
    category?: QuizCategory;
    class_id: string;
    class_ids?: string[];
    duration_minutes: number;
    questions: QuizQuestion[];
    is_public?: boolean;
  }): Quiz {
    const normalizedQuestions = (data.questions || []).map(question => {
      const expectedAnswers = getQuestionExpectedAnswers(question);
      let pts = Number(question.points) || 1;
      if (question.type === 'text' && expectedAnswers.length > 1 && pts <= 1) {
        pts = expectedAnswers.length;
      }
      return {
        ...question,
        points: pts,
        time_limit_seconds: getQuestionTimeSeconds(question)
      };
    });
    const totalTimeSeconds = normalizedQuestions.reduce((total, question) => total + getQuestionTimeSeconds(question), 0);
    const totalPoints = normalizedQuestions.reduce((acc, curr) => acc + (Number(curr.points) || 0), 0) || 20;
    const cls = state.classes.find(c => c.id === data.class_id);

    // Handle class_ids for backward compatibility
    const finalClassIds = data.class_ids || [data.class_id];

    const newQuiz: Quiz = {
      id: generateUUID(),
      public_id: data.is_public ? generateUUID() : undefined,
      is_public: data.is_public ?? false,
      category: data.category || 'Autre',
      title: data.title.trim(),
      description: data.description?.trim(),
      class_id: data.class_id, // Keep for backward compatibility (first class)
      class_ids: finalClassIds,
      class_name: cls ? cls.name : 'Classe',
      created_at: new Date().toISOString(),
      duration_minutes: normalizedQuestions.length
        ? Math.max(1, Math.ceil(totalTimeSeconds / 60))
        : Number(data.duration_minutes) || 10,
      status: 'draft',
      attendance_mode: data.is_public ? 'legacy' : 'strict_presence',
      presence_window_seconds: 10,
      questions: normalizedQuestions,
      total_points: totalPoints
    };

    supabaseService.saveQuiz(newQuiz).catch(err => console.error('Cloud createQuiz error:', err));
    if (!state.quizzes) state.quizzes = [];
    state.quizzes.unshift(newQuiz);
    persistState();
    notifySubscribers();
    return newQuiz;
  },

  updateQuiz(id: string, updates: Partial<Quiz>): Quiz {
    if (!state.quizzes) state.quizzes = [];
    const idx = state.quizzes.findIndex(q => q.id === id);
    if (idx === -1) throw new Error('Quiz introuvable');

    // Handle public_id generation when is_public is set to true
    if (updates.is_public === true && (!state.quizzes[idx].public_id || state.quizzes[idx].public_id === '')) {
      updates.public_id = generateUUID();
    }
    // Handle public_id removal when is_public is set to false
    if (updates.is_public === false) {
      updates.public_id = undefined;
    }

    // Handle class_ids updates for backward compatibility
    if (updates.class_ids !== undefined) {
      // Update class_id to first class in class_ids for backward compatibility
      if (updates.class_ids.length > 0) {
        updates.class_id = updates.class_ids[0];
        // Update class_name to match the first class
        const firstClass = state.classes.find(c => c.id === updates.class_ids?.[0]);
        if (firstClass) {
          updates.class_name = firstClass.name;
        }
      } else {
        // If class_ids is empty, set defaults
        updates.class_id = '';
        updates.class_name = '';
      }
    }

    const normalizedQuestions = updates.questions?.map(question => {
      const expectedAnswers = getQuestionExpectedAnswers(question);
      let pts = Number(question.points) || 1;
      if (question.type === 'text' && expectedAnswers.length > 1 && pts <= 1) {
        pts = expectedAnswers.length;
      }
      return {
        ...question,
        points: pts,
        time_limit_seconds: getQuestionTimeSeconds(question)
      };
    });
    const totalTimeSeconds = normalizedQuestions?.reduce((total, question) => total + getQuestionTimeSeconds(question), 0) || 0;
    const totalPoints = normalizedQuestions
      ? normalizedQuestions.reduce((acc, curr) => acc + (Number(curr.points) || 0), 0)
      : state.quizzes[idx].total_points;

    state.quizzes[idx] = {
      ...state.quizzes[idx],
      ...updates,
      ...(normalizedQuestions ? {
        questions: normalizedQuestions,
        duration_minutes: Math.max(1, Math.ceil(totalTimeSeconds / 60))
      } : {}),
      total_points: totalPoints || state.quizzes[idx].total_points
    };

    supabaseService.saveQuiz(state.quizzes[idx]).catch(err => console.error('Cloud updateQuiz error:', err));
    persistState();
    notifySubscribers();
    return state.quizzes[idx];
  },

  deleteQuiz(id: string): void {
    if (!state.quizzes) return;
    supabaseService.deleteQuiz(id).catch(err => console.error('Cloud deleteQuiz error:', err));
    state.quizzes = state.quizzes.filter(q => q.id !== id);
    if (state.quizSubmissions) {
      state.quizSubmissions = state.quizSubmissions.filter(sub => sub.quiz_id !== id);
    }
    persistState();
    notifySubscribers();
  },

  /**
   * Lance le quiz pour les classes ciblées.
   * Tous les quiz restent accessibles jusqu'à leur clôture manuelle.
   */
  async launchQuiz(id: string): Promise<Quiz> {
    const idx = (state.quizzes || []).findIndex(q => q.id === id);
    if (idx === -1) throw new Error('Quiz introuvable');

    const quizBeforeLaunch = state.quizzes[idx];
    // Les nouveaux quiz privés utilisent le parcours présence strict. Les quiz
    // historiques/publics restent sur le RPC legacy sans réinterprétation.
    if (quizBeforeLaunch.attendance_mode === 'strict_presence' && !quizBeforeLaunch.is_public) {
      await supabaseService.launchQuizWithPresence(id);
    } else {
      await supabaseService.launchQuizAtomically(id);
    }

    // Le service local reflète le même état que la transaction distante.
    if (state.quizSubmissions && quizBeforeLaunch.attendance_mode !== 'strict_presence') {
      state.quizSubmissions = state.quizSubmissions.filter(sub => !(sub.quiz_id === id && sub.status === 'missed'));
    }

    const now = new Date();

    state.quizzes[idx] = {
      ...state.quizzes[idx],
      status: 'launched',
      launched_at: now.toISOString(),
      expires_at: undefined
    };

    if (!supabaseService.isConfigured()) {
      supabaseService.saveQuiz(state.quizzes[idx]).catch(err => console.error('Cloud launchQuiz error:', err));
    }
    persistState();
    notifySubscribers();
    return state.quizzes[idx];
  },

  async closeQuiz(id: string): Promise<Quiz> {
    const idx = (state.quizzes || []).findIndex(q => q.id === id);
    if (idx === -1) throw new Error('Quiz introuvable');

    const authoritativeSubmissions = state.quizzes[idx].attendance_mode === 'strict_presence' && !state.quizzes[idx].is_public
      ? await supabaseService.closeQuizWithPresence(id)
      : await supabaseService.closeQuizAtomically(id);

    state.quizzes[idx] = {
      ...state.quizzes[idx],
      status: 'closed'
    };

    if (authoritativeSubmissions) {
      state.quizSubmissions = [
        ...authoritativeSubmissions,
        ...(state.quizSubmissions || []).filter(sub => sub.quiz_id !== id)
      ];
    } else {
      // Mode local sans Supabase.
      this.applyZeroForMissedStudents(state.quizzes[idx]);
    }

    persistState();
    notifySubscribers();
    return state.quizzes[idx];
  },

  /** Les anciennes échéances sont ignorées : seul closeQuiz clôt un quiz lancé. */
  checkAndApplyExpiredQuizzes(): void {
    // Conservée pour compatibilité avec les appelants existants; aucun quiz
    // ne s'expire automatiquement, que le quiz soit public ou privé.
  },

  applyZeroForMissedStudents(quiz: Quiz): void {
    if (!state.quizSubmissions) state.quizSubmissions = [];

    // Get all class IDs for this quiz (supporting both class_ids array and backward compatibility)
    const classIds = quiz.class_ids || [quiz.class_id];

    // Get all students who belong to any of the quiz's classes
    const classStudents = state.students.filter(s => classIds.includes(s.class_id));
    const existingStudentIds = new Set(
      state.quizSubmissions.filter(sub => sub.quiz_id === quiz.id).map(sub => sub.student_id)
    );

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    classStudents.forEach(st => {
      if (!existingStudentIds.has(st.id)) {
        // À la clôture, l'élève qui n'a pas composé reçoit la note de 0 / 20.
        const studentClass = state.classes.find(c => c.id === st.class_id);
        const zeroSubmission: QuizSubmission = {
          id: `sub_missed_${quiz.id}_${st.id}`,
          quiz_id: quiz.id,
          quiz_title: quiz.title,
          student_id: st.id,
          student_name: `${st.first_name} ${st.last_name}`,
          student_number: st.student_number || '1',
          class_id: st.class_id,
          class_name: studentClass ? studentClass.name : 'Classe inconnue',
          started_at: quiz.launched_at || now,
          submitted_at: now,
          answers: {},
          score: 0,
          max_score: quiz.total_points || 20,
          score_20: 0,
          status: 'missed',
          date: today,
          feedback: {}
        };
        state.quizSubmissions.push(zeroSubmission);
        supabaseService.saveQuizSubmission(zeroSubmission)
          .catch(err => console.error('Cloud save missed quiz submission error:', err));
      }
    });
  },

  /**
   * Soumission et correction automatique d'un quiz
   */
  async submitQuiz(
    quizId: string,
    studentId: string,
    studentName: string,
    studentNumber: string | null | undefined,
    classId: string,
    answers: Record<string, string>,
    isTimeout = false,
    retryGrantId?: string
  ): Promise<QuizSubmission> {
    const quiz = this.getQuizById(quizId);
    if (!quiz) throw new Error('Quiz introuvable');

    if (!state.quizSubmissions) state.quizSubmissions = [];

    // Vérifier si l'élève appartient à l'une des classes du quiz
    const classIds = quiz.class_ids || [quiz.class_id];
    const student = state.students.find(s => s.id === studentId);
    if (!student) {
      throw new Error('Élève introuvable');
    }

    // Vérifier si l'élève appartient à au moins une des classes du quiz
    const isStudentInQuizClass = classIds.some(classId => student.class_id === classId);
    if (!isStudentInQuizClass) {
      throw new Error('Vous n\'êtes pas autorisé à passer ce quiz car vous n\'êtes pas inscrit dans une des classes concernées.');
    }

    // Vérifier si l'élève a déjà soumis ce quiz
    const existingIdx = state.quizSubmissions.findIndex(s => {
      return s.quiz_id === quizId && Boolean(studentId) && s.student_id === studentId;
    });

    if (existingIdx !== -1 && !retryGrantId) {
      throw new Error("Vous avez déjà soumis ce quiz et il est définitivement verrouillé.");
    }

    let rawScore = 0;
    const feedback: Record<string, { correct: boolean; points: number; expected: string; studentAnswer: string }> = {};

    quiz.questions.forEach(q => {
      const studentAns = (answers[q.id] || '').trim();
      const pointsInfo = calculateQuestionPointsEarned(q, studentAns);
      const awarded = pointsInfo.awardedPoints;
      rawScore += awarded;
      feedback[q.id] = {
        correct: pointsInfo.isFullyCorrect,
        points: awarded,
        expected: q.type === 'reorder'
          ? formatCorrectReorderAnswer(q)
          : q.type === 'text'
          ? formatCorrectTextAnswerForDisplay(q)
          : q.type === 'verbes_trous' && q.verbes_trous
          ? q.verbes_trous.phrases.map((phrase) => (phrase.verbe || '') + ' → ' + (phrase.reponses || []).join(' / ')).join(' · ')
          : (q.correct_answer || ''),
        studentAnswer: q.type === 'reorder'
          ? formatReorderAnswer(q, studentAns)
          : q.type === 'text'
          ? formatTextAnswerForDisplay(q, studentAns)
          : q.type === 'verbes_trous' && q.verbes_trous
          ? q.verbes_trous.phrases.map((phrase) => { const response = parseVerbesTrousAnswers(studentAns)[String(phrase.id)]; return (response?.verbe_choisi || '—') + ' → ' + (response?.texte_saisi || '—'); }).join(' · ')
          : studentAns
      };
    });

    const maxScore = quiz.total_points || 20;
    const finalScore = isTimeout ? 0 : rawScore;
    const score20 = isTimeout ? 0 : (maxScore > 0 ? Number(((rawScore / maxScore) * 20).toFixed(1)) : 0);
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // Déterminer la classe de l'élève pour l'enregistrement dans la soumission
    const studentClass = state.classes.find(c => c.id === student.class_id);

    const submission: QuizSubmission = {
      id: generateUUID(),
      quiz_id: quizId,
      quiz_title: quiz.title,
      student_id: studentId,
      student_name: studentName,
      student_number: studentNumber || '1',
      class_id: student.class_id,
      class_name: studentClass ? studentClass.name : 'Classe inconnue',
      started_at: now,
      submitted_at: now,
      answers,
      score: finalScore,
      max_score: maxScore,
      score_20: score20,
      status: isTimeout ? 'timeout' : 'completed',
      feedback,
      date: today,
      attempt_number: existingIdx === -1 ? 1 : Math.max(...state.quizSubmissions.filter(s => s.quiz_id === quizId && s.student_id === studentId).map(s => s.attempt_number || 1), 0) + 1,
      retry_grant_id: retryGrantId,
      attendance_status: existingIdx !== -1 ? (state.quizSubmissions[existingIdx].attendance_status || 'present') : 'present',
      is_counted: true
    };

    // En cloud, la remise verrouille la même ligne quiz que la clôture.
    // Une seule des deux opérations gagne la course; une note réelle ne peut
    // pas être remplacée par un résultat manqué.
    const savedAtomically = quiz.attendance_mode === 'strict_presence' && !quiz.is_public
      ? await supabaseService.submitQuizPresenceSubmission(submission)
      : await supabaseService.submitQuizSubmissionAtomically(submission);
    if (!savedAtomically) await supabaseService.saveQuizSubmission(submission);

    if (existingIdx !== -1 && retryGrantId) {
      state.quizSubmissions.unshift(submission);
    } else if (existingIdx !== -1) {
      state.quizSubmissions[existingIdx] = submission;
    } else {
      state.quizSubmissions.unshift(submission);
    }

    persistState();
    notifySubscribers();
    return submission;
  },

  getQuizSubmissions(quizId?: string): QuizSubmission[] {
    this.checkAndApplyExpiredQuizzes();
    let list = state.quizSubmissions || [];
    if (quizId) {
      list = list.filter(s => s.quiz_id === quizId);
    }
    return list;
  },

  getStudentSubmissions(studentId: string, _studentName?: string, _studentNumber?: string, classId?: string): QuizSubmission[] {
    this.checkAndApplyExpiredQuizzes();
    const studentExists = (state.students || []).some(s => s.id === studentId);
    if (!studentExists && (state.students || []).length > 0) return [];
    const cleanId = (studentId || '').toLowerCase();

    return (state.quizSubmissions || []).filter(s => {
      const sId = (s.student_id || '').toLowerCase();
      if (classId && s.class_id !== classId) return false;
      return Boolean(cleanId && sId === cleanId);
    });
  },

  /**
   * Calcule la note journalière en pondérant chaque quiz selon son barème.
   * Filtre strictement pour n'inclure que les élèves actifs non supprimés.
   */
  getDailyGrades(classId?: string, targetDate?: string): DailyGrade[] {
    this.checkAndApplyExpiredQuizzes();
    const activeStudentIds = new Set((state.students || []).map(s => s.id));
    let submissions = (state.quizSubmissions || []).filter(s => {
      if (activeStudentIds.size > 0 && !activeStudentIds.has(s.student_id)) return false;
      return true;
    });

    if (classId) {
      submissions = submissions.filter(s => s.class_id === classId);
    }
    if (targetDate) {
      submissions = submissions.filter(s => s.date === targetDate);
    }

    // Grouper par student_id + date
    const groups: Record<string, QuizSubmission[]> = {};
    submissions.forEach(sub => {
      const key = `${sub.student_id}_${sub.date}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(sub);
    });

    const result: DailyGrade[] = [];
    Object.keys(groups).forEach(key => {
      const grouped = groups[key];
      const bestByQuiz = new Map<string, QuizSubmission>();
      grouped.forEach(sub => {
        if (sub.is_counted === false) return;
        const current = bestByQuiz.get(sub.quiz_id);
        if (!current || sub.score_20 > current.score_20 || (sub.score_20 === current.score_20 && (sub.attempt_number || 1) > (current.attempt_number || 1))) bestByQuiz.set(sub.quiz_id, sub);
      });
      const subs = [...bestByQuiz.values()];
      if (subs.length === 0) return;
      const first = subs[0];
      const totalScore = subs.reduce((acc, curr) => acc + curr.score, 0);
      const totalPossible = subs.reduce((acc, curr) => acc + curr.max_score, 0);
      const avg = totalPossible > 0 ? Number(((totalScore / totalPossible) * 20).toFixed(2)) : 0;

      result.push({
        student_id: first.student_id,
        student_name: first.student_name,
        student_number: first.student_number,
        class_id: first.class_id,
        class_name: first.class_name,
        date: first.date,
        quizzes_count: subs.length,
        average_score_20: avg,
        submissions: subs
      });
    });

    return result.sort((a, b) => b.date.localeCompare(a.date));
  },

  getStudentDailyGrades(studentId: string): DailyGrade[] {
    this.checkAndApplyExpiredQuizzes();
    const studentExists = (state.students || []).some(s => s.id === studentId);
    if (!studentExists && (state.students || []).length > 0) return [];
    const submissions = (state.quizSubmissions || []).filter(s => s.student_id === studentId);

    const groups: Record<string, QuizSubmission[]> = {};
    submissions.forEach(sub => {
      if (!groups[sub.date]) groups[sub.date] = [];
      groups[sub.date].push(sub);
    });

    const result: DailyGrade[] = [];
    Object.keys(groups).forEach(date => {
      const grouped = groups[date];
      const bestByQuiz = new Map<string, QuizSubmission>();
      grouped.forEach(sub => {
        if (sub.is_counted === false) return;
        const current = bestByQuiz.get(sub.quiz_id);
        if (!current || sub.score_20 > current.score_20 || (sub.score_20 === current.score_20 && (sub.attempt_number || 1) > (current.attempt_number || 1))) bestByQuiz.set(sub.quiz_id, sub);
      });
      const subs = [...bestByQuiz.values()];
      if (subs.length === 0) return;
      const first = subs[0];
      const totalScore = subs.reduce((acc, curr) => acc + curr.score, 0);
      const totalPossible = subs.reduce((acc, curr) => acc + curr.max_score, 0);
      const avg = totalPossible > 0 ? Number(((totalScore / totalPossible) * 20).toFixed(2)) : 0;

      result.push({
        student_id: studentId,
        student_name: first.student_name,
        student_number: first.student_number,
        class_id: first.class_id,
        class_name: first.class_name,
        date,
        quizzes_count: subs.length,
        average_score_20: avg,
        submissions: subs
      });
    });

    return result.sort((a, b) => b.date.localeCompare(a.date));
  }
};
