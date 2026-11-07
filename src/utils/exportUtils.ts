import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Evaluation, Exam, Quiz, QuizSubmission, Student } from '../types';

export interface StudentBulletinData {
  student: Student;
  quizzes: Quiz[];
  submissions: QuizSubmission[];
  generatedAt?: Date;
}

const safeFilenamePart = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'eleve';

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const getBestQuizSubmissions = (submissions: QuizSubmission[]): QuizSubmission[] => {
  const bestByQuiz = new Map<string, QuizSubmission>();
  submissions.forEach(submission => {
    if (submission.is_counted === false) return;
    const current = bestByQuiz.get(submission.quiz_id);
    if (!current || submission.score_20 > current.score_20 ||
      (submission.score_20 === current.score_20 && (submission.attempt_number || 1) > (current.attempt_number || 1))) {
      bestByQuiz.set(submission.quiz_id, submission);
    }
  });
  return [...bestByQuiz.values()].sort((a, b) => a.quiz_title.localeCompare(b.quiz_title, 'fr'));
};

const bulletinAverage = (rows: Array<{ score: number; max: number }>): number => {
  const max = rows.reduce((sum, row) => sum + row.max, 0);
  const score = rows.reduce((sum, row) => sum + row.score, 0);
  return max > 0 ? Number(((score / max) * 20).toFixed(2)) : 0;
};

/**
 * Format seconds to MM:SS
 */
export const formatDuration = (seconds?: number): string => {
  const total = seconds || 0;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Export results to CSV formatted for French/European Excel & LibreOffice
 * Uses semicolon delimiter ';' and UTF-8 BOM '\uFEFF' to properly open in Excel without encoding issues.
 */
export const exportResultsToCSV = (
  evaluations: Evaluation[],
  students: Student[],
  contextInfo?: { className?: string; examTitle?: string }
): void => {
  const headers = [
    'Nom',
    'Prénom',
    'Matricule',
    'Classe',
    'Épreuve',
    'Date Évaluation',
    'Note',
    'Note Maximale',
    'Pourcentage Réussite',
    'Rubriques Validées',
    'Total Rubriques',
    'Temps Parole Utilisé (s)',
    'Temps Parole Formaté',
    'Durée Maximale (s)',
    'Statut Chrono'
  ];

  const escapeCSV = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = evaluations.map((ev) => {
    const student = students.find((s) => s.id === ev.student_id);
    const safeStudentName = ev.student_name || '';
    const lastName = student?.last_name || safeStudentName.split(' ').slice(1).join(' ') || '';
    const firstName = student?.first_name || safeStudentName.split(' ')[0] || '';
    const matricule = student?.student_number || ev.student_number || '';
    const usedSec = ev.duration_used_seconds || 0;
    const timeFormatted = formatDuration(usedSec);

    return [
      escapeCSV(lastName),
      escapeCSV(firstName),
      escapeCSV(matricule),
      escapeCSV(ev.class_name || contextInfo?.className || ''),
      escapeCSV(ev.exam_title || contextInfo?.examTitle || ''),
      escapeCSV(ev.exam_date || ''),
      escapeCSV(ev.total_score),
      escapeCSV(ev.max_score || 10),
      escapeCSV(`${ev.percentage}%`),
      escapeCSV(ev.validated_rubrics_count || 0),
      escapeCSV(ev.total_rubrics_count || 10),
      escapeCSV(usedSec),
      escapeCSV(timeFormatted),
      escapeCSV(ev.max_duration_seconds || 180),
      escapeCSV(ev.timer_status === 'completed' ? '3 min atteintes' : 'Arrêté manuellement')
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const today = new Date().toISOString().split('T')[0];
  const safeTitle = (contextInfo?.examTitle || contextInfo?.className || 'notes_italien')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const filename = `releve_${safeTitle}_${today}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export results to PDF document using jsPDF & autoTable
 * Generates an offline printable document with statistics and clean layout.
 */
export const exportResultsToPDF = (
  evaluations: Evaluation[],
  students: Student[],
  contextInfo?: { className?: string; examTitle?: string; filterLabel?: string }
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Calculate statistics
  const count = evaluations.length;
  const totalPoints = evaluations.reduce((acc, curr) => acc + (curr.total_score || 0), 0);
  const average = count > 0 ? (totalPoints / count).toFixed(2) : '0';
  const minScore = count > 0 ? Math.min(...evaluations.map((e) => e.total_score)) : 0;
  const maxScore = count > 0 ? Math.max(...evaluations.map((e) => e.total_score)) : 0;
  const passCount = evaluations.filter((e) => e.total_score >= 5).length;
  const passRate = count > 0 ? Math.round((passCount / count) * 100) : 0;

  // Header banner
  doc.setFillColor(146, 64, 14); // amber-800
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Title in header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text("RELEVÉ DE NOTES - ÉVALUATIONS ORALES D'ITALIEN", 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Document officiel généré le ${today} · Mode hors ligne`, 14, 18);

  // Filter & Context Info Badge
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  const examLabel = contextInfo?.examTitle ? `Épreuve : ${contextInfo.examTitle}` : 'Toutes les épreuves';
  const classLabel = contextInfo?.className ? `Classe : ${contextInfo.className}` : 'Toutes les classes';
  doc.text(`${classLabel}  |  ${examLabel}`, 14, 32);

  // Statistics summary cards (drawn as boxes)
  const statBoxY = 36;
  const statBoxHeight = 16;
  const statBoxWidth = (pageWidth - 28 - 12) / 4;

  const stats = [
    { label: 'ÉLÈVES ÉVALUÉS', value: `${count}` },
    { label: 'MOYENNE GÉNÉRALE', value: `${average} / 10` },
    { label: 'NOTE MIN / MAX', value: `${minScore} / ${maxScore}` },
    { label: 'TAUX DE RÉUSSITE (≥5)', value: `${passRate}% (${passCount}/${count})` }
  ];

  stats.forEach((stat, idx) => {
    const x = 14 + idx * (statBoxWidth + 4);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(x, statBoxY, statBoxWidth, statBoxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(stat.label, x + 4, statBoxY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(stat.value, x + 4, statBoxY + 12);
  });

  // Table Data
  const tableData: string[][] = evaluations.map((ev, index) => {
    const student = students.find((s) => s.id === ev.student_id);
    const fullName: string = student 
      ? `${student.last_name.toUpperCase()} ${student.first_name}` 
      : (ev.student_name || 'Élève inconnu');
    const matricule: string = student?.student_number || ev.student_number || '-';
    const timeUsed: string = formatDuration(ev.duration_used_seconds);
    const timerStatus: string = ev.timer_status === 'completed' ? 'Terminé (3m)' : 'Arrêté';

    return [
      (index + 1).toString(),
      fullName,
      matricule,
      ev.class_name || contextInfo?.className || '-',
      ev.exam_title || contextInfo?.examTitle || '-',
      `${ev.total_score} / ${ev.max_score || 10}`,
      `${ev.percentage}%`,
      `${ev.validated_rubrics_count || 0} / ${ev.total_rubrics_count || 10}`,
      `${timeUsed} (${timerStatus})`,
      ev.exam_date || '-'
    ];
  });

  autoTable(doc, {
    startY: statBoxY + statBoxHeight + 6,
    head: [[
      'N°',
      'Élève',
      'Matricule',
      'Classe',
      'Épreuve',
      'Note',
      '%',
      'Rubriques',
      'Temps parole',
      'Date'
    ]],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [146, 64, 14], // amber-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left'
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { fontStyle: 'bold', cellWidth: 45 },
      2: { halign: 'center', cellWidth: 24 },
      3: { cellWidth: 26 },
      4: { cellWidth: 45 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
      6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 22 },
      8: { halign: 'center', cellWidth: 34 },
      9: { halign: 'center', cellWidth: 24 }
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const pageStr = `Page ${data.pageNumber} sur ${doc.getNumberOfPages()}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(pageStr, pageWidth - 14, pageHeight - 8, { align: 'right' });
      doc.text('Application Grille Évaluation Orale Italien · Document confidentiel', 14, pageHeight - 8);
    }
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const safeTitle = (contextInfo?.examTitle || contextInfo?.className || 'releve_notes')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const filename = `releve_${safeTitle}_${todayStr}.pdf`;

  doc.save(filename);
};

/**
 * Export a single student's individual evaluation sheet as a clean PDF
 */
export const exportSingleStudentSheetPDF = (
  student: Student,
  evaluation: Evaluation,
  exam: Exam | null
): void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Header Banner
  doc.setFillColor(146, 64, 14); // amber-800
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text("FICHE INDIVIDUELLE D'ÉVALUATION ORALE", 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text("Discipline : Italien · Épreuve d'expression orale en continu", 14, 20);

  // Student Identity Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 34, pageWidth - 28, 26, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${student.last_name.toUpperCase()} ${student.first_name}`, 20, 43);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Classe : ${student.class_name}   |   Identifiant : ${student.student_number || 'N/A'}`, 20, 50);
  doc.text(`Épreuve : ${evaluation.exam_title}   |   Date : ${evaluation.exam_date || today}`, 20, 56);

  // Score Badge
  const scoreBadgeX = pageWidth - 60;
  doc.setFillColor(254, 243, 199); // amber-100
  doc.setDrawColor(217, 119, 6);
  doc.roundedRect(scoreBadgeX, 38, 42, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(146, 64, 14);
  doc.text(`${evaluation.total_score} / ${evaluation.max_score || 10}`, scoreBadgeX + 21, 47, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${evaluation.percentage}% de réussite`, scoreBadgeX + 21, 52, { align: 'center' });

  // Speaking time summary
  const usedSecs = evaluation.duration_used_seconds || 0;
  const timeStr = formatDuration(usedSecs);
  const timerStatus = evaluation.timer_status === 'completed' ? 'Durée limite atteinte (3m 00s)' : 'Arrêt manuel du candidat';

  doc.setFillColor(255, 251, 235); // amber-50
  doc.setDrawColor(251, 191, 36);
  doc.roundedRect(14, 64, pageWidth - 28, 14, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 53, 15);
  doc.text(`Temps de parole effectif : ${timeStr} / 03:00 (${usedSecs}s)  ·  Statut : ${timerStatus}`, 20, 72.5);

  // Rubrics breakdown table
  if (exam && exam.rubrics) {
    const rubricsData = exam.rubrics.map((r) => {
      const detail = evaluation.details.find((d) => d.rubric_id === r.id);
      const isValidated = detail ? detail.is_validated : false;
      const pts = isValidated ? (Number(r.points) || 1) : 0;
      const errorNote = detail?.error_note;
      const questionText = errorNote 
        ? `${r.question}\n[Erreur élève : ${errorNote}]` 
        : r.question;

      return [
        r.position.toString(),
        r.title,
        questionText,
        isValidated ? 'VALIDÉ' : 'NON VALIDÉ',
        `${pts} pt`
      ];
    });

    autoTable(doc, {
      startY: 83,
      head: [['#', 'Rubrique en italien', 'Question attendue', 'Validation', 'Points']],
      body: rubricsData,
      theme: 'grid',
      headStyles: {
        fillColor: [146, 64, 14],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { fontStyle: 'bold', cellWidth: 55 },
        2: { cellWidth: 75 },
        3: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 16 }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          if (data.cell.raw === 'VALIDÉ') {
            data.cell.styles.textColor = [22, 101, 52]; // emerald-800
          } else {
            data.cell.styles.textColor = [156, 163, 175]; // slate-400
          }
        }
      }
    });
  }

  // Footer signature box
  const lastY = (doc as any).lastAutoTable?.finalY || 220;
  if (lastY < pageHeight - 35) {
    const sigY = Math.max(lastY + 12, pageHeight - 40);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, sigY, pageWidth - 28, 25, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Observations de l'enseignant(e) & Signature :", 20, sigY + 6);
  }

  doc.save(`fiche_${student.last_name.toLowerCase()}_${student.first_name.toLowerCase()}_${today}.pdf`);
};

const formatBulletinDate = (date?: string): string => date
  ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR')
  : '—';

/** Génère le bulletin récapitulatif d'un élève avec une moyenne globale des quiz. */
export const exportStudentBulletinPDF = (data: StudentBulletinData): void => {
  const { student, quizzes, submissions } = data;
  const bestSubmissions = getBestQuizSubmissions(submissions);
  const quizRows = bestSubmissions.map((submission, index) => {
    const quiz = quizzes.find(item => item.id === submission.quiz_id);
    const attemptCount = submissions.filter(item => item.quiz_id === submission.quiz_id).length;
    const status = submission.status === 'missed' ? 'Absent · 0/20'
      : submission.status === 'timeout' ? 'Timeout · 0/20' : 'Terminé';
    return [
      String(index + 1),
      quiz?.title || submission.quiz_title,
      quiz?.category || '—',
      formatBulletinDate(submission.date),
      `${submission.score_20}/20`,
      `${attemptCount} tentative${attemptCount > 1 ? 's' : ''}`,
      status
    ];
  });
  const overall = bulletinAverage(bestSubmissions.map(submission => ({ score: submission.score, max: submission.max_score })));
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = (data.generatedAt || new Date()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  doc.setFillColor(15, 70, 87);
  doc.rect(0, 0, pageWidth, 29, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('BULLETIN DE L’ÉLÈVE', 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`PerckyLingua · Italien · Généré le ${today}`, 14, 20);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 35, pageWidth - 28, 26, 2, 2, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${student.last_name.toUpperCase()} ${student.first_name}`, 20, 45);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Classe : ${student.class_name || '—'}   ·   Matricule : ${student.student_number || '—'}`, 20, 53);

  const summaryY = 67;
  const summaryWidth = (pageWidth - 28 - 4) / 2;
  [
    ['QUIZ ÉVALUÉS', String(bestSubmissions.length)],
    ['MOYENNE DES QUIZ', `${overall}/20`]
  ].forEach(([label, value], index) => {
    const x = 14 + index * (summaryWidth + 4);
    doc.setFillColor(index === 1 ? 236 : 248, index === 1 ? 253 : 250, index === 1 ? 245 : 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, summaryY, summaryWidth, 18, 2, 2, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.text(label, x + 4, summaryY + 6);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(value, x + 4, summaryY + 14);
    doc.setFont('helvetica', 'normal');
  });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Résultats des quiz — meilleure tentative retenue', 14, 94);
  autoTable(doc, {
    startY: 98,
    head: [['N°', 'Quiz', 'Catégorie', 'Date', 'Note', 'Tentatives', 'Statut']],
    body: quizRows.length ? quizRows : [['—', 'Aucun quiz évalué', '—', '—', '—', '—', '—']],
    theme: 'striped',
    headStyles: { fillColor: [15, 70, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2.3, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 1: { cellWidth: 48 }, 2: { cellWidth: 27 }, 3: { halign: 'center', cellWidth: 23 }, 4: { halign: 'center', fontStyle: 'bold', cellWidth: 18 }, 5: { halign: 'center', cellWidth: 24 }, 6: { cellWidth: 27 } }
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Les tentatives précédentes restent conservées dans l’historique. Une seule meilleure note par quiz est retenue dans la moyenne.', 14, pageHeight - 14);
  doc.text('Document confidentiel · PerckyLingua', pageWidth - 14, pageHeight - 8, { align: 'right' });
  doc.save(`bulletin_${safeFilenamePart(student.last_name)}_${safeFilenamePart(student.first_name)}.pdf`);
};

/** Génère une image PNG lisible et partageable du même bulletin. */
export const exportStudentBulletinPNG = (data: StudentBulletinData): void => {
  const { student, quizzes, submissions } = data;
  const bestSubmissions = getBestQuizSubmissions(submissions);
  const canvas = document.createElement('canvas');
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = 1200;
  const rowHeight = 42;
  const height = Math.max(760, 370 + bestSubmissions.length * rowHeight);
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Le navigateur ne peut pas générer l’image du bulletin.');
  ctx.scale(scale, scale);
  const text = (value: string, x: number, y: number, size = 20, color = '#0f172a', weight = '400') => {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const line = (x1: number, y: number, x2: number, color = '#e2e8f0') => { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); };
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0f4657'; ctx.fillRect(0, 0, width, 150);
  text('BULLETIN DE L’ÉLÈVE', 56, 62, 38, '#ffffff', '700');
  text(`PerckyLingua · Italien · ${new Date().toLocaleDateString('fr-FR')}`, 56, 105, 20, '#dbeafe');
  text(`${student.last_name.toUpperCase()} ${student.first_name}`, 56, 205, 32, '#0f172a', '700');
  text(`Classe : ${student.class_name || '—'}   ·   Matricule : ${student.student_number || '—'}`, 56, 242, 20, '#475569');
  const overall = bulletinAverage(bestSubmissions.map(submission => ({ score: submission.score, max: submission.max_score })));
  [['QUIZ ÉVALUÉS', String(bestSubmissions.length)], ['MOYENNE DES QUIZ', `${overall}/20`]].forEach(([label, value], index) => {
    const x = 56 + index * 545;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#cbd5e1'; ctx.fillRect(x, 275, 330, 78); ctx.strokeRect(x, 275, 330, 78);
    text(label, x + 18, 303, 15, '#64748b', '700'); text(value, x + 18, 337, 25, '#0f172a', '700');
  });
  let y = 405;
  text('RÉSULTATS DES QUIZ — MEILLEURE TENTATIVE', 56, y, 22, '#0f172a', '700'); y += 35;
  text('Quiz', 56, y, 16, '#475569', '700'); text('Catégorie', 500, y, 16, '#475569', '700'); text('Date', 735, y, 16, '#475569', '700'); text('Note', 865, y, 16, '#475569', '700'); text('Statut', 1000, y, 16, '#475569', '700'); y += 17; line(56, y, 1144); y += 30;
  bestSubmissions.forEach(submission => {
    const quiz = quizzes.find(item => item.id === submission.quiz_id);
    text(quiz?.title || submission.quiz_title, 56, y, 17); text(quiz?.category || '—', 500, y, 16, '#475569'); text(formatBulletinDate(submission.date), 735, y, 16, '#475569'); text(`${submission.score_20}/20`, 865, y, 18, submission.score_20 >= 10 ? '#047857' : '#be123c', '700'); text(submission.status === 'missed' ? 'Absent' : submission.status === 'timeout' ? 'Timeout' : 'Terminé', 1000, y, 16, '#475569'); line(56, y + 12, 1144); y += rowHeight;
  });
  text('Les anciennes tentatives restent conservées ; une meilleure note par quiz est retenue dans la moyenne.', 56, height - 42, 15, '#64748b');
  canvas.toBlob(blob => { if (blob) downloadBlob(blob, `bulletin_${safeFilenamePart(student.last_name)}_${safeFilenamePart(student.first_name)}.png`); }, 'image/png');
};
