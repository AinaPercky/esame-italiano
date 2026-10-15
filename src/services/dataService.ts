import { 
  ClassRoom, 
  Student, 
  Exam, 
  ExamRubric, 
  Evaluation, 
  PassOrderItem, 
  ExamStatistics,
  Quiz,
  QuizQuestion,
  QuizSubmission,
  DailyGrade
} from '../types';
import { 
  SEED_CLASSES, 
  SEED_STUDENTS, 
  SEED_EXAMS, 
  SEED_RUBRICS, 
  SEED_EVALUATIONS, 
  SEED_PASS_ORDER,
  SEED_QUIZZES,
  SEED_QUIZ_SUBMISSIONS,
  ZEBU_DEFAULT_RUBRICS 
} from '../data/seedData';
import { supabaseService, generateUUID, isUUID } from './supabaseService';
import { authService } from './authService';
import { isValidEmail, normalizeEmail } from '../utils/email';
import { normalizeFirstName, normalizeLastName } from '../utils/personName';

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
  // Keep quiz submissions even when the student's roster entry is missing or not synced.
  const validSubmissions = (appState.quizSubmissions || [])
    .filter(submission => !legacyStudentIds.has(submission.student_id));

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
  return sanitizeState({
    classes: [...SEED_CLASSES],
    students: [...SEED_STUDENTS],
    exams: [...SEED_EXAMS],
    rubrics: [...SEED_RUBRICS],
    evaluations: [...SEED_EVALUATIONS],
    passOrder: [...SEED_PASS_ORDER],
    quizzes: [...SEED_QUIZZES],
    quizSubmissions: [...SEED_QUIZ_SUBMISSIONS]
  });
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
    if (!supabaseService.isConfigured()) return false;
    try {
      const res = await supabaseService.importFromSupabase();
      if (!res.success) {
        console.warn('Initial cloud import failed:', res.message);
        return false;
      }
      if (res.success && res.state) {
        if (res.state.classes.length > 0 || res.state.exams.length > 0) {
          const localState = this.getRawState();
          const cloudQuizzes = res.state.quizzes || [];
          const cloudSubmissions = res.state.quizSubmissions || [];
          const cloudStudentIds = new Set(res.state.students.map(student => student.id));
          const missingQuizzes = localState.quizzes.filter(
            localQuiz => !cloudQuizzes.some(cloudQuiz => cloudQuiz.id === localQuiz.id)
          );
          const missingSubmissions = localState.quizSubmissions.filter(localSubmission =>
            cloudStudentIds.has(localSubmission.student_id) &&
            !cloudSubmissions.some(cloudSubmission => {
              return cloudSubmission.quiz_id === localSubmission.quiz_id &&
                cloudSubmission.student_id === localSubmission.student_id;
            })
          );

          await supabaseService.syncQuizData(missingQuizzes, missingSubmissions);
          this.setImportedState({
            ...res.state,
            quizzes: [...cloudQuizzes, ...missingQuizzes],
            quizSubmissions: [...cloudSubmissions, ...missingSubmissions]
          });
          authService.synchronizeStudentAccountsWithRoster(res.state.students, res.state.classes);
          return true;
        } else {
          // Si Supabase est vierge, envoyer l'état initial
          const syncResult = await supabaseService.syncLocalToSupabase(this.getRawState());
          if (!syncResult.success) throw new Error(syncResult.message);
          return true;
        }
      }
    } catch (e) {
      console.warn('Initial cloud sync error:', e);
    }
    return false;
  },

  // Reset demo
  resetToDefault() {
    state = {
      classes: [...SEED_CLASSES],
      students: [...SEED_STUDENTS],
      exams: [...SEED_EXAMS],
      rubrics: [...SEED_RUBRICS],
      evaluations: [...SEED_EVALUATIONS],
      passOrder: [...SEED_PASS_ORDER],
      quizzes: [...SEED_QUIZZES],
      quizSubmissions: [...SEED_QUIZ_SUBMISSIONS]
    };
    persistState();
    notifySubscribers();

    // Synchroniser la réinitialisation sur Supabase si connecté
    if (supabaseService.isConfigured()) {
      supabaseService.syncLocalToSupabase(this.getRawState()).catch(console.error);
    }
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
      submission.class_id !== id && !classQuizIds.has(submission.quiz_id)
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
    avatarUrl?: string | null
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
    const updatedStudent: Student = {
      ...state.students[idx],
      validation_status: status,
      updated_at: new Date().toISOString()
    };
    await supabaseService.saveStudent(updatedStudent);
    state.students[idx] = updatedStudent;
    persistState();
    notifySubscribers();
    return updatedStudent;
  },

  deleteStudent(id: string) {
    state.students = state.students.filter(s => s.id !== id);
    state.evaluations = state.evaluations.filter(e => e.student_id !== id);
    state.passOrder = state.passOrder.filter(po => po.student_id !== id);
    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.deleteStudent(id).catch(err => console.error('Cloud deleteStudent error:', err));
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

  createExam(title: string, classId: string, description: string = '', examDate?: string, useZebuTemplate = true): Exam {
    if (!title.trim() || !classId) throw new Error('Titre et classe obligatoires');
    const newExamId = generateUUID();
    const newExam: Exam = {
      id: newExamId,
      class_id: classId,
      title: title.trim(),
      description: description.trim(),
      exam_date: examDate || new Date().toISOString().split('T')[0],
      status: 'in_progress',
      created_at: new Date().toISOString()
    };
    state.exams.push(newExam);

    let templateRubrics: ExamRubric[] = [];
    if (useZebuTemplate) {
      templateRubrics = ZEBU_DEFAULT_RUBRICS.map((r, idx) => ({
        id: generateUUID(),
        exam_id: newExamId,
        ...r
      }));
      state.rubrics.push(...templateRubrics);
    }

    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.saveExam(newExam, templateRubrics).catch(err => console.error('Cloud createExam error:', err));

    return this.getExamById(newExamId)!;
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

  updateExamRubrics(examId: string, rubrics: Array<Omit<ExamRubric, 'id' | 'exam_id'>>) {
    state.rubrics = state.rubrics.filter(r => r.exam_id !== examId);
    const newRubrics: ExamRubric[] = rubrics.map((r, idx) => ({
      id: generateUUID(),
      exam_id: examId,
      ...r,
      position: idx + 1
    }));
    state.rubrics.push(...newRubrics);
    persistState();
    notifySubscribers();

    // Persistance Cloud Supabase
    supabaseService.saveRubrics(newRubrics).catch(err => console.error('Cloud updateExamRubrics error:', err));
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
    errorNotesMap?: Record<string, string>,
    presentedAnimal?: string
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
    const animal = presentedAnimal !== undefined 
      ? presentedAnimal.trim() 
      : (existingIndex !== -1 ? state.evaluations[existingIndex].presented_animal : undefined);

    let savedEval: Evaluation;

    if (existingIndex !== -1) {
      const currentId = state.evaluations[existingIndex].id;
      savedEval = {
        ...state.evaluations[existingIndex],
        id: isUUID(currentId) ? currentId : generateUUID(),
        total_score: totalScore,
        status: 'completed',
        details,
        presented_animal: animal,
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
        presented_animal: animal,
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
    let q = (state.quizzes || []).find(x => 
      (x.public_id === clean || x.id === clean) || (clean && x.public_id?.includes(clean))
    );
    if (!q && (state.quizzes || []).length > 0) {
      // Pick the first quiz as public fallback
      q = { ...(state.quizzes || [])[0], is_public: true };
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
    class_id: string;
    class_ids?: string[];
    duration_minutes: number;
    questions: QuizQuestion[];
    is_public?: boolean;
  }): Quiz {
    const totalPoints = (data.questions || []).reduce((acc, curr) => acc + (Number(curr.points) || 0), 0) || 20;
    const cls = state.classes.find(c => c.id === data.class_id);

    // Handle class_ids for backward compatibility
    const finalClassIds = data.class_ids || [data.class_id];

    const newQuiz: Quiz = {
      id: generateUUID(),
      public_id: data.is_public ? generateUUID() : undefined,
      is_public: data.is_public ?? false,
      title: data.title.trim(),
      description: data.description?.trim(),
      class_id: data.class_id, // Keep for backward compatibility (first class)
      class_ids: finalClassIds,
      class_name: cls ? cls.name : 'Classe',
      created_at: new Date().toISOString(),
      duration_minutes: Number(data.duration_minutes) || 10,
      status: 'draft',
      questions: data.questions,
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

    const totalPoints = updates.questions
      ? updates.questions.reduce((acc, curr) => acc + (Number(curr.points) || 0), 0)
      : state.quizzes[idx].total_points;

    state.quizzes[idx] = {
      ...state.quizzes[idx],
      ...updates,
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
   * Le professeur lance le début du quiz pour la classe :
   * - Tous les élèves de la classe peuvent alors commencer.
   * - Fenêtre de disponibilité stricte d'1 heure (60 minutes).
   */
  launchQuiz(id: string): Quiz {
    const idx = (state.quizzes || []).findIndex(q => q.id === id);
    if (idx === -1) throw new Error('Quiz introuvable');

    // Remove any automatic zero submissions from a previous expiration so students can attempt again
    if (state.quizSubmissions) {
      state.quizSubmissions = state.quizSubmissions.filter(sub => !(sub.quiz_id === id && sub.status === 'missed'));
    }

    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000); // 1 heure exacte

    state.quizzes[idx] = {
      ...state.quizzes[idx],
      status: 'launched',
      launched_at: now.toISOString(),
      expires_at: oneHourLater.toISOString()
    };

    supabaseService.saveQuiz(state.quizzes[idx]).catch(err => console.error('Cloud launchQuiz error:', err));
    persistState();
    notifySubscribers();
    return state.quizzes[idx];
  },

  closeQuiz(id: string): Quiz {
    const idx = (state.quizzes || []).findIndex(q => q.id === id);
    if (idx === -1) throw new Error('Quiz introuvable');

    state.quizzes[idx] = {
      ...state.quizzes[idx],
      status: 'closed'
    };
    supabaseService.saveQuiz(state.quizzes[idx]).catch(err => console.error('Cloud closeQuiz error:', err));

    // Attribution automatique du 0/20 pour tous les élèves qui n'ont pas composé
    this.applyZeroForMissedStudents(state.quizzes[idx]);

    persistState();
    notifySubscribers();
    return state.quizzes[idx];
  },

  /**
   * Règle stricte :
   * Le quiz disparaît 1 heure après le lancement.
   * Si l'élève ne fait pas le quiz dans ce délai, alors sa note sera de zéro !
   */
  checkAndApplyExpiredQuizzes(): void {
    if (!state.quizzes) return;
    const now = Date.now();
    let hasChanged = false;

    state.quizzes.forEach(q => {
      if (q.status === 'launched' && q.expires_at) {
        const expireTime = new Date(q.expires_at).getTime();
        if (now >= expireTime) {
          // L'heure est écoulée : fermeture et attribution de 0 pour les retardataires
          q.status = 'closed';
          supabaseService.saveQuiz(q).catch(err => console.error('Cloud expireQuiz error:', err));
          this.applyZeroForMissedStudents(q);
          hasChanged = true;
        }
      }
    });

    if (hasChanged) {
      persistState();
      notifySubscribers();
    }
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
        // L'élève n'a pas composé dans l'heure : attribution automatique de la note 0 / 20
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
  submitQuiz(
    quizId: string,
    studentId: string,
    studentName: string,
    studentNumber: string | null | undefined,
    classId: string,
    answers: Record<string, string>,
    isTimeout = false
  ): QuizSubmission {
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

    if (existingIdx !== -1) {
      throw new Error("Vous avez déjà soumis ce quiz et il est définitivement verrouillé.");
    }

    let rawScore = 0;
    const feedback: Record<string, { correct: boolean; points: number; expected: string; studentAnswer: string }> = {};

    quiz.questions.forEach(q => {
      const studentAns = (answers[q.id] || '').trim();
      const expectedAns = (q.correct_answer || '').trim();
      let isCorrect = false;

      if (q.type === 'qcm') {
        isCorrect = studentAns.toLowerCase() === expectedAns.toLowerCase();
      } else {
        // Question texte saisie : comparaison tolérante (insensible à la casse, accents retirés)
        const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const normStudent = normalize(studentAns);
        const normExpected = normalize(expectedAns);
        isCorrect = normStudent === normExpected || normStudent.includes(normExpected) || normExpected.includes(normStudent);
      }

      const awarded = isCorrect ? (Number(q.points) || 1) : 0;
      rawScore += awarded;
      feedback[q.id] = {
        correct: isCorrect,
        points: awarded,
        expected: expectedAns,
        studentAnswer: studentAns
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
      date: today
    };

    if (existingIdx !== -1) {
      state.quizSubmissions[existingIdx] = submission;
    } else {
      state.quizSubmissions.unshift(submission);
    }

    supabaseService.saveQuizSubmission(submission)
      .catch(err => console.error('Cloud submitQuiz error:', err));
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
    const cleanId = (studentId || '').toLowerCase();

    return (state.quizSubmissions || []).filter(s => {
      const sId = (s.student_id || '').toLowerCase();
      if (classId && s.class_id !== classId) return false;
      return Boolean(cleanId && sId === cleanId);
    });
  },

  /**
   * Calcule la note journalière en pondérant chaque quiz selon son barème.
   */
  getDailyGrades(classId?: string, targetDate?: string): DailyGrade[] {
    this.checkAndApplyExpiredQuizzes();
    let submissions = state.quizSubmissions || [];

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
      const subs = groups[key];
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
    const submissions = (state.quizSubmissions || []).filter(s => s.student_id === studentId);

    const groups: Record<string, QuizSubmission[]> = {};
    submissions.forEach(sub => {
      if (!groups[sub.date]) groups[sub.date] = [];
      groups[sub.date].push(sub);
    });

    const result: DailyGrade[] = [];
    Object.keys(groups).forEach(date => {
      const subs = groups[date];
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
