import type { LessonBlock } from '../types/lessons';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isLessonUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

function remapBlockReferences(value: unknown, idBySource: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map(item => remapBlockReferences(item, idBySource));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => {
    if ((key === 'source' || key === 'formula_block') && typeof child === 'string') {
      return [key, idBySource.get(child) || child];
    }
    return [key, remapBlockReferences(child, idBySource)];
  }));
}

/** Convert editor/import block aliases to UUIDs required by Supabase and rewrite cross-block references. */
export function prepareLessonBlockRows(
  lessonId: string,
  blocks: LessonBlock[],
  generateId: () => string
): Array<{ id: string; lesson_id: string; position: number; type: string; content: unknown; parent_block_id: string | null }> {
  const idBySource = new Map<string, string>();
  const rows = blocks.map((block, index) => {
    const sourceId = typeof block.id === 'string' ? block.id : undefined;
    const id = isLessonUuid(sourceId) ? sourceId : generateId();
    if (sourceId) idBySource.set(sourceId, id);
    return { block, id, position: index };
  });

  const ids = new Set<string>();
  for (const row of rows) {
    if (!isLessonUuid(row.id) || ids.has(row.id)) {
      throw new Error('Les identifiants UUID des blocs doivent être valides et uniques.');
    }
    ids.add(row.id);
  }

  return rows.map(({ block, id, position }) => {
    const sourceParentId = block.parent_block_id;
    const parentId = sourceParentId
      ? idBySource.get(sourceParentId) || (isLessonUuid(sourceParentId) ? sourceParentId : null)
      : null;
    return {
      id,
      lesson_id: lessonId,
      position,
      type: block.type,
      content: remapBlockReferences(block.content, idBySource),
      parent_block_id: parentId
    };
  });
}
