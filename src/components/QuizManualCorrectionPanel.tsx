import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, FileText, Save, Search, ShieldCheck, X } from 'lucide-react';
import { Quiz, QuizQuestion, QuizSubmission } from '../types';

interface QuizManualCorrectionPanelProps {
  quiz: Quiz;
  submissions: QuizSubmission[];
  onClose: () => void;
  onSave: (submissionId: string, questionScores: Record<string, number>, questionComments: Record<string, string>, generalComment: string) => Promise<QuizSubmission>;
}

const questionTypeLabel: Record<QuizQuestion['type'], string> = {
  qcm: 'QCM', text: 'Réponse libre', reorder: 'Réordonnement', verbes_trous: 'Verbes à trous', mots_trous: 'Mots à trous'
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Aucune réponse';
  if (Array.isArray(value)) return value.map(item => String(item ?? '')).join(' · ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  const text = String(value);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(item => String(item ?? '')).join(' · ');
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 2);
  } catch { /* Réponse texte ordinaire. */ }
  return text;
}

function hasStudentResponse(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null) return false;
      if (Array.isArray(parsed)) return parsed.some(item => hasStudentResponse(item));
      if (typeof parsed === 'object') return Object.values(parsed as Record<string, unknown>).some(item => hasStudentResponse(item));
    } catch { /* Texte ordinaire : une chaîne non vide constitue une réponse. */ }
    return true;
  }
  if (Array.isArray(value)) return value.some(item => hasStudentResponse(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(item => hasStudentResponse(item));
  return true;
}

function expectedAnswer(question: QuizQuestion): string {
  if (question.type === 'qcm') {
    const raw = String(question.correct_answer ?? '').trim();
    const index = /^\d+$/.test(raw) ? Number(raw) : -1;
    return index >= 0 && question.options?.[index] !== undefined ? question.options[index] : raw;
  }
  if (question.type === 'text') {
    const expected = Array.isArray(question.answers) && question.answers.length
      ? question.answers
      : String(question.correct_answer || '').split(/\s*(?:\||\/)\s*/).filter(Boolean);
    return expected.join(' · ');
  }
  if (question.type === 'reorder') {
    try {
      const ids = JSON.parse(question.correct_answer || '[]');
      if (Array.isArray(ids)) {
        const ordered = ids.map(id => question.items?.find(item => item.id === String(id))?.text || String(id));
        if (ordered.length) return ordered.join(' → ');
      }
    } catch { /* Compatibilité avec les anciens corrigés textuels. */ }
    return (question.items || []).map(item => item.text).join(' → ') || question.correct_answer;
  }
  if (question.type === 'verbes_trous') {
    const phrases = question.verbes_trous?.phrases || question.phrases || [];
    return phrases.map((phrase, index) => (index + 1) + '. ' + (phrase.verbe || 'Verbe') + ' : ' + ((phrase.reponses?.filter(Boolean) || []).join(' / ') || 'Réponse non définie')).join('\n');
  }
  if (question.type === 'mots_trous') {
    return (question.mots_trous?.phrases || []).map((phrase, index) => (index + 1) + '. ' + (phrase.mot || 'Réponse non définie')).join('\n');
  }
  return question.correct_answer || 'Corrigé non disponible';
}

function submissionStatus(submission: QuizSubmission): string {
  if (submission.status === 'completed') return 'Terminée';
  if (submission.status === 'timeout') return 'Temps écoulé';
  return 'Absence';
}

export const QuizManualCorrectionPanel: React.FC<QuizManualCorrectionPanelProps> = ({ quiz, submissions, onClose, onSave }) => {
  const [search, setSearch] = useState('');
  const [questionFilter, setQuestionFilter] = useState<'all' | 'review' | 'correct' | 'missing'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(submissions.find(item => item.quiz_id === quiz.id)?.id || null);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [questionComments, setQuestionComments] = useState<Record<string, string>>({});
  const [generalComment, setGeneralComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedSubmission, setSavedSubmission] = useState<QuizSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { savingRef.current = saving; }, [saving]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const getFocusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ) || []).filter(element => element.offsetParent !== null);
    getFocusable()[0]?.focus();

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!savingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeys);
    return () => {
      document.removeEventListener('keydown', handleDialogKeys);
      previousFocus?.focus();
    };
  }, []);

  const quizSubmissions = useMemo(() => submissions.filter(item => item.quiz_id === quiz.id).sort((a, b) =>
    new Date(b.submitted_at || b.started_at).getTime() - new Date(a.submitted_at || a.started_at).getTime()
  ), [submissions, quiz.id]);

  const filteredSubmissions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return quizSubmissions;
    return quizSubmissions.filter(item => (item.student_name + ' ' + (item.student_number || '') + ' ' + (item.class_name || '')).toLocaleLowerCase().includes(term));
  }, [quizSubmissions, search]);

  const selectedSubmission = savedSubmission?.id === selectedId ? savedSubmission : quizSubmissions.find(item => item.id === selectedId) || null;
  const questions = selectedSubmission?.questions_snapshot || [];
  const isSnapshotMissing = !selectedSubmission?.questions_snapshot?.length;
  const canReview = Boolean(selectedSubmission && selectedSubmission.status !== 'missed' && !isSnapshotMissing);
  const automaticTotal = questions.reduce((sum, question) => sum + (Number(selectedSubmission?.manual_review?.automatic_feedback?.[question.id]?.points ?? selectedSubmission?.feedback?.[question.id]?.points) || 0), 0);
  const maxTotal = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
  const manualTotal = questions.reduce((sum, question) => {
    const raw = points[question.id];
    const value = raw === undefined ? Number(selectedSubmission?.manual_review?.question_scores?.[question.id] ?? selectedSubmission?.feedback?.[question.id]?.points ?? 0) : Number(raw);
    return sum + (Number.isFinite(value) ? Math.min(Number(question.points) || 0, Math.max(0, value)) : 0);
  }, 0);
  // Tant qu'aucune vérification n'est enregistrée, la note automatique reste la note officielle du quiz.
  const retainedScore20 = selectedSubmission?.manual_review
    ? (maxTotal > 0 ? Number((manualTotal / maxTotal * 20).toFixed(1)) : 0)
    : Number(selectedSubmission?.score_20 ?? 0);
  const pendingCount = quizSubmissions.filter(item => !item.manual_review && item.status !== 'missed' && item.questions_snapshot?.length).length;
  const reviewedCount = quizSubmissions.filter(item => Boolean(item.manual_review)).length;
  const questionStatus = (question: QuizQuestion): 'missing' | 'correct' | 'review' => {
    if (!hasStudentResponse(selectedSubmission?.answers?.[question.id])) return 'missing';
    const automatic = selectedSubmission?.manual_review?.automatic_feedback?.[question.id] || selectedSubmission?.feedback?.[question.id];
    const raw = points[question.id];
    const awarded = raw === undefined ? Number(selectedSubmission?.manual_review?.question_scores?.[question.id] ?? automatic?.points ?? 0) : Number(raw);
    return awarded >= Number(question.points || 0) && Number(question.points || 0) > 0 ? 'correct' : 'review';
  };
  const visibleQuestions = questions.filter(question => questionFilter === 'all' || questionStatus(question) === questionFilter);
  const correctQuestionCount = questions.filter(question => questionStatus(question) === 'correct').length;
  const reviewQuestionCount = questions.filter(question => questionStatus(question) === 'review').length;
  const missingQuestionCount = questions.filter(question => questionStatus(question) === 'missing').length;

  useEffect(() => {
    if (!selectedSubmission) return;
    const initialPoints: Record<string, string> = {};
    const initialComments: Record<string, string> = {};
    (selectedSubmission.questions_snapshot || []).forEach(question => {
      const savedPoints = selectedSubmission.manual_review?.question_scores?.[question.id];
      initialPoints[question.id] = String(savedPoints ?? selectedSubmission.manual_review?.automatic_feedback?.[question.id]?.points ?? selectedSubmission.feedback?.[question.id]?.points ?? 0);
      initialComments[question.id] = selectedSubmission.manual_review?.question_comments?.[question.id] || '';
    });
    setPoints(initialPoints);
    setQuestionComments(initialComments);
    setGeneralComment(selectedSubmission.manual_review?.general_comment || '');
    setSavedSubmission(null);
    setError(null);
  }, [selectedId]);

  const selectSubmission = (submission: QuizSubmission) => {
    if (saving) return;
    setSelectedId(submission.id);
    setQuestionFilter('all');
    setMobileDetailOpen(true);
  };

  const handleSave = async () => {
    if (!selectedSubmission || !canReview) return;
    setError(null);
    const scores: Record<string, number> = {};
    for (const question of questions) {
      const rawValue = points[question.id] ?? String(selectedSubmission.manual_review?.question_scores?.[question.id] ?? selectedSubmission.feedback?.[question.id]?.points ?? 0);
      const value = Number(rawValue);
      const maximum = Number(question.points) || 0;
      if (String(rawValue).trim() === '' || !Number.isFinite(value) || value < 0 || value > maximum) {
        setError('La note de la question « ' + question.question + ' » doit être comprise entre 0 et ' + maximum + ' points.');
        return;
      }
      scores[question.id] = value;
    }
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const maximumTotal = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
    if (!window.confirm('Confirmer l’enregistrement de la correction ?\n\nPoints attribués : ' + total.toFixed(2) + ' / ' + maximumTotal.toFixed(2) + '.\nChaque note respecte le barème de sa question.')) return;
    try {
      setSaving(true);
      const updated = await onSave(selectedSubmission.id, scores, questionComments, generalComment);
      setSavedSubmission(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'La correction n’a pas pu être enregistrée.');
    } finally {
      setSaving(false);
    }
  };

  const resetToAutomatic = () => {
    if (!selectedSubmission) return;
    setPoints(Object.fromEntries(questions.map(question => [question.id, String(selectedSubmission.manual_review?.automatic_feedback?.[question.id]?.points ?? selectedSubmission.feedback?.[question.id]?.points ?? 0)])));
    setQuestionComments({});
    setGeneralComment('');
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-[#072a3f]/55 p-0 sm:p-3 lg:p-5" role="dialog" aria-modal="true" aria-labelledby="quiz-manual-correction-title">
      <section ref={dialogRef} className="flex h-full w-full max-w-[1440px] flex-col overflow-hidden bg-[#f5f8fa] shadow-2xl sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#d8e6ee] bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6f0f7] text-[#0b3c5d]"><ClipboardCheck className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#2fa36b]">Espace professeur · vérification des copies</p>
              <h2 id="quiz-manual-correction-title" className="truncate text-base font-extrabold text-[#072a3f] sm:text-lg">{quiz.title}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fermer la correction manuelle" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d8e6ee] text-[#46657a] hover:bg-[#f3f8fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={(mobileDetailOpen ? 'hidden lg:flex' : 'flex') + ' min-h-0 flex-col border-r border-[#d8e6ee] bg-white'}>
            <div className="border-b border-[#e6edf2] p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#f3f8fb] p-2"><div className="text-lg font-extrabold tabular-nums text-[#072a3f]">{quizSubmissions.length}</div><div className="text-[10px] text-slate-500">Copies</div></div>
                <div className="rounded-lg bg-[#f3f8fb] p-2"><div className="text-lg font-extrabold tabular-nums text-[#a15c08]">{pendingCount}</div><div className="text-[10px] text-slate-500">À vérifier</div></div>
                <div className="rounded-lg bg-[#f3f8fb] p-2"><div className="text-lg font-extrabold tabular-nums text-[#176b45]">{reviewedCount}</div><div className="text-[10px] text-slate-500">Vérifiées</div></div>
              </div>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold text-[#46657a]">Rechercher un élève</span>
                <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom, matricule, classe…" className="min-h-11 w-full rounded-lg border border-[#cbd9e2] bg-white pl-9 pr-3 text-base text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15" /></span>
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredSubmissions.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Aucune copie ne correspond à cette recherche.</div> : filteredSubmissions.map(submission => {
                const active = selectedId === submission.id;
                const reviewed = Boolean(submission.manual_review);
                const unavailable = submission.status === 'missed' || !submission.questions_snapshot?.length;
                return (
                  <button key={submission.id} type="button" onClick={() => selectSubmission(submission)} className={'flex min-h-[76px] w-full items-center justify-between gap-3 border-b border-[#edf1f4] px-4 py-3 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#0b3c5d] ' + (active ? 'bg-[#edf5fa]' : 'bg-white hover:bg-[#f7fafc]')}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[#072a3f]">{submission.student_name || 'Élève sans nom'}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">{submission.class_name || 'Classe'} · {submission.student_number || 'Sans matricule'} · Tentative {submission.attempt_number || 1}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-slate-500">{submissionStatus(submission)} · {Number(submission.score_20 || 0).toFixed(1)}/20 · {submission.manual_review ? 'Vérifiée' : 'Note automatique retenue'}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {reviewed ? <CheckCircle2 className="ml-auto h-4 w-4 text-[#2fa36b]" aria-label="Copie vérifiée" /> : unavailable ? <AlertCircle className="ml-auto h-4 w-4 text-slate-400" aria-label="Copie non corrigeable" /> : <span className="block h-2.5 w-2.5 rounded-full bg-amber-500" aria-label="À vérifier" />}
                      <span className="mt-1 block text-[9px] text-slate-500">{reviewed ? 'Vérifiée' : unavailable ? 'Indisponible' : 'À vérifier'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className={(mobileDetailOpen ? 'flex' : 'hidden lg:flex') + ' min-h-0 min-w-0 flex-col'}>
            {!selectedSubmission ? (
              <div className="grid flex-1 place-items-center p-8 text-center"><div><FileText className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-3 font-bold text-[#072a3f]">Sélectionnez une copie</h3><p className="mt-1 text-sm text-slate-500">Choisissez un élève dans la liste pour vérifier ses réponses.</p></div></div>
            ) : (
              <>
                <div className="shrink-0 border-b border-[#d8e6ee] bg-white px-4 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <button type="button" onClick={() => setMobileDetailOpen(false)} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0b3c5d] lg:hidden"><ArrowLeft className="h-3.5 w-3.5" /> Liste des copies</button>
                      <h3 className="truncate text-lg font-extrabold text-[#072a3f]">{selectedSubmission.student_name || 'Élève sans nom'}</h3>
                      <p className="text-xs text-slate-500">{selectedSubmission.class_name || 'Classe'} · {selectedSubmission.student_number || 'Sans matricule'} · Tentative {selectedSubmission.attempt_number || 1} · Remise {selectedSubmission.submitted_at ? new Date(selectedSubmission.submitted_at).toLocaleString() : '—'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl border border-[#d8e6ee] bg-[#f7fafc] px-3 py-2 text-right"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Note automatique</div><div className="font-mono text-lg font-extrabold tabular-nums text-[#072a3f]">{Number(selectedSubmission.manual_review?.automatic_score_20 ?? selectedSubmission.score_20 ?? 0).toFixed(1)}<span className="text-xs text-slate-400">/20</span></div></div>
                      <div className="rounded-xl border border-[#b9d8c9] bg-[#f6fbf8] px-3 py-2 text-right"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#176b45]">{selectedSubmission.manual_review ? 'Note après vérification' : 'Note retenue (automatique)'}</div><div className="font-mono text-lg font-extrabold tabular-nums text-[#176b45]">{retainedScore20.toFixed(1)}<span className="text-xs text-[#5c8b72]">/20</span></div></div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500"><span>Barème : {maxTotal || selectedSubmission.max_score} points · Automatique : {automaticTotal.toFixed(2)} points</span><span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-[#2fa36b]" /> Les réponses originales sont conservées</span></div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                  {isSnapshotMissing ? (
                    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex items-center gap-2 font-bold"><AlertCircle className="h-4 w-4" /> Sujet original indisponible</div><p className="mt-1 text-xs leading-relaxed">Cette copie ne possède pas de snapshot des questions au moment du lancement. Pour éviter de corriger avec un sujet qui aurait été modifié depuis, la correction manuelle est désactivée pour cette tentative.</p></div>
                  ) : selectedSubmission.status === 'missed' ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">Cette tentative est enregistrée comme absence et ne contient aucune réponse à corriger.</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8e6ee] bg-white/95 p-3 shadow-sm backdrop-blur-sm">
                        <div><p className="text-sm font-bold text-[#072a3f]">Réponses de cette copie</p><p className="text-xs text-slate-500">{questions.length} questions · {correctQuestionCount} justes · {reviewQuestionCount} à vérifier · {missingQuestionCount} sans réponse</p></div>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les questions">
                          {([{id:'all',label:'Tous',count:questions.length},{id:'review',label:'À vérifier',count:reviewQuestionCount},{id:'correct',label:'Réponse juste',count:correctQuestionCount},{id:'missing',label:'Absence de réponse',count:missingQuestionCount}] as const).map(filter => <button key={filter.id} type="button" aria-pressed={questionFilter === filter.id} onClick={() => setQuestionFilter(filter.id)} className={'min-h-10 rounded-lg border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] ' + (questionFilter === filter.id ? filter.id === 'review' ? 'border-rose-700 bg-rose-700 text-white' : filter.id === 'correct' ? 'border-emerald-700 bg-emerald-700 text-white' : filter.id === 'missing' ? 'border-slate-600 bg-slate-600 text-white' : 'border-[#0b3c5d] bg-[#0b3c5d] text-white' : 'border-[#cbd9e2] bg-white text-[#46657a] hover:bg-[#f3f8fb]')}>{filter.label} ({filter.count})</button>)}
                        </div>
                      </div>
                      {visibleQuestions.length === 0 ? <div className="rounded-xl border border-[#d8e6ee] bg-white p-8 text-center text-sm text-slate-500">Aucune question dans cette catégorie.</div> : visibleQuestions.map(question => {
                        const index = questions.findIndex(item => item.id === question.id);
                        const feedback = selectedSubmission.feedback?.[question.id];
                        const automaticFeedback = selectedSubmission.manual_review?.automatic_feedback?.[question.id] || feedback;
                        const maximum = Number(question.points) || 0;
                        const value = points[question.id] ?? String(selectedSubmission.manual_review?.question_scores?.[question.id] ?? feedback?.points ?? 0);
                        const isChanged = Number(value) !== Number(automaticFeedback?.points ?? 0);
                        return (
                          <article key={question.id} className="overflow-hidden rounded-xl border border-[#d8e6ee] bg-white">
                            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#edf1f4] bg-[#fbfcfd] px-4 py-3">
                              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#58768a]">Question {index + 1} · {questionTypeLabel[question.type]}</p><h4 className="mt-1 whitespace-pre-wrap text-sm font-bold leading-relaxed text-[#072a3f]">{question.question}</h4></div>
                              <div className="flex shrink-0 items-center gap-1.5"><span className={'rounded-md border px-2.5 py-1.5 text-[11px] font-extrabold ' + (questionStatus(question) === 'correct' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : questionStatus(question) === 'missing' ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-rose-200 bg-rose-50 text-rose-800')}>{questionStatus(question) === 'correct' ? 'Réponse juste' : questionStatus(question) === 'missing' ? 'Absence de réponse' : 'À vérifier'}</span>{isChanged && <span className="rounded-md bg-[#e6f0f7] px-2 py-1 text-[10px] font-bold text-[#0b3c5d]">Modifiée</span>}</div>
                            </div>
                            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 md:gap-5">
                              <div className="min-h-[180px] min-w-0 rounded-xl border border-[#cbd9e2] bg-[#f4f8fb] p-5 sm:p-6"><p className="text-xs font-extrabold uppercase tracking-wide text-[#46657a]">Réponse de l’élève</p><p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-[#072a3f]">{displayValue(selectedSubmission.answers?.[question.id])}</p></div>
                              <div className="min-h-[180px] min-w-0 rounded-xl border border-[#b9d8c9] bg-[#f3faf6] p-5 sm:p-6"><p className="text-xs font-extrabold uppercase tracking-wide text-[#176b45]">Réponse attendue</p><p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-[#174d35]">{expectedAnswer(question)}</p>{question.explanation && <p className="mt-4 border-t border-[#dcebe2] pt-3 text-sm leading-6 text-[#46657a]">{question.explanation}</p>}</div>
                            </div>
                            <div className="grid gap-3 border-t border-[#edf1f4] bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                              <label className="block min-w-0 text-xs font-semibold text-[#46657a]">Commentaire sur cette question<input value={questionComments[question.id] || ''} onChange={event => setQuestionComments(previous => ({ ...previous, [question.id]: event.target.value }))} placeholder="Facultatif : expliquer la décision…" className="mt-1 min-h-10 w-full rounded-lg border border-[#cbd9e2] px-3 text-sm font-normal text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15" /></label>
                              <label className="block text-xs font-semibold text-[#46657a]">Points attribués<span className="mt-1 flex items-center gap-2"><input type="number" inputMode="decimal" min="0" max={maximum} step="0.25" value={value} aria-invalid={value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > maximum} onChange={event => setPoints(previous => ({ ...previous, [question.id]: event.target.value }))} disabled={!canReview || saving} className={'min-h-11 w-full rounded-lg border px-3 text-base font-bold tabular-nums text-[#072a3f] outline-none focus:ring-2 disabled:bg-slate-100 ' + (value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > maximum ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-200' : 'border-[#cbd9e2] focus:border-[#0b3c5d] focus:ring-[#0b3c5d]/15')} /><span className="shrink-0 font-mono text-sm text-slate-500">/ {maximum}</span></span><span className="mt-1 block text-[10px] font-normal text-slate-500">Automatique : {Number(automaticFeedback?.points || 0).toFixed(2)} pts</span></label>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {canReview && <section className="mt-4 rounded-xl border border-[#d8e6ee] bg-white p-4"><label className="block text-xs font-semibold text-[#46657a]">Commentaire général du professeur<textarea rows={3} value={generalComment} onChange={event => setGeneralComment(event.target.value)} placeholder="Observation globale sur cette copie (facultatif)…" className="mt-1 w-full resize-y rounded-lg border border-[#cbd9e2] px-3 py-2 text-base font-normal text-[#072a3f] outline-none focus:border-[#0b3c5d] focus:ring-2 focus:ring-[#0b3c5d]/15" /></label></section>}
                  {error && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}
                  {savedSubmission?.id === selectedSubmission.id && <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-[#b9d8c9] bg-[#f6fbf8] px-3 py-2 text-xs font-semibold text-[#176b45]"><CheckCircle2 className="h-4 w-4" /> Correction enregistrée. Le classement a été recalculé.</div>}
                </div>

                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#d8e6ee] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
                  <div className="text-xs text-slate-500"><span className="font-semibold text-[#072a3f]">{manualTotal.toFixed(2)} / {maxTotal.toFixed(2)} pts</span><span className="mx-1.5">·</span>{maxTotal > 0 ? (manualTotal / maxTotal * 20).toFixed(1) : '0.0'} / 20</div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <button type="button" onClick={resetToAutomatic} disabled={!canReview || saving} className="min-h-11 flex-1 rounded-lg border border-[#cbd9e2] px-3 py-2 text-xs font-bold text-[#46657a] hover:bg-[#f7fafc] disabled:opacity-40 sm:flex-none">Rétablir les points automatiques</button>
                    <button type="button" onClick={() => void handleSave()} disabled={!canReview || saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#072a3f] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b3c5d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">
                      {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Enregistrement…</> : <><Save className="h-4 w-4" /> Enregistrer la correction</>}
                    </button>
                  </div>
                </footer>
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  );
};
