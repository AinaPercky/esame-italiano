import React, { useEffect, useMemo, useState } from 'react';
import { Download, Upload, Plus, Save, FileText, BarChart3, ArrowLeftRight, RefreshCw } from 'lucide-react';
import type { ClassRoom, ExerciseDefinition, Quiz } from '../types';
import { dataService } from '../services/dataService';
import { exerciseService, convertQuizToExercise, parseExerciseJson } from '../services/exerciseService';

interface Props { classes: ClassRoom[]; }

const EMPTY_JSON = JSON.stringify({
  schema: 'perckylingua.exercise',
  schema_version: 1,
  metadata: { title: 'Nuovo exercice', description: '', category: 'Grammaire', level: 'A1' },
  questions: [{
    id: 'q1', type: 'qcm', question: 'Scegli la risposta corretta.',
    options: ['A', 'B', 'C'], correct_answer: 'A', points: 1,
    time_limit_seconds: 20, explanation: ''
  }]
}, null, 2);

export const ExercisesAdminView: React.FC<Props> = ({ classes }) => {
  const [items, setItems] = useState<ExerciseDefinition[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Autre');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [json, setJson] = useState(EMPTY_JSON);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [showAttempts, setShowAttempts] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await exerciseService.listTeacherExercises());
      setQuizzes(dataService.getQuizzes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const parsed = useMemo(() => {
    try { return parseExerciseJson(json); } catch { return null; }
  }, [json]);

  const resetEditor = () => {
    setSelectedId('');
    setTitle('');
    setDescription('');
    setCategory('Autre');
    setLevel('');
    setStatus('draft');
    setClassIds([]);
    setJson(EMPTY_JSON);
    setError('');
    setMessage('');
    setAttempts([]);
    setShowAttempts(false);
  };

  const loadExercise = (item: ExerciseDefinition) => {
    setSelectedId(item.id);
    setTitle(item.title);
    setDescription(item.description || '');
    setCategory(item.category || 'Autre');
    setLevel(item.level || '');
    setStatus(item.status);
    setClassIds(item.class_ids || []);
    setJson(JSON.stringify({
      schema: 'perckylingua.exercise',
      schema_version: 1,
      metadata: { title: item.title, description: item.description || '', category: item.category, level: item.level || null },
      questions: item.questions
    }, null, 2));
    setError('');
    setMessage('');
    setShowAttempts(false);
  };

  const handleSave = async () => {
    setError(''); setMessage('');
    try {
      const document = parseExerciseJson(json);
      const finalTitle = title.trim() || document.metadata.title;
      if (!finalTitle) throw new Error('Le titre est obligatoire.');
      if (status === 'published' && classIds.length === 0) throw new Error('Attribuez au moins une classe avant de publier.');
      setLoading(true);
      const id = await exerciseService.saveDefinition({
        id: selectedId || null,
        metadata: { title: finalTitle, description, category, level: level || null, status },
        questions: document.questions,
        classIds
      });
      setSelectedId(id);
      setMessage(status === 'published' ? 'Exercice publié et attribué aux classes sélectionnées.' : 'Exercice enregistré en brouillon.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally { setLoading(false); }
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const doc = parseExerciseJson(text);
      setTitle(doc.metadata.title); setDescription(doc.metadata.description);
      setCategory(doc.metadata.category); setLevel(doc.metadata.level || '');
      setJson(JSON.stringify(doc, null, 2));
      setSelectedId('');
      setClassIds([]);
      setStatus('draft');
      setMessage('Fichier validé. Vérifiez le contenu et choisissez les classes avant enregistrement.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Import JSON impossible.'); }
  };

  const handleConvertQuiz = (quizId: string) => {
    const quiz = quizzes.find(q => q.id === quizId);
    if (!quiz) return;
    try {
      const doc = convertQuizToExercise(quiz);
      setSelectedId('');
      setTitle(doc.metadata.title + ' — Exercice');
      setDescription(doc.metadata.description);
      setCategory(doc.metadata.category);
      setLevel(doc.metadata.level || '');
      setClassIds([]);
      setStatus('draft');
      setJson(JSON.stringify({ ...doc, metadata: { ...doc.metadata, title: doc.metadata.title + ' — Exercice' } }, null, 2));
      setMessage('Conversion préparée : vérifiez les durées de chaque question et confirmez les classes avant de créer l’exercice. Le quiz original reste inchangé.');
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Conversion impossible.'); }
  };

  const handleConvertBack = () => {
    try {
      if (!parsed) throw new Error('Corrigez d’abord le JSON de l’exercice.');
      if (classIds.length === 0) throw new Error('Sélectionnez au moins une classe pour le nouveau quiz.');
      const classId = classIds[0];
      const quiz = dataService.createQuiz({
        title: (title || parsed.metadata.title) + ' — Quiz',
        description: description || parsed.metadata.description,
        category: parsed.metadata.category as any,
        level: parsed.metadata.level as any,
        class_id: classId,
        class_ids: classIds,
        duration_minutes: Math.max(1, Math.ceil(parsed.questions.reduce((sum, q) => sum + Number(q.time_limit_seconds || 0), 0) / 60)),
        questions: parsed.questions
      });
      setMessage('Nouveau quiz créé : ' + quiz.title + '. L’exercice et ses tentatives restent inchangés.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Conversion vers quiz impossible.'); }
  };

  const exportJson = () => {
    try {
      const doc = parseExerciseJson(json);
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = (title || doc.metadata.title || 'exercice').toLowerCase().replace(/[^a-z0-9-]+/g, '-') + '.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export impossible.'); }
  };

  const showResults = async (item: ExerciseDefinition) => {
    setError(''); setMessage('');
    try {
      setSelectedId(item.id);
      setAttempts(await exerciseService.listTeacherAttempts(item.id));
      setShowAttempts(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Résultats indisponibles.'); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wider text-[#2fa36b]">Entraînement autonome</p><h1 className="text-2xl font-black text-[#072a3f]">Module Exercices</h1><p className="mt-1 text-sm text-slate-500">Des exercices indépendants des notes et des quiz évaluatifs.</p></div>
        <button type="button" onClick={resetEditor} className="inline-flex items-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-sm font-bold text-white"><Plus size={16}/> Nouvel exercice</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

      {showAttempts ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-[#072a3f]">Tentatives des élèves</h2><button type="button" onClick={() => setShowAttempts(false)} className="text-sm font-semibold text-[#0b3c5d]">Retour</button></div>
          {attempts.length === 0 ? <p className="text-sm text-slate-500">Aucune tentative pour cet exercice.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-2">Élève</th><th className="p-2">Classe</th><th className="p-2">Résultat</th><th className="p-2">État</th><th className="p-2">Date</th></tr></thead><tbody>{attempts.map(row => <tr key={row.attempt_id} className="border-b border-slate-100"><td className="p-2 font-semibold">{row.student_name}</td><td className="p-2">{row.class_name}</td><td className="p-2 tabular-nums">{row.score} / {row.max_score}</td><td className="p-2">{row.status === 'completed' ? 'Terminée' : 'En cours'}</td><td className="p-2">{new Date(row.started_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-[#072a3f]"><FileText size={17}/> Exercices enregistrés</h2>
            {loading && <p className="text-sm text-slate-500">Chargement…</p>}
            {!loading && items.length === 0 && <p className="text-sm text-slate-500">Aucun exercice pour le moment.</p>}
            <div className="grid gap-2 md:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-[#072a3f]">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.questions.length} questions · {item.class_ids.length} classe(s) · v{item.current_version_number}</p></div><span className={'rounded-full px-2 py-1 text-[10px] font-bold ' + (item.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{item.status === 'published' ? 'Publié' : item.status === 'archived' ? 'Archivé' : 'Brouillon'}</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => loadExercise(item)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold">Modifier</button><button type="button" onClick={() => void showResults(item)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold"><BarChart3 size={13}/> Tentatives</button><button type="button" onClick={() => { loadExercise(item); setStatus('archived'); }} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold">Archiver</button></div></article>)}</div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-bold text-[#072a3f]">{selectedId ? 'Modifier l’exercice' : 'Créer un exercice'}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold">Titre<input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" placeholder="Titre de l’exercice"/></label>
              <label className="space-y-1 text-sm font-semibold">Catégorie<input value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-normal"/></label>
              <label className="space-y-1 text-sm font-semibold md:col-span-2">Description<textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" rows={2}/></label>
              <label className="space-y-1 text-sm font-semibold">Niveau<select value={level} onChange={e => setLevel(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-normal"><option value="">Non précisé</option>{['A1','A2','B1','B2','C1','C2'].map(v => <option key={v}>{v}</option>)}</select></label>
              <label className="space-y-1 text-sm font-semibold">Publication<select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-normal"><option value="draft">Brouillon</option><option value="published">Publier</option><option value="archived">Archiver</option></select></label>
            </div>
            <div><p className="mb-2 text-sm font-semibold">Classes autorisées</p><div className="flex flex-wrap gap-2">{classes.map(c => <label key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={classIds.includes(c.id)} onChange={e => setClassIds(old => e.target.checked ? [...old,c.id] : old.filter(id => id !== c.id))}/>{c.name}</label>)}</div></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><Upload size={15}/> Importer JSON<input type="file" accept="application/json,.json" className="hidden" onChange={e => { void handleImportFile(e.target.files?.[0]); e.currentTarget.value=''; }}/></label><select aria-label="Convertir un quiz existant" defaultValue="" onChange={e => { if(e.target.value) handleConvertQuiz(e.target.value); e.currentTarget.value=''; }} className="max-w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"><option value="">Convertir un quiz existant…</option>{quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}</select></div>
            <label className="block space-y-1 text-sm font-semibold">Contenu JSON — chaque question doit avoir un temps strictement positif<textarea value={json} onChange={e => setJson(e.target.value)} spellCheck={false} className="min-h-[360px] w-full rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-emerald-100" /></label>
            <p className="text-xs text-slate-500">{parsed ? parsed.questions.length + ' question(s) validée(s), chronométrées.' : 'Le JSON est invalide ou une question ne possède pas de chronomètre valide.'}</p>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={loading || !parsed} onClick={() => void handleSave()} className="inline-flex items-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Save size={16}/> Enregistrer</button><button type="button" disabled={!parsed} onClick={exportJson} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"><Download size={16}/> Exporter JSON</button><button type="button" disabled={!parsed} onClick={handleConvertBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"><ArrowLeftRight size={16}/> Créer un quiz à partir de cet exercice</button><button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"><RefreshCw size={15}/> Actualiser</button></div>
          </section>
        </>
      )}
    </div>
  );
};
