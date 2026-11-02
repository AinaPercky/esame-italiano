import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Lesson, LessonBlock } from '../types/lessons';

const BRAND = {
  navy: [7, 42, 63] as [number, number, number],
  blue: [42, 111, 171] as [number, number, number],
  turquoise: [27, 157, 154] as [number, number, number],
  orange: [210, 120, 32] as [number, number, number],
  yellow: [248, 224, 116] as [number, number, number],
  yellowPale: [255, 249, 221] as [number, number, number],
  green: [47, 163, 107] as [number, number, number],
  red: [215, 38, 61] as [number, number, number],
  ink: [31, 49, 71] as [number, number, number],
  muted: [91, 107, 134] as [number, number, number],
  line: [205, 216, 226] as [number, number, number],
  softBlue: [239, 247, 253] as [number, number, number],
  softTurquoise: [235, 249, 247] as [number, number, number]
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 22;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TOP_CONTENT = 34;
const FOOTER_Y = PAGE_HEIGHT - 16;
const FONT_REGULAR = 'NotoSans';
const FONT_BOLD = 'NotoSans-Bold';

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
        } else context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
      } catch { resolve(null); }
    };
    image.onerror = () => resolve(null);
    if (!source.startsWith('data:') && /^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous';
    image.src = source;
  });
}

async function loadBrandLogo(): Promise<RasterImageData> { return loadImageAsPng('/percky-lingua-logo.webp'); }
async function loadProfileAvatar(source?: string | null): Promise<RasterImageData> { return source ? loadImageAsPng(source, true) : null; }

async function addEmbeddedFonts(doc: jsPDF): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  try {
    const files = await Promise.all(['/fonts/NotoSans-Regular.ttf', '/fonts/NotoSans-Bold.ttf'].map(url => fetch(url).then(r => r.arrayBuffer())));
    files.forEach((buffer, index) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      doc.addFileToVFS(index === 0 ? 'NotoSans-Regular.ttf' : 'NotoSans-Bold.ttf', base64);
    });
    doc.addFont('NotoSans-Regular.ttf', FONT_REGULAR, 'normal');
    doc.addFont('NotoSans-Bold.ttf', FONT_BOLD, 'normal');
  } catch {
    // Fallback to the PDF-safe standard font in tests/offline exports.
  }
}

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lecon-italien';
}

function courseBlocks(blocks: LessonBlock[] = []): LessonBlock[] {
  return blocks.flatMap(block => {
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
  await addEmbeddedFonts(doc);
  const regularFont = doc.getFontList()[FONT_REGULAR] ? FONT_REGULAR : 'helvetica';
  const boldFont = doc.getFontList()[FONT_BOLD] ? FONT_BOLD : 'helvetica';
  doc.setProperties({ title: `${lesson.title_it} — PerckyLingua`, subject: lesson.title_fr, creator: 'PerckyLingua', keywords: 'italien, grammaire, leçon' });
  (doc as any).setLanguage?.('fr-FR');

  let y = TOP_CONTENT;
  const font = (bold = false) => doc.setFont(bold ? boldFont : regularFont, 'normal');
  const wrapped = (text: unknown, width = CONTENT_WIDTH, size = 10, bold = false): string[] => {
    font(bold); doc.setFontSize(size); doc.setCharSpace(0);
    return doc.splitTextToSize(normalizePdfText(text), Math.max(10, width - 1)) as string[];
  };
  const pageBottom = FOOTER_Y - 4;
  const ensureSpace = (height: number) => {
    if (y + height > pageBottom) { doc.addPage(); y = TOP_CONTENT; }
  };
  const addPageBreak = () => { doc.addPage(); y = TOP_CONTENT; };

  const addParagraph = (text: unknown, opts: { bold?: boolean; color?: [number, number, number]; size?: number; indent?: number; italic?: boolean } = {}) => {
    if (text === undefined || text === null || String(text).trim() === '') return;
    const size = opts.size || 10.5;
    const x = MARGIN + (opts.indent || 0);
    const lines = wrapped(text, CONTENT_WIDTH - (opts.indent || 0), size, opts.bold);
    const lh = size * 0.46;
    ensureSpace(lines.length * lh + 3);
    font(Boolean(opts.bold)); doc.setFontSize(size); doc.setTextColor(...(opts.color || BRAND.ink));
    doc.text(lines, x, y); y += lines.length * lh + 3;
  };

  const addHeading = (title: string, level = 1) => {
    if (!title?.trim()) return;
    const size = level === 1 ? 15 : 12.5;
    const lines = wrapped(title, CONTENT_WIDTH, size, true);
    ensureSpace(lines.length * 6 + 9);
    font(true); doc.setFontSize(size); doc.setTextColor(...BRAND.navy);
    doc.text(lines, MARGIN, y);
    const lineY = y + lines.length * 5.5 + 2;
    doc.setDrawColor(...(level === 1 ? BRAND.blue : BRAND.line)); doc.setLineWidth(level === 1 ? 0.6 : 0.35);
    doc.line(MARGIN, lineY, PAGE_WIDTH - MARGIN, lineY);
    y = lineY + 6;
  };

  const addSection = (title: string, level = 1) => addHeading(title, level);

  const addCallout = (title: string, text: unknown, kind: 'objectif' | 'conseil' | 'attention' | 'exception' | 'retenir' = 'conseil') => {
    if (!text) return;
    const colors = {
      objectif: { fill: BRAND.softBlue, accent: BRAND.blue }, conseil: { fill: BRAND.softTurquoise, accent: BRAND.turquoise },
      attention: { fill: [255, 247, 235] as [number, number, number], accent: BRAND.orange },
      exception: { fill: [255, 255, 255] as [number, number, number], accent: BRAND.orange }, retenir: { fill: BRAND.yellowPale, accent: BRAND.yellow }
    }[kind];
    const lines = wrapped(text, CONTENT_WIDTH - 13, 9.7);
    const height = 11 + lines.length * 4.5;
    ensureSpace(height + 5);
    doc.setFillColor(...colors.fill); doc.setDrawColor(...colors.accent); doc.setLineWidth(0.65);
    if (kind === 'exception') doc.setLineDashPattern([1.2, 1.2], 0);
    doc.roundedRect(MARGIN, y - 2, CONTENT_WIDTH, height, 1.8, 1.8, 'FD');
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...colors.accent); doc.rect(MARGIN, y - 2, 2, height, 'F');
    font(true); doc.setFontSize(8.5); doc.setTextColor(...BRAND.navy); doc.text(title.toUpperCase(), MARGIN + 7, y + 4);
    font(false); doc.setFontSize(9.7); doc.setTextColor(...BRAND.ink); doc.text(lines, MARGIN + 7, y + 9);
    y += height + 5;
  };

  const addDialogue = (lines: any[]) => {
    if (!lines?.length) return;
    addSection('Dialogue de départ', 1);
    lines.forEach((line: any) => {
      const it = normalizePdfText(String(line.it || '').replace(/==|\+\+/g, ''));
      const fr = normalizePdfText(line.fr || '');
      const itLines = wrapped(it, CONTENT_WIDTH * 0.57, 10.2, true);
      const frLines = wrapped(fr, CONTENT_WIDTH * 0.35, 9.2);
      const h = Math.max(itLines.length * 4.6, frLines.length * 4.4) + 5;
      ensureSpace(h);
      font(true); doc.setFontSize(8); doc.setTextColor(...BRAND.muted); doc.text(normalizePdfText(line.speaker || '—'), MARGIN, y);
      font(true); doc.setFontSize(10.2); doc.setTextColor(...BRAND.navy); doc.text(itLines, MARGIN + 18, y);
      font(false); doc.setFontSize(9.2); doc.setTextColor(...BRAND.muted); doc.text(frLines, MARGIN + CONTENT_WIDTH * 0.62, y);
      doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.25); doc.line(MARGIN + 18, y + h - 2, PAGE_WIDTH - MARGIN, y + h - 2);
      y += h + 2;
    });
  };

  const addExample = (italian: unknown, french?: unknown) => {
    if (!italian && !french) return;
    const left = CONTENT_WIDTH * 0.57; const right = CONTENT_WIDTH * 0.35;
    const itLines = wrapped(italian || '', left, 10.3, true); const frLines = wrapped(french || '', right, 9.2);
    const h = Math.max(itLines.length * 4.6, frLines.length * 4.4) + 4;
    ensureSpace(h);
    font(true); doc.setFontSize(10.3); doc.setTextColor(...BRAND.navy); doc.text(itLines, MARGIN, y);
    font(false); doc.setFontSize(9.2); doc.setTextColor(...BRAND.muted); doc.text(frLines, MARGIN + CONTENT_WIDTH * 0.62, y);
    doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.22); doc.line(MARGIN, y + h - 1.5, PAGE_WIDTH - MARGIN, y + h - 1.5);
    y += h + 2;
  };

  const addVocabTable = (items: any[], title: string) => {
    if (!items?.length) return;
    addSection(title, 1);
    autoTable(doc, {
      startY: y, head: [['Italien', 'Français']], body: items.map(item => [normalizePdfText(item.it), normalizePdfText(item.fr)]),
      theme: 'plain', margin: { left: MARGIN, right: MARGIN, bottom: 22 }, pageBreak: 'auto', rowPageBreak: 'avoid',
      styles: { font: regularFont, fontSize: 10, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, textColor: BRAND.ink, lineColor: BRAND.line, lineWidth: 0.25 },
      headStyles: { font: boldFont, fillColor: [255, 255, 255], textColor: BRAND.navy, lineWidth: 0.45, lineColor: BRAND.navy },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: CONTENT_WIDTH * 0.48 }, 1: { fontStyle: 'normal', textColor: BRAND.muted, cellWidth: CONTENT_WIDTH * 0.52 } },
      didDrawPage: () => { y = TOP_CONTENT; }
    });
    y = (doc as any).lastAutoTable.finalY + 7;
  };

  const addRulesTable = (content: any) => {
    if (content.title) addSection(content.title, 1);
    const columns: string[] = content.columns || []; const rows = content.rows || [];
    if (!rows.length) return;
    autoTable(doc, {
      startY: y, head: [[normalizePdfText(content.label || ''), ...columns.map(normalizePdfText)]], body: rows.map((row: any) => [normalizePdfText(row.label || ''), ...(row.cells || []).map(normalizePdfText)]),
      theme: 'plain', margin: { left: MARGIN, right: MARGIN, bottom: 22 }, rowPageBreak: 'avoid',
      styles: { font: regularFont, fontSize: 9.4, cellPadding: 2.5, textColor: BRAND.ink, lineColor: BRAND.line, lineWidth: 0.22 },
      headStyles: { font: boldFont, fillColor: BRAND.navy, textColor: [255, 255, 255], lineColor: BRAND.navy, lineWidth: 0.4 },
      alternateRowStyles: { fillColor: [250, 252, 253] },
      didDrawPage: () => { y = TOP_CONTENT; }
    });
    y = (doc as any).lastAutoTable.finalY + 7;
  };

  const addFormula = (formula: any) => {
    if (formula.label) addParagraph(formula.label, { bold: true, color: BRAND.navy, size: 10.2 });
    const parts = formula.parts || [];
    ensureSpace(12);
    let x = MARGIN;
    parts.forEach((part: any) => {
      const text = normalizePdfText(part.text || part.hint || '');
      if (!text) return;
      const color = part.kind === 'slot' ? BRAND.green : part.kind === 'operator' ? BRAND.muted : BRAND.orange;
      font(true); doc.setFontSize(13); doc.setTextColor(...color); doc.text(text, x, y);
      x += doc.getTextWidth(text) + 4;
    });
    y += 8;
    (formula.examples || []).forEach((example: any) => addExample(example.it, example.fr));
  };

  const addWritingWorkshop = (title: string) => {
    addSection(title, 1);
    addParagraph('Écris six phrases au passato prossimo à partir des indications. Ne consulte pas la correction : cette page sert à garder une trace de tes essais.', { size: 10 });
    const prompts = ['Hier, je…', 'La semaine dernière, nous…', 'Ce matin, elle…', 'Pendant les vacances, ils…', 'Un événement important : …', 'Une phrase avec essere : …'];
    prompts.forEach((prompt, index) => {
      ensureSpace(18);
      font(true); doc.setFontSize(9.5); doc.setTextColor(...BRAND.navy); doc.text(`${index + 1}. ${prompt}`, MARGIN, y);
      doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.3); doc.line(MARGIN + 8, y + 7, PAGE_WIDTH - MARGIN, y + 7); doc.line(MARGIN + 8, y + 13, PAGE_WIDTH - MARGIN, y + 13);
      y += 18;
    });
  };

  const addDiscoveries = (block: any) => {
    addPageBreak(); addSection('Mes découvertes', 1);
    addParagraph('Avant de lire la règle, note ce que tu observes dans le dialogue. Utilise tes mots : il n’y a pas une seule formulation attendue.', { size: 10 });
    const steps = block?.content?.steps || [];
    steps.slice(0, 6).forEach((step: any, index: number) => {
      ensureSpace(25); font(true); doc.setFontSize(9.7); doc.setTextColor(...BRAND.navy); doc.text(`${index + 1}. ${normalizePdfText(step.prompt || 'Qu’observes-tu ?')}`, MARGIN, y);
      for (let line = 0; line < 3; line += 1) { doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.25); doc.line(MARGIN, y + 7 + line * 6, PAGE_WIDTH - MARGIN, y + 7 + line * 6); }
      y += 27;
    });
  };

  const renderBlock = (block: LessonBlock, numbering: { n: number }) => {
    const content = block.content || {};
    if (block.type === 'dialogue') { addDialogue(content.lines || []); return; }
    if (block.type === 'discovery') { addDiscoveries(block); return; }
    numbering.n += 1;
    const sectionNo = numbering.n;
    if (block.type === 'module') { addSection(`${sectionNo}. ${content.title || 'Module'}`, 1); courseBlocks(content.blocks || []).forEach(child => renderBlock(child, numbering)); return; }
    if (block.type === 'rules_table') { if (content.title) addSection(`${sectionNo}. ${content.title}`, 1); addRulesTable({ ...content, title: '' }); return; }
    if (block.type === 'formula') { addSection(`${sectionNo}. ${content.title || 'Formule générale'}`, 1); (content.formulas || []).forEach(addFormula); return; }
    if (block.type === 'rule_cards') { (content.cards || []).forEach((card: any, index: number) => { addSection(`${sectionNo}.${index + 1} ${card.title || 'Règle'}`, 2); addParagraph(card.text); (card.examples || []).forEach((example: any) => addExample(example.it, example.fr)); }); return; }
    if (block.type === 'exceptions') { addSection(`${sectionNo}. ${content.title || 'Exceptions'}`, 1); (content.items || []).forEach((item: any) => { addCallout(item.rule || 'Exception', `${item.explanation || ''}${item.examples?.length ? ` ${item.examples.map((e: any) => e.it).join(' · ')}` : ''}`, 'exception'); }); return; }
    if (block.type === 'vocab_cards' || block.type === 'chips') { addVocabTable(content.items || [], `${sectionNo}. ${content.title || (block.type === 'vocab_cards' ? 'Vocabulaire essentiel' : 'Expressions utiles')}`); return; }
    if (block.type === 'example_list') { const title = content.title || 'Exemples'; if (/mettiamo in pratica|pratique|pratica/i.test(title)) { addWritingWorkshop(`${sectionNo}. ${title}`); return; } addSection(`${sectionNo}. ${title}`, 1); (content.examples || []).forEach((example: any) => addExample(example.it, example.fr)); return; }
    if (block.type === 'steps_text') { addSection(`${sectionNo}. ${content.title || 'Étapes à suivre'}`, 1); (content.steps || []).forEach((step: any, index: number) => { addParagraph(`${index + 1}. ${step.title || step.it || ''}`, { bold: true, color: BRAND.navy }); if (step.it && step.title) addExample(step.it, step.fr); }); return; }
    if (block.type === 'key_value_list') { if (content.title) addSection(`${sectionNo}. ${content.title}`, 1); (content.rows || []).forEach((row: any) => addExample(`${row.key || ''} : ${row.it || ''}`, row.fr)); return; }
    if (block.type === 'recap') { addCallout('À retenir', (content.bullets || []).map((point: string) => `• ${point}`).join('\n'), 'retenir'); if (content.model) addExample(content.model.it, content.model.fr); return; }
    if (block.type === 'tip' || block.type === 'warning') { addCallout(block.type === 'tip' ? 'Conseil' : 'Attention', content.text, block.type === 'tip' ? 'conseil' : 'attention'); }
  };

  // Première page : en-tête léger puis entrée inductive.
  const titleLines = wrapped(lesson.title_it || 'Leçon d’italien', CONTENT_WIDTH - 30, 18, true);
  const subtitleLines = wrapped(lesson.title_fr || '', CONTENT_WIDTH - 30, 10.5);
  font(true); doc.setFontSize(18); doc.setTextColor(...BRAND.navy); doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 7.5 + 1; font(false); doc.setFontSize(10.5); doc.setTextColor(...BRAND.muted); if (subtitleLines.length) doc.text(subtitleLines, MARGIN, y);
  y += Math.max(1, subtitleLines.length) * 4.8 + 3;
  font(true); doc.setFontSize(8.5); doc.setTextColor(...BRAND.blue); doc.text(`${lessonTypeLabel(lesson.type).toUpperCase()}  ·  ${lesson.level}  ·  ${lesson.duration_min} MIN`, MARGIN, y); y += 7;
  if (lesson.objective) addCallout('Objectif', lesson.objective, 'objectif');

  const blocks = lesson.blocks || [];
  const dialogue = blocks.find(block => block.type === 'dialogue');
  if (dialogue) addDialogue(dialogue.content?.lines || []);
  const discovery = blocks.find(block => block.type === 'discovery');
  if (discovery) addDiscoveries(discovery);
  const numbering = { n: 0 };
  blocks.filter(block => block !== dialogue && block !== discovery).forEach(block => renderBlock(block, numbering));
  if (y <= TOP_CONTENT + 5) addParagraph('Le contenu pédagogique de cette leçon sera bientôt disponible.');

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    // En-tête courant, clair et économe en encre.
    doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.35); doc.line(MARGIN, 16, PAGE_WIDTH - MARGIN, 16);
    font(true); doc.setFontSize(8); doc.setTextColor(...BRAND.navy); doc.text(`Leçon ${lesson.sort_order ? lesson.sort_order : 12} · ${normalizePdfText(lesson.title_it)}`, MARGIN, 12);
    if (logoData && page === 1) { const ratio = logoData.width / Math.max(1, logoData.height); const w = ratio >= 1 ? 14 : 14 * ratio; const h = ratio >= 1 ? 14 / ratio : 14; doc.addImage(logoData.data, 'PNG', PAGE_WIDTH - MARGIN - w, 4.5, w, h, undefined, 'FAST'); }
    if (avatarData && page === 1) { doc.addImage(avatarData.data, 'PNG', PAGE_WIDTH - MARGIN - 18, 18.5, 8, 8, undefined, 'FAST'); font(false); doc.setFontSize(7); doc.setTextColor(...BRAND.muted); doc.text(normalizePdfText(options.displayName || 'Mon profil'), PAGE_WIDTH - MARGIN - 20, 24, { align: 'right' }); }
    doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.35); doc.line(MARGIN, FOOTER_Y, PAGE_WIDTH - MARGIN, FOOTER_Y);
    font(false); doc.setFontSize(8); doc.setTextColor(...BRAND.muted); doc.text('PerckyLingua  ·  Apprendre l’italien, pas à pas', MARGIN, FOOTER_Y + 6); doc.text(`Page ${page} sur ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y + 6, { align: 'right' });
  }
  const outline = (doc as any).outline;
  if (outline?.add) outline.add(null, 'Leçon', 1);
  return doc;
}

export async function downloadLessonPdf(lesson: Lesson, profile: Pick<LessonPdfOptions, 'avatarUrl' | 'displayName'> = {}): Promise<void> {
  const doc = await createLessonPdf(lesson, profile);
  const date = new Date().toISOString().slice(0, 10);
  doc.save(`PerckyLingua-${safeFilename(lesson.title_it)}-${date}.pdf`);
}
