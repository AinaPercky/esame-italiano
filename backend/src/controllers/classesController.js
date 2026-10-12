const { memoryStore, generateId } = require('../services/store');

exports.getClasses = async (req, res) => {
  try {
    const classesWithCounts = memoryStore.classes.map(c => {
      const studentCount = memoryStore.students.filter(s => s.class_id === c.id).length;
      const examCount = memoryStore.exams.filter(e => e.class_id === c.id).length;
      return { ...c, student_count: studentCount, exam_count: examCount };
    });
    return res.json(classesWithCounts);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getClassById = async (req, res) => {
  try {
    const { id } = req.params;
    const cls = memoryStore.classes.find(c => c.id === id);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
    const students = memoryStore.students.filter(s => s.class_id === id);
    const exams = memoryStore.exams.filter(e => e.class_id === id);
    return res.json({ ...cls, students, exams });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom de la classe est obligatoire' });
    }
    const newClass = {
      id: generateId(),
      name: name.trim(),
      created_at: new Date().toISOString()
    };
    memoryStore.classes.push(newClass);
    return res.status(201).json(newClass);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const index = memoryStore.classes.findIndex(c => c.id === id);
    if (index === -1) return res.status(404).json({ error: 'Classe introuvable' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom est obligatoire' });

    memoryStore.classes[index].name = name.trim();
    return res.json(memoryStore.classes[index]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { id } = req.params;
    const index = memoryStore.classes.findIndex(c => c.id === id);
    if (index === -1) return res.status(404).json({ error: 'Classe introuvable' });

    // Suppression en cascade
    memoryStore.classes.splice(index, 1);
    memoryStore.students = memoryStore.students.filter(s => s.class_id !== id);
    memoryStore.exams = memoryStore.exams.filter(e => e.class_id !== id);
    return res.json({ message: 'Classe supprimée avec succès' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
