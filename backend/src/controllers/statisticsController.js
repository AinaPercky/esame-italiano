const { memoryStore } = require('../services/store');

exports.getExamStatistics = async (req, res) => {
  try {
    const { id } = req.params; // exam_id
    const exam = memoryStore.exams.find(e => e.id === id);
    if (!exam) return res.status(404).json({ error: 'Examen introuvable' });

    const rubrics = memoryStore.rubrics
      .filter(r => r.exam_id === id)
      .sort((a, b) => a.position - b.position);

    const maxScore = rubrics.reduce((s, r) => s + (Number(r.points) || 1), 0);

    // Élèves de la classe
    const classStudents = memoryStore.students.filter(s => s.class_id === exam.class_id);
    const totalStudents = classStudents.length;

    // Évaluations de cet examen
    const evaluations = memoryStore.evaluations.filter(ev => ev.exam_id === id);
    const evaluatedCount = evaluations.length;
    const unevaluatedCount = Math.max(0, totalStudents - evaluatedCount);

    // Calculs statistiques UNIQUEMENT sur les évaluations enregistrées
    let classAverage = 0;
    let minScore = 0;
    let maxObtainedScore = 0;
    let successRate = 0;

    if (evaluatedCount > 0) {
      const scores = evaluations.map(e => Number(e.total_score));
      const totalPoints = scores.reduce((sum, s) => sum + s, 0);
      classAverage = Number((totalPoints / evaluatedCount).toFixed(2));
      minScore = Math.min(...scores);
      maxObtainedScore = Math.max(...scores);

      // Taux de réussite (note >= 50% de la note max)
      const passingScore = maxScore * 0.5;
      const passedCount = scores.filter(s => s >= passingScore).length;
      successRate = Number(((passedCount / evaluatedCount) * 100).toFixed(1));
    }

    // Graphique 1 : Distribution des notes par tranches
    const distributionBuckets = [
      { label: '0 - 2 pts', count: 0 },
      { label: '3 - 4 pts', count: 0 },
      { label: '5 - 6 pts', count: 0 },
      { label: '7 - 8 pts', count: 0 },
      { label: '9 - 10 pts', count: 0 }
    ];

    evaluations.forEach(ev => {
      const s = Number(ev.total_score);
      if (s <= 2) distributionBuckets[0].count++;
      else if (s <= 4) distributionBuckets[1].count++;
      else if (s <= 6) distributionBuckets[2].count++;
      else if (s <= 8) distributionBuckets[3].count++;
      else distributionBuckets[4].count++;
    });

    // Graphique 2 : Répartition exacte par note (0 à 10)
    const scoreFrequency = {};
    for (let i = 0; i <= maxScore; i++) scoreFrequency[i] = 0;
    evaluations.forEach(ev => {
      const s = Math.round(Number(ev.total_score));
      if (scoreFrequency[s] !== undefined) scoreFrequency[s]++;
    });

    // Graphique 3 : Performance par rubrique (% de réussite)
    const rubricPerformance = rubrics.map(r => {
      let validatedCount = 0;
      evaluations.forEach(ev => {
        const detail = ev.details ? ev.details.find(d => d.rubric_id === r.id) : null;
        if (detail && detail.is_validated) {
          validatedCount++;
        }
      });
      const pct = evaluatedCount > 0 ? Number(((validatedCount / evaluatedCount) * 100).toFixed(1)) : 0;
      return {
        rubric_id: r.id,
        position: r.position,
        title: r.title,
        question: r.question,
        validated_count: validatedCount,
        success_rate: pct
      };
    });

    // Graphique 4 : Comparaison des examens de la même classe
    const classExams = memoryStore.exams.filter(e => e.class_id === exam.class_id);
    const examComparisons = classExams.map(ex => {
      const evals = memoryStore.evaluations.filter(ev => ev.exam_id === ex.id);
      const avg = evals.length > 0 
        ? Number((evals.reduce((sum, e) => sum + Number(e.total_score), 0) / evals.length).toFixed(2))
        : 0;
      return {
        exam_id: ex.id,
        title: ex.title,
        date: ex.exam_date,
        evaluated_count: evals.length,
        average_score: avg
      };
    });

    return res.json({
      exam_id: id,
      exam_title: exam.title,
      max_score: maxScore,
      indicators: {
        total_students: totalStudents,
        evaluated_students: evaluatedCount,
        unevaluated_students: unevaluatedCount,
        class_average: classAverage,
        min_score: minScore,
        max_score: maxObtainedScore,
        success_rate: successRate
      },
      charts: {
        distribution: distributionBuckets,
        score_frequency: Object.keys(scoreFrequency).map(k => ({ score: Number(k), count: scoreFrequency[k] })),
        rubric_performance: rubricPerformance,
        class_exams_comparison: examComparisons
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getClassStatistics = async (req, res) => {
  try {
    const { id } = req.params; // class_id
    const cls = memoryStore.classes.find(c => c.id === id);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const students = memoryStore.students.filter(s => s.class_id === id);
    const exams = memoryStore.exams.filter(e => e.class_id === id);

    const examStats = exams.map(exam => {
      const evals = memoryStore.evaluations.filter(ev => ev.exam_id === exam.id);
      const avg = evals.length > 0
        ? Number((evals.reduce((sum, e) => sum + Number(e.total_score), 0) / evals.length).toFixed(2))
        : 0;
      return {
        exam_id: exam.id,
        title: exam.title,
        exam_date: exam.exam_date,
        evaluated_count: evals.length,
        total_students: students.length,
        average: avg
      };
    });

    return res.json({
      class_id: id,
      class_name: cls.name,
      total_students: students.length,
      total_exams: exams.length,
      exams: examStats
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
