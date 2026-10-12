const { memoryStore, generateId } = require('../services/store');

exports.getEvaluations = async (req, res) => {
  try {
    const { exam_id, class_id, student_id } = req.query;
    let list = [...memoryStore.evaluations];

    if (exam_id) list = list.filter(e => e.exam_id === exam_id);
    if (student_id) list = list.filter(e => e.student_id === student_id);

    const enriched = list.map(ev => {
      const student = memoryStore.students.find(s => s.id === ev.student_id);
      const exam = memoryStore.exams.find(e => e.id === ev.exam_id);
      const cls = exam ? memoryStore.classes.find(c => c.id === exam.class_id) : null;
      const rubrics = memoryStore.rubrics.filter(r => r.exam_id === ev.exam_id);
      const maxScore = rubrics.reduce((sum, r) => sum + (Number(r.points) || 1), 0);

      return {
        ...ev,
        student_name: student ? `${student.first_name} ${student.last_name}` : 'Inconnu',
        student_number: student ? student.student_number : null,
        exam_title: exam ? exam.title : 'Inconnu',
        exam_date: exam ? exam.exam_date : null,
        class_name: cls ? cls.name : 'Inconnue',
        class_id: cls ? cls.id : null,
        max_score: maxScore,
        percentage: maxScore > 0 ? Math.round((ev.total_score / maxScore) * 100) : 0,
        validated_rubrics_count: ev.details ? ev.details.filter(d => d.is_validated).length : 0,
        total_rubrics_count: rubrics.length
      };
    });

    if (class_id) {
      return res.json(enriched.filter(e => e.class_id === class_id));
    }

    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getEvaluationById = async (req, res) => {
  try {
    const { id } = req.params;
    const ev = memoryStore.evaluations.find(e => e.id === id);
    if (!ev) return res.status(404).json({ error: 'Évaluation introuvable' });

    const student = memoryStore.students.find(s => s.id === ev.student_id);
    const exam = memoryStore.exams.find(e => e.id === ev.exam_id);
    const cls = exam ? memoryStore.classes.find(c => c.id === exam.class_id) : null;
    const rubrics = memoryStore.rubrics
      .filter(r => r.exam_id === ev.exam_id)
      .sort((a, b) => a.position - b.position);

    const maxScore = rubrics.reduce((sum, r) => sum + (Number(r.points) || 1), 0);

    // Fusionner les rubriques avec les détails de validation
    const detailedRubrics = rubrics.map(r => {
      const match = ev.details ? ev.details.find(d => d.rubric_id === r.id) : null;
      return {
        ...r,
        is_validated: match ? Boolean(match.is_validated) : false,
        awarded_points: match && match.is_validated ? Number(r.points) : 0
      };
    });

    return res.json({
      ...ev,
      student,
      exam,
      class_name: cls ? cls.name : 'Inconnue',
      max_score: maxScore,
      percentage: maxScore > 0 ? Math.round((ev.total_score / maxScore) * 100) : 0,
      rubrics: detailedRubrics
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.saveEvaluation = async (req, res) => {
  try {
    const { 
      exam_id, 
      student_id, 
      rubrics_validated, 
      status,
      duration_used_seconds,
      max_duration_seconds,
      timer_status
    } = req.body;
    if (!exam_id || !student_id) {
      return res.status(400).json({ error: 'exam_id et student_id sont obligatoires' });
    }

    const exam = memoryStore.exams.find(e => e.id === exam_id);
    if (!exam) return res.status(404).json({ error: 'Examen introuvable' });

    const student = memoryStore.students.find(s => s.id === student_id);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });

    const examRubrics = memoryStore.rubrics.filter(r => r.exam_id === exam_id);

    // Calcul précis et intègre de la note (indépendante de la durée)
    let calculatedTotalScore = 0;
    const details = examRubrics.map(rubric => {
      let isValidated = false;
      if (Array.isArray(rubrics_validated)) {
        isValidated = rubrics_validated.includes(rubric.id);
      } else if (typeof rubrics_validated === 'object' && rubrics_validated !== null) {
        isValidated = Boolean(rubrics_validated[rubric.id]);
      }

      const points = isValidated ? Number(rubric.points) || 1 : 0;
      calculatedTotalScore += points;

      return {
        rubric_id: rubric.id,
        is_validated: isValidated,
        awarded_points: points
      };
    });

    const now = new Date().toISOString();
    const existingIndex = memoryStore.evaluations.findIndex(
      e => e.exam_id === exam_id && e.student_id === student_id
    );

    const maxDuration = max_duration_seconds !== undefined ? Number(max_duration_seconds) : 180;
    const durationUsed = duration_used_seconds !== undefined ? Number(duration_used_seconds) : 0;
    const timerState = timer_status || (durationUsed >= maxDuration ? 'completed' : 'stopped_manually');

    let resultEval;
    if (existingIndex !== -1) {
      // Mise à jour de l'évaluation existante
      memoryStore.evaluations[existingIndex] = {
        ...memoryStore.evaluations[existingIndex],
        total_score: calculatedTotalScore,
        status: status || 'completed',
        details,
        max_duration_seconds: maxDuration,
        duration_used_seconds: durationUsed,
        timer_status: timerState,
        updated_at: now
      };
      resultEval = memoryStore.evaluations[existingIndex];
    } else {
      // Création d'une nouvelle évaluation
      resultEval = {
        id: generateId(),
        exam_id,
        student_id,
        total_score: calculatedTotalScore,
        status: status || 'completed',
        details,
        max_duration_seconds: maxDuration,
        duration_used_seconds: durationUsed,
        timer_status: timerState,
        created_at: now,
        updated_at: now
      };
      memoryStore.evaluations.push(resultEval);
    }

    // Mettre à jour l'ordre de passage si l'élève y est inscrit
    const passOrderIdx = memoryStore.passOrder.findIndex(
      po => po.exam_id === exam_id && po.student_id === student_id
    );
    if (passOrderIdx !== -1) {
      memoryStore.passOrder[passOrderIdx].status = 'completed';
    }

    const maxScore = examRubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);

    return res.status(existingIndex !== -1 ? 200 : 201).json({
      success: true,
      message: 'Évaluation enregistrée avec succès',
      evaluation: {
        ...resultEval,
        max_score: maxScore,
        percentage: maxScore > 0 ? Math.round((calculatedTotalScore / maxScore) * 100) : 0
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const index = memoryStore.evaluations.findIndex(e => e.id === id);
    if (index === -1) return res.status(404).json({ error: 'Évaluation introuvable' });

    memoryStore.evaluations.splice(index, 1);
    return res.json({ message: 'Évaluation supprimée avec succès' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getStudentEvaluations = async (req, res) => {
  try {
    const { id } = req.params;
    const student = memoryStore.students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });

    const studentEvals = memoryStore.evaluations.filter(e => e.student_id === id);
    const enriched = studentEvals.map(ev => {
      const exam = memoryStore.exams.find(e => e.id === ev.exam_id);
      const rubrics = memoryStore.rubrics.filter(r => r.exam_id === ev.exam_id);
      const maxScore = rubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);

      return {
        ...ev,
        exam_title: exam ? exam.title : 'Inconnu',
        exam_date: exam ? exam.exam_date : null,
        max_score: maxScore,
        percentage: maxScore > 0 ? Math.round((ev.total_score / maxScore) * 100) : 0
      };
    });

    return res.json({
      student,
      evaluations: enriched
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
