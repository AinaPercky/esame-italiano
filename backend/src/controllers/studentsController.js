const { memoryStore, generateId } = require('../services/store');

exports.getStudents = async (req, res) => {
  try {
    const { class_id, search } = req.query;
    let list = [...memoryStore.students];

    if (class_id) {
      list = list.filter(s => s.class_id === class_id);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        (s.student_number && s.student_number.toLowerCase().includes(q))
      );
    }

    // Associer le nom de la classe
    const enriched = list.map(s => {
      const cls = memoryStore.classes.find(c => c.id === s.class_id);
      return { ...s, class_name: cls ? cls.name : 'Inconnue' };
    });

    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const student = memoryStore.students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });

    const cls = memoryStore.classes.find(c => c.id === student.class_id);
    const evaluations = memoryStore.evaluations.filter(e => e.student_id === id);

    return res.json({
      ...student,
      class_name: cls ? cls.name : 'Inconnue',
      evaluations
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const { first_name, last_name, class_id, student_number } = req.body;
    if (!first_name || !last_name || !class_id) {
      return res.status(400).json({ error: 'Prénom, nom et classe sont obligatoires' });
    }

    const cls = memoryStore.classes.find(c => c.id === class_id);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const newStudent = {
      id: generateId(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      class_id,
      student_number: student_number ? student_number.trim() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    memoryStore.students.push(newStudent);
    return res.status(201).json(newStudent);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, class_id, student_number } = req.body;
    const index = memoryStore.students.findIndex(s => s.id === id);
    if (index === -1) return res.status(404).json({ error: 'Élève introuvable' });

    if (first_name) memoryStore.students[index].first_name = first_name.trim();
    if (last_name) memoryStore.students[index].last_name = last_name.trim();
    if (class_id) memoryStore.students[index].class_id = class_id;
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
    const index = memoryStore.students.findIndex(s => s.id === id);
    if (index === -1) return res.status(404).json({ error: 'Élève introuvable' });

    // La suppression de l'élève conserve ses évaluations historiques ou les dissocie selon la consigne
    memoryStore.students.splice(index, 1);
    return res.json({ message: 'Élève supprimé avec succès' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Importation par lots d'élèves (CSV ou JSON)
 * Détecte les doublons, valide les lignes, retourne le détail
 */
exports.importStudents = async (req, res) => {
  try {
    const { students: rawItems, default_class_id } = req.body;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ error: 'Format invalide. Liste d\'élèves attendue.' });
    }

    const imported = [];
    const duplicates = [];
    const errors = [];

    rawItems.forEach((item, idx) => {
      const lineNum = idx + 1;
      const firstName = (item.prenom || item.first_name || '').trim();
      const lastName = (item.nom || item.last_name || '').trim();
      const studentNum = (item.numero || item.student_number || item.id || '').trim();
      
      // Trouver la classe par nom ou ID
      let classId = item.class_id || default_class_id;
      if (!classId && (item.classe || item.class_name)) {
        const targetName = (item.classe || item.class_name).trim().toLowerCase();
        const found = memoryStore.classes.find(c => 
          c.name.toLowerCase() === targetName || 
          c.name.toLowerCase().includes(targetName)
        );
        if (found) classId = found.id;
      }

      if (!firstName || !lastName) {
        errors.push({ line: lineNum, reason: 'Nom ou prénom manquant', data: item });
        return;
      }

      if (!classId) {
        errors.push({ line: lineNum, reason: 'Classe non spécifiée ou introuvable', data: item });
        return;
      }

      // Vérifier les doublons dans la classe (même nom et prénom)
      const isDuplicate = memoryStore.students.some(s => 
        s.class_id === classId &&
        s.first_name.toLowerCase() === firstName.toLowerCase() &&
        s.last_name.toLowerCase() === lastName.toLowerCase()
      );

      if (isDuplicate) {
        duplicates.push({ line: lineNum, student: `${firstName} ${lastName}` });
        return;
      }

      const newStudent = {
        id: generateId(),
        class_id: classId,
        first_name: firstName,
        last_name: lastName,
        student_number: studentNum || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      memoryStore.students.push(newStudent);
      imported.push(newStudent);
    });

    return res.status(200).json({
      success: true,
      summary: {
        total_submitted: rawItems.length,
        imported_count: imported.length,
        duplicates_count: duplicates.length,
        errors_count: errors.length
      },
      imported,
      duplicates,
      errors
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
