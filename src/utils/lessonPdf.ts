import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Lesson, LessonBlock } from '../types/lessons';

const BRAND = {
  navy: [7, 42, 63] as [number, number, number],
  green: [47, 163, 107] as [number, number, number],
  red: [215, 38, 61] as [number, number, number],
  ice: [230, 240, 247] as [number, number, number],
  ink: [31, 49, 71] as [number, number, number],
  muted: [91, 107, 134] as [number, number, number],
  line: [210, 224, 237] as [number, number, number]
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 17;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 13;

type RasterImageData = { data: string; width: number; height: number } | null;

export interface LessonPdfOptions {
  avatarUrl?: string | null;
  displayName?: string;
  logoDataUrl?: string | null;
  avatarDataUrl?: string | null;
}

export function normalizePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[→⇒⟶➜]/g, ' devient ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function loadImageAsPng(source: string, circular = false): Promise<RasterImageData> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const outputSize = 384;
      canvas.width = circular ? outputSize : image.naturalWidth || 768;
      canvas.height = circular ? outputSize : image.naturalHeight || 768;
      const context = canvas.getContext('2d');
      if (!context) return resolve(null);
      try {
        if (circular) {
          const scale = Math.max(outputSize / (image.naturalWidth || outputSize), outputSize / (image.naturalHeight || outputSize));
          const width = (image.naturalWidth || outputSize) * scale;
          const height = (image.naturalHeight || outputSize) * scale;
          context.beginPath();
          context.arc(outputSize / 2, outputSize / 2, outputSize / 2 - 2, 0, Math.PI * 2);
          context.clip();
          context.drawImage(image, (outputSize - width) / 2, (outputSize - height) / 2, width, height);
        } else {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
        }
        resolve({ data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    if (!source.startsWith('data:') && /^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous';
    image.src = source;
  });
}

async function loadBrandLogo(): Promise<RasterImageData> {
  return loadImageAsPng('/percky-lingua-logo.webp');
}

async function loadProfileAvatar(source?: string | null): Promise<RasterImageData> {
  if (!source) return null;
  return loadImageAsPng(source, true);
}

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lecon-italien';
}

function courseBlocks(blocks: LessonBlock[] = []): LessonBlock[] {
  return blocks.flatMap(block => {
    if (block.type === 'dialogue' || block.type === 'discovery') return [];
    if (block.type === 'module') {
      const children = courseBlocks(block.content?.blocks || []);
      return children.length ? [{ ...block, content: { ...block.content, blocks: children } }] : [];
    }
    return [block];
  });
}

function lessonTypeLabel(type: string): string {
  return ({ grammaire: 'Grammaire', vocabulaire: 'Vocabulaire', fonction: 'Fonction', theme: 'Thème', prononciation: 'Prononciation' } as Record<string, string>)[type] || 'Leçon';
}

export async function createLessonPdf(lesson: Lesson, options: LessonPdfOptions = {}): Promise<jsPDF> {
  const logo = options.logoDataUrl === undefined ? await loadBrandLogo() : null;
  const logoData = typeof options.logoDataUrl === 'string' ? { data: options.logoDataUrl, width: 1, height: 1 } : logo;
  const avatar = options.avatarDataUrl === undefined ? await loadProfileAvatar(options.avatarUrl) : null;
  const avatarData = typeof options.avatarDataUrl === 'string' ? { data: options.avatarDataUrl, width: 1, height: 1 } : avatar;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  doc.setProperties({ title: `${lesson.title_it} — PerckyLingua`, subject: lesson.title_fr, creator: 'PerckyLingua' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setCharSpace(0);
  const titleLines = doc.splitTextToSize(normalizePdfText(lesson.title_it || 'Leçon d’italien'), CONTENT_WIDTH - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const subtitleLines = doc.splitTextToSize(normalizePdfText(lesson.title_fr || ''), CONTENT_WIDTH - 4);
  const titleY = 34;
  const subtitleY = titleY + titleLines.length * 7.2 + 1;
  const metaY = subtitleY + Math.max(1, subtitleLines.length) * 4.6 + 5;
  const headerHeight = Math.max(64, metaY + 7);

  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, PAGE_WIDTH, headerHeight, 'F');
  if (logoData) {
    const maxSize = 17;
    const ratio = logoData.width / Math.max(1, logoData.height);
    const width = ratio >= 1 ? maxSize : maxSize * ratio;
    const height = ratio >= 1 ? maxSize / ratio : maxSize;
    doc.addImage(logoData.data, 'PNG', MARGIN, 7, width, height, undefined, 'FAST');
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PerckyLingua', MARGIN + 22, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(205, 223, 238);
  doc.setCharSpace(0);
  if (avatarData) {
    const avatarX = PAGE_WIDTH - MARGIN - 16;
    doc.addImage(avatarData.data, 'PNG', avatarX, 7, 16, 16, undefined, 'FAST');
    const name = normalizePdfText(options.displayName || 'Mon profil');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let fittedName = name;
    while (doc.getTextWidth(fittedName) > 47 && fittedName.length > 5) fittedName = `${fittedName.slice(0, -4).trimEnd()}...`;
    doc.text(fittedName, avatarX - 4, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(205, 223, 238);
    doc.text('FICHE PERSONNELLE', avatarX - 4, 20, { align: 'right' });
  } else {
    if (options.displayName) {
      const initials = normalizePdfText(options.displayName).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      if (initials) {
        const avatarX = PAGE_WIDTH - MARGIN - 16;
        doc.setFillColor(...BRAND.green);
        doc.circle(avatarX + 8, 17, 7.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(initials, avatarX + 8, 19.8, { align: 'center' });
        let fittedName = normalizePdfText(options.displayName);
        while (doc.getTextWidth(fittedName) > 47 && fittedName.length > 5) fittedName = `${fittedName.slice(0, -4).trimEnd()}...`;
        doc.setFontSize(7);
        doc.text(fittedName, avatarX - 4, 13, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(205, 223, 238);
        doc.text('FICHE PERSONNELLE', avatarX - 4, 20, { align: 'right' });
      }
    } else doc.text('APPRENDRE L’ITALIEN, PAS À PAS', PAGE_WIDTH - MARGIN, 16, { align: 'right' });
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleLines.length > 1 ? 18 : 20);
  doc.text(titleLines, MARGIN, titleY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(215, 229, 242);
  if (subtitleLines.length) doc.text(subtitleLines, MARGIN, subtitleY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(181, 222, 202);
  doc.text(`${lessonTypeLabel(lesson.type).toUpperCase()}  ·  ${lesson.level}  ·  ${lesson.duration_min} MIN`, MARGIN, metaY);

  const stripeY = headerHeight;
  const stripeWidth = PAGE_WIDTH / 3;
  doc.setFillColor(...BRAND.green);
  doc.rect(0, stripeY, stripeWidth, 1.6, 'F');
  doc.setFillColor(245, 248, 250);
  doc.rect(stripeWidth, stripeY, stripeWidth, 1.6, 'F');
  doc.setFillColor(...BRAND.red);
  doc.rect(stripeWidth * 2, stripeY, stripeWidth, 1.6, 'F');

  let y = headerHeight + 12;
  const pageBottom = PAGE_HEIGHT - 20;
  const ensureSpace = (height: number) => {
    if (y + height > pageBottom) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const wrapped = (text: unknown, width = CONTENT_WIDTH, size = 10, style: 'normal' | 'bold' = 'normal') => {
    const previousFont = doc.getFont();
    const previousSize = doc.getFontSize();
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setCharSpace(0);
    const normalized = normalizePdfText(text);
    const nativeLines = doc.splitTextToSize(normalized, Math.max(10, width - 1.5)) as string[];
    const lines = nativeLines.flatMap(line => {
      if (doc.getTextWidth(line) <= width - 1) return [line];
      const pieces: string[] = [];
      let current = '';
      for (const character of Array.from(line)) {
        if (current && doc.getTextWidth(current + character) > width - 1) {
          pieces.push(current);
          current = character;
        } else current += character;
      }
      if (current) pieces.push(current);
      return pieces;
    });
    doc.setFont(previousFont.fontName, previousFont.fontStyle);
    doc.setFontSize(previousSize);
    return lines;
  };

  const addSection = (title: string) => {
    if (!title?.trim()) return;
    const lines = wrapped(title, CONTENT_WIDTH - 7, 13, 'bold');
    const textHeight = lines.length * 5.2;
    ensureSpace(textHeight + 6);
    doc.setFillColor(...BRAND.green);
    doc.roundedRect(MARGIN, y - 3.2, 2, Math.max(8.5, textHeight + 1), 1, 1, 'F');
    doc.setTextColor(...BRAND.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(lines, MARGIN + 7, y + 2.5);
    y += textHeight + 5;
  };

  const addParagraph = (text: unknown, options: { bold?: boolean; color?: [number, number, number]; size?: number; indent?: number } = {}) => {
    if (text === undefined || text === null || String(text).trim() === '') return;
    const size = options.size || 10;
    const x = MARGIN + (options.indent || 0);
    const lines = wrapped(text, PAGE_WIDTH - MARGIN - x, size, options.bold ? 'bold' : 'normal');
    const lineHeight = size * 0.43;
    ensureSpace(lines.length * lineHeight + 3);
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(options.color || BRAND.ink));
    doc.text(lines, x, y);
    y += lines.length * lineHeight + 3;
  };

  const addBullet = (text: unknown, index?: number) => {
    if (text === undefined || text === null || String(text).trim() === '') return;
    const lines = wrapped(text, CONTENT_WIDTH - 12, 10);
    const lineHeight = 4.8;
    ensureSpace(lines.length * lineHeight + 4);
    doc.setFillColor(...BRAND.green);
    doc.circle(MARGIN + 2, y - 1.2, 1.15, 'F');
    doc.setTextColor(...BRAND.ink);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(lines, MARGIN + 7, y);
    y += lines.length * lineHeight + (index !== undefined ? 3 : 2);
  };

  const addExample = (italian: unknown, french?: unknown) => {
    if (!italian && !french) return;
    const itLines = wrapped(italian || '', CONTENT_WIDTH - 12, 10, 'bold');
    const frLines = french ? wrapped(french, CONTENT_WIDTH - 12, 9) : [];
    const height = 7 + itLines.length * 4.7 + frLines.length * 4.3;
    ensureSpace(height + 3);
    doc.setFillColor(...BRAND.ice);
    doc.setDrawColor(...BRAND.line);
    doc.roundedRect(MARGIN + 4, y - 4, CONTENT_WIDTH - 4, height, 2, 2, 'FD');
    doc.setFillColor(...BRAND.green);
    doc.roundedRect(MARGIN + 4, y - 4, 1.5, height, .7, .7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.navy);
    doc.text(itLines, MARGIN + 11, y + 1);
    let lineY = y + 1 + itLines.length * 4.7;
    if (frLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.muted);
      doc.text(frLines, MARGIN + 11, lineY);
      lineY += frLines.length * 4.3;
    }
    y += height + 4;
  };

  const addCallout = (title: string, text: unknown, warning = false) => {
    if (!text) return;
    const lines = wrapped(text, CONTENT_WIDTH - 16, 9.5);
    const height = 12 + lines.length * 4.7;
    ensureSpace(height + 4);
    const fill: [number, number, number] = warning ? [255, 246, 225] : [231, 247, 239];
    const accent: [number, number, number] = warning ? [205, 126, 28] : BRAND.green;
    doc.setFillColor(...fill);
    doc.setDrawColor(...BRAND.line);
    doc.roundedRect(MARGIN, y - 3, CONTENT_WIDTH, height, 2.5, 2.5, 'FD');
    doc.setFillColor(...accent);
    doc.roundedRect(MARGIN, y - 3, 2, height, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.navy);
    doc.text(title.toUpperCase(), MARGIN + 7, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND.ink);
    doc.text(lines, MARGIN + 7, y + 8);
    y += height + 5;
  };

  const renderBlock = (block: LessonBlock) => {
    const content = block.content || {};
    if (block.type === 'dialogue' || block.type === 'discovery') return;
    if (block.type === 'module') {
      addSection(content.title || 'Module');
      courseBlocks(content.blocks || []).forEach(renderBlock);
      return;
    }
    if (block.type === 'rules_table') {
      const columns: string[] = content.columns || [];
      const rows = content.rows || [];
      if (content.title) addSection(content.title);
      if (!rows.length) return;
      ensureSpace(16);
      autoTable(doc, {
        startY: y,
        head: [[normalizePdfText(content.label || ''), ...columns.map(normalizePdfText)]],
        body: rows.map((row: any) => [normalizePdfText(row.label || ''), ...(row.cells || []).map(normalizePdfText)]),
        theme: 'grid',
        margin: { left: MARGIN, right: MARGIN, bottom: 19 },
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: BRAND.ink, lineColor: BRAND.line, lineWidth: .2, overflow: 'linebreak' },
        headStyles: { fillColor: BRAND.navy, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 249, 252] },
        rowPageBreak: 'avoid'
      });
      y = (doc as any).lastAutoTable.finalY + 8;
      return;
    }
    if (block.type === 'formula') {
      addSection(content.title || 'Formule générale');
      (content.formulas || []).forEach((formula: any) => {
        if (formula.label) addParagraph(formula.label, { bold: true, color: BRAND.navy, size: 10 });
        const formulaText = (formula.parts || []).map((part: any) => part.hint ? `${part.text} (${part.hint})` : part.text).join(' ');
        if (formulaText) addExample(formulaText);
        (formula.examples || []).forEach((example: any) => addExample(example.it, example.fr));
      });
      return;
    }
    if (block.type === 'rule_cards') {
      (content.cards || []).forEach((card: any) => {
        addSection(card.title || 'Règle');
        addParagraph(card.text);
        (card.examples || []).forEach((example: any) => addExample(example.it, example.fr));
      });
      return;
    }
    if (block.type === 'exceptions') {
      addSection(content.title || 'Exceptions');
      (content.items || []).forEach((item: any) => {
        addParagraph(item.rule, { bold: true, color: BRAND.navy });
        addParagraph(item.explanation);
        (item.examples || []).forEach((example: any) => addExample(example.it, example.fr));
      });
      return;
    }
    if (block.type === 'example_list' || block.type === 'vocab_cards' || block.type === 'chips') {
      const title = content.title || (block.type === 'example_list' ? 'Exemples' : block.type === 'vocab_cards' ? 'Vocabulaire essentiel' : 'Expressions utiles');
      addSection(title);
      const items = block.type === 'example_list' ? content.examples || [] : content.items || [];
      items.forEach((item: any) => addExample(item.it, item.fr));
      return;
    }
    if (block.type === 'steps_text') {
      addSection(content.title || 'Étapes à suivre');
      (content.steps || []).forEach((step: any, index: number) => {
        addBullet(`${index + 1}. ${step.title ? `${step.title} — ` : ''}${step.it || ''}`);
        if (step.fr) addParagraph(step.fr, { color: BRAND.muted, size: 9, indent: 7 });
      });
      return;
    }
    if (block.type === 'key_value_list') {
      if (content.title) addSection(content.title);
      (content.rows || []).forEach((row: any) => addBullet(`${row.key || ''} : ${row.it || ''}${row.fr ? ` — ${row.fr}` : ''}`));
      return;
    }
    if (block.type === 'recap') {
      addSection('À retenir');
      (content.bullets || []).forEach((point: string) => addBullet(point));
      if (content.model) addExample(content.model.it, content.model.fr);
      return;
    }
    if (block.type === 'tip' || block.type === 'warning') {
      addCallout(block.type === 'tip' ? 'Conseil' : 'Attention', content.text, block.type === 'warning');
    }
  };

  const objectiveLines = wrapped(lesson.objective || '', CONTENT_WIDTH - 14, 10);
  if (objectiveLines.length) {
    const objectiveHeight = 13 + objectiveLines.length * 4.8;
    ensureSpace(objectiveHeight + 7);
    doc.setFillColor(...BRAND.ice);
    doc.setDrawColor(...BRAND.line);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, objectiveHeight, 2.5, 2.5, 'FD');
    doc.setFillColor(...BRAND.green);
    doc.roundedRect(MARGIN, y, 2, objectiveHeight, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.green);
    doc.text('OBJECTIF DE LA LEÇON', MARGIN + 7, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.ink);
    doc.text(objectiveLines, MARGIN + 7, y + 13);
    y += objectiveHeight + 8;
  }

  courseBlocks(lesson.blocks || []).forEach(renderBlock);
  if (y <= headerHeight + 12) addParagraph('Le contenu pédagogique de cette leçon sera bientôt disponible.');

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BRAND.line);
    doc.setLineWidth(.35);
    doc.line(MARGIN, FOOTER_Y, PAGE_WIDTH - MARGIN, FOOTER_Y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text('PerckyLingua  ·  Apprendre l’italien, pas à pas', MARGIN, FOOTER_Y + 6);
    doc.text(`${page} / ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y + 6, { align: 'right' });
  }
  return doc;
}

export async function downloadLessonPdf(lesson: Lesson, profile: Pick<LessonPdfOptions, 'avatarUrl' | 'displayName'> = {}): Promise<void> {
  const doc = await createLessonPdf(lesson, profile);
  const date = new Date().toISOString().slice(0, 10);
  doc.save(`PerckyLingua-${safeFilename(lesson.title_it)}-${date}.pdf`);
}
