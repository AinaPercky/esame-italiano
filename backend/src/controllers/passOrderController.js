const { memoryStore, generateId } = require('../services/store');

exports.getPassOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = memoryStore.exams.find(e => e.id === id);
    if (!exam) return res.status(404).json({ error: 'Examen introuvable' });

    let orderList = memoryStore.passOrder
      .filter(po => po.exam_id === id)
      .sort((a, b) => a.position - b.position);

    // Si aucun ordre n'existe encore pour cet examen, initialiser avec la liste des élèves de la classe
    if (orderList.length === 0) {
      const classStudents = memoryStore.students.filter(s => s.class_id === exam.class_id);
      orderList = classStudents.map((s, idx) => {
        const isAlreadyEval = memoryStore.evaluations.some(ev => ev.exam_id === id && ev.student_id === s.id);
        const item = {
          id: generateId(),
          exam_id: id,
          student_id: s.id,
          position: idx + 1,
          status: isAlreadyEval ? 'completed' : 'waiting'
        };
        memoryStore.passOrder.push(item);
        return item;
      });
    }

    // Enrichir avec les données des élèves
    const enriched = orderList.map(po => {
      const student = memoryStore.students.find(s => s.id === po.student_id);
      const evaluation = memoryStore.evaluations.find(ev => ev.exam_id === id && ev.student_id === po.student_id);
      return {
        ...po,
        student_name: student ? `${student.first_name} ${student.last_name}` : 'Inconnu',
        student_number: student ? student.student_number : null,
        evaluation_score: evaluation ? evaluation.total_score : null,
        is_evaluated: Boolean(evaluation)
      };
    });

    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.randomizePassOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = memoryStore.exams.find(e => e.id === id);
    if (!exam) return res.status(404).json({ error: 'Examen introuvable' });

    // Récupérer les élèves de la classe
    const classStudents = memoryStore.students.filter(s => s.class_id === exam.class_id);
    if (classStudents.length === 0) {
      return res.status(400).json({ error: 'Aucun élève trouvé dans cette classe' });
    }

    // Algorithme de mélange Fisher-Yates
    const shuffled = [...classStudents];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Supprimer l'ancien ordre pour cet examen
    memoryStore.passOrder = memoryStore.passOrder.filter(po => po.exam_id !== id);

    // Enregistrer le nouvel ordre
    const newOrder = shuffled.map((student, idx) => {
      const evaluation = memoryStore.evaluations.find(ev => ev.exam_id === id && ev.student_id === student.id);
      const item = {
        id: generateId(),
        exam_id: id,
        student_id: student.id,
        position: idx + 1,
        status: evaluation ? 'completed' : 'waiting'
      };
      memoryStore.passOrder.push(item);
      return {
        ...item,
        student_name: `${student.first_name} ${student.last_name}`,
        student_number: student.student_number,
        is_evaluated: Boolean(evaluation),
        evaluation_score: evaluation ? evaluation.total_score : null
      };
    });

    return res.json({
      message: 'Ordre de passage mélangé avec succès',
      pass_order: newOrder
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updatePassOrderStatus = async (req, res) => {
  try {
    const { id } = req.params; // exam_id
    const { student_id, status, position } = req.body;

    const idx = memoryStore.passOrder.findIndex(
      po => po.exam_id === id && po.student_id === student_id
    );

    if (idx === -1) {
      return res.status(404).json({ error: 'Élève non trouvé dans l\'ordre de passage' });
    }

    if (status) memoryStore.passOrder[idx].status = status;
    if (position !== undefined) memoryStore.passOrder[idx].position = Number(position);

    return res.json(memoryStore.passOrder[idx]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
