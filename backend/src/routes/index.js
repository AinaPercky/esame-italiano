const express = require('express');
const router = express.Router();

const classesCtrl = require('../controllers/classesController');
const studentsCtrl = require('../controllers/studentsController');
const examsCtrl = require('../controllers/examsController');
const evaluationsCtrl = require('../controllers/evaluationsController');
const passOrderCtrl = require('../controllers/passOrderController');
const statsCtrl = require('../controllers/statisticsController');
const enrollmentsCtrl = require('../controllers/enrollmentsController');
const { requireAuth } = require('../middlewares/auth');

// Middleware global d'authentification pour les routes protégées
router.use(requireAuth);

// -----------------------------------------------------------------------------
// Routes : Classes
// -----------------------------------------------------------------------------
router.get('/classes', classesCtrl.getClasses);
router.post('/classes', classesCtrl.createClass);
router.get('/classes/:id', classesCtrl.getClassById);
router.put('/classes/:id', classesCtrl.updateClass);
router.delete('/classes/:id', classesCtrl.deleteClass);
router.get('/classes/available', enrollmentsCtrl.listAvailableClasses);
router.get('/classes/:classId/enrollments', enrollmentsCtrl.listAllEnrollments);
router.post('/classes/:classId/enrollments', enrollmentsCtrl.enrollStudent);
router.post('/classes/:classId/enrollment-requests', enrollmentsCtrl.requestEnrollment);
router.get('/students/me/enrollments', enrollmentsCtrl.listMyEnrollments);
router.get('/students/me/enrollment-requests', enrollmentsCtrl.listMyRequests);
router.get('/enrollments', enrollmentsCtrl.listAllEnrollments);
router.patch('/enrollments/:enrollmentId/status', enrollmentsCtrl.updateEnrollmentStatus);
router.get('/enrollment-requests', enrollmentsCtrl.listAllRequests);
router.post('/enrollment-requests/:requestId/review', enrollmentsCtrl.reviewRequest);

// -----------------------------------------------------------------------------
// Routes : Élèves (Students)
// -----------------------------------------------------------------------------
router.get('/students', studentsCtrl.getStudents);
router.post('/students', studentsCtrl.createStudent);
router.post('/students/import', studentsCtrl.importStudents);
router.get('/students/:id', studentsCtrl.getStudentById);
router.put('/students/:id', studentsCtrl.updateStudent);
router.delete('/students/:id', studentsCtrl.deleteStudent);
router.get('/students/:id/evaluations', evaluationsCtrl.getStudentEvaluations);

// -----------------------------------------------------------------------------
// Routes : Examens (Exams)
// -----------------------------------------------------------------------------
router.get('/exams', examsCtrl.getExams);
router.post('/exams', examsCtrl.createExam);
router.get('/exams/:id', examsCtrl.getExamById);
router.put('/exams/:id', examsCtrl.updateExam);
router.delete('/exams/:id', examsCtrl.deleteExam);

// -----------------------------------------------------------------------------
// Routes : Rubriques (Rubrics)
// -----------------------------------------------------------------------------
router.get('/exams/:id/rubrics', examsCtrl.getExamRubrics);
router.post('/exams/:id/rubrics', examsCtrl.addExamRubric);
router.put('/rubrics/:id', examsCtrl.updateRubric);
router.delete('/rubrics/:id', examsCtrl.deleteRubric);

// -----------------------------------------------------------------------------
// Routes : Évaluations (Evaluations)
// -----------------------------------------------------------------------------
router.get('/evaluations', evaluationsCtrl.getEvaluations);
router.post('/evaluations', evaluationsCtrl.saveEvaluation);
router.get('/evaluations/:id', evaluationsCtrl.getEvaluationById);
router.put('/evaluations/:id', evaluationsCtrl.saveEvaluation);
router.delete('/evaluations/:id', evaluationsCtrl.deleteEvaluation);

// -----------------------------------------------------------------------------
// Routes : Ordre de passage (Pass Order)
// -----------------------------------------------------------------------------
router.get('/exams/:id/pass-order', passOrderCtrl.getPassOrder);
router.post('/exams/:id/pass-order/randomize', passOrderCtrl.randomizePassOrder);
router.put('/exams/:id/pass-order', passOrderCtrl.updatePassOrderStatus);

// -----------------------------------------------------------------------------
// Routes : Statistiques (Statistics)
// -----------------------------------------------------------------------------
router.get('/exams/:id/statistics', statsCtrl.getExamStatistics);
router.get('/classes/:id/statistics', statsCtrl.getClassStatistics);

module.exports = router;
