const { memoryStore, generateId } = require('../services/store');

const TEACHER_EMAIL = (process.env.TEACHER_EMAIL || 'ainapercky@gmail.com').trim().toLowerCase();
const OPEN_STATUSES = new Set(['active', 'suspended']);
const END_STATUSES = new Set(['completed', 'abandoned', 'expelled']);

const requireTeacher = (req, res) => {
  if ((req.user?.email || '').trim().toLowerCase() !== TEACHER_EMAIL) {
    res.status(403).json({ error: 'Action réservée à l’administration.' });
    return false;
  }
  return true;
};

const getStudentId = async (client, email) => {
  const { data, error } = await client.from('students')
    .select('id')
    .ilike('email', String(email || '').trim())
    .eq('validation_status', 'approved')
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

const sendError = (res, error, status = 500) => res.status(status).json({ error: error.message || 'Erreur serveur.' });

exports.listAvailableClasses = async (req, res) => {
  try {
    if (!req.supabase) {
      return res.json(memoryStore.classes.filter(item => !item.archived_at).map(item => ({
        ...item, enrollment_mode: item.enrollment_mode || 'approval'
      })));
    }
    const { data, error } = await req.supabase.from('classes')
      .select('id,name,enrollment_mode,created_at')
      .is('archived_at', null)
      .order('name');
    if (error) throw error;
    return res.json(data || []);
  } catch (error) { return sendError(res, error); }
};

exports.listMyEnrollments = async (req, res) => {
  try {
    if (!req.supabase) return res.json([]);
    const studentId = await getStudentId(req.supabase, req.user?.email);
    if (!studentId) return res.status(404).json({ error: 'Fiche élève approuvée introuvable.' });
    const { data, error } = await req.supabase.from('class_enrollments')
      .select('id,student_id,class_id,status,source,started_at,ended_at,end_reason,class:classes(id,name,enrollment_mode)')
      .eq('student_id', studentId)
      .order('started_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (error) { return sendError(res, error); }
};

exports.listMyRequests = async (req, res) => {
  try {
    if (!req.supabase) return res.json([]);
    const studentId = await getStudentId(req.supabase, req.user?.email);
    if (!studentId) return res.status(404).json({ error: 'Fiche élève approuvée introuvable.' });
    const { data, error } = await req.supabase.from('class_enrollment_requests')
      .select('id,student_id,class_id,status,requested_at,reviewed_at,review_note,class:classes(id,name,enrollment_mode)')
      .eq('student_id', studentId)
      .order('requested_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (error) { return sendError(res, error); }
};

exports.requestEnrollment = async (req, res) => {
  try {
    if (!req.supabase) return res.status(503).json({ error: 'Supabase Authenticated Client indisponible.' });
    const { data, error } = await req.supabase.rpc('request_class_enrollment', { p_class_id: req.params.classId });
    if (error) throw error;
    return res.status(data?.status === 'active' ? 201 : 202).json(data);
  } catch (error) { return sendError(res, error, 400); }
};

exports.listAllEnrollments = async (req, res) => {
  if (!requireTeacher(req, res)) return;
  try {
    if (!req.supabase) return res.json(memoryStore.enrollments || []);
    const { data, error } = await req.supabase.from('class_enrollments')
      .select('id,student_id,class_id,status,source,started_at,ended_at,end_reason,student:students(id,first_name,last_name,email,student_number),class:classes(id,name,enrollment_mode)')
      .order('started_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (error) { return sendError(res, error); }
};

exports.listAllRequests = async (req, res) => {
  if (!requireTeacher(req, res)) return;
  try {
    if (!req.supabase) return res.json(memoryStore.enrollmentRequests || []);
    const { data, error } = await req.supabase.from('class_enrollment_requests')
      .select('id,student_id,class_id,status,requested_at,reviewed_at,review_note,student:students(id,first_name,last_name,email),class:classes(id,name,enrollment_mode)')
      .order('requested_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (error) { return sendError(res, error); }
};

exports.enrollStudent = async (req, res) => {
  if (!requireTeacher(req, res)) return;
  try {
    const { student_id } = req.body;
    if (!student_id || !req.params.classId) return res.status(400).json({ error: 'Élève et classe obligatoires.' });
    if (!req.supabase) {
      memoryStore.enrollments ||= [];
      const exists = memoryStore.enrollments.some(item => item.student_id === student_id && item.class_id === req.params.classId && OPEN_STATUSES.has(item.status));
      if (exists) return res.status(409).json({ error: 'Élève déjà inscrit dans cette classe.' });
      const item = { id: generateId(), student_id, class_id: req.params.classId, status: 'active', source: 'admin', started_at: new Date().toISOString(), ended_at: null };
      memoryStore.enrollments.push(item);
      return res.status(201).json(item);
    }
    const { data, error } = await req.supabase.from('class_enrollments')
      .insert({ student_id, class_id: req.params.classId, status: 'active', source: 'admin' })
      .select('*').single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) { return sendError(res, error, error.code === '23505' ? 409 : 400); }
};

exports.updateEnrollmentStatus = async (req, res) => {
  if (!requireTeacher(req, res)) return;
  try {
    const { status, end_reason } = req.body;
    if (!OPEN_STATUSES.has(status) && !END_STATUSES.has(status)) return res.status(400).json({ error: 'Statut d’inscription invalide.' });
    const isOpen = OPEN_STATUSES.has(status);
    const updates = { status, ended_at: isOpen ? null : new Date().toISOString(), ended_by: isOpen ? null : req.user.id, end_reason: isOpen ? null : (end_reason || null), updated_at: new Date().toISOString() };
    if (!req.supabase) {
      memoryStore.enrollments ||= [];
      const item = memoryStore.enrollments.find(entry => entry.id === req.params.enrollmentId);
      if (!item) return res.status(404).json({ error: 'Inscription introuvable.' });
      Object.assign(item, updates);
      return res.json(item);
    }
    const { data, error } = await req.supabase.from('class_enrollments')
      .update(updates).eq('id', req.params.enrollmentId).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Inscription introuvable.' });
    return res.json(data);
  } catch (error) { return sendError(res, error, 400); }
};

exports.reviewRequest = async (req, res) => {
  if (!requireTeacher(req, res)) return;
  try {
    if (!req.supabase) return res.status(503).json({ error: 'La validation des demandes nécessite Supabase.' });
    const { decision, note } = req.body;
    const { data, error } = await req.supabase.rpc('review_class_enrollment_request', {
      p_request_id: req.params.requestId, p_decision: decision, p_note: note || null
    });
    if (error) throw error;
    return res.json(data);
  } catch (error) { return sendError(res, error, 400); }
};
