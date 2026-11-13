const { memoryStore, generateId } = require('../services/store');

const normalizeMode = value => value === 'direct' ? 'direct' : 'approval';

exports.getClasses = async (req, res) => {
  try {
    if (req.supabase) {
      const [{ data: classes, error: classError }, { data: memberships, error: membershipError }] = await Promise.all([
        req.supabase.from('classes').select('*').order('created_at', { ascending: false }),
        req.supabase.from('class_enrollments').select('class_id').eq('status', 'active')
      ]);
      if (classError) throw classError;
      if (membershipError) throw membershipError;
      const counts = new Map();
      (memberships || []).forEach(row => counts.set(row.class_id, (counts.get(row.class_id) || 0) + 1));
      const examsResult = await req.supabase.from('exams').select('class_id');
      if (examsResult.error) throw examsResult.error;
      const examCounts = new Map();
      (examsResult.data || []).forEach(row => examCounts.set(row.class_id, (examCounts.get(row.class_id) || 0) + 1));
      return res.json((classes || []).map(cls => ({
        ...cls, enrollment_mode: normalizeMode(cls.enrollment_mode),
        student_count: counts.get(cls.id) || 0, exam_count: examCounts.get(cls.id) || 0
      })));
    }
    const classesWithCounts = memoryStore.classes.map(c => {
      const enrolled = memoryStore.enrollments || [];
      const studentCount = enrolled.length
        ? enrolled.filter(e => e.class_id === c.id && e.status === 'active').length
        : memoryStore.students.filter(s => s.class_id === c.id).length;
      const examCount = memoryStore.exams.filter(e => e.class_id === c.id).length;
      return { ...c, enrollment_mode: normalizeMode(c.enrollment_mode), student_count: studentCount, exam_count: examCount };
    });
    return res.json(classesWithCounts);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getClassById = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.supabase) {
      const { data: cls, error } = await req.supabase.from('classes').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
      const [{ data: enrollments, error: enrollError }, { data: exams, error: examError }] = await Promise.all([
        req.supabase.from('class_enrollments').select('*,student:students(*)').eq('class_id', id),
        req.supabase.from('exams').select('*').eq('class_id', id)
      ]);
      if (enrollError) throw enrollError;
      if (examError) throw examError;
      return res.json({ ...cls, students: (enrollments || []).filter(e => e.status === 'active').map(e => e.student), enrollments: enrollments || [], exams: exams || [] });
    }
    const cls = memoryStore.classes.find(c => c.id === id);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
    const enrollments = (memoryStore.enrollments || []).filter(e => e.class_id === id);
    const students = enrollments.length
      ? enrollments.filter(e => e.status === 'active').map(e => memoryStore.students.find(s => s.id === e.student_id)).filter(Boolean)
      : memoryStore.students.filter(s => s.class_id === id);
    const exams = memoryStore.exams.filter(e => e.class_id === id);
    return res.json({ ...cls, students, enrollments, exams });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name, enrollment_mode } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom de la classe est obligatoire' });
    const mode = normalizeMode(enrollment_mode);
    if (req.supabase) {
      const { data, error } = await req.supabase.from('classes')
        .insert({ name: name.trim(), enrollment_mode: mode })
        .select('*').single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    const newClass = { id: generateId(), name: name.trim(), enrollment_mode: mode, archived_at: null, created_at: new Date().toISOString() };
    memoryStore.classes.push(newClass);
    return res.status(201).json(newClass);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, enrollment_mode } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom est obligatoire' });
    const updates = { name: name.trim() };
    if (enrollment_mode !== undefined) updates.enrollment_mode = normalizeMode(enrollment_mode);
    if (req.supabase) {
      const { data, error } = await req.supabase.from('classes').update(updates).eq('id', id).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Classe introuvable' });
      return res.json(data);
    }
    const index = memoryStore.classes.findIndex(c => c.id === id);
    if (index === -1) return res.status(404).json({ error: 'Classe introuvable' });
    Object.assign(memoryStore.classes[index], updates);
    return res.json(memoryStore.classes[index]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { id } = req.params;
    const archivedAt = new Date().toISOString();
    if (req.supabase) {
      const { data, error } = await req.supabase.from('classes')
        .update({ archived_at: archivedAt }).eq('id', id).is('archived_at', null).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Classe introuvable ou déjà archivée' });
      return res.json({ message: 'Classe archivée. Les inscriptions et historiques sont conservés.' });
    }
    const cls = memoryStore.classes.find(c => c.id === id);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
    cls.archived_at = archivedAt;
    return res.json({ message: 'Classe archivée. Les inscriptions et historiques sont conservés.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
