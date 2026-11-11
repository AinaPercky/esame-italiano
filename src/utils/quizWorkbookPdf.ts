import { jsPDF } from 'jspdf';
import type { Quiz, QuizQuestion } from '../types';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 17;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - 18;

const slugify = (value: string) =>
  value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz';

const shuffle = <T,>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Exports a quiz as a student-facing A4 workbook.
 * Answer keys and pedagogical explanations are deliberately never rendered.
 */
export function downloadQuizWorkbookPdf(quiz: Quiz): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 18;
  let pageNumber = 1;

  const addFooter = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 140);
    doc.text('PerckyLingua • Cahier d’exercices', MARGIN, PAGE_HEIGHT - 8);
    doc.text(String(pageNumber), PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: 'right' });
  };

  const addPage = () => {
    addFooter();
    doc.addPage();
    pageNumber += 1;
    y = 18;
  };

  const ensureSpace = (height: number) => {
    if (y + height > BOTTOM) addPage();
  };

  const writeParagraph = (value: string, fontSize = 10, lineHeight = 5, indent = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(35, 45, 55);
    const lines = doc.splitTextToSize(value, CONTENT_WIDTH - indent);
    ensureSpace(lines.length * lineHeight + 1);
    doc.text(lines, MARGIN + indent, y);
    y += lines.length * lineHeight;
  };

  const writeAnswerLines = (count: number, lineGap = 8) => {
    const safeCount = Math.max(1, Math.min(8, count));
    ensureSpace(safeCount * lineGap + 3);
    doc.setDrawColor(190, 198, 206);
    doc.setLineWidth(0.25);
    for (let i = 0; i < safeCount; i += 1) {
      y += lineGap;
      doc.line(MARGIN + 2, y, PAGE_WIDTH - MARGIN - 2, y);
    }
    y += 5;
  };

  const writeQuestionHeading = (index: number, question: QuizQuestion) => {
    ensureSpace(18);
    doc.setFillColor(245, 247, 249);
    doc.roundedRect(MARGIN, y - 5, CONTENT_WIDTH, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(25, 45, 65);
    doc.text(`Exercice ${index + 1}`, MARGIN + 3, y + 1.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(95, 105, 115);
    doc.text(`${Number(question.points) || 1} pt(s)`, PAGE_WIDTH - MARGIN - 3, y + 1.5, { align: 'right' });
    y += 11;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(20, 48, 70);
  const titleLines = doc.splitTextToSize(quiz.title || 'Cahier d’exercices', CONTENT_WIDTH);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 8 + 2;

  if (quiz.category) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(145, 91, 32);
    doc.text(String(quiz.category), MARGIN, y);
    y += 6;
  }

  if (quiz.description?.trim()) {
    writeParagraph(quiz.description.trim(), 9, 4.5);
    y += 2;
  }

  doc.setDrawColor(125, 140, 152);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(35, 45, 55);
  doc.text('Nom et prénom :', MARGIN, y);
  doc.line(MARGIN + 31, y + 1, 112, y + 1);
  doc.text('Date :', 121, y);
  doc.line(134, y + 1, PAGE_WIDTH - MARGIN, y + 1);
  y += 9;
  doc.text('Classe :', MARGIN, y);
  doc.line(MARGIN + 17, y + 1, 112, y + 1);
  doc.text('Note :', 121, y);
  doc.line(134, y + 1, PAGE_WIDTH - MARGIN - 9, y + 1);
  doc.text('/' + String(quiz.total_points || 0), PAGE_WIDTH - MARGIN, y);
  y += 10;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text('Consigne : lisez chaque question et répondez directement sur cette feuille.', MARGIN, y);
  y += 10;

  (quiz.questions || []).forEach((question, index) => {
    writeQuestionHeading(index, question);
    writeParagraph(question.question || ' ', 10, 5);

    if (question.type === 'qcm') {
      (question.options || []).forEach((option, optionIndex) => {
        ensureSpace(7);
        doc.setDrawColor(75, 85, 95);
        doc.circle(MARGIN + 4, y - 1.2, 1.8);
        writeParagraph(`${String.fromCharCode(65 + optionIndex)}. ${option}`, 9.5, 5, 10);
        y += 1;
      });
      y += 3;
    } else if (question.type === 'reorder') {
      const items = shuffle(question.items || []);
      items.forEach((item, itemIndex) => {
        ensureSpace(8);
        doc.setDrawColor(160, 170, 180);
        doc.rect(MARGIN + 2, y - 4, CONTENT_WIDTH - 4, 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(40, 50, 60);
        doc.text(`${itemIndex + 1}.  ${item.text}`, MARGIN + 5, y + 0.5);
        y += 9;
      });
      writeParagraph('Réécrivez les éléments dans le bon ordre :', 9, 5);
      writeAnswerLines(Math.max(2, Math.ceil(items.length / 2)), 8);
    } else if (question.type === 'verbes_trous' && question.verbes_trous) {
      const exercise = question.verbes_trous;
      if (exercise.consigne) writeParagraph(exercise.consigne, 9, 4.5);
      if (exercise.banque?.length) {
        writeParagraph(`Banque de verbes : ${shuffle(exercise.banque).join(' • ')}`, 9, 5);
        y += 2;
      }
      (exercise.phrases || []).forEach((phrase, phraseIndex) => {
        writeParagraph(`${phraseIndex + 1}. ${phrase.debut || ''} ____________________ ${phrase.fin || ''}`, 9.5, 6);
      });
      y += 4;
    } else {
      const blankCount = question.answers?.length
        || (question.correct_answer?.includes('|') ? question.correct_answer.split('|').length : 1);
      writeAnswerLines(blankCount > 1 ? blankCount : 2, 8);
    }
    y += 5;
  });

  addFooter();
  doc.save(`cahier-exercices-${slugify(quiz.title)}.pdf`);
}
