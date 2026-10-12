const { memoryStore, generateId } = require('../services/store');

exports.getExams = async (req, res) => {
  try {
    const { class_id } = req.query;
    let list = [...memoryStore.exams];
    if (class_id) {
      list = list.filter(e => e.class_id === class_id);
    }

    const enriched = list.map(e => {
      const cls = memoryStore.classes.find(c => c.id === e.class_id);
      const rubrics = memoryStore.rubrics.filter(r => r.exam_id === e.id);
      const maxScore = rubrics.reduce((sum, r) => sum + (Number(r.points) || 1), 0);
      const evalCount = memoryStore.evaluations.filter(ev => ev.exam_id === e.id).length;
      return {
        ...e,
        class_name: cls ? cls.name : 'Inconnue',
        rubric_count: rubrics.length,
        max_score: maxScore,
        evaluations_count: evalCount
      };
    });

    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getExamById = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = memoryStore.exams.find(e => e.id === id);
    if (!exam) return res.status(404).json({ error: 'Examen introuvable' });

    const cls = memoryStore.classes.find(c => c.id === exam.class_id);
    const rubrics = memoryStore.rubrics
      .filter(r => r.exam_id === id)
      .sort((a, b) => a.position - b.position);

    const maxScore = rubrics.reduce((acc, r) => acc + (Number(r.points) || 1), 0);

    return res.json({
      ...exam,
      class_name: cls ? cls.name : 'Inconnue',
      max_score: maxScore,
      rubrics
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createExam = async (req, res) => {
  try {
    const { class_id, title, description, exam_date, status, rubrics, use_zebu_template } = req.body;
    if (!class_id || !title) {
      return res.status(400).json({ error: 'La classe et le titre sont obligatoires' });
    }

    const cls = memoryStore.classes.find(c => c.id === class_id);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const newExamId = generateId();
    const newExam = {
      id: newExamId,
      class_id,
      title: title.trim(),
      description: description ? description.trim() : '',
      exam_date: exam_date || new Date().toISOString().split('T')[0],
      status: status || 'draft',
      created_at: new Date().toISOString()
    };

    memoryStore.exams.push(newExam);

    // Rubriques : modèle zébu ou personnalisées
    let rubricList = [];
    if (use_zebu_template || (!rubrics || rubrics.length === 0)) {
      const zebuTemplate = [
        { title: 'Identificazione', question: 'Che animale è?', example_sentence: 'Questo è…', points: 1 },
        { title: 'Nome scientifico e significato', question: 'Qual è il suo nome scientifico?', example_sentence: 'Il suo nome scientifico è…', points: 1 },
        { title: 'Aspetto fisico', question: 'Com\'è fatto?', example_sentence: 'Ha… / È ricoperto di…', points: 1 },
        { title: 'Dimensioni e peso', question: 'Quanto è grande?', example_sentence: 'È lungo circa… / Pesa circa…', points: 1 },
        { title: 'Habitat e distribuzione', question: 'Dove vive?', example_sentence: 'Vive soprattutto in…', points: 1 },
        { title: 'Alimentazione', question: 'Che cosa mangia?', example_sentence: 'Si nutre di…', points: 1 },
        { title: 'Comportamento', question: 'Come si comporta?', example_sentence: 'Di solito… / Spesso…', points: 1 },
        { title: 'Particolarità', question: 'Che cosa lo rende speciale?', example_sentence: 'È particolare perché…', points: 1 },
        { title: 'Curiosità', question: 'Qual è una curiosità interessante?', example_sentence: 'Una cosa interessante è che…', points: 1 },
        { title: 'Utilità', question: 'A che cosa serve lo zebu?', example_sentence: 'Può essere utilizzato per…', points: 1 }
      ];
      rubricList = zebuTemplate.map((item, idx) => ({
        id: generateId(),
        exam_id: newExamId,
        position: idx + 1,
        title: item.title,
        question: item.question,
        example_sentence: item.example_sentence,
        points: Number(item.points) || 1
      }));
    } else if (Array.isArray(rubrics)) {
      rubricList = rubrics.map((r, idx) => ({
        id: generateId(),
        exam_id: newExamId,
        position: r.position || idx + 1,
        title: r.title || `Rubrique ${idx + 1}`,
        question: r.question || '',
        example_sentence: r.example_sentence || '',
        points: Number(r.points) || 1
      }));
    }

    rubricList.forEach(r => memoryStore.rubrics.push(r));

    return res.status(201).json({
      ...newExam,
      rubrics: rubricList,
      max_score: rubricList.reduce((s, r) => s + r.points, 0)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, exam_date, status, class_id } = req.body;
    const index = memoryStore.exams.findIndex(e => e.id === id);
    if (index === -1) return res.status(404).json({ error: 'Examen introuvable' });

    if (title) memoryStore.exams[index].title = title.trim();
    if (description !== undefined) memoryStore.exams[index].description = description.trim();
    if (exam_date) memoryStore.exams[index].exam_date = exam_date;
    if (status) memoryStore.exams[index].status = status;
    if (class_id) memoryStore.exams[index].class_id = class_id;

    return res.json(memoryStore.exams[index]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    const { id } = req.params;
    const index = memoryStore.exams.findIndex(e => e.id === id);
    if (index === -1) return res.status(404).json({ error: 'Examen introuvable' });

    memoryStore.exams.splice(index, 1);
    memoryStore.rubrics = memoryStore.rubrics.filter(r => r.exam_id !== id);
    memoryStore.evaluations = memoryStore.evaluations.filter(ev => ev.exam_id !== id);
    memoryStore.passOrder = memoryStore.passOrder.filter(po => po.exam_id !== id);

    return res.json({ message: 'Examen supprimé avec succès' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Gestion des rubriques d'un examen
exports.getExamRubrics = async (req, res) => {
  try {
    const { id } = req.params;
    const rubrics = memoryStore.rubrics
      .filter(r => r.exam_id === id)
      .sort((a, b) => a.position - b.position);
    return res.json(rubrics);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.addExamRubric = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, question, example_sentence, points } = req.body;
    if (!title) return res.status(400).json({ error: 'Le titre de la rubrique est requis' });

    const existing = memoryStore.rubrics.filter(r => r.exam_id === id);
    const newRubric = {
      id: generateId(),
      exam_id: id,
      position: existing.length + 1,
      title: title.trim(),
      question: question ? question.trim() : '',
      example_sentence: example_sentence ? example_sentence.trim() : '',
      points: Number(points) || 1
    };

    memoryStore.rubrics.push(newRubric);
    return res.status(201).json(newRubric);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateRubric = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, question, example_sentence, points, position } = req.body;
    const idx = memoryStore.rubrics.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Rubrique introuvable' });

    if (title) memoryStore.rubrics[idx].title = title.trim();
    if (question !== undefined) memoryStore.rubrics[idx].question = question.trim();
    if (example_sentence !== undefined) memoryStore.rubrics[idx].example_sentence = example_sentence.trim();
    if (points !== undefined) memoryStore.rubrics[idx].points = Number(points);
    if (position !== undefined) memoryStore.rubrics[idx].position = Number(position);

    return res.json(memoryStore.rubrics[idx]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteRubric = async (req, res) => {
  try {
    const { id } = req.params;
    const idx = memoryStore.rubrics.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Rubrique introuvable' });

    memoryStore.rubrics.splice(idx, 1);
    return res.json({ message: 'Rubrique supprimée avec succès' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
