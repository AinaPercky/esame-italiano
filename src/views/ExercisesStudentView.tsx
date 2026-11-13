import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Play, RotateCcw, CheckCircle2, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import type { ExerciseAttemptQuestion, ExerciseCorrection, StudentExerciseItem, ExerciseAttemptResult, QuizQuestion } from '../types';
import { exerciseService } from '../services/exerciseService';
import { QuizClozeInput } from '../components/QuizClozeInput';
import { QuizReorderList } from '../components/QuizReorderList';
import { VerbesTrousQuestion } from '../components/verbesTrous/VerbesTrousQuestion';

const formatSeconds = (seconds: number) => {
  const safe = Math.max(0, seconds);
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
};

const correctionText = (value: unknown): string => {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item, index) => {
    if (typeof item === 'string') return item;
    if (item && Array.isArray((item as any).reponses)) return 'Phrase ' + (index + 1) + ' : ' + (item as any).reponses.join(' / ');
    return JSON.stringify(item);
  }).join(' · ');
  return JSON.stringify(value);
};

interface ExercisesStudentViewProps { onFullscreenChange: (fullscreen: boolean) => void; }

export const ExercisesStudentView: React.FC<ExercisesStudentViewProps> = ({ onFullscreenChange }) => {
  const [items, setItems] = useState<StudentExerciseItem[]>([]);
  const [results, setResults] = useState<ExerciseAttemptResult[]>([]);
  const [active, setActive] = useState<ExerciseAttemptQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [correction, setCorrection] = useState<ExerciseCorrection | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [correctionSeconds, setCorrectionSeconds] = useState(10);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const timeoutLock = useRef(false);
  const advanceLock = useRef(false);
  const serverClockOffset = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [available, history] = await Promise.all([
        exerciseService.listStudentExercises(),
        exerciseService.listStudentResults()
      ]);
      setItems(available);
      setResults(history);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement des exercices impossible.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!active || correction) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((new Date(active.deadline_at).getTime() - (Date.now() - serverClockOffset.current)) / 1000));
      setRemaining(seconds);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [active, correction]);

  const submit = useCallback(async (value?: string) => {
    if (!active || submitting || correction) return;
    setSubmitting(true); setError('');
    try {
      const result = await exerciseService.submitAnswer(active.attempt_id, value === undefined ? answer : value);
      setCorrection(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Validation impossible. Réessayez.'); }
    finally { setSubmitting(false); }
  }, [active, answer, correction, submitting]);

  useEffect(() => {
    if (active && remaining <= 0 && !correction && !submitting && !timeoutLock.current) {
      timeoutLock.current = true;
      void submit('');
    }
    if (!active || correction) timeoutLock.current = false;
  }, [active, remaining, correction, submitting, submit]);

  const begin = async (exerciseId: string, attemptId?: string | null) => {
    setError(''); setCorrection(null); setAnswer(''); timeoutLock.current = false;
    try {
      const current = attemptId
        ? await exerciseService.resumeAttempt(attemptId)
        : await exerciseService.startAttempt(exerciseId);
      serverClockOffset.current = Date.now() - new Date(current.server_now).getTime();
      setActive(current);
      onFullscreenChange(true);
      setCorrection(current.correction || null);
      setAnswer(current.correction?.student_answer == null ? '' : String(current.correction.student_answer));
      setRemaining(current.seconds_remaining);
    } catch (e) { setError(e instanceof Error ? e.message : 'Démarrage impossible.'); }
  };

  const next = useCallback(async () => {
    if (!active || advanceLock.current) return;
    advanceLock.current = true;
    setSubmitting(true); setError('');
    try {
      const result = await exerciseService.advance(active.attempt_id);
      if ('completed' in result && result.completed) {
        setActive(null); setCorrection(null); setAnswer('');
        onFullscreenChange(false);
        await refresh();
      } else {
        const nextQuestion = result as ExerciseAttemptQuestion;
        serverClockOffset.current = Date.now() - new Date(nextQuestion.server_now).getTime();
        setActive(nextQuestion);
        setCorrection(nextQuestion.correction || null); setAnswer(''); timeoutLock.current = false;
        setRemaining(nextQuestion.seconds_remaining);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Passage à la question suivante impossible.'); }
    finally { advanceLock.current = false; setSubmitting(false); }
  }, [active, onFullscreenChange, refresh]);

  useEffect(() => {
    if (!active || !correction || correction.correct) return;
    const startedAt = Date.now();
    setCorrectionSeconds(10);
    const timer = window.setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((10_000 - (Date.now() - startedAt)) / 1000));
      setCorrectionSeconds(secondsLeft);
      if (secondsLeft === 0) {
        window.clearInterval(timer);
        void next();
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [active?.attempt_id, active?.question_number, correction?.correct, correction?.timed_out, next]);

  const renderQuestion = (question: QuizQuestion) => {
    if (question.type === 'qcm') {
      return <div className="grid gap-2">{(question.options || []).map((option, index) => <label key={index} className={'flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ' + (answer === option ? 'border-[#0b3c5d] bg-[#e6f0f7]' : 'border-slate-200 bg-white')}><input type="radio" name="exercise-qcm" checked={answer === option} onChange={() => setAnswer(option)}/><span>{option}</span></label>)}</div>;
    }
    if (question.type === 'text') return <QuizClozeInput question={question} answer={answer} onChange={setAnswer} theme="navy"/>;
    if (question.type === 'reorder') return <QuizReorderList question={question} answer={answer} onChange={setAnswer} theme="navy"/>;
    if (question.type === 'verbes_trous' && question.verbes_trous) {
      return <VerbesTrousQuestion definition={question.verbes_trous as any} answer={answer} onChange={setAnswer}/>;
    }
    return <p className="text-sm text-rose-700">Type de question non pris en charge.</p>;
  };

  const renderModuleHeader = (onBack: () => void, backLabel: string) => (
    <header className="sticky top-0 z-20 border-b border-[#d8e6ee] bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/percky-lingua-logo.webp" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-tight text-[#072a3f] sm:text-base">PerckyLingua</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2fa36b]">Module Exercices</p>
          </div>
        </div>
        <button type="button" onClick={onBack} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[#cbdde7] bg-white px-3 py-2 text-xs font-bold text-[#0b3c5d] transition-colors hover:bg-[#e6f0f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2fa36b] sm:px-4">
          <ArrowRight className="h-4 w-4 rotate-180" /> {backLabel}
        </button>
      </div>
    </header>
  );

  const returnToList = () => {
    onFullscreenChange(false);
    setActive(null);
    setCorrection(null);
    setAnswer('');
    setError('');
    timeoutLock.current = false;
    void refresh();
  };

  if (active) {
    const q = active.question;
    return (
      <div className="min-h-svh bg-[#f4f8fb] text-slate-900">
        {renderModuleHeader(returnToList, 'Mes exercices')}
        <main className="mx-auto w-full max-w-5xl space-y-4 px-3 py-5 sm:px-6 sm:py-8">
      <section className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#2fa36b]">Exercice autonome</p><h1 className="text-xl font-black text-[#072a3f]">Question {active.question_number} / {active.question_count}</h1></div><div className={'flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-lg font-black ' + (remaining <= 5 ? 'bg-rose-100 text-rose-700' : 'bg-[#e6f0f7] text-[#072a3f]')}><Clock size={18}/>{formatSeconds(remaining)}</div></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2fa36b] transition-all" style={{width: (active.question_number / active.question_count * 100) + '%'}}/></div>
        {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center justify-between text-xs text-slate-500"><span>{q.points} point(s)</span><span>Temps limité à cette question</span></div>
          <h2 className="text-lg font-bold leading-relaxed text-[#072a3f]">{q.question}</h2>
          {correction?.correct ? (
            <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600"/>
              <div><p className="font-bold">Bonne réponse !</p><p className="text-sm">Points obtenus : {correction.points} / {correction.max_points}</p></div>
            </div>
          ) : correction ? (
            <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-bold"><XCircle className="mr-2 inline h-4 w-4"/>Réponse incorrecte</p>
              <p>La correction détaillée s’affiche séparément.</p>
            </div>
          ) : renderQuestion(q)}
          {!correction ? <button type="button" disabled={submitting || remaining <= 0} onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">{submitting ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>} Valider la réponse</button> : correction.correct ? <button type="button" disabled={submitting} onClick={() => void next()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2fa36b] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" size={16}/> : <ArrowRight size={16}/>} {active.question_number === active.question_count ? 'Terminer l’exercice' : 'Question suivante'}</button> : null}
        </article>
        <p className="text-center text-xs text-slate-500">Une fois validée, une question ne peut plus être modifiée. La correction ne consomme pas de temps.</p>
      </section>
      {correction && !correction.correct && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#072a3f]/70 p-3 backdrop-blur-sm sm:p-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="exercise-correction-title" className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 bg-[#0b3c5d] px-4 py-3 text-white sm:px-5">
              <div className="flex items-center gap-2"><XCircle className="h-5 w-5 text-rose-300"/><h2 id="exercise-correction-title" className="font-bold">Correction de la réponse</h2></div>
              <span className="rounded-lg bg-white/15 px-3 py-1 font-mono text-sm font-bold tabular-nums">{correctionSeconds}s</span>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-700">Votre réponse</p>
                <p className="break-words text-sm font-bold text-rose-950">{correctionText((correction.student_answer ?? answer) || 'Aucune réponse')}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Bonne réponse</p>
                <p className="break-words text-sm font-bold text-emerald-950">{correctionText(correction.expected)}</p>
              </div>
              {correction.explanation && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-violet-700">Explication</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-violet-950">{correctionText(correction.explanation)}</p>
                </div>
              )}
              <div className="flex flex-col-reverse items-stretch justify-between gap-2 pt-1 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-500">Cette pause pédagogique n’est pas décomptée du temps.</p>
                <button type="button" disabled={submitting} onClick={() => void next()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2fa36b] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowRight className="h-4 w-4"/>} Continuer
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
        </main>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <main className="mx-auto w-full max-w-5xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <header><p className="text-xs font-bold uppercase tracking-wider text-[#2fa36b]">Entraînement autonome</p><h1 className="text-2xl font-black text-[#072a3f]">Mes exercices</h1><p className="mt-1 text-sm text-slate-500">Les exercices attribués à votre classe. Vous pouvez vous entraîner autant de fois que vous le souhaitez ; ces résultats ne sont pas des notes officielles.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {loading ? <p className="text-sm text-slate-500">Chargement depuis Supabase…</p> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Aucun exercice n’est actuellement attribué à votre classe.</div> : <div className="grid gap-3 md:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><h2 className="font-bold text-[#072a3f]">{item.title}</h2><p className="mt-1 text-xs text-slate-500">{item.category} {item.level ? '· ' + item.level : ''}</p></div><span className="rounded-full bg-[#e6f0f7] px-2 py-1 text-[10px] font-bold text-[#0b3c5d]">{item.attempt_count} tentative(s)</span></div>{item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void begin(item.id)} className="inline-flex items-center gap-2 rounded-xl bg-[#072a3f] px-3 py-2 text-xs font-bold text-white"><Play size={14}/> Nouvelle tentative</button>{item.active_attempt_id && <button type="button" onClick={() => void begin(item.id,item.active_attempt_id)} className="inline-flex items-center gap-2 rounded-xl border border-[#0b3c5d] px-3 py-2 text-xs font-bold text-[#0b3c5d]"><RotateCcw size={14}/> Reprendre</button>}</div></article>)}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold text-[#072a3f]">Historique de mes tentatives</h2>{results.length === 0 ? <p className="text-sm text-slate-500">Aucun résultat enregistré.</p> : <div className="space-y-2">{results.map(result => { const item = items.find(x => x.id === result.exercise_id); return <div key={result.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="font-semibold">{item?.title || 'Exercice'}</p><p className="text-xs text-slate-500">{new Date(result.started_at).toLocaleString()}</p></div><strong className="tabular-nums">{result.score} / {result.max_score}</strong></div>; })}</div>}</section>
      <button type="button" onClick={() => void refresh()} className="text-xs font-semibold text-[#0b3c5d]">Actualiser</button>
    </div>
      </main>
    </div>
  );
};
