import { supabaseService, generateUUID } from './supabaseService';
import { Lesson, LessonDraft, LessonProgress } from '../types/lessons';
import { validateLessonDraft } from '../utils/lessonValidation';
import { prepareLessonBlockRows } from '../utils/lessonPersistence';

function mapLesson(row: any, blocks: any[] = []): Lesson {
  return {
    id: row.id, slug: row.slug, type: row.type, level: row.level, duration_min: Number(row.duration_min) || 10,
    title_it: row.title_it, title_fr: row.title_fr, objective: row.objective, status: row.status,
    method: row.method || 'inductive', sort_order: Number(row.sort_order) || 0, access: row.access || 'free',
    quiz_ref: row.quiz_ref || null, mind_map_url: row.mind_map_url || null, created_by: row.created_by || null, created_at: row.created_at,
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
    let existingCreatedBy: string | null = null;
    let existingId: string | undefined;
    if (!id) {
      const { data: existing, error: lookupError } = await client
        .from('lessons')
        .select('id, created_by')
        .eq('slug', validation.value.slug)
        .maybeSingle();
      if (lookupError) throw new Error(`Recherche de la leçon : ${lookupError.message}`);
      existingId = existing?.id;
      existingCreatedBy = existing?.created_by || null;
    }
    const lessonId = id || existingId || generateUUID();
    const now = new Date().toISOString();
    const uniqueSlug = await this.ensureUniqueSlug(validation.value.slug, lessonId);
    const payload = { ...validation.value, slug: uniqueSlug, id: lessonId, created_by: createdBy || existingCreatedBy, updated_at: now };
    delete (payload as any).blocks;
    const { data, error } = await client.from('lessons').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw new Error(`Enregistrement de la leçon : ${error.message}`);
    const { error: deleteError } = await client.from('lesson_blocks').delete().eq('lesson_id', lessonId);
    if (deleteError) throw new Error(`Blocs : ${deleteError.message}`);
    const blocks = prepareLessonBlockRows(lessonId, validation.value.blocks, generateUUID);
    if (blocks.length) {
      const { error: blockError } = await client.from('lesson_blocks').insert(blocks);
      if (blockError) throw new Error(`Blocs : ${blockError.message}`);
    }
    return mapLesson(data, blocks);
  }
  async uploadMindMap(lessonId: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Veuillez sélectionner un fichier image.');
    if (file.size > 15 * 1024 * 1024) throw new Error('La photo ne doit pas dépasser 15 Mo.');
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossible de lire cette image.')); };
      img.src = url;
    });
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('La compression de la photo est indisponible sur cet appareil.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encodeWebp = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Conversion WebP impossible.')), 'image/webp', quality));
    let blob = await encodeWebp(0.76);
    if (blob.type !== 'image/webp') throw new Error('Ce navigateur ne prend pas en charge la conversion WebP.');
    if (blob.size > 4.5 * 1024 * 1024) {
      canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await encodeWebp(0.62);
    }
    if (blob.size > 4.8 * 1024 * 1024) throw new Error('Cette photo reste trop volumineuse après compression. Choisissez une image plus légère.');
    const client = this.client();
    const path = `${lessonId}/mind-map-${Date.now()}.webp`;
    const { error: uploadError } = await client.storage.from('lesson-mindmaps').upload(path, blob, { contentType: 'image/webp', upsert: true });
    if (uploadError) throw new Error(`Téléversement du mind map : ${uploadError.message}`);
    const { data } = client.storage.from('lesson-mindmaps').getPublicUrl(path);
    const { error: updateError } = await client.from('lessons').update({ mind_map_url: data.publicUrl, updated_at: new Date().toISOString() }).eq('id', lessonId);
    if (updateError) throw new Error(`Enregistrement du mind map : ${updateError.message}`);
    return data.publicUrl;
  }
  async removeMindMap(lessonId: string): Promise<void> {
    const { error } = await this.client().from('lessons').update({ mind_map_url: null, updated_at: new Date().toISOString() }).eq('id', lessonId);
    if (error) throw new Error(`Suppression du mind map : ${error.message}`);
  }
  async remove(id: string): Promise<void> {
    const { error } = await this.client().from('lessons').delete().eq('id', id);
    if (error) throw new Error(`Suppression : ${error.message}`);
  }
  async updateStatus(id: string, status: Lesson['status']): Promise<void> {
    const { data, error } = await this.client()
      .from('lessons')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Publication de la leçon : ${error.message}`);
    if (!data) throw new Error('Aucune leçon mise à jour. Vérifiez que la leçon existe et que vous avez les droits nécessaires.');
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
