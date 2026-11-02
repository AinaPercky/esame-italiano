import React, { useEffect, useMemo, useState } from 'react';
import { 
  BookOpen, 
  Copy, 
  Download, 
  Eye, 
  EyeOff, 
  FilePlus2, 
  Globe, 
  Loader2, 
  Pencil, 
  Plus, 
  Save, 
  Trash2, 
  Upload, 
  X, 
  Search, 
  SlidersHorizontal, 
  Clock, 
  Layers, 
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { AuthUser } from '../services/authService';
import { lessonsService } from '../services/lessonsService';
import { Lesson, LessonDraft, LessonLevel, LessonType } from '../types/lessons';
import { validateLessonDraft } from '../utils/lessonValidation';
import { LessonFullPreview, LessonPlayer } from '../components/lessons/LessonRenderer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import '../components/lessons/lessonExperience.css';
import '../components/lessons/lessonGuidedQuiz.css';
import '../components/lessons/lessonPlayer.css';
import completeLessonTemplateText from '../../docs/modele-lecon-complet.json?raw';

const template = (type: LessonType): LessonDraft => ({
  slug: `nouvelle-lecon-${Date.now()}`,
  type,
  level: 'A1',
  duration_min: 10,
  title_it: 'Nuova lezione',
  title_fr: 'Nouvelle leçon',
  objective: 'À la fin de la leçon, je sais…',
  status: 'draft',
  method: 'inductive',
  sort_order: 0,
  access: 'free',
  quiz_ref: null,
  blocks: [
    {
      type: 'dialogue',
      content: {
        lines: [
          { speaker: 'Marta', side: 'left', it: 'Ciao, come stai?', fr: 'Bonjour, comment vas-tu ?' },
          { speaker: 'Luca', side: 'right', it: 'Sto bene, grazie.', fr: 'Je vais bien, merci.' }
        ]
      }
    },
    {
      type: 'discovery',
      content: {
        steps: [
          {
            id: 's1',
            kind: 'choose',
            prompt: 'Que remarquez-vous dans le dialogue ?',
            data: {
              options: [
                { text: 'Une salutation', correct: true, reply: 'Exact.' },
                { text: 'Une recette', correct: false, reply: 'Relisez le dialogue.' }
              ]
            },
            hints: ['Observez le début de la conversation.'],
            ok: 'Bien observé.',
            insight: 'Les salutations ouvrent souvent une conversation.'
          }
        ]
      }
    },
    { type: 'tip', content: { text: 'Touchez une phrase pour l’écouter en italien.' } },
    { type: 'recap', content: { bullets: ['Observez les exemples avant de retenir la règle.', 'Écoutez les phrases plusieurs fois.'] } }
  ]
});

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  grammaire: { bg: 'bg-blue-100', text: 'text-blue-800' },
  vocabulaire: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  fonction: { bg: 'bg-amber-100', text: 'text-amber-800' },
  theme: { bg: 'bg-rose-100', text: 'text-rose-800' },
  prononciation: { bg: 'bg-purple-100', text: 'text-purple-800' }
};

export const LessonsAdminView: React.FC<{ currentUser: AuthUser }> = ({ currentUser }) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [editing, setEditing] = useState<LessonDraft | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [preview, setPreview] = useState<Lesson | null>(null);
  const [previewTab, setPreviewTab] = useState<'student' | 'full'>('student');
  const [json, setJson] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  
  // Mobile search & filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Confirm dialog state for safe in-app deletions
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; lesson: Lesson | null }>({
    isOpen: false,
    lesson: null
  });

  const load = async () => {
    try {
      setLessons(await lessonsService.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const start = (draft: LessonDraft, id?: string) => {
    setEditing(draft);
    setEditingId(id);
    setJson(JSON.stringify(draft, null, 2));
    setError('');
  };

  const createCompleteTemplateJson = () => {
    const value = JSON.parse(completeLessonTemplateText);
    value.slug = `nouvelle-lecon-complete-${Date.now()}`;
    return JSON.stringify(value, null, 2);
  };

  const useCompleteTemplate = () => {
    try {
      const nextJson = createCompleteTemplateJson();
      const draft = JSON.parse(nextJson) as LessonDraft;
      setEditing(draft);
      setEditingId(undefined);
      setJson(nextJson);
      setError('');
      setMessage('Modèle complet chargé : personnalisez son contenu et son slug avant enregistrement.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement du modèle impossible.');
    }
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(successMessage);
      setError('');
    } catch {
      setError('Copie impossible. Vérifiez les autorisations du presse-papiers.');
    }
  };

  const copyCompleteTemplate = () => {
    try {
      void copyText(createCompleteTemplateJson(), 'Modèle complet copié dans le presse-papiers.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copie du modèle impossible.');
    }
  };

  const save = async () => {
    try {
      const parsed = JSON.parse(json);
      const valid = validateLessonDraft(parsed);
      if (!valid.valid || !valid.value) throw new Error(valid.errors.join('\n'));
      const saved = await lessonsService.save(valid.value, editingId, currentUser.id);
      setMessage(saved.slug === valid.value.slug ? 'Leçon enregistrée avec succès.' : `Leçon enregistrée avec le slug « ${saved.slug} » car « ${valid.value.slug} » était déjà utilisé.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON invalide ou non conforme.');
    }
  };

  const importJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const value = JSON.parse(String(reader.result));
        const valid = validateLessonDraft(value);
        if (!valid.valid || !valid.value) throw new Error(valid.errors.join('\n'));
        start(valid.value);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Importation impossible du fichier JSON.');
      }
    };
    reader.readAsText(file);
  };

  const download = () => {
    if (!editing) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editing.slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmDelete = (lesson: Lesson) => {
    setDeleteConfirm({ isOpen: true, lesson });
  };

  const executeDelete = async () => {
    if (!deleteConfirm.lesson) return;
    try {
      await lessonsService.remove(deleteConfirm.lesson.id);
      setMessage(`La leçon « ${deleteConfirm.lesson.title_fr} » a été supprimée.`);
      setDeleteConfirm({ isOpen: false, lesson: null });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.');
      setDeleteConfirm({ isOpen: false, lesson: null });
    }
  };

  const duplicate = async (lesson: Lesson) => {
    try {
      await lessonsService.duplicate(lesson);
      setMessage(`La leçon « ${lesson.title_fr} » a été dupliquée.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplication impossible.');
    }
  };

  const updatePublication = async (lesson: Lesson, status: Lesson['status']) => {
    setUpdatingStatus(lesson.id);
    setError('');
    setMessage('');
    try {
      await lessonsService.updateStatus(lesson.id, status);
      setMessage(status === 'published' ? `« ${lesson.title_fr} » est publiée et accessible aux élèves.` : `« ${lesson.title_fr} » est dépubliée.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mise à jour du statut impossible.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Filtered lessons
  const filteredLessons = useMemo(() => {
    return lessons.filter(l => {
      const matchSearch = !searchTerm || 
        `${l.title_fr} ${l.title_it} ${l.slug} ${l.objective || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || l.status === statusFilter;
      const matchType = typeFilter === 'all' || l.type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [lessons, searchTerm, statusFilter, typeFilter]);

  const publishedCount = lessons.filter(l => l.status === 'published').length;
  const draftCount = lessons.filter(l => l.status === 'draft').length;

  // Full-screen modal for Lesson Preview on Mobile & Desktop
  if (preview) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-y-auto">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur-md sm:px-6 sm:py-3 shadow-xs">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPreviewTab('student')}
              className={`rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                previewTab === 'student' ? 'bg-[#072a3f] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Aperçu élève
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab('full')}
              className={`rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                previewTab === 'full' ? 'bg-[#072a3f] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Vue complète
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block font-mono text-xs text-slate-500 truncate max-w-[200px]">
              {preview.title_fr}
            </span>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm hover:bg-slate-800 transition-colors"
              aria-label="Fermer l’aperçu"
              title="Fermer l’aperçu"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 pb-16">
          {previewTab === 'student' ? (
            <LessonPlayer 
              lesson={preview} 
              avatarUrl={currentUser.avatar} 
              profileName={currentUser.name} 
              showClose={false} 
            />
          ) : (
            <div className="mx-auto max-w-4xl p-3 sm:p-6">
              <LessonFullPreview lesson={preview} revealAll />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header section with responsive layout */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              <Sparkles size={13} className="text-emerald-600" />
              Espace Enseignant · Cours
            </span>
          </div>
          <h1 className="mt-1 font-display text-xl sm:text-2xl font-extrabold text-slate-900">
            Leçons de cours
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
            Créez, éditez et publiez des parcours de découverte interactive de l'italien.
          </p>
        </div>

        {/* Action buttons (grid on mobile, flex on desktop) */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => start(template('grammaire'))}
            className="col-span-2 sm:col-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#0b3c5d] active:scale-98"
          >
            <Plus size={16} />
            <span>Nouvelle leçon</span>
          </button>

          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors">
            <Upload size={14} className="text-slate-500" />
            <span>Importer JSON</span>
            <input type="file" accept="application/json" onChange={importJson} className="hidden" />
          </label>

          <button
            type="button"
            onClick={useCompleteTemplate}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 active:bg-emerald-200 transition-colors"
          >
            <FilePlus2 size={14} className="text-emerald-700" />
            <span>Modèle complet</span>
          </button>

          <button
            type="button"
            onClick={copyCompleteTemplate}
            className="col-span-2 sm:col-auto inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <Copy size={14} className="text-slate-500" />
            <span>Copier le modèle</span>
          </button>
        </div>
      </div>

      {/* Global alert feedback messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs sm:text-sm text-emerald-800 shadow-xs animate-fade-in">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span className="flex-1">{message}</span>
          <button type="button" onClick={() => setMessage('')} className="p-1 text-emerald-600 hover:text-emerald-800">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs sm:text-sm text-rose-800 shadow-xs animate-fade-in">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span className="flex-1 whitespace-pre-line">{error}</span>
          <button type="button" onClick={() => setError('')} className="p-1 text-rose-600 hover:text-rose-800">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Editor Modal */}
      {editing ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-bold text-sm sm:text-base text-slate-900">Éditeur JSON de leçon</h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Format de blocs validé. Modifiez le contenu, la grammaire et les exercices guidés.
              </p>
            </div>
            <button 
              type="button" 
              onClick={() => setEditing(null)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Fermer l'éditeur"
            >
              <X size={18} />
            </button>
          </div>

          <textarea
            value={json}
            onChange={e => setJson(e.target.value)}
            className="min-h-[340px] sm:min-h-[460px] w-full rounded-xl border border-slate-300 bg-slate-950 p-3 sm:p-4 font-mono text-xs text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            spellCheck={false}
          />

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void copyText(json, 'JSON de la leçon copié dans le presse-papiers.')}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Copy size={14} />
              <span>Copier le JSON</span>
            </button>
            <button
              type="button"
              onClick={download}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download size={14} />
              <span>Exporter</span>
            </button>
            <button
              type="button"
              onClick={save}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors"
            >
              <Save size={15} />
              <span>Enregistrer la leçon</span>
            </button>
          </div>
        </section>
      ) : (
        /* Lessons Listing & Filters */
        <div className="space-y-3 sm:space-y-4">
          {/* Mobile-Friendly Search & Status filter bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs space-y-3">
            {/* Quick stats pills */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-[#072a3f] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Toutes ({lessons.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('published')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === 'published'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 size={13} />
                <span>Publiées ({publishedCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('draft')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'draft'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Brouillons ({draftCount})
              </button>
            </div>

            {/* Search Input & Type Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Rechercher une leçon par titre, slug…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-3 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#072a3f]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs sm:text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#072a3f]"
              >
                <option value="all">Tous les types</option>
                <option value="grammaire">Grammaire</option>
                <option value="vocabulaire">Vocabulaire</option>
                <option value="fonction">Fonction</option>
                <option value="theme">Thème</option>
                <option value="prononciation">Prononciation</option>
              </select>
            </div>
          </div>

          {/* Empty state */}
          {filteredLessons.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 sm:p-12 text-center text-slate-500 shadow-2xs">
              <SlidersHorizontal className="mx-auto mb-2 text-slate-400" size={28} />
              <p className="text-sm font-semibold text-slate-700">Aucune leçon ne correspond aux critères.</p>
              <p className="text-xs text-slate-400 mt-1">Créez votre première leçon ou réinitialisez les filtres.</p>
              {(searchTerm || statusFilter !== 'all' || typeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  className="mt-3 text-xs font-bold text-[#072a3f] underline"
                >
                  Effacer les filtres
                </button>
              )}
            </div>
          ) : (
            <>
              {/* MOBILE CARDS VIEW (< md) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredLessons.map(lesson => {
                  const typeColor = TYPE_COLORS[lesson.type] || { bg: 'bg-slate-100', text: 'text-slate-800' };
                  const isPublished = lesson.status === 'published';
                  const isUpdating = updatingStatus === lesson.id;

                  return (
                    <article
                      key={lesson.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-all"
                    >
                      {/* Top Badges Row */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${typeColor.bg} ${typeColor.text}`}>
                            {lesson.type}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {lesson.level}
                          </span>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? 'bg-emerald-600' : 'bg-amber-600'}`} />
                          {isPublished ? 'Publié' : 'Brouillon'}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 className="font-display text-base font-bold text-slate-900 leading-snug">
                        {lesson.title_it}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5 font-medium line-clamp-2">
                        {lesson.title_fr}
                      </p>

                      {/* Metadata Row */}
                      <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={13} className="text-slate-400" />
                          {lesson.duration_min} min
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Layers size={13} className="text-slate-400" />
                          {lesson.blocks?.length || 0} bloc(s)
                        </span>
                        {lesson.quiz_ref && (
                          <span className="inline-flex items-center gap-1 text-[#2fa36b] font-bold">
                            <Sparkles size={12} />
                            Quiz lié
                          </span>
                        )}
                      </div>

                      {/* Mobile Actions Bar */}
                      <div className="mt-3 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => void updatePublication(lesson, isPublished ? 'draft' : 'published')}
                          className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                            isPublished
                              ? 'border border-slate-300 bg-white text-slate-700 active:bg-slate-100'
                              : 'bg-emerald-700 text-white active:bg-emerald-800'
                          }`}
                        >
                          {isUpdating ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : isPublished ? (
                            <EyeOff size={13} />
                          ) : (
                            <Globe size={13} />
                          )}
                          <span>{isUpdating ? 'Patientez…' : isPublished ? 'Dépublier' : 'Publier'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPreviewTab('student');
                            setPreview(lesson);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                          title="Aperçu"
                          aria-label="Aperçu de la leçon"
                        >
                          <Eye size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => start({ ...lesson, blocks: lesson.blocks }, lesson.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                          title="Modifier"
                          aria-label="Modifier la leçon"
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => duplicate(lesson)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                          title="Dupliquer"
                          aria-label="Dupliquer la leçon"
                        >
                          <Copy size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => confirmDelete(lesson)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95 transition-all"
                          title="Supprimer"
                          aria-label="Supprimer la leçon"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* DESKTOP TABLE VIEW (>= md) */}
              <section className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                <div className="grid grid-cols-[140px_1fr_120px_auto] items-center border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Type / Statut</span>
                  <span>Titre & Description</span>
                  <span>Métadonnées</span>
                  <span className="text-right">Actions</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredLessons.map(lesson => {
                    const typeColor = TYPE_COLORS[lesson.type] || { bg: 'bg-slate-100', text: 'text-slate-800' };
                    const isPublished = lesson.status === 'published';
                    const isUpdating = updatingStatus === lesson.id;

                    return (
                      <div
                        key={lesson.id}
                        className="grid grid-cols-[140px_1fr_120px_auto] items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                      >
                        {/* Type & Status */}
                        <div className="space-y-1.5">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${typeColor.bg} ${typeColor.text}`}>
                            {lesson.type} · {lesson.level}
                          </span>
                          <div>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? 'bg-emerald-600' : 'bg-amber-600'}`} />
                              {isPublished ? 'Publié' : 'Brouillon'}
                            </span>
                          </div>
                        </div>

                        {/* Title & Info */}
                        <div className="min-w-0 pr-4">
                          <h3 className="font-display text-sm font-bold text-slate-900 truncate">
                            {lesson.title_it}
                          </h3>
                          <p className="text-xs text-slate-500 truncate">
                            {lesson.title_fr}
                          </p>
                        </div>

                        {/* Metadata */}
                        <div className="text-xs text-slate-500 font-medium space-y-0.5">
                          <p><Clock size={12} className="inline mr-1 text-slate-400" />{lesson.duration_min} min</p>
                          <p><Layers size={12} className="inline mr-1 text-slate-400" />{lesson.blocks?.length || 0} bloc(s)</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => void updatePublication(lesson, isPublished ? 'draft' : 'published')}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                              isPublished
                                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                : 'bg-emerald-700 text-white hover:bg-emerald-800'
                            }`}
                          >
                            {isUpdating ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : isPublished ? (
                              <EyeOff size={13} />
                            ) : (
                              <Globe size={13} />
                            )}
                            <span>{isUpdating ? 'Patientez…' : isPublished ? 'Dépublier' : 'Publier'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPreviewTab('student');
                              setPreview(lesson);
                            }}
                            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            title="Aperçu étudiant"
                          >
                            <Eye size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => start({ ...lesson, blocks: lesson.blocks }, lesson.id)}
                            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            title="Modifier"
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => duplicate(lesson)}
                            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            title="Dupliquer"
                          >
                            <Copy size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => confirmDelete(lesson)}
                            className="rounded-xl p-2 text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* In-App Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Supprimer la leçon"
        message={`Êtes-vous sûr de vouloir supprimer définitivement la leçon « ${deleteConfirm.lesson?.title_fr || ''} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer définitivement"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, lesson: null })}
      />
    </div>
  );
};
