export type LessonType = 'grammaire' | 'vocabulaire' | 'fonction' | 'theme' | 'prononciation';
export type LessonLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type LessonStatus = 'draft' | 'published';
export type LessonMethod = 'inductive' | 'direct';
export type LessonAccess = 'free' | 'pass';
export type LessonBlockType =
  | 'dialogue' | 'vocab_cards' | 'rules_table' | 'rule_cards' | 'example_list'
  | 'steps_text' | 'key_value_list' | 'chips' | 'tip' | 'warning' | 'recap'
  | 'formula' | 'exceptions' | 'discovery' | 'module';

export interface LessonExample { it: string; fr: string; audio?: string; }
export interface DialogueLine { speaker: string; side?: 'left' | 'right'; it: string; fr: string; audio?: string; }
export interface FormulaPart { text: string; kind: 'slot' | 'fixed' | 'operator'; hint?: string; }
export interface FormulaDefinition { label?: string; parts: FormulaPart[]; examples?: LessonExample[]; }
export interface DiscoveryOption { text: string; correct?: boolean; reply?: string; }
export type DiscoveryKind = 'highlight' | 'choose' | 'compare' | 'complete_table' | 'group' | 'guess_meaning' | 'build_formula' | 'free_text';
export interface DiscoveryStep {
  id: string; kind: DiscoveryKind; prompt: string; data?: any; hints?: string[];
  ok?: string; ko?: string; insight?: string;
}
export interface LessonBlock {
  id?: string; lesson_id?: string; position?: number; type: LessonBlockType;
  content: any; parent_block_id?: string | null;
}
export interface Lesson {
  id: string; slug: string; type: LessonType; level: LessonLevel; duration_min: number;
  title_it: string; title_fr: string; objective: string; status: LessonStatus;
  method: LessonMethod; sort_order: number; access: LessonAccess; quiz_ref?: string | null;
  created_by?: string | null; created_at: string; updated_at: string; blocks: LessonBlock[];
}
export interface LessonProgress {
  user_id: string; lesson_id: string; status: 'started' | 'done';
  discovery_state: {
    currentStepId?: string; completedSteps?: string[]; hintsUsed?: Record<string, number>;
    revealedSteps?: string[]; freeTextAnswers?: Record<string, string>; notebook?: string[];
  };
  updated_at: string;
}
export interface LessonDraft {
  slug: string; type: LessonType; level: LessonLevel; duration_min: number;
  title_it: string; title_fr: string; objective: string; status: LessonStatus;
  method: LessonMethod; sort_order: number; access: LessonAccess; quiz_ref?: string | null;
  blocks: LessonBlock[];
}
