import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Evaluation, Student, Exam } from '../types';

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
