const assert = require('assert');
const { isConfigured } = require('../src/config/supabase');
const { memoryStore } = require('../src/services/store');

if (isConfigured) {
  console.log('[IGNORÉ] Tests HTTP en mémoire : Supabase est configuré dans cet environnement.');
  process.exit(0);
}

const app = require('../src/app');
const original = {
  classes: JSON.parse(JSON.stringify(memoryStore.classes)),
  students: JSON.parse(JSON.stringify(memoryStore.students)),
  enrollments: JSON.parse(JSON.stringify(memoryStore.enrollments || [])),
  requests: JSON.parse(JSON.stringify(memoryStore.enrollmentRequests || []))
};

(async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}/api`;
    const request = (path, options = {}) => fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });

    // HTTP end-to-end: class creation, adding an existing student, roster visibility, independent expulsion.
    let response = await request('/classes', {
      method: 'POST', body: JSON.stringify({ name: 'Test multi-inscriptions', enrollment_mode: 'direct' })
    });
    assert.strictEqual(response.status, 201);
    const createdClass = await response.json();

    response = await request(`/classes/${createdClass.id}/enrollments`, {
      method: 'POST', body: JSON.stringify({ student_id: 's1' })
    });
    assert.strictEqual(response.status, 201);
    const enrollment = await response.json();

    response = await request(`/students?class_id=${createdClass.id}`);
    assert.strictEqual(response.status, 200);
    const roster = await response.json();
    assert.ok(roster.some(student => student.id === 's1'));

    response = await request(`/enrollments/${enrollment.id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: 'expelled', end_reason: 'Integration test' })
    });
    assert.strictEqual(response.status, 200);
    response = await request(`/students?class_id=${createdClass.id}`);
    assert.strictEqual(response.status, 200);
    const afterExpulsion = await response.json();
    assert.ok(!afterExpulsion.some(student => student.id === 's1'));

    // An archived class cannot accept a new enrollment, but its history and student are retained.
    response = await request(`/classes/${createdClass.id}`, { method: 'DELETE' });
    assert.strictEqual(response.status, 200);
    response = await request(`/classes/${createdClass.id}/enrollments`, {
      method: 'POST', body: JSON.stringify({ student_id: 's2' })
    });
    assert.strictEqual(response.status, 404);
    assert.ok(memoryStore.students.some(student => student.id === 's1'));

    // Browser CORS preflight must explicitly allow PATCH.
    response = await fetch(`${base}/enrollments/test/status`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.test', 'Access-Control-Request-Method': 'PATCH' }
    });
    assert.strictEqual(response.status, 204);
    assert.ok(response.headers.get('access-control-allow-methods').includes('PATCH'));

    console.log('[SUCCÈS] Tests HTTP : création, affectation, liste, expulsion, archivage, blocage des classes archivées et CORS PATCH.');
  } catch (error) {
    console.error('[ÉCHEC] Tests HTTP multi-classes :', error);
    process.exitCode = 1;
  } finally {
    server.close();
    memoryStore.classes = original.classes;
    memoryStore.students = original.students;
    memoryStore.enrollments = original.enrollments;
    memoryStore.enrollmentRequests = original.requests;
  }
})();
