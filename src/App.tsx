/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { ClassesView } from './views/ClassesView';
import { StudentsView } from './views/StudentsView';
import { ExamsView } from './views/ExamsView';
import { WrittenExamsView } from './views/WrittenExamsView';
import { OralEvaluationView } from './views/OralEvaluationView';
import { PassOrderView } from './views/PassOrderView';
import { ResultsView } from './views/ResultsView';
import { QRCodePortalView } from './views/QRCodePortalView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { StudentPublicReportView } from './views/StudentPublicReportView';
import { QuizzesAdminView } from './views/QuizzesAdminView';
import { ExercisesAdminView } from './views/ExercisesAdminView';
import { PublicQuizView } from './views/PublicQuizView';
import { StudentSpaceView } from './views/StudentSpaceView';
import { LessonsAdminView } from './views/LessonsAdminView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { dataService } from './services/dataService';
import { authService, AuthUser } from './services/authService';
import { supabaseService } from './services/supabaseService';
import { ClassRoom, Exam, Student, Evaluation } from './types';

let initialCloudSyncPromise: Promise<boolean> | null = null;

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [initialDataReady, setInitialDataReady] = useState<boolean>(false);
  const [initialDataError, setInitialDataError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isPublicMode, setIsPublicMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    return view === 'student' || view === 'student-portal' || view === 'portal' || view === 'public-quiz';
  });

  // Public quiz state
  const [publicQuizId, setPublicQuizId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || null;
  });
  
  // App data state
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  // Navigation context state
  const [activeExamId, setActiveExamId] = useState<string | undefined>(undefined);
  const [activeStudentId, setActiveStudentId] = useState<string | undefined>(undefined);
  const [selectedClassIdForStudents, setSelectedClassIdForStudents] = useState<string | undefined>(undefined);

  const reloadData = () => {
    const loadedClasses = dataService.getClasses();
    const loadedExams = dataService.getExams();
    const loadedStudents = dataService.getStudents();
    const loadedEvaluations = dataService.getEvaluations();

    setClasses(loadedClasses);
    setExams(loadedExams);
    setStudents(loadedStudents);
    setEvaluations(loadedEvaluations);
  };

  useEffect(() => {
    // Abonnement aux changements d'authentification
    const unsubAuth = authService.subscribe(() => {
      setCurrentUser(authService.getCurrentUser());
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    // L'interface ne doit jamais démarrer sur des seeds ou un cache local.
    const unsubscribe = dataService.subscribe(() => {
      reloadData();
    });

    if (!initialCloudSyncPromise) initialCloudSyncPromise = dataService.initFromCloud();
    initialCloudSyncPromise.then(synced => {
      if (!synced) throw new Error('Les données Supabase n’ont pas été chargées.');
      reloadData();
    }).catch(err => {
      console.error('Initial Supabase sync failed:', err);
      setInitialDataError(err instanceof Error ? err.message : 'Connexion Supabase impossible.');
    }).finally(() => setInitialDataReady(true));

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!initialDataReady) return;

    const client = supabaseService.getClient();
    if (!client) {
      setSession(null);
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    let isMounted = true;
    let requestId = 0;

    const applySession = async (nextSession: Session | null) => {
      const currentRequestId = ++requestId;
      setSession(nextSession);

      if (!nextSession) {
        authService.clearCurrentUser();
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      try {
        const user = await authService.restoreFromSupabaseSession(nextSession);
        if (isMounted && currentRequestId === requestId) setCurrentUser(user);
      } catch (error) {
        console.error('Impossible de restaurer le profil de la session Supabase :', error);
        if (isMounted && currentRequestId === requestId) {
          setCurrentUser(null);
          setSession(null);
        }
        await client.auth.signOut().catch(signOutError => {
          console.error('Impossible de fermer la session Supabase invalide :', signOutError);
        });
      } finally {
        if (isMounted && currentRequestId === requestId) setAuthLoading(false);
      }
    };

    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'TOKEN_REFRESHED' && nextSession) {
        if (isMounted) setSession(nextSession);
        return;
      }
      if (!nextSession) {
        void applySession(null);
        return;
      }
      if (isMounted) {
        setSession(nextSession);
        setAuthLoading(true);
      }
      window.setTimeout(() => {
        if (isMounted) void applySession(nextSession);
      }, 0);
    });

    client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      return applySession(data.session);
    }).catch(error => {
      console.error('Impossible de récupérer la session Supabase au démarrage :', error);
      if (isMounted) {
        authService.clearCurrentUser();
        setSession(null);
        setCurrentUser(null);
        setAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initialDataReady]);

  // 1. Si l'élève a scanné le Code QR -> Afficher la Fiche Officielle en lecture seule
  const urlParams = new URLSearchParams(window.location.search);
  const studentViewExamId = urlParams.get('exam') || '';
  const studentViewStudentId = urlParams.get('student') || '';
  const publicQuizViewId = urlParams.get('id') || '';

  if (!initialDataReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="text-center text-slate-600">
          <p className="font-semibold">Connexion à Supabase…</p>
          <p className="mt-2 text-sm">Chargement des données de l’application.</p>
        </div>
      </div>
    );
  }

  if (initialDataError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Connexion Supabase requise</h1>
          <p className="mt-3 text-sm text-slate-600">{initialDataError}</p>
          <p className="mt-2 text-sm text-slate-600">Aucune donnée locale ou de démonstration ne sera affichée à la place de la base de données.</p>
          <button className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (isPublicMode) {
    // Public quiz view (with or without a specific quiz id)
    if (urlParams.get('view') === 'public-quiz') {
      return (
        <PublicQuizView
          quizId={publicQuizViewId || null}
          onBackToApp={() => {
            setIsPublicMode(false);
            window.history.replaceState({}, '', window.location.pathname);
          }}
        />
      );
    }

    // Student public report view (QR code scan)
    return (
      <StudentPublicReportView
        examId={studentViewExamId || undefined}
        studentId={studentViewStudentId || undefined}
        onBackToApp={() => {
          setIsPublicMode(false);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // Attendre la vérification de session avant de protéger les vues privées.
  if (authLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-slate-50 px-4 text-sm font-medium text-slate-600" role="status">
        Vérification de la session…
      </div>
    );
  }

  // La session Supabase est la source de vérité pour l'accès aux vues privées.
  if (!session) {
    return <LoginView onLoginSuccess={() => setCurrentUser(authService.getCurrentUser())} />;
  }

  if (!currentUser) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-slate-50 px-4 text-sm font-medium text-slate-600" role="status">
        Chargement du profil…
      </div>
    );
  }

  const handleLogout = async () => {
    setAuthLoading(true);
    await authService.logout();
    setSession(null);
    setCurrentUser(null);
    setAuthLoading(false);
  };

  // 3. Si l'utilisateur est un Étudiant -> Afficher son Espace Étudiant dédié
  if (currentUser.role === 'student') {
    return <StudentSpaceView currentUser={currentUser} onLogout={handleLogout} />;
  }

  // Handlers for switching views with preloaded state
  const handleQuickEvaluate = (examId?: string) => {
    if (examId) setActiveExamId(examId);
    setCurrentTab('evaluation');
  };

  const handleSelectExamForEvaluation = (examId: string) => {
    setActiveExamId(examId);
    setCurrentTab('evaluation');
  };

  const handleSelectPassOrder = (examId?: string) => {
    if (examId) setActiveExamId(examId);
    setCurrentTab('pass-order');
  };

  const handleEvaluateStudent = (examId: string, studentId: string) => {
    setActiveExamId(examId);
    setActiveStudentId(studentId);
    setCurrentTab('evaluation');
  };

  const handleViewStudentSheet = (studentId: string) => {
    setActiveStudentId(studentId);
    setCurrentTab('results');
  };

  const handleSelectClassStudents = (classId: string) => {
    setSelectedClassIdForStudents(classId);
    setCurrentTab('students');
  };

  // Progression de la session actuelle synchronisée avec les élèves réels de la classe de l'examen
  const activeExam = exams.find(e => e.id === activeExamId) || exams[0];
  const sessionClass = activeExam ? classes.find(c => c.id === activeExam.class_id) : null;
  const sessionClassStudents = activeExam ? students.filter(s => s.class_id === activeExam.class_id) : students;
  const sessionEvaluations = activeExam 
    ? evaluations.filter(e => e.exam_id === activeExam.id && sessionClassStudents.some(s => s.id === e.student_id))
    : evaluations.filter(e => students.some(s => s.id === e.student_id));

  const totalStudents = sessionClassStudents.length;
  const evaluatedCount = Math.min(totalStudents, sessionEvaluations.length);
  const sessionLabel = activeExam ? `${activeExam.title} (${sessionClass?.name || 'Classe'})` : undefined;
  const pendingStudentsCount = students.filter(s => s.validation_status === 'pending').length;

  return (
    <div className="teacher-space min-h-screen flex flex-col text-slate-900">
      {/* Top Bar Contract (3 zones) */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onQuickEvaluate={() => handleQuickEvaluate(activeExamId || exams[0]?.id)}
        currentUser={currentUser}
        onLogout={handleLogout}
        pendingStudentsCount={pendingStudentsCount}
      />

      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto">
        {/* Sidebar Lateral Menu (8 Pages) */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setCurrentTab(tab);
            if (tab !== 'results') setActiveStudentId(undefined);
          }}
          stats={{
            evaluatedCount,
            totalStudents,
            sessionLabel
          }}
          currentUser={currentUser}
          onLogout={handleLogout}
          pendingStudentsCount={pendingStudentsCount}
        />

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 pb-24 sm:p-6 lg:p-8 lg:pb-8">
          {currentTab === 'dashboard' && (
            <DashboardView
              exams={exams}
              classes={classes}
              students={students}
              onRefresh={reloadData}
              onNavigateToEvaluation={handleQuickEvaluate}
              onNavigateToPassOrder={handleSelectPassOrder}
              onNavigateToResults={() => setCurrentTab('results')}
              onSelectTab={setCurrentTab}
            />
          )}

          {currentTab === 'quizzes' && (
            <QuizzesAdminView
              classes={classes}
              students={students}
              onRefresh={reloadData}
            />
          )}

          {currentTab === 'exercises' && <ExercisesAdminView classes={classes} />}

          {currentTab === 'lessons' && (
            <LessonsAdminView currentUser={currentUser} />
          )}

          {currentTab === 'classes' && (
            <ClassesView
              classes={classes}
              onCreateClass={(name) => {
                dataService.createClass(name);
                reloadData();
              }}
              onUpdateClass={(id, name) => {
                dataService.updateClass(id, name);
                reloadData();
              }}
              onDeleteClass={async (id) => {
                await dataService.deleteClass(id);
                reloadData();
              }}
              onSelectClassStudents={handleSelectClassStudents}
            />
          )}

          {currentTab === 'students' && (
            <StudentsView
              students={students}
              classes={classes}
              selectedClassId={selectedClassIdForStudents}
              onRefresh={reloadData}
              onViewStudentSheet={handleViewStudentSheet}
            />
          )}

          {currentTab === 'written-exams' && <WrittenExamsView classes={classes} />}

          {currentTab === 'exams' && (
            <ExamsView
              exams={exams}
              classes={classes}
              onRefresh={reloadData}
              onSelectExamForEvaluation={handleSelectExamForEvaluation}
              onSelectExamForPassOrder={handleSelectPassOrder}
            />
          )}

          {currentTab === 'evaluation' && (
            <OralEvaluationView
              classes={classes}
              exams={exams}
              students={students}
              initialExamId={activeExamId || exams[0]?.id}
              initialStudentId={activeStudentId}
              onEvaluationSaved={reloadData}
              onNavigateToPassOrder={(exId) => {
                setActiveExamId(exId);
                setCurrentTab('pass-order');
              }}
            />
          )}

          {currentTab === 'pass-order' && (
            <PassOrderView
              classes={classes}
              exams={exams}
              selectedExamId={activeExamId || exams[0]?.id}
              onEvaluateStudent={handleEvaluateStudent}
            />
          )}

          {currentTab === 'results' && (
            <ResultsView
              evaluations={evaluations}
              classes={classes}
              exams={exams}
              students={students}
              initialStudentSheetId={activeStudentId}
              onEditEvaluation={(exId, stId) => {
                handleEvaluateStudent(exId, stId);
              }}
              onCloseStudentSheetModal={() => setActiveStudentId(undefined)}
            />
          )}

          {currentTab === 'qrcode' && (
            <QRCodePortalView
              classes={classes}
              exams={exams}
              students={students}
              initialExamId={activeExamId || exams[0]?.id}
              initialStudentId={activeStudentId}
              onNavigateToEvaluation={handleEvaluateStudent}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              onResetData={reloadData}
              currentUser={currentUser}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Section Touch & Responsive) */}
      <MobileBottomNav currentTab={currentTab} onSelectTab={setCurrentTab} />
    </div>
  );
}
