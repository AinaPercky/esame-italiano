const assert = require('assert');
const { memoryStore } = require('../src/services/store');
const classes = require('../src/controllers/classesController');
const students = require('../src/controllers/studentsController');
const enrollments = require('../src/controllers/enrollmentsController');

const clone = value => JSON.parse(JSON.stringify(value));
const original = {
  classes: clone(memoryStore.classes),
  students: clone(memoryStore.students),
  enrollments: clone(memoryStore.enrollments || []),
  enrollmentRequests: clone(memoryStore.enrollmentRequests || [])
};

const call = async (handler, req = {}) => {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await handler({ params: {}, query: {}, body: {}, user: { id: 'teacher-demo-id', email: 'prof@scuola.it' }, ...req }, res);
  return result;
};

(async () => {
  try {
    // Existing student can have a second active class enrollment without changing the first one.
    const added = await call(enrollments.enrollStudent, { params: { classId: 'c2' }, body: { student_id: 's1' } });
    assert.strictEqual(added.statusCode, 201);
    assert.ok(memoryStore.enrollments.some(e => e.student_id === 's1' && e.class_id === 'c1' && e.status === 'active'));
    assert.ok(memoryStore.enrollments.some(e => e.student_id === 's1' && e.class_id === 'c2' && e.status === 'active'));

    // A class roster includes students through any active enrollment, not only students.class_id.
    const roster = await call(students.getStudents, { query: { class_id: 'c2' } });
    assert.strictEqual(roster.statusCode, 200);
    assert.ok(roster.body.some(s => s.id === 's1'));
    assert.ok(roster.body.some(s => s.id === 's7'));

    // Expelling the student from c2 leaves the c1 enrollment untouched.
    const membership = memoryStore.enrollments.find(e => e.student_id === 's1' && e.class_id === 'c2');
    const expelled = await call(enrollments.updateEnrollmentStatus, {
      params: { enrollmentId: membership.id },
      body: { status: 'expelled', end_reason: 'Test' }
    });
    assert.strictEqual(expelled.statusCode, 200);
    assert.ok(memoryStore.enrollments.some(e => e.student_id === 's1' && e.class_id === 'c1' && e.status === 'active'));
    assert.ok(memoryStore.enrollments.some(e => e.student_id === 's1' && e.class_id === 'c2' && e.status === 'expelled'));

    // Archiving a class is non-destructive and hides it from self-service class discovery.
    const archived = await call(classes.deleteClass, { params: { id: 'c1' } });
    assert.strictEqual(archived.statusCode, 200);
    assert.ok(memoryStore.students.some(s => s.id === 's1'));
    assert.ok(memoryStore.enrollments.some(e => e.student_id === 's1' && e.class_id === 'c1'));
    const available = await call(enrollments.listAvailableClasses);
    assert.ok(!available.body.some(c => c.id === 'c1'));

    // Class creation keeps free-form names and supports both enrollment modes without adding a level/type.
    const created = await call(classes.createClass, { body: { name: 'Rattrapage grammaire', enrollment_mode: 'direct' } });
    assert.strictEqual(created.statusCode, 201);
    assert.strictEqual(created.body.enrollment_mode, 'direct');
    assert.ok(!Object.prototype.hasOwnProperty.call(created.body, 'level'));
    assert.ok(!Object.prototype.hasOwnProperty.call(created.body, 'class_type'));

    console.log('[SUCCÈS] Tests des inscriptions multiples, expulsions indépendantes et archivage non destructif.');
  } catch (error) {
    console.error('[ÉCHEC] Tests des inscriptions multiples:', error);
    process.exitCode = 1;
  } finally {
    memoryStore.classes = original.classes;
    memoryStore.students = original.students;
    memoryStore.enrollments = original.enrollments;
    memoryStore.enrollmentRequests = original.enrollmentRequests;
  }
})();
