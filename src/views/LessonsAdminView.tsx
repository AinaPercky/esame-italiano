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
import { Lesson, LessonDraft, LessonType } from '../types/lessons';
import { validateLessonDraft } from '../utils/lessonValidation';
import { LessonFullPreview, LessonPlayer } from '../components/lessons/LessonRenderer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  StatusBadge
} from '../components/LearningCard';
import '../components/lessons/lessonExperience.css';
import '../components/lessons/lessonGuidedQuiz.css';
import '../components/lessons/lessonPlayer.css';
import completeLessonTemplateText from '../../docs/modele-lecon-complet.json?raw';
import { MindMapPromptGenerator } from '../components/lessons/MindMapPromptGenerator';
import { downloadLessonPdf } from '../utils/lessonPdf';

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
  const [dialogueHighlightColor, setDialogueHighlightColor] = useState<'green' | 'amber'>('green');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mindMapFile, setMindMapFile] = useState<File | null>(null);
  const [mindMapUrl, setMindMapUrl] = useState<string | null>(null);
  const [mindMapRemoved, setMindMapRemoved] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
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
    setMindMapFile(null);
    setMindMapUrl(draft.mind_map_url || null);
    setMindMapRemoved(false);
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

  const downloadPreviewPdf = async () => {
    if (!preview || downloadingPdf) return;
    setDownloadingPdf(true);
    setError('');
    try {
      await downloadLessonPdf(preview, { avatarUrl: currentUser.avatar, displayName: currentUser.name });
      setMessage('PDF du cours téléchargé.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Téléchargement du PDF impossible.');
    } finally {
      setDownloadingPdf(false);
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
      if (mindMapFile) { const url = await lessonsService.uploadMindMap(saved.id, mindMapFile); saved.mind_map_url = url; }
      else if (mindMapRemoved && saved.mind_map_url) { await lessonsService.removeMindMap(saved.id); saved.mind_map_url = null; }
      setMessage(saved.slug === valid.value.slug ? 'Leçon enregistrée avec succès.' : `Leçon enregistrée avec le slug « ${saved.slug} » car « ${valid.value.slug} » était déjà utilisé.`);
      setEditing(null);
      setMindMapFile(null);
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

  const dialogueBlocksForEditor = useMemo(() => {
    try {
      const parsed = JSON.parse(json);
      return (parsed.blocks || []).map((block: any, index: number) => ({ block, index })).filter(({ block }: any) => block.type === 'dialogue');
    } catch {
      return [];
    }
  }, [json]);

  const toggleDialogueWord = (blockIndex: number, lineIndex: number, wordIndex: number, word: string, color: 'green' | 'amber') => {
    try {
      const parsed = JSON.parse(json);
      const block = parsed.blocks?.[blockIndex];
      if (!block || block.type !== 'dialogue') return;
      block.content = { ...(block.content || {}) };
      // The teacher now selects exact word occurrences; legacy automatic modes are intentionally retired.
      delete block.content.highlight_mode;
      delete block.content.highlight_terms;
      const marks = Array.isArray(block.content.highlight_tokens) ? [...block.content.highlight_tokens] : [];
      const existing = marks.findIndex((mark: any) => mark.line_index === lineIndex && mark.word_index === wordIndex);
      if (existing >= 0) marks.splice(existing, 1);
      else marks.push({ line_index: lineIndex, word_index: wordIndex, text: word, color });
      block.content.highlight_tokens = marks;
      setJson(JSON.stringify(parsed, null, 2));
      setError('');
    } catch {
      setError('Le JSON doit être valide avant de sélectionner les mots du dialogue.');
    }
  };

  const clearDialogueHighlights = (blockIndex: number) => {
    try {
      const parsed = JSON.parse(json);
      const block = parsed.blocks?.[blockIndex];
      if (!block || block.type !== 'dialogue') return;
      block.content = { ...(block.content || {}) };
      delete block.content.highlight_tokens;
      delete block.content.highlight_mode;
      delete block.content.highlight_terms;
      setJson(JSON.stringify(parsed, null, 2));
      setError('');
    } catch {
      setError('Le JSON doit être valide avant de modifier les surbrillances.');
    }
  };

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
            <span className="hidden sm:inline-block font-mono text-xs text-slate-500 truncate max-w-[160px]">
              {preview.title_fr}
            </span>
            <button
              type="button"
              onClick={() => void downloadPreviewPdf()}
              disabled={downloadingPdf}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#072a3f] px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-60"
              title="Télécharger le PDF du cours"
            >
              {downloadingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              <span className="hidden sm:inline">{downloadingPdf ? 'Génération…' : 'PDF'}</span>
            </button>
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

          <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Sélection manuelle des mots à surligner</h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Choisissez une couleur, puis touchez chaque mot italien à surligner. Chaque occurrence peut avoir sa propre couleur.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {dialogueBlocksForEditor.reduce((total: number, item: any) => total + (item.block.content?.highlight_tokens || []).length, 0)} mot(s) sélectionné(s)
              </span>
            </div>
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Couleur à appliquer aux prochains mots</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={dialogueHighlightColor === 'green'} onClick={() => setDialogueHighlightColor('green')} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${dialogueHighlightColor === 'green' ? 'border-emerald-600 bg-emerald-100 text-emerald-950 ring-2 ring-emerald-300' : 'border-slate-300 bg-white text-slate-700'}`}>
                  <span className="h-4 w-4 rounded border border-emerald-500 bg-emerald-300" /> Notion principale
                </button>
                <button type="button" aria-pressed={dialogueHighlightColor === 'amber'} onClick={() => setDialogueHighlightColor('amber')} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${dialogueHighlightColor === 'amber' ? 'border-amber-600 bg-amber-100 text-amber-950 ring-2 ring-amber-300' : 'border-slate-300 bg-white text-slate-700'}`}>
                  <span className="h-4 w-4 rounded border border-amber-500 bg-amber-300" /> Auxiliaire / notion secondaire
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">La couleur choisie s'applique uniquement aux nouveaux mots sélectionnés. Pour changer la couleur d'un mot déjà sélectionné, retirez-le puis sélectionnez-le avec l'autre couleur.</p>
            </div>
            {dialogueBlocksForEditor.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Ajoutez un bloc « dialogue » pour sélectionner les mots à mettre en évidence.</p>
            ) : dialogueBlocksForEditor.map(({ block, index }: any, dialogueIndex: number) => {
              const lines = block.content?.lines || [];
              const marks = block.content?.highlight_tokens || [];
              return (
                <div key={block.id || index} className="border-t border-slate-200 py-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">{dialogueBlocksForEditor.length > 1 ? `Dialogue ${dialogueIndex + 1}` : 'Dialogue de la leçon'}</h4>
                      <p className="text-xs text-slate-500">{marks.length} occurrence(s) sélectionnée(s)</p>
                    </div>
                    <button type="button" onClick={() => clearDialogueHighlights(index)} disabled={!marks.length}
                      className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                      Tout effacer
                    </button>
                  </div>
                  <div className="space-y-3">
                    {lines.map((line: any, lineIndex: number) => {
                      let wordIndex = 0;
                      const tokens = String(line.it || '').split(/(\s+|[^\p{L}\p{M}]+)/u);
                      return (
                        <div key={lineIndex} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">{String(line.speaker || '?').trim().charAt(0).toUpperCase()}</span>
                            <span className="text-xs font-semibold text-slate-700">{line.speaker || `Intervenant ${lineIndex + 1}`}</span>
                            <span className="ml-auto text-[11px] text-slate-400">Réplique {lineIndex + 1}</span>
                          </div>
                          <p className="text-[15px] leading-8 text-slate-900">
                            {tokens.map((token: string, tokenIndex: number) => {
                              if (!/^[\p{L}\p{M}]+$/u.test(token)) return <React.Fragment key={tokenIndex}>{token}</React.Fragment>;
                              const currentWordIndex = wordIndex++;
                              const selectedMark = marks.find((mark: any) => mark.line_index === lineIndex && mark.word_index === currentWordIndex && String(mark.text || '').toLocaleLowerCase('it-IT') === token.toLocaleLowerCase('it-IT'));
                              const selected = Boolean(selectedMark);
                              return <React.Fragment key={tokenIndex}><button type="button"
                                aria-pressed={selected}
                                aria-label={`${selected ? 'Retirer' : 'Surligner'} le mot ${token}, réplique ${lineIndex + 1}`}
                                onClick={() => toggleDialogueWord(index, lineIndex, currentWordIndex, token, dialogueHighlightColor)}
                                className={`mx-0.5 inline rounded-md px-1 py-0.5 font-semibold underline decoration-dotted underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${selected ? (selectedMark.color === 'amber' ? 'bg-amber-200 text-amber-950 ring-1 ring-amber-400' : 'bg-emerald-200 text-emerald-950 ring-1 ring-emerald-400') : 'text-slate-800 hover:bg-emerald-50 hover:text-emerald-900'}`}>
                                {token}
                              </button></React.Fragment>;
                            })}
                          </p>
                          {line.fr && <p className="mt-2 border-t border-slate-200 pt-2 text-xs leading-5 text-slate-500">{line.fr}</p>}
                        </div>
                      );
                    })}
                    {!lines.length && <p className="text-xs text-slate-500">Ce dialogue ne contient pas encore de répliques.</p>}
                  </div>
                </div>
              );
            })}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="inline-block rounded-md bg-emerald-200 px-2 py-1 font-semibold text-emerald-950">Notion principale</span>
              <span className="inline-block rounded-md bg-amber-200 px-2 py-1 font-semibold text-amber-950">Auxiliaire / secondaire</span>
              <span>Appuyez de nouveau sur un mot sélectionné pour retirer sa surbrillance.</span>
            </div>
          </section>

          <textarea
            value={json}
            onChange={e => setJson(e.target.value)}
            className="min-h-[340px] sm:min-h-[460px] w-full rounded-xl border border-slate-300 bg-slate-950 p-3 sm:p-4 font-mono text-xs text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            spellCheck={false}
          />

          <MindMapPromptGenerator lessonJson={json} onCopy={copyText} />

          <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Mind map du cours (facultatif)</h3>
                <p className="mt-1 text-xs text-slate-600">Ajoutez une photo JPG, PNG ou WebP. Elle sera redimensionnée (maximum 1 800 px), compressée et convertie en WebP avant l’envoi.</p>
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#0b3c5d] px-3 py-2 text-xs font-bold text-white">
                <Upload size={14} /> Choisir une photo
                <input type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden" onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) { setMindMapFile(file); setMindMapUrl(URL.createObjectURL(file)); setMindMapRemoved(false); }
                  event.currentTarget.value = '';
                }} />
              </label>
            </div>
            {mindMapUrl && !mindMapRemoved && <div className="mt-3 flex flex-wrap items-start gap-3">
              <img src={mindMapUrl} alt="Aperçu du mind map" className="max-h-48 max-w-full rounded-lg border border-slate-200 bg-white object-contain" />
              <button type="button" onClick={() => { setMindMapFile(null); setMindMapUrl(null); setMindMapRemoved(true); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700"><Trash2 size={13} /> Retirer</button>
            </div>}
            {mindMapRemoved && <p className="mt-3 text-xs text-amber-700">Le mind map sera retiré lors de l’enregistrement.</p>}
            {mindMapFile && <p className="mt-2 text-xs text-emerald-700">Photo sélectionnée : {mindMapFile.name} · conversion WebP à l’enregistrement.</p>}
          </section>

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
              <div className="grid grid-cols-1 gap-3.5 md:hidden">
                {filteredLessons.map(lesson => {
                  const isPublished = lesson.status === 'published';
                  const isUpdating = updatingStatus === lesson.id;

                  return (
                    <LearningCard key={lesson.id} active={isPublished}>
                      <LearningCardHeader
                        kicker={`${lesson.type} · ${lesson.level}`}
                        status={
                          <StatusBadge tone={isPublished ? 'success' : 'warning'}>
                            {isPublished ? 'Publié' : 'Brouillon'}
                          </StatusBadge>
                        }
                      />

                      <div className="min-w-0 space-y-1">
                        <h3 className="break-words font-display text-base font-extrabold leading-snug text-[#072a3f]">
                          {lesson.title_it}
                        </h3>
                        <p className="line-clamp-2 text-xs font-medium text-[#46657a]">
                          {lesson.title_fr}
                        </p>
                      </div>

                      <LearningCardMetrics
                        columns={2}
                        items={[
                          { label: 'Durée', value: `${lesson.duration_min} min` },
                          {
                            label: 'Contenu',
                            value: `${lesson.blocks?.length || 0} bloc(s)`,
                            hint: lesson.quiz_ref ? 'Quiz lié' : undefined,
                            tone: lesson.quiz_ref ? 'accent' : 'default'
                          }
                        ]}
                      />

                      <LearningCardFooter>
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => void updatePublication(lesson, isPublished ? 'draft' : 'published')}
                            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                              isPublished
                                ? 'border border-[#cfe1ec] bg-[#f5f9fc] text-[#0b3c5d] active:bg-[#e6f0f7]'
                                : 'bg-[#2fa36b] text-white active:bg-[#248556]'
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
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d8e6ee] bg-white text-[#46657a] hover:bg-[#f5f9fc] active:scale-95 transition-all"
                            title="Aperçu"
                            aria-label="Aperçu de la leçon"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => start({ ...lesson, blocks: lesson.blocks }, lesson.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d8e6ee] bg-white text-[#46657a] hover:bg-[#f5f9fc] active:scale-95 transition-all"
                            title="Modifier"
                            aria-label="Modifier la leçon"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => duplicate(lesson)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d8e6ee] bg-white text-[#46657a] hover:bg-[#f5f9fc] active:scale-95 transition-all"
                            title="Dupliquer"
                            aria-label="Dupliquer la leçon"
                          >
                            <Copy size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => confirmDelete(lesson)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95 transition-all"
                            title="Supprimer"
                            aria-label="Supprimer la leçon"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </LearningCardFooter>
                    </LearningCard>
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
