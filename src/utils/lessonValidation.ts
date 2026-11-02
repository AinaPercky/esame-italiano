import { LessonBlock, LessonDraft, LessonLevel, LessonMethod, LessonStatus, LessonType } from '../types/lessons';

const types: LessonType[] = ['grammaire', 'vocabulaire', 'fonction', 'theme', 'prononciation'];
const levels: LessonLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const methods: LessonMethod[] = ['inductive', 'direct'];
const statuses: LessonStatus[] = ['draft', 'published'];

export interface LessonValidationResult { valid: boolean; errors: string[]; value?: LessonDraft; }

/** Accepte le format compact (les propriétés du bloc au niveau supérieur) et
 * le format canonique { type, content }. */
function normalizeLessonInput(input: any): any {
  if (!input || typeof input !== 'object') return input;
  if (input.lesson && typeof input.lesson === 'object' && !input.slug) return normalizeLessonInput(input.lesson);
  return {
    ...input,
    blocks: Array.isArray(input.blocks) ? input.blocks.map((block: any) => {
      if (block?.content && typeof block.content === 'object') return block;
      const { id, type, position, lesson_id, parent_block_id, ...content } = block || {};
      return { id, type, position, lesson_id, parent_block_id, content };
    }) : input.blocks
  };
}

export function validateLessonDraft(input: unknown): LessonValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { valid: false, errors: ['Le JSON doit être un objet.'] };
  const raw = normalizeLessonInput(input) as Partial<LessonDraft>;
  if (!raw.slug?.trim()) errors.push('slug est obligatoire.');
  if (!raw.title_it?.trim()) errors.push('title_it est obligatoire.');
  if (!raw.title_fr?.trim()) errors.push('title_fr est obligatoire.');
  if (!raw.objective?.trim()) errors.push('objective est obligatoire.');
  if (!types.includes(raw.type as LessonType)) errors.push(`type doit être l'un de : ${types.join(', ')}.`);
  if (!levels.includes(raw.level as LessonLevel)) errors.push(`level doit être l'un de : ${levels.join(', ')}.`);
  if (!methods.includes(raw.method as LessonMethod)) errors.push('method doit être inductive ou direct.');
  if (!statuses.includes(raw.status as LessonStatus)) errors.push('status doit être draft ou published.');
  if (!Number.isFinite(Number(raw.duration_min)) || Number(raw.duration_min) < 1) errors.push('duration_min doit être un nombre positif.');
  if (!Array.isArray(raw.blocks)) errors.push('blocks doit être un tableau.');
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  blocks.forEach((block: LessonBlock, index) => {
    if (!block || typeof block !== 'object' || typeof block.type !== 'string') errors.push(`Bloc ${index + 1} : type manquant.`);
    if (!block?.content || typeof block.content !== 'object') errors.push(`Bloc ${index + 1} (${block?.type || '?'}) : content doit être un objet.`);
    if (block?.type === 'formula') {
      const formulas = block.content?.formulas;
      if (!Array.isArray(formulas)) errors.push(`Bloc ${index + 1} formula : formulas doit être un tableau.`);
      formulas?.forEach((formula: any, formulaIndex: number) => {
        if (!Array.isArray(formula.parts) || formula.parts.length < 2) errors.push(`Bloc ${index + 1}, formule ${formulaIndex + 1} : au moins 2 pièces sont requises.`);
      });
    }
    if (block?.type === 'discovery') {
      if (!Array.isArray(block.content?.steps)) errors.push(`Bloc ${index + 1} discovery : steps doit être un tableau.`);
      block.content?.steps?.forEach((step: any, stepIndex: number) => {
        if (!step.id || !step.kind || !step.prompt) errors.push(`Bloc ${index + 1}, étape ${stepIndex + 1} : id, kind et prompt sont obligatoires.`);
        if (step.hints && (!Array.isArray(step.hints) || step.hints.length > 3)) errors.push(`Bloc ${index + 1}, étape ${stepIndex + 1} : maximum 3 indices.`);
      });
    }
  });
  if (errors.length) return { valid: false, errors };
  return { valid: true, errors: [], value: {
    slug: raw.slug!.trim(), type: raw.type as LessonType, level: raw.level as LessonLevel,
    duration_min: Number(raw.duration_min), title_it: raw.title_it!.trim(), title_fr: raw.title_fr!.trim(),
    objective: raw.objective!.trim(), status: raw.status as LessonStatus, method: raw.method as LessonMethod,
    sort_order: Number(raw.sort_order || 0), access: raw.access === 'pass' ? 'pass' : 'free',
    quiz_ref: raw.quiz_ref || null, blocks: blocks.map((block, position) => ({ ...block, position }))
  } };
}
