import React, { useEffect, useMemo, useState } from 'react';
import {
  applyDialogueEmphasisRange,
  buildDialogueSegments,
  DialogueColor,
  DialogueEmphasisMark,
  DialogueEmphasisStyle,
  DialogueHighlightMark,
  DialogueToken,
  getDialogueWords,
  getEmphasisGroupWordIndices,
  normalizeDialogueColor,
  removeDialogueEmphasisAtWord
} from '../utils/lessonDialogueText';
import { 
  BookOpen, 
  Circle,
  Copy, 
  Download, 
  Eraser,
  Eye, 
  EyeOff, 
  FilePlus2, 
  Globe, 
  Highlighter,
  Loader2, 
  Pencil, 
  Plus, 
  RotateCcw,
  Save, 
  Square,
  Trash2, 
  Underline,
  Undo2,
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
  const [dialogueHighlightColor, setDialogueHighlightColor] = useState<DialogueColor>('green');
  const [dialogueMarkMode, setDialogueMarkMode] = useState<'highlight' | DialogueEmphasisStyle | 'erase'>('highlight');
  const [dialogueRangeStart, setDialogueRangeStart] = useState<{ blockIndex: number; lineIndex: number; wordIndex: number; word: string } | null>(null);
  const [dialogueUndoStack, setDialogueUndoStack] = useState<string[]>([]);
  const [hoveredEraseTarget, setHoveredEraseTarget] = useState<{ blockIndex: number; lineIndex: number; wordIndex: number } | null>(null);
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
    setDialogueUndoStack([]);
    setDialogueRangeStart(null);
    setHoveredEraseTarget(null);
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
      setDialogueUndoStack([]);
      setDialogueRangeStart(null);
      setHoveredEraseTarget(null);
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

  const pushDialogueUndo = (snapshot: string) => {
    setDialogueUndoStack(prev => [...prev.slice(-24), snapshot]);
  };

  const undoDialogueMark = () => {
    if (dialogueUndoStack.length === 0) return;
    const previousJson = dialogueUndoStack[dialogueUndoStack.length - 1];
    setDialogueUndoStack(prev => prev.slice(0, -1));
    setJson(previousJson);
    setDialogueRangeStart(null);
    setHoveredEraseTarget(null);
    setError('');
  };

  const toggleDialogueHighlightWord = (blockIndex: number, lineIndex: number, wordIndex: number, word: string, color: DialogueColor) => {
    try {
      const parsed = JSON.parse(json);
      const block = parsed.blocks?.[blockIndex];
      if (!block || block.type !== 'dialogue') return;
      block.content = { ...(block.content || {}) };
      delete block.content.highlight_mode;
      delete block.content.highlight_terms;
      const marks: DialogueHighlightMark[] = Array.isArray(block.content.highlight_tokens) ? [...block.content.highlight_tokens] : [];
      const existing = marks.findIndex(mark => mark.line_index === lineIndex && mark.word_index === wordIndex);
      if (existing >= 0 && normalizeDialogueColor(marks[existing].color) === color) {
        marks.splice(existing, 1);
      } else if (existing >= 0) {
        marks[existing] = { line_index: lineIndex, word_index: wordIndex, text: word, color };
      } else {
        marks.push({ line_index: lineIndex, word_index: wordIndex, text: word, color });
      }
      block.content.highlight_tokens = marks;
      pushDialogueUndo(json);
      setJson(JSON.stringify(parsed, null, 2));
      setError('');
    } catch {
      setError('Le JSON doit être valide avant de sélectionner les mots du dialogue.');
    }
  };

  const removeDialogueMarkAtWord = (blockIndex: number, lineIndex: number, wordIndex: number) => {
    try {
      const parsed = JSON.parse(json);
      const block = parsed.blocks?.[blockIndex];
      if (!block || block.type !== 'dialogue') return;
      block.content = { ...(block.content || {}) };
      const emphasisMarks: DialogueEmphasisMark[] = Array.isArray(block.content.emphasis_tokens) ? [...block.content.emphasis_tokens] : [];
      const emphasisRemoval = removeDialogueEmphasisAtWord(emphasisMarks, lineIndex, wordIndex);
      if (emphasisRemoval.removed) {
        if (emphasisRemoval.marks.length > 0) block.content.emphasis_tokens = emphasisRemoval.marks;
        else delete block.content.emphasis_tokens;
        pushDialogueUndo(json);
        setJson(JSON.stringify(parsed, null, 2));
        setHoveredEraseTarget(null);
        setError('');
        return;
      }

      const highlightMarks: DialogueHighlightMark[] = Array.isArray(block.content.highlight_tokens) ? [...block.content.highlight_tokens] : [];
      const existingHighlight = highlightMarks.findIndex(mark => mark.line_index === lineIndex && mark.word_index === wordIndex);
      if (existingHighlight >= 0) {
        highlightMarks.splice(existingHighlight, 1);
        if (highlightMarks.length > 0) block.content.highlight_tokens = highlightMarks;
        else delete block.content.highlight_tokens;
        pushDialogueUndo(json);
        setJson(JSON.stringify(parsed, null, 2));
        setHoveredEraseTarget(null);
        setError('');
      }
    } catch {
      setError('Le JSON doit être valide avant de retirer un effet du dialogue.');
    }
  };

  const handleDialogueWordClick = (blockIndex: number, lineIndex: number, wordIndex: number, word: string) => {
    if (dialogueMarkMode === 'erase') {
      removeDialogueMarkAtWord(blockIndex, lineIndex, wordIndex);
      return;
    }

    if (dialogueMarkMode === 'highlight') {
      toggleDialogueHighlightWord(blockIndex, lineIndex, wordIndex, word, dialogueHighlightColor);
      return;
    }

    if (!dialogueRangeStart || dialogueRangeStart.blockIndex !== blockIndex || dialogueRangeStart.lineIndex !== lineIndex) {
      setDialogueRangeStart({ blockIndex, lineIndex, wordIndex, word });
      return;
    }

    if (dialogueRangeStart.wordIndex === wordIndex) {
      setDialogueRangeStart(null);
      return;
    }

    const startIndex = Math.min(dialogueRangeStart.wordIndex, wordIndex);
    const endIndex = Math.max(dialogueRangeStart.wordIndex, wordIndex);
    try {
      const parsed = JSON.parse(json);
      const block = parsed.blocks?.[blockIndex];
      const line = block?.content?.lines?.[lineIndex];
      if (!block || block.type !== 'dialogue' || !line) return;
      const words = getDialogueWords(line.it || '');
      if (endIndex - startIndex + 1 < 2) {
        setDialogueRangeStart(null);
        return;
      }
      const existingMarks: DialogueEmphasisMark[] = Array.isArray(block.content.emphasis_tokens) ? [...block.content.emphasis_tokens] : [];
      const nextMarks = applyDialogueEmphasisRange(existingMarks, {
        lineIndex,
        startIndex,
        endIndex,
        words,
        color: dialogueHighlightColor,
        style: dialogueMarkMode
      });
      block.content = { ...(block.content || {}), emphasis_tokens: nextMarks };
      pushDialogueUndo(json);
      setJson(JSON.stringify(parsed, null, 2));
      setError('');
    } catch {
      setError('Le JSON doit être valide avant de sélectionner une expression du dialogue.');
    } finally {
      setDialogueRangeStart(null);
    }
  };

  const clearDialogueHighlights = (blockIndex: number) => {
    setDialogueRangeStart(null);
    setHoveredEraseTarget(null);
    try {
      const parsed = JSON.parse(json);
      const block = parsed.blocks?.[blockIndex];
      if (!block || block.type !== 'dialogue') return;
      pushDialogueUndo(json);
      block.content = { ...(block.content || {}) };
      delete block.content.highlight_tokens;
      delete block.content.emphasis_tokens;
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

          {(() => {
            const totalMarksCount = dialogueBlocksForEditor.reduce(
              (total: number, item: any) =>
                total + (item.block.content?.highlight_tokens || []).length + (item.block.content?.emphasis_tokens || []).length,
              0
            );
            const singleDialogueIndex = dialogueBlocksForEditor.length === 1 ? dialogueBlocksForEditor[0].index : null;
            const modeHint = dialogueRangeStart
              ? null
              : dialogueMarkMode === 'erase'
                ? 'Cliquez sur un mot ou une expression marquée pour retirer son effet.'
                : dialogueMarkMode === 'highlight'
                  ? 'Cliquez sur un mot pour le surligner ou changer sa couleur.'
                  : `Cliquez sur le 1er puis le dernier mot pour les ${
                      dialogueMarkMode === 'underline'
                        ? 'souligner'
                        : dialogueMarkMode === 'outline'
                          ? 'encadrer'
                          : 'entourer'
                    } ensemble.`;

            const HIGHLIGHT_CLASSES: Record<DialogueColor, string> = {
              green: 'bg-emerald-200 text-emerald-950 ring-1 ring-emerald-400',
              amber: 'bg-amber-200 text-amber-950 ring-1 ring-amber-400',
              blue: 'bg-sky-200 text-sky-950 ring-1 ring-sky-400',
              purple: 'bg-violet-200 text-violet-950 ring-1 ring-violet-400',
              rose: 'bg-rose-200 text-rose-950 ring-1 ring-rose-400',
              teal: 'bg-teal-200 text-teal-950 ring-1 ring-teal-400'
            };

            return (
              <section className="mb-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
                {/* Sticky compact toolbar: stays pinned below Header and above scrollable dialogue lines */}
                <div className="sticky top-[100px] sm:top-[108px] lg:top-[69px] z-20 rounded-t-xl border-b border-slate-200 bg-white/95 px-3 py-2.5 shadow-2xs backdrop-blur-sm sm:px-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-sm font-bold text-slate-900">Mise en valeur du dialogue</h3>
                      <span className="text-xs font-medium text-slate-500">
                        · {totalMarksCount} mot{totalMarksCount > 1 ? 's' : ''} marqué{totalMarksCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={undoDialogueMark}
                        disabled={dialogueUndoStack.length === 0}
                        title="Annuler la dernière action"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3c5d]"
                      >
                        <Undo2 size={14} />
                        <span>Annuler</span>
                      </button>
                      {singleDialogueIndex !== null && (
                        <button
                          type="button"
                          onClick={() => clearDialogueHighlights(singleDialogueIndex)}
                          disabled={totalMarksCount === 0}
                          title="Supprimer toutes les mises en valeur du dialogue"
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3c5d]"
                        >
                          <RotateCcw size={13} />
                          <span>Tout effacer</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Unified Effect + Color strip */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Effet de mise en valeur">
                      {([
                        { id: 'highlight', label: 'Surligner', Icon: Highlighter },
                        { id: 'underline', label: 'Souligner', Icon: Underline },
                        { id: 'outline', label: 'Encadrer', Icon: Square },
                        { id: 'circle', label: 'Entourer', Icon: Circle },
                        { id: 'erase', label: 'Retirer', Icon: Eraser }
                      ] as const).map(({ id, label, Icon }) => {
                        const isActive = dialogueMarkMode === id;
                        const activeStyle =
                          id === 'erase'
                            ? 'border-rose-600 bg-rose-50 text-rose-800 ring-1 ring-rose-600'
                            : 'border-[#0b3c5d] bg-[#e6f0f7] text-[#072a3f] ring-1 ring-[#0b3c5d]';
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => {
                              setDialogueMarkMode(id);
                              setDialogueRangeStart(null);
                              setHoveredEraseTarget(null);
                            }}
                            className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3c5d] ${
                              isActive ? activeStyle : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Icon size={14} className="shrink-0" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <span className="hidden lg:block h-6 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

                    <div
                      className={`flex flex-wrap items-center gap-1 transition-opacity ${dialogueMarkMode === 'erase' ? 'opacity-40' : ''}`}
                      role="group"
                      aria-label="Couleur de mise en valeur"
                    >
                      {([
                        { id: 'green', label: 'Vert', swatch: 'bg-emerald-400 border-emerald-600', active: 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500' },
                        { id: 'amber', label: 'Ambre', swatch: 'bg-amber-400 border-amber-600', active: 'border-amber-600 bg-amber-50 text-amber-950 ring-1 ring-amber-500' },
                        { id: 'blue', label: 'Bleu', swatch: 'bg-sky-400 border-sky-600', active: 'border-sky-600 bg-sky-50 text-sky-950 ring-1 ring-sky-500' },
                        { id: 'purple', label: 'Violet', swatch: 'bg-violet-400 border-violet-600', active: 'border-violet-600 bg-violet-50 text-violet-950 ring-1 ring-violet-500' },
                        { id: 'rose', label: 'Rose', swatch: 'bg-rose-400 border-rose-600', active: 'border-rose-600 bg-rose-50 text-rose-950 ring-1 ring-rose-500' },
                        { id: 'teal', label: 'Turquoise', swatch: 'bg-teal-400 border-teal-600', active: 'border-teal-600 bg-teal-50 text-teal-950 ring-1 ring-teal-500' }
                      ] as const).map(color => (
                        <button
                          key={color.id}
                          type="button"
                          disabled={dialogueMarkMode === 'erase'}
                          aria-pressed={dialogueHighlightColor === color.id}
                          onClick={() => setDialogueHighlightColor(color.id)}
                          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3c5d] ${
                            dialogueHighlightColor === color.id
                              ? color.active
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`h-3.5 w-3.5 shrink-0 rounded-sm border ${color.swatch}`} />
                          <span>{color.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Single concise contextual hint */}
                  {dialogueRangeStart ? (
                    <div
                      className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900"
                      role="status"
                    >
                      <span>
                        1er mot : <strong>« {dialogueRangeStart.word} »</strong> — cliquez sur le dernier mot de l’expression dans la même réplique.
                      </span>
                      <button
                        type="button"
                        onClick={() => setDialogueRangeStart(null)}
                        className="font-bold text-amber-950 underline hover:no-underline"
                      >
                        Annuler sélection
                      </button>
                    </div>
                  ) : (
                    <p
                      className={`mt-1.5 text-xs ${
                        dialogueMarkMode === 'erase' ? 'font-medium text-rose-700' : 'text-slate-500'
                      }`}
                    >
                      {modeHint}
                    </p>
                  )}
                </div>

                {/* Compact dialogue lines */}
                {dialogueBlocksForEditor.length === 0 ? (
                  <p className="p-3 text-sm text-slate-600">
                    Ajoutez un bloc « dialogue » pour sélectionner les mots à mettre en évidence.
                  </p>
                ) : (
                  <div className="max-h-[55vh] overflow-y-auto overscroll-contain divide-y divide-slate-200">
                    {dialogueBlocksForEditor.map(({ block, index }: any, dialogueIndex: number) => {
                      const lines = block.content?.lines || [];
                      const marks: DialogueHighlightMark[] = block.content?.highlight_tokens || [];
                      const emphasisMarks: DialogueEmphasisMark[] = block.content?.emphasis_tokens || [];

                      const renderWordButton = (token: DialogueToken, lineIndex: number, key: string, inHoveredEraseGroup: boolean) => {
                        if (!token.isWord || token.wordIndex === null) {
                          return <React.Fragment key={key}>{token.raw}</React.Fragment>;
                        }
                        const currentWordIndex = token.wordIndex;
                        const selectedMark = marks.find(
                          mark =>
                            mark.line_index === lineIndex &&
                            mark.word_index === currentWordIndex &&
                            (!mark.text || mark.text.toLocaleLowerCase('it-IT') === token.raw.toLocaleLowerCase('it-IT'))
                        );
                        const selectedEmphasis = emphasisMarks.find(
                          mark =>
                            mark.line_index === lineIndex &&
                            mark.word_index === currentWordIndex &&
                            (!mark.text || mark.text.toLocaleLowerCase('it-IT') === token.raw.toLocaleLowerCase('it-IT'))
                        );
                        const isRangeStart =
                          dialogueRangeStart?.blockIndex === index &&
                          dialogueRangeStart?.lineIndex === lineIndex &&
                          dialogueRangeStart?.wordIndex === currentWordIndex;
                        const hasAnyMark = Boolean(selectedMark || selectedEmphasis);
                        const isEraseHighlightHover =
                          dialogueMarkMode === 'erase' &&
                          !selectedEmphasis &&
                          Boolean(selectedMark) &&
                          hoveredEraseTarget?.blockIndex === index &&
                          hoveredEraseTarget?.lineIndex === lineIndex &&
                          hoveredEraseTarget?.wordIndex === currentWordIndex;
                        const highlightClass = selectedMark
                          ? HIGHLIGHT_CLASSES[normalizeDialogueColor(selectedMark.color)]
                          : '';

                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={dialogueMarkMode === 'highlight' ? Boolean(selectedMark) : Boolean(selectedEmphasis && selectedEmphasis.style === dialogueMarkMode)}
                            aria-label={`${
                              dialogueMarkMode === 'erase'
                                ? hasAnyMark
                                  ? "Retirer l'effet de"
                                  : 'Aucun effet sur'
                                : 'Sélectionner'
                            } ${token.raw}, réplique ${lineIndex + 1}`}
                            onMouseEnter={() => {
                              if (dialogueMarkMode === 'erase' && hasAnyMark) {
                                setHoveredEraseTarget({ blockIndex: index, lineIndex, wordIndex: currentWordIndex });
                              }
                            }}
                            onMouseLeave={() => {
                              if (hoveredEraseTarget) setHoveredEraseTarget(null);
                            }}
                            onClick={() => handleDialogueWordClick(index, lineIndex, currentWordIndex, token.raw)}
                            className={`inline rounded px-0.5 py-0.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${highlightClass} ${
                              isRangeStart ? 'bg-amber-100 text-amber-950 ring-2 ring-amber-500' : ''
                            } ${
                              isEraseHighlightHover || inHoveredEraseGroup
                                ? 'bg-rose-100/90 text-rose-900 line-through'
                                : dialogueMarkMode === 'erase' && hasAnyMark
                                  ? 'cursor-pointer hover:bg-rose-50'
                                  : 'text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            {token.raw}
                          </button>
                        );
                      };

                      return (
                        <div key={block.id || index}>
                          {dialogueBlocksForEditor.length > 1 && (
                            <div className="flex items-center justify-between gap-2 bg-slate-50/70 px-3 py-2 border-b border-slate-100 sm:px-4">
                              <h4 className="text-xs font-bold text-slate-700">
                                Dialogue {dialogueIndex + 1} · {marks.length + emphasisMarks.length} mot(s) marqué(s)
                              </h4>
                              <button
                                type="button"
                                onClick={() => clearDialogueHighlights(index)}
                                disabled={!marks.length && !emphasisMarks.length}
                                className="min-h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Tout effacer
                              </button>
                            </div>
                          )}

                          <div className="divide-y divide-slate-100">
                            {lines.map((line: any, lineIndex: number) => {
                              const lineEmphasisMarks = emphasisMarks.filter(mark => mark.line_index === lineIndex);
                              const { segments } = buildDialogueSegments(String(line.it || ''), lineEmphasisMarks);
                              const hoveredGroupWordIndices =
                                dialogueMarkMode === 'erase' &&
                                hoveredEraseTarget &&
                                hoveredEraseTarget.blockIndex === index &&
                                hoveredEraseTarget.lineIndex === lineIndex
                                  ? getEmphasisGroupWordIndices(emphasisMarks, lineIndex, hoveredEraseTarget.wordIndex)
                                  : null;

                              return (
                                <div
                                  key={lineIndex}
                                  className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-baseline sm:gap-3 sm:px-4"
                                >
                                  <div className="flex items-center gap-1.5 sm:w-28 shrink-0">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                                      {String(line.speaker || '?').trim().charAt(0).toUpperCase()}
                                    </span>
                                    <span className="truncate text-xs font-semibold text-slate-700">
                                      {line.speaker || `Rép. ${lineIndex + 1}`}
                                    </span>
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className="text-[15px] leading-8 text-slate-900">
                                      {segments.map((segment, segIdx) => {
                                        if (segment.kind === 'token') {
                                          return renderWordButton(segment.token, lineIndex, `${lineIndex}-t-${segIdx}`, false);
                                        }
                                        const isGroupEraseHovered =
                                          hoveredGroupWordIndices !== null &&
                                          segment.tokens.some(
                                            tok => tok.isWord && tok.wordIndex !== null && hoveredGroupWordIndices.has(tok.wordIndex)
                                          );
                                        return (
                                          <span
                                            key={`${lineIndex}-g-${segIdx}`}
                                            className={`lesson-word-emphasis lesson-word-emphasis-${segment.style} lesson-word-emphasis-${segment.color} ${
                                              isGroupEraseHovered ? 'bg-rose-50/90 ring-2 ring-rose-400' : ''
                                            }`}
                                          >
                                            {segment.tokens.map((tok, tokIdx) =>
                                              renderWordButton(tok, lineIndex, `${lineIndex}-g-${segIdx}-${tokIdx}`, isGroupEraseHovered)
                                            )}
                                          </span>
                                        );
                                      })}
                                    </p>
                                    {line.fr && (
                                      <p className="mt-0.5 text-xs leading-5 text-slate-500">{line.fr}</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {!lines.length && (
                              <p className="px-3 py-2.5 text-xs text-slate-500">
                                Ce dialogue ne contient pas encore de répliques.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })()}

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
