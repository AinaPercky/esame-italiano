/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { ClassesView } from './views/ClassesView';
import { StudentsView } from './views/StudentsView';
import { ExamsView } from './views/ExamsView';
import { OralEvaluationView } from './views/OralEvaluationView';
import { PassOrderView } from './views/PassOrderView';
import { ResultsView } from './views/ResultsView';
import { QRCodePortalView } from './views/QRCodePortalView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { StudentPublicReportView } from './views/StudentPublicReportView';
import { QuizzesAdminView } from './views/QuizzesAdminView';
import { StudentSpaceView } from './views/StudentSpaceView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { dataService } from './services/dataService';
import { authService, AuthUser } from './services/authService';
import { ClassRoom, Exam, Student, Evaluation } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => authService.getCurrentUser());
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isPublicMode, setIsPublicMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    return view === 'student' || view === 'student-portal' || view === 'portal';
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
    // Chargement des données (nécessaire aussi pour la vue publique étudiante)
    reloadData();

    const unsubscribe = dataService.subscribe(() => {
      reloadData();
    });

    dataService.initFromCloud().then(synced => {
      if (synced) {
        reloadData();
      }
    }).catch(err => {
      console.warn('Initial cloud sync notice:', err);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 1. Si l'élève a scanné le Code QR -> Afficher la Fiche Officielle en lecture seule
  const urlParams = new URLSearchParams(window.location.search);
  const studentViewExamId = urlParams.get('exam') || '';
  const studentViewStudentId = urlParams.get('student') || '';

  if (isPublicMode) {
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

  // 2. Si l'utilisateur n'est pas connecté -> Afficher la page de Login sécurisée
  if (!currentUser) {
    return <LoginView onLoginSuccess={() => setCurrentUser(authService.getCurrentUser())} />;
  }

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract (3 zones) */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onQuickEvaluate={() => handleQuickEvaluate(activeExamId || exams[0]?.id)}
        currentUser={currentUser}
        onLogout={handleLogout}
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
        />

        {/* Main Content Area */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 overflow-x-hidden pb-24 lg:pb-8">
          {currentTab === 'dashboard' && (
            <DashboardView
              exams={exams}
              classes={classes}
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
              onDeleteClass={(id) => {
                dataService.deleteClass(id);
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
