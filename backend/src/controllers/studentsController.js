const { memoryStore, generateId } = require('../services/store');

exports.getStudents = async (req, res) => {
  try {
    const { class_id, search } = req.query;
    let list = [];
    if (req.supabase) {
      const [{ data: students, error: studentError }, { data: enrollments, error: enrollmentError }, { data: classes, error: classError }] = await Promise.all([
        req.supabase.from('students').select('*').order('created_at', { ascending: false }),
        req.supabase.from('class_enrollments').select('student_id,class_id,status').eq('status', 'active'),
        req.supabase.from('classes').select('id,name')
      ]);
      if (studentError) throw studentError;
      if (enrollmentError) throw enrollmentError;
      if (classError) throw classError;
      const classIdsByStudent = new Map();
      (enrollments || []).forEach(row => {
        const ids = classIdsByStudent.get(row.student_id) || [];
        if (!ids.includes(row.class_id)) ids.push(row.class_id);
        classIdsByStudent.set(row.student_id, ids);
      });
      const classNames = new Map((classes || []).map(c => [c.id, c.name]));
      list = (students || []).map(student => ({
        ...student,
        class_ids: classIdsByStudent.get(student.id) || [],
        class_name: classNames.get(student.class_id) || 'Inconnue'
      }));
    } else {
      list = memoryStore.students.map(student => {
        const memberships = (memoryStore.enrollments || []).filter(e => e.student_id === student.id && e.status === 'active').map(e => e.class_id);
        const cls = memoryStore.classes.find(c => c.id === student.class_id);
        return { ...student, class_ids: memberships, class_name: cls ? cls.name : 'Inconnue' };
      });
    }
    if (class_id) list = list.filter(student => student.class_ids.includes(class_id));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.first_name.toLowerCase().includes(q) || s.last_name.toLowerCase().includes(q) ||
        (s.student_number && s.student_number.toLowerCase().includes(q)));
    }
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.supabase) {
      const { data: student, error } = await req.supabase.from('students').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!student) return res.status(404).json({ error: 'Élève introuvable' });
      const [{ data: enrollments, error: enrollmentError }, { data: evaluations, error: evaluationError }, { data: classes, error: classError }] = await Promise.all([
        req.supabase.from('class_enrollments').select('class_id,status').eq('student_id', id),
        req.supabase.from('evaluations').select('*').eq('student_id', id),
        req.supabase.from('classes').select('id,name')
      ]);
      if (enrollmentError) throw enrollmentError;
      if (evaluationError) throw evaluationError;
      if (classError) throw classError;
      const classNames = new Map((classes || []).map(c => [c.id, c.name]));
      const classIds = (enrollments || []).filter(e => e.status === 'active').map(e => e.class_id);
      return res.json({ ...student, class_ids: classIds, class_name: classNames.get(student.class_id) || 'Inconnue', enrollments: enrollments || [], evaluations: evaluations || [] });
    }
    const student = memoryStore.students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    const cls = memoryStore.classes.find(c => c.id === student.class_id);
    const evaluations = memoryStore.evaluations.filter(e => e.student_id === id);
    const enrollments = (memoryStore.enrollments || []).filter(e => e.student_id === id);
    const classIds = enrollments.filter(e => e.status === 'active').map(e => e.class_id);
    return res.json({ ...student, class_ids: classIds, class_name: cls ? cls.name : 'Inconnue', enrollments, evaluations });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const { first_name, last_name, class_id, student_number } = req.body;
    if (!first_name || !last_name || !class_id) return res.status(400).json({ error: 'Prénom, nom et classe sont obligatoires' });
    if (req.supabase) {
      const { data, error } = await req.supabase.from('students').insert({
        first_name: first_name.trim(), last_name: last_name.trim(), class_id,
        student_number: student_number ? student_number.trim() : null
      }).select('*').single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    const cls = memoryStore.classes.find(c => c.id === class_id);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
    const newStudent = { id: generateId(), first_name: first_name.trim(), last_name: last_name.trim(), class_id,
      class_ids: [class_id], student_number: student_number ? student_number.trim() : null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    memoryStore.students.push(newStudent);
    memoryStore.enrollments ||= [];
    memoryStore.enrollments.push({ id: generateId(), student_id: newStudent.id, class_id, status: 'active', source: 'legacy', started_at: newStudent.created_at, ended_at: null });
    return res.status(201).json(newStudent);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, class_id, student_number } = req.body;
    if (req.supabase) {
      const updates = { updated_at: new Date().toISOString() };
      if (first_name) updates.first_name = first_name.trim();
      if (last_name) updates.last_name = last_name.trim();
      if (class_id) updates.class_id = class_id;
      if (student_number !== undefined) updates.student_number = student_number ? student_number.trim() : null;
      const { data, error } = await req.supabase.from('students').update(updates).eq('id', id).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Élève introuvable' });
      return res.json(data);
    }
    const index = memoryStore.students.findIndex(s => s.id === id);
    if (index === -1) return res.status(404).json({ error: 'Élève introuvable' });
    if (first_name) memoryStore.students[index].first_name = first_name.trim();
    if (last_name) memoryStore.students[index].last_name = last_name.trim();
    if (class_id && class_id !== memoryStore.students[index].class_id) {
      memoryStore.students[index].class_id = class_id;
      memoryStore.enrollments ||= [];
      const exists = memoryStore.enrollments.some(e => e.student_id === id && e.class_id === class_id && ['active', 'suspended'].includes(e.status));
      if (!exists) memoryStore.enrollments.push({ id: generateId(), student_id: id, class_id, status: 'active', source: 'admin', started_at: new Date().toISOString(), ended_at: null });
    }
    if (student_number !== undefined) memoryStore.students[index].student_number = student_number ? student_number.trim() : null;
    memoryStore.students[index].updated_at = new Date().toISOString();
    return res.json(memoryStore.students[index]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.supabase) {
      const { error } = await req.supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      return res.json({ message: 'Élève supprimé avec succès' });
    }
    const index = memoryStore.students.findIndex(s => s.id === id);
    if (index === -1) return res.status(404).json({ error: 'Élève introuvable' });
    memoryStore.students.splice(index, 1);
    return res.json({ message: 'Élève supprimé avec succès' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.importStudents = async (req, res) => {
  try {
    const { students: rawItems, default_class_id } = req.body;
    if (!Array.isArray(rawItems) || rawItems.length === 0) return res.status(400).json({ error: 'Format invalide. Liste d’élèves attendue.' });
    const imported = [], duplicates = [], errors = [];
    rawItems.forEach((item, idx) => {
      const lineNum = idx + 1;
      const firstName = (item.prenom || item.first_name || '').trim();
      const lastName = (item.nom || item.last_name || '').trim();
      const studentNum = (item.numero || item.student_number || item.id || '').trim();
      const classId = item.class_id || default_class_id;
      if (!firstName || !lastName || !classId) { errors.push({ line: lineNum, reason: 'Nom, prénom ou classe manquant', data: item }); return; }
      const duplicate = memoryStore.students.some(s => (s.class_ids || [s.class_id]).includes(classId) && s.first_name.toLowerCase() === firstName.toLowerCase() && s.last_name.toLowerCase() === lastName.toLowerCase());
      if (duplicate) { duplicates.push({ line: lineNum, student: `${firstName} ${lastName}` }); return; }
      const newStudent = { id: generateId(), class_id: classId, class_ids: [classId], first_name: firstName, last_name: lastName, student_number: studentNum || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStore.students.push(newStudent);
      memoryStore.enrollments ||= [];
      memoryStore.enrollments.push({ id: generateId(), student_id: newStudent.id, class_id: classId, status: 'active', source: 'legacy', started_at: newStudent.created_at, ended_at: null });
      imported.push(newStudent);
    });
    return res.status(200).json({ success: true, summary: { total_submitted: rawItems.length, imported_count: imported.length, duplicates_count: duplicates.length, errors_count: errors.length }, imported, duplicates, errors });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
