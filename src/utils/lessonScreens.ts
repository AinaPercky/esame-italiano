import { Lesson, LessonBlock, DiscoveryStep } from '../types/lessons';

export type LessonScreen =
  | { kind: 'dialogue'; block: LessonBlock; extras: LessonBlock[]; index: number; total: number }
  | { kind: 'step'; block: LessonBlock; step: DiscoveryStep; stepIndex: number; total: number; extras: LessonBlock[] }
  | { kind: 'part'; block: LessonBlock; extras: LessonBlock[]; index: number; total: number }
  | { kind: 'done'; extras: LessonBlock[] };

const CALLOUT_TYPES = new Set(['tip', 'warning']);

/**
 * Build the student-facing screen sequence without modifying lesson JSON.
 * Dialogue is introduced first, then each discovery prompt, followed by the
 * lesson material in its original relative order and one final completion screen.
 */
export function buildScreens(lesson: Lesson): LessonScreen[] {
  const blocks = lesson.blocks || [];
  const dialogues = blocks.filter(block => block.type === 'dialogue');
  const discoveries = lesson.method === 'inductive' ? blocks.filter(block => block.type === 'discovery') : [];
  const lessonParts = blocks.filter(block => block.type !== 'dialogue' && block.type !== 'discovery' && !CALLOUT_TYPES.has(block.type));
  const totalSteps = discoveries.reduce((total, block) => total + (block.content?.steps?.length || 0), 0);

  const screens: LessonScreen[] = [];
  const screensByBlock = new Map<LessonBlock, number[]>();

  const addForBlock = (block: LessonBlock, screen: LessonScreen) => {
    const screenIndex = screens.length;
    screens.push(screen);
    const indices = screensByBlock.get(block) || [];
    indices.push(screenIndex);
    screensByBlock.set(block, indices);
  };

  dialogues.forEach((block, index) => addForBlock(block, {
    kind: 'dialogue', block, extras: [], index: index + 1, total: dialogues.length
  }));

  let globalStepIndex = 0;
  discoveries.forEach(block => {
    const steps: DiscoveryStep[] = Array.isArray(block.content?.steps) ? block.content.steps : [];
    steps.forEach((step, stepIndex) => {
      globalStepIndex += 1;
      addForBlock(block, { kind: 'step', block, step, stepIndex: globalStepIndex, total: totalSteps, extras: [] });
    });
  });

  lessonParts.forEach((block, index) => addForBlock(block, {
    kind: 'part', block, extras: [], index: index + 1, total: lessonParts.length
  }));

  // Callouts belong to their preceding content screen. If they lead the lesson,
  // attach them to the next content screen; if the lesson contains only callouts,
  // keep them on the final screen so no authored text disappears.
  blocks.forEach((block, blockIndex) => {
    if (!CALLOUT_TYPES.has(block.type)) return;
    let target: number | undefined;
    for (let i = blockIndex - 1; i >= 0 && target === undefined; i -= 1) {
      const mapped = screensByBlock.get(blocks[i]);
      if (mapped?.length) target = mapped[mapped.length - 1];
    }
    if (target === undefined) {
      for (let i = blockIndex + 1; i < blocks.length && target === undefined; i += 1) {
        const mapped = screensByBlock.get(blocks[i]);
        if (mapped?.length) target = mapped[0];
      }
    }
    if (target !== undefined) {
      const screen = screens[target];
      screen.extras.push(block);
    }
  });

  screens.push({ kind: 'done', extras: [] });
  return screens;
}

export function lessonScreenSegment(screen: LessonScreen): 'dialogue' | 'discovery' | 'lesson' {
  if (screen.kind === 'dialogue') return 'dialogue';
  if (screen.kind === 'step') return 'discovery';
  return 'lesson';
}

export function getFirstDiscoveryScreenIndex(screens: LessonScreen[]): number {
  const index = screens.findIndex(screen => screen.kind === 'step');
  return index >= 0 ? index : screens.findIndex(screen => screen.kind === 'done');
}

export function getFirstLessonScreenIndex(screens: LessonScreen[]): number {
  const index = screens.findIndex(screen => screen.kind === 'part');
  return index >= 0 ? index : screens.findIndex(screen => screen.kind === 'done');
}
