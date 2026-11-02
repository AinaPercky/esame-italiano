import { supabaseService, generateUUID } from './supabaseService';
import { Lesson, LessonDraft, LessonProgress } from '../types/lessons';
import { validateLessonDraft } from '../utils/lessonValidation';

function mapLesson(row: any, blocks: any[] = []): Lesson {
  return {
    id: row.id, slug: row.slug, type: row.type, level: row.level, duration_min: Number(row.duration_min) || 10,
    title_it: row.title_it, title_fr: row.title_fr, objective: row.objective, status: row.status,
    method: row.method || 'inductive', sort_order: Number(row.sort_order) || 0, access: row.access || 'free',
    quiz_ref: row.quiz_ref || null, created_by: row.created_by || null, created_at: row.created_at,
    updated_at: row.updated_at, blocks: blocks.sort((a, b) => (a.position || 0) - (b.position || 0)).map(block => ({
      id: block.id, lesson_id: block.lesson_id, position: block.position, type: block.type,
      content: block.content || {}, parent_block_id: block.parent_block_id || null
    }))
  };
}

class LessonsService {
  private client() {
    const client = supabaseService.getClient();
    if (!client) throw new Error('Supabase n’est pas configuré.');
    return client;
  }
  async getAuthenticatedUserId(fallback: string): Promise<string> {
    const { data } = await this.client().auth.getUser();
    return data.user?.id || fallback;
  }
  async list(options: { publishedOnly?: boolean } = {}): Promise<Lesson[]> {
    const client = this.client();
    let query = client.from('lessons').select('*, lesson_blocks(*)').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (options.publishedOnly) query = query.eq('status', 'published');
    const { data, error } = await query;
    if (error) throw new Error(`Leçons : ${error.message}`);
    return (data || []).map((row: any) => mapLesson(row, row.lesson_blocks || []));
  }
  async get(idOrSlug: string, publishedOnly = false): Promise<Lesson | null> {
    const client = this.client();
    let query = client.from('lessons').select('*, lesson_blocks(*)').or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`).limit(1);
    if (publishedOnly) query = query.eq('status', 'published');
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Leçon : ${error.message}`);
    return data ? mapLesson(data, data.lesson_blocks || []) : null;
  }
  private async ensureUniqueSlug(slug: string, lessonId?: string): Promise<string> {
    const base = slug.trim();
    const { data, error } = await this.client().from('lessons').select('id,slug').like('slug', `${base}%`).limit(500);
    if (error) throw new Error(`Vérification du slug : ${error.message}`);
    const used = new Set((data || []).filter((row: any) => row.id !== lessonId).map((row: any) => row.slug));
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }
  async save(draft: LessonDraft, id?: string, createdBy?: string): Promise<Lesson> {
    const validation = validateLessonDraft(draft);
    if (!validation.valid || !validation.value) throw new Error(validation.errors.join('\n'));
    const client = this.client();
    const lessonId = id || generateUUID();
    const now = new Date().toISOString();
    const uniqueSlug = await this.ensureUniqueSlug(validation.value.slug, id);
    const payload = { ...validation.value, slug: uniqueSlug, id: lessonId, created_by: createdBy || null, updated_at: now };
    delete (payload as any).blocks;
    const { data, error } = await client.from('lessons').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw new Error(`Enregistrement de la leçon : ${error.message}`);
    const { error: deleteError } = await client.from('lesson_blocks').delete().eq('lesson_id', lessonId);
    if (deleteError) throw new Error(`Blocs : ${deleteError.message}`);
    const blocks = validation.value.blocks.map((block, position) => ({
      id: block.id || generateUUID(), lesson_id: lessonId, position, type: block.type,
      content: block.content, parent_block_id: block.parent_block_id || null
    }));
    if (blocks.length) {
      const { error: blockError } = await client.from('lesson_blocks').insert(blocks);
      if (blockError) throw new Error(`Blocs : ${blockError.message}`);
    }
    return mapLesson(data, blocks);
  }
  async remove(id: string): Promise<void> {
    const { error } = await this.client().from('lessons').delete().eq('id', id);
    if (error) throw new Error(`Suppression : ${error.message}`);
  }
  async setPublished(id: string, published: boolean): Promise<Lesson> {
    const { data, error } = await this.client().from('lessons').update({ status: published ? 'published' : 'draft', updated_at: new Date().toISOString() }).eq('id', id).select('*, lesson_blocks(*)').single();
    if (error) throw new Error(`Publication : ${error.message}`);
    return mapLesson(data, data.lesson_blocks || []);
  }
  async duplicate(lesson: Lesson): Promise<Lesson> {
    const draft: LessonDraft = { ...lesson, slug: `${lesson.slug}-copie-${Date.now()}`, status: 'draft', title_fr: `${lesson.title_fr} (copie)`, blocks: lesson.blocks };
    delete (draft as any).id; delete (draft as any).created_at; delete (draft as any).updated_at; delete (draft as any).created_by;
    return this.save(draft);
  }
  async getProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
    const { data, error } = await this.client().from('lesson_progress').select('*').eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle();
    if (error) throw new Error(`Progression : ${error.message}`);
    return data ? { ...data, discovery_state: data.discovery_state || {} } : null;
  }
  async saveProgress(progress: Omit<LessonProgress, 'updated_at'>): Promise<LessonProgress> {
    const payload = { ...progress, updated_at: new Date().toISOString() };
    const { data, error } = await this.client().from('lesson_progress').upsert(payload, { onConflict: 'user_id,lesson_id' }).select().single();
    if (error) throw new Error(`Progression : ${error.message}`);
    return { ...data, discovery_state: data.discovery_state || {} };
  }
}
export const lessonsService = new LessonsService();
