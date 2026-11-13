import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, Clock, FileText, Lock, Play, Save, ShieldAlert, Send, ChevronRight, ChevronDown, RotateCcw, CalendarDays } from 'lucide-react';
import { writtenExamService } from '../services/writtenExamService';
import type { AuthUser } from '../services/authService';
import { applyWrittenExamOrder, WrittenAttempt, getTimedQuestionIndex, getTimedQuestionRemainingSeconds, getWrittenQuestionTimeLimit, shouldDisqualifyWrittenExamVisibilityChange } from '../utils/writtenExam';
import { QuizClozeInput, parseQuestionClozePrompt } from '../components/QuizClozeInput';
import { QuizReorderList } from '../components/QuizReorderList';
import { VerbesTrousQuestion } from '../components/verbesTrous/VerbesTrousQuestion';
import { WrittenExamStudentCopy } from '../components/WrittenExamStudentCopy';
import {
  isTimerBeepEnabled,
  playTimerBeep,
  primeTimerAudio,
  setTimerBeepEnabled,
  useAssessmentTimerBeeper
} from '../utils/timerAudio';
import {
  AssessmentQcmOptions,
  AssessmentQuestionHeader,
  AssessmentShell
} from '../components/AssessmentRunner';
import {
  LearningCard,
  LearningCardFooter,
  LearningCardHeader,
  LearningCardMetrics,
  LearningModuleHeader,
  StatusBadge
} from '../components/LearningCard';
import type { QuizQuestion } from '../types';
import { parseVerbesTrousAnswers } from '../utils/verbesTrous';

type ExamCard = { id: string; title: string; description: string; level: string; target_language: string; instruction_language: string; duration_minutes: number; raw_max: number; display_scale: number | null; status: string; opens_at?: string; closes_at?: string; class_eligible?: boolean; attempt_status?: string; attempts_used: number; max_attempts: number; results_published: boolean; show_score_after_publish: boolean; show_corrections_after_publish: boolean; integrity_settings: any; navigation_mode: 'free' | 'sequential'; sections: any[]; raw_score?: number | null; normalized_score?: number | null; attempt_raw_max?: number | null; attempt_display_scale?: number | null; };

export const StudentWrittenExamsView: React.FC<{ currentUser: AuthUser; onFullscreenChange?: (active: boolean) => void }> = ({ currentUser, onFullscreenChange }) => {
  const [exams, setExams] = useState<ExamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<WrittenAttempt | null>(null);
  const [orderedSections, setOrderedSections] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const answersRef = useRef<Record<string, any>>({});
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [questionSeconds, setQuestionSeconds] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isTimerBeepEnabled());
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitLock = useRef(false);
  const violationPendingRef = useRef(false);
  const advancingRef = useRef(false);
  const questionDeadlineRef = useRef(0);
  const [integrityDisqualified, setIntegrityDisqualified] = useState(false);
  const [integrityWarning, setIntegrityWarning] = useState('');
  const [incompleteConfirmation, setIncompleteConfirmation] = useState<number | null>(null);
  const [corrections, setCorrections] = useState<Record<string, any[]>>({});
  const [correctionOpen, setCorrectionOpen] = useState<string | null>(null);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setTimerBeepEnabled(next);
    if (next) {
      primeTimerAudio();
      playTimerBeep(true);
    }
  };

  const refresh = useCallback(async () => {
    try { setError(''); setExams(await writtenExamService.listAvailable()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Chargement des examens impossible.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const flat = useMemo(() => orderedSections.flatMap(section => (section.questions || []).map((question: any) => ({ section, question }))), [orderedSections]);
  const current = flat[index];
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);

  const save = useCallback(async (questionId: string, next: Record<string, any>, advance = false) => {
    if (!attempt || submitted || !questionId) return;
    pendingSaveCountRef.current += 1;
    setSaving(true);
    const request = saveQueueRef.current.catch(() => undefined).then(async () => {
      await writtenExamService.saveQuestionAnswer(attempt.attempt_id, questionId, next[questionId] ?? null, advance);
    });
    saveQueueRef.current = request;
    try { await request; setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'La sauvegarde a échoué.'); throw e; }
    finally {
      pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
      if (pendingSaveCountRef.current === 0) setSaving(false);
    }
  }, [attempt, submitted]);

  useEffect(() => {
    const questionId = flat[index]?.question.id;
    if (!attempt || submitted || !questionId) return;
    const id = window.setTimeout(() => {
      if (!advancingRef.current && !submitLock.current) void save(questionId, answersRef.current).catch(() => {});
    }, 350);
    return () => window.clearTimeout(id);
  }, [answers, attempt, flat, index, save, submitted]);

  const finish = useCallback(async (violationReason?: 'visibility_hidden' | 'window_blur') => {
    if (!attempt || submitLock.current || submitted) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      if (violationReason) {
        await writtenExamService.flagIntegrityViolation(attempt.attempt_id, violationReason, { page: 'written-exam', userAgent: navigator.userAgent });
        setIntegrityDisqualified(true);
      }
      const currentQuestion = flat[index]?.question;
      if (currentQuestion) await save(currentQuestion.id, answersRef.current);
      await saveQueueRef.current;
      await writtenExamService.submit(attempt.attempt_id);
      setIncompleteConfirmation(null);
      setSubmitted(true);
      setAttempt(null);
      onFullscreenChange?.(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La remise de la copie a échoué.');
      submitLock.current = false;
      violationPendingRef.current = false;
    } finally { setSubmitting(false); }
  }, [attempt, flat, index, onFullscreenChange, refresh, save, submitted]);

  useEffect(() => {
    if (!attempt || submitted) return;
    const update = () => {
      const left = Math.ceil((new Date(attempt.deadline_at).getTime() - Date.now()) / 1000);
      setSeconds(Math.max(0, left));
      if (left <= 0) void finish();
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [attempt, finish, submitted]);

  const moveToQuestion = useCallback(async (nextIndex: number) => {
    if (!attempt || submitted || advancingRef.current) return;
    const bounded = Math.max(index + 1, Math.min(nextIndex, flat.length));
    if (bounded === index) return;
    advancingRef.current = true;
    setValidating(true);
    try {
      const currentQuestion = flat[index]?.question;
      if (currentQuestion) await save(currentQuestion.id, answersRef.current, true);
      if (bounded >= flat.length) return;
      setIndex(bounded);
      const nextQuestion = flat[bounded].question;
      const nextSeconds = getWrittenQuestionTimeLimit(nextQuestion);
      questionDeadlineRef.current = Date.now() + nextSeconds * 1000;
      setQuestionSeconds(nextSeconds);
    } catch (e) { setError(e instanceof Error ? e.message : 'La validation de la réponse a échoué.'); }
    finally { advancingRef.current = false; setValidating(false); }
  }, [attempt, flat, index, save, submitted]);

  useEffect(() => {
    if (!attempt || submitted || flat.length === 0) return;
    if (index >= flat.length) { void finish(); return; }
    const update = () => {
      const left = Math.ceil((questionDeadlineRef.current - Date.now()) / 1000);
      setQuestionSeconds(Math.max(0, left));
      if (left <= 0 && !advancingRef.current) {
        if (index < flat.length - 1) void moveToQuestion(index + 1);
        else void finish();
      }
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [attempt, finish, flat.length, index, moveToQuestion, submitted]);

  useAssessmentTimerBeeper({
    active: Boolean(attempt && !submitted && current),
    paused: false,
    questionKey: attempt && current ? `${attempt.attempt_id}:${current.question.id}` : '',
    questionTotalSeconds: current ? getWrittenQuestionTimeLimit(current.question) : 30,
    questionSecondsRemaining: current ? questionSeconds : null,
    totalSecondsRemaining: attempt ? seconds : null,
    soundEnabled
  });

  useEffect(() => {
    if (!attempt || submitted) return;
    const gracePeriodMs = 2000;
    const debounceMs = 1500;
    const startedAt = Date.now();
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let violationTimer: number | null = null;
    const clearViolationTimer = () => { if (violationTimer !== null) { window.clearTimeout(violationTimer); violationTimer = null; } };
    const scheduleViolationCheck = (reason: 'visibility_hidden' | 'window_blur') => {
      clearViolationTimer();
      const graceRemainingMs = Math.max(0, gracePeriodMs - (Date.now() - startedAt));
      violationTimer = window.setTimeout(() => {
        violationTimer = null;
        const actuallyAway = document.hidden || (!isMobileDevice && !document.hasFocus());
        if (actuallyAway && !violationPendingRef.current) {
          violationPendingRef.current = true;
          setIntegrityWarning('Changement d’onglet ou sortie de la fenêtre détecté. Votre examen est remis avec la note de 0/100.');
          void finish(reason);
        }
      }, graceRemainingMs + debounceMs);
    };
    const hidden = () => {
      if (document.hidden && attempt.exam.integrity_settings?.warn_on_tab_switch !== false) {
        if (!shouldDisqualifyWrittenExamVisibilityChange(isMobileDevice)) {
          void writtenExamService.logIntegrity(attempt.attempt_id, 'visibility_hidden', { page: 'written-exam', platform: 'mobile', policy: 'non_disqualifying' }).catch(() => {});
        } else { scheduleViolationCheck('visibility_hidden'); }
      } else if (!document.hidden) clearViolationTimer();
    };
    const blur = () => { if (!isMobileDevice && attempt.exam.integrity_settings?.warn_on_tab_switch !== false) scheduleViolationCheck('window_blur'); };
    const focus = () => clearViolationTimer();
    const log = (type: string) => { void writtenExamService.logIntegrity(attempt.attempt_id, type, { page: 'written-exam' }).catch(() => {}); };
    const copy = () => log('copy_attempt');
    const paste = () => log('paste_attempt');
    const offline = () => log('connection_lost');
    const online = () => { log('connection_restored'); const questionId = flat[index]?.question.id; if (questionId) void save(questionId, answersRef.current).catch(() => {}); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('copy', copy);
    document.addEventListener('paste', paste);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('copy', copy);
      document.removeEventListener('paste', paste);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      clearViolationTimer();
    };
  }, [attempt, finish, flat, index, save, submitted]);

  const start = async (id: string) => {
    primeTimerAudio();
    try {
      setError('');
      onFullscreenChange?.(true);
      const result = await writtenExamService.start(id);
      submitLock.current = false;
      violationPendingRef.current = false;
      setIntegrityDisqualified(false);
      setAttempt(result);
      const sections = applyWrittenExamOrder(result.sections, result.order_manifest);
      setOrderedSections(sections);
      const restoredAnswers = result.answers || {};
      setAnswers(restoredAnswers);
      answersRef.current = restoredAnswers;
      const initialIndex = getTimedQuestionIndex(sections, result.question_timer_started_at || result.started_at);
      setIndex(initialIndex);
      const initialSeconds = getTimedQuestionRemainingSeconds(sections, initialIndex, result.question_timer_started_at || result.started_at);
      questionDeadlineRef.current = Date.now() + Math.max(1, initialSeconds) * 1000;
      setQuestionSeconds(Math.max(1, initialSeconds));
      setSubmitted(false);
      setIncompleteConfirmation(null);
      setIntegrityWarning('');
    } catch (e) {
      onFullscreenChange?.(false);
      setError(e instanceof Error ? e.message : 'Impossible de démarrer cet examen.');
    }
  };

  const updateAnswer = (questionId: string, value: any) => {
    const next = { ...answersRef.current, [questionId]: value };
    answersRef.current = next;
    setAnswers(next);
  };

  const requestFinish = () => {
    const missing = flat.reduce((total, item) => {
      const q = item.question;
      if (q.type !== 'verbes_trous') return total;
      const phrases = q.public_data?.verbes_trous?.phrases || [];
      const response = parseVerbesTrousAnswers(answersRef.current[q.id]);
      return total + phrases.filter((phrase: any) => !response[String(phrase.id)]?.verbe_choisi).length;
    }, 0);
    if (missing > 0) setIncompleteConfirmation(missing);
    else void finish();
  };

  const questionForInput = (q: any): QuizQuestion => ({
    id: q.id,
    type: q.type,
    question: q.prompt,
    points: Number(q.points) || 1,
    correct_answer: '',
    options: (q.options || []).map((o: any) => o.label),
    items: q.items || [],
    answers: q.type === 'text' && Number(q.public_data?.blank_count) > 1 ? Array(Number(q.public_data.blank_count)).fill('') : undefined
  });

  useEffect(() => {
    if (!attempt || submitted) return;
    const handleKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        if (index < flat.length - 1) void moveToQuestion(index + 1);
        else requestFinish();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [attempt, flat.length, index, moveToQuestion, requestFinish, submitted]);

  useEffect(() => {
    onFullscreenChange?.(!!attempt && !submitted);
    return () => onFullscreenChange?.(false);
  }, [attempt, submitted, onFullscreenChange]);

  if (attempt && !submitted && current) {
    const q = current.question;
    const qData = q.public_data || {};
    const inputQuestion = questionForInput(q);
    const isFirstQuestionInSection = index === 0 || flat[index - 1]?.section !== current.section;
    const clozeInfo = q.type === 'text' ? parseQuestionClozePrompt(q.prompt) : null;
    const maxQuestionSecs = getWrittenQuestionTimeLimit(q);
    const isLastQuestion = index >= flat.length - 1;

    return (
      <AssessmentShell
        modeTone="exam"
        bannerLabel={
          attempt.exam.integrity_settings?.warn_on_tab_switch !== false
            ? 'EXAMEN OFFICIEL • Surveillance active — Ne quittez pas cette fenêtre'
            : 'EXAMEN OFFICIEL • Session écrite contrôlée'
        }
        bannerMobileLabel="EXAMEN OFFICIEL"
        bannerRight={`${currentUser.name} · Copie surveillée`}
        watermarkText={attempt.exam.integrity_settings?.watermark ? `${currentUser.name} · PerckyLingua` : undefined}
        kicker={current.section.title || 'Examen écrit'}
        title={attempt.exam.title}
        questionIndex={index}
        totalQuestions={flat.length}
        completedMap={flat.map((item) => Boolean(answers[item.question.id]))}
        questionSecondsRemaining={questionSeconds}
        questionTotalSeconds={maxQuestionSecs}
        totalSecondsRemaining={seconds}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        zIndexClass="z-[110]"
        alerts={
          <>
            {error && (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 sm:text-sm">
                {error}
              </div>
            )}
            {integrityWarning && (
              <div role="status" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{integrityWarning}</span>
              </div>
            )}
          </>
        }
        footerLeft={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#46657a]">
            {saving ? (
              <>
                <Save className="h-3.5 w-3.5 text-[#0b3c5d]" />
                <span>Sauvegarde…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-[#2fa36b]" />
                <span>Enregistré</span>
              </>
            )}
          </span>
        }
        footerAction={
          !isLastQuestion ? (
            <button
              type="button"
              disabled={submitting || validating}
              onClick={() => void moveToQuestion(index + 1)}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] disabled:opacity-50 sm:w-auto"
            >
              <span>Valider et continuer</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={requestFinish}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#2fa36b] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#248556] disabled:opacity-50 sm:w-auto"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? 'Envoi…' : 'Valider et remettre'}</span>
            </button>
          )
        }
        modals={
          incompleteConfirmation !== null ? (
            <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#051e2e]/70 p-4 backdrop-blur-xs">
              <section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-[#d8e6ee] bg-white p-5 shadow-2xl">
                <h2 className="text-base font-extrabold text-[#072a3f]">
                  Il reste {incompleteConfirmation} phrase{incompleteConfirmation > 1 ? 's' : ''} sans réponse.
                </h2>
                <p className="mt-2 text-sm text-[#46657a]">Remettre la copie quand même ?</p>
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setIncompleteConfirmation(null)} className="min-h-11 flex-1 rounded-xl border border-[#d8e6ee] px-3 text-sm font-bold text-[#072a3f] hover:bg-[#f3f8fb]">
                    Continuer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIncompleteConfirmation(null);
                      void finish();
                    }}
                    className="min-h-11 flex-1 rounded-xl bg-[#072a3f] px-3 text-sm font-bold text-white hover:bg-[#0b3c5d]"
                  >
                    Remettre
                  </button>
                </div>
              </section>
            </div>
          ) : null
        }
      >
        <div key={`${attempt.attempt_id}-${q.id}`} className="space-y-5">
          <AssessmentQuestionHeader
            questionNumber={index + 1}
            type={q.type}
            points={Number(q.points) || 1}
            prompt={clozeInfo?.hasBlanks ? clozeInfo.prompt : q.prompt}
            sectionTitle={current.section.title}
          />

          {(isFirstQuestionInSection && current.section.instructions) || current.section.support_text || current.section.support_url ? (
            <div className="space-y-3">
              {isFirstQuestionInSection && current.section.instructions && (
                <p className="rounded-xl border border-[#e5eff5] bg-[#f7fafc] px-4 py-2.5 text-sm font-medium leading-relaxed text-[#46657a]">
                  {current.section.instructions}
                </p>
              )}
              {current.section.support_text && (
                <div className="whitespace-pre-wrap rounded-2xl border border-[#cfe1ec] bg-[#f3f8fb] p-4 text-[15px] leading-relaxed text-[#072a3f] sm:p-5 sm:text-base">
                  {current.section.support_text}
                </div>
              )}
              {current.section.support_url && (
                <a
                  href={current.section.support_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center rounded-xl border border-[#cfe1ec] bg-white px-3.5 py-2 text-xs font-bold text-[#0b3c5d] transition-colors hover:bg-[#e6f0f7]"
                >
                  Ouvrir le document support
                </a>
              )}
            </div>
          ) : null}

          <div>
            {q.type === 'qcm' && (
              <AssessmentQcmOptions
                options={(q.options || []).map((option: any) => ({ value: option.id, label: option.label }))}
                selectedValue={answers[q.id] || ''}
                onSelect={(value) => updateAnswer(q.id, value)}
              />
            )}
            {q.type === 'text' && (
              <QuizClozeInput
                question={inputQuestion}
                customSentence={clozeInfo?.hasBlanks ? clozeInfo.sentence : undefined}
                answer={typeof answers[q.id] === 'string' ? answers[q.id] : JSON.stringify(answers[q.id] || [])}
                onChange={value => updateAnswer(q.id, value)}
                theme="navy"
              />
            )}
            {q.type === 'reorder' && (
              <QuizReorderList
                question={inputQuestion}
                answer={typeof answers[q.id] === 'string' ? answers[q.id] : JSON.stringify(answers[q.id] || [])}
                onChange={value => updateAnswer(q.id, value)}
                theme="navy"
              />
            )}
            {q.type === 'verbes_trous' && qData.verbes_trous && (
              <VerbesTrousQuestion
                definition={qData.verbes_trous}
                answer={typeof answers[q.id] === 'string' ? answers[q.id] : JSON.stringify(answers[q.id] || {})}
                onChange={value => updateAnswer(q.id, value)}
              />
            )}
          </div>
        </div>
      </AssessmentShell>
    );
  }
  if(submitted)return <div className="fixed inset-0 z-[110] flex min-h-svh items-center justify-center bg-[#f3f8fb] p-4"><div className="w-full max-w-xl rounded-[24px] border border-[#bfe3ce] bg-white p-8 text-center shadow-[0_12px_32px_rgba(7,42,63,0.08)]">{integrityDisqualified?<ShieldAlert className="mx-auto h-12 w-12 text-rose-600"/>:<CheckCircle2 className="mx-auto h-12 w-12 text-[#2fa36b]"/>}<h2 className="mt-3 font-display text-xl font-black text-[#072a3f]">{integrityDisqualified?'Examen interrompu':'Copie remise'}</h2><p className="mt-2 text-sm leading-relaxed text-[#46657a]">{integrityDisqualified?'Une sortie de la fenêtre d’examen ou une capture clavier détectée a entraîné une note définitive de 0/100. Votre copie reste enregistrée pour consultation par l’enseignant.':'Votre tentative a été enregistrée. Les résultats seront disponibles après leur publication par l’enseignant.'}</p><button onClick={()=>{setSubmitted(false);setIntegrityDisqualified(false);onFullscreenChange?.(false);void refresh();}} className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#072a3f] px-5 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-[#0b3c5d]">Retour aux examens</button></div></div>;
 return <div className="w-full min-w-0 space-y-5">
  <LearningModuleHeader
   kicker="Évaluations officielles"
   title="Examens écrits"
   description="Les examens publiés pour votre classe apparaissent ici. Vous pouvez reprendre une tentative en cours."
  />
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
  {loading?<div className="rounded-[22px] border border-[#d8e6ee] bg-white p-8 text-center text-sm text-[#607f93] shadow-[0_6px_20px_rgba(7,42,63,0.04)]">Chargement des examens…</div>:exams.length===0?<div className="rounded-[22px] border border-dashed border-[#b9cfdd] bg-white/90 p-10 text-center"><FileText className="mx-auto h-8 w-8 text-[#607f93]"/><p className="mt-2 text-sm font-semibold text-[#46657a]">Aucun examen écrit disponible pour le moment.</p></div>:<div className="grid grid-cols-1 gap-4 md:grid-cols-2">{exams.map(exam=>{
   const totalQuestions=(exam.sections||[]).reduce((total:number,section:any)=>total+(section.questions||[]).length,0);
   const isInProgress=exam.attempt_status==='in_progress';
   const isScheduled=Boolean(exam.opens_at&&new Date(exam.opens_at).getTime()>Date.now());
   const isEndedWindow=Boolean(exam.closes_at&&new Date(exam.closes_at).getTime()<=Date.now());
   const isCompleted=exam.attempts_used>=exam.max_attempts&&Boolean(exam.attempt_status);
   const canStart=!['grading','closed','results_published'].includes(exam.status)&&(isInProgress||(exam.class_eligible!==false&&!isScheduled&&!isEndedWindow&&!isCompleted));
   const hasPublishedScore=exam.results_published&&exam.raw_score!==null&&exam.raw_score!==undefined;

   const statusBadge=isInProgress?(
    <StatusBadge tone="info" icon={<RotateCcw className="h-3 w-3"/>}>En cours</StatusBadge>
   ):exam.results_published?(
    <StatusBadge tone="success" icon={<CheckCircle2 className="h-3 w-3"/>}>Résultats publiés</StatusBadge>
   ):exam.status==='grading'?(
    <StatusBadge tone="warning" icon={<Clock className="h-3 w-3"/>}>Correction</StatusBadge>
   ):exam.status==='closed'||exam.status==='results_published'||isEndedWindow?(
    <StatusBadge tone="neutral" icon={<Lock className="h-3 w-3"/>}>Terminé</StatusBadge>
   ):isScheduled?(
    <StatusBadge tone="info" icon={<CalendarDays className="h-3 w-3"/>}>Programmé</StatusBadge>
   ):isCompleted?(
    <StatusBadge tone="success" icon={<CheckCircle2 className="h-3 w-3"/>}>Copie remise</StatusBadge>
   ):canStart?(
    <StatusBadge tone="live" icon={<Play className="h-3 w-3 fill-current"/>}>Disponible</StatusBadge>
   ):(
    <StatusBadge tone="neutral">Fermé</StatusBadge>
   );

   const metricItems=[
    {label:'Durée',value:`${exam.duration_minutes} min`},
    {label:'Structure',value:`${exam.sections?.length||0} parties`,hint:`${totalQuestions} question${totalQuestions>1?'s':''}`},
    hasPublishedScore?{
     label:'Résultat',
     value:`${exam.raw_score} / ${exam.attempt_raw_max??exam.raw_max}`,
     hint:exam.normalized_score!==null&&exam.normalized_score!==undefined?`Note : ${exam.normalized_score} / ${exam.attempt_display_scale??exam.display_scale}`:undefined,
     tone:'success' as const
    }:{
     label:'Barème',
     value:`${exam.raw_max} pts`,
     hint:exam.display_scale?`Affichage /${exam.display_scale}`:undefined
    }
   ];

   return <LearningCard key={exam.id} active={canStart}>
    <LearningCardHeader
     kicker={`${exam.level?`Niveau ${exam.level}`:'Examen écrit'} · ${(exam.target_language||'it').toUpperCase()}`}
     status={statusBadge}
     icon={<BookOpen className="h-4 w-4"/>}
    />

    <div className="min-w-0 space-y-1.5">
     <h2 className="break-words text-base font-extrabold leading-snug text-[#072a3f] sm:text-lg">{exam.title}</h2>
     {exam.description&&<p className="line-clamp-2 break-words text-xs leading-relaxed text-[#46657a] sm:text-[13px]">{exam.description}</p>}
    </div>

    <LearningCardMetrics items={metricItems} columns={3}/>

    <div>
     <button
      type="button"
      onClick={()=>setExpandedExamId(expandedExamId===exam.id?null:exam.id)}
      aria-expanded={expandedExamId===exam.id}
      className="inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-[#0b3c5d] transition-colors hover:text-[#072a3f]"
     >
      {expandedExamId===exam.id?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}
      <span>{expandedExamId===exam.id?'Masquer les sections et consignes':'Consulter les sections et les consignes'}</span>
     </button>
     {expandedExamId===exam.id&&<div className="mt-2.5 space-y-2.5 rounded-xl border border-[#e5eff5] bg-[#f7fafc] p-3.5 text-xs">
      <p className="font-medium text-[#46657a]">Langue cible : {exam.target_language} · Consignes : {exam.instruction_language} · Navigation : séquentielle sans retour · Tentatives : {exam.max_attempts}</p>
      {(exam.sections||[]).map((section:any,i:number)=><div key={i} className="border-t border-[#e5eff5] pt-2">
       <p className="font-bold text-[#072a3f]">{section.group_name?section.group_name+' · ':''}{section.title} <span className="font-normal text-[#607f93]">({section.max_points} pts)</span></p>
       {section.instructions&&<p className="mt-1 text-[#46657a]">{section.instructions}</p>}
       {section.support_text&&<p className="mt-1 whitespace-pre-wrap text-[#46657a]">{section.support_text}</p>}
       {section.support_url&&<a className="mt-1 inline-block font-semibold text-[#0b3c5d] underline" href={section.support_url} target="_blank" rel="noreferrer">Document support</a>}
      </div>)}
      <p className="border-t border-[#e5eff5] pt-2 text-[11px] text-[#607f93]">Période : {exam.opens_at?new Date(exam.opens_at).toLocaleString():'dès publication'} – {exam.closes_at?new Date(exam.closes_at).toLocaleString():'sans date de fermeture'}</p>
      <p className="border-t border-[#e5eff5] pt-2 text-[11px] leading-relaxed text-[#607f93]">Règles : ordre aléatoire propre à chaque élève, temps global et compte à rebours individuel par question, passage automatique sans retour en arrière. Les corrigés restent masqués. Un changement d’onglet ou une perte de fenêtre persistante peut entraîner la remise automatique et une note nulle. Sur iPhone, les événements blur sont ignorés pour éviter les faux positifs; les captures d’écran natives ne sont pas détectables de manière fiable.</p>
     </div>}
    </div>

    {exam.results_published&&!hasPublishedScore&&(
     <div className="rounded-xl border border-[#bfe3ce] bg-[#eef9f3] px-3.5 py-2.5 text-xs font-semibold text-[#145c3d]">
      Les résultats ont été publiés. Le score reste masqué selon les paramètres de l’enseignant.
     </div>
    )}

    {exam.results_published&&exam.show_corrections_after_publish&&(
     <div>
      <button
       type="button"
       onClick={async()=>{if(correctionOpen===exam.id){setCorrectionOpen(null);return;}try{const data=await writtenExamService.getCorrections(exam.id);setCorrections(v=>({...v,[exam.id]:data}));setCorrectionOpen(exam.id);}catch(e){setError(e instanceof Error?e.message:'Correction indisponible.');}}}
       className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[#cfe1ec] bg-[#f5f9fc] px-3.5 py-2 text-xs font-extrabold text-[#0b3c5d] transition-colors hover:bg-[#e6f0f7]"
      >
       {correctionOpen===exam.id?'Masquer ma feuille de copie':'Consulter ma feuille de copie détaillée'}
      </button>
      {correctionOpen===exam.id&&<WrittenExamStudentCopy sections={corrections[exam.id]||[]} rawScore={exam.raw_score} rawMax={exam.attempt_raw_max??exam.raw_max} normalizedScore={exam.normalized_score} displayScale={exam.attempt_display_scale??exam.display_scale} title={exam.title} studentName={currentUser.name}/>}
     </div>
    )}

    <LearningCardFooter>
     {exam.status==='grading'?(
      <div className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#fef9ec] px-3 py-2 text-xs font-semibold text-[#8a5108]">
       <Clock className="h-3.5 w-3.5 shrink-0"/>
       <span>Épreuve terminée · correction en cours.</span>
      </div>
     ):exam.status==='closed'?(
      <div className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#f5f9fc] px-3 py-2 text-xs font-semibold text-[#607f93]">
       <Lock className="h-3.5 w-3.5 shrink-0"/>
       <span>Examen clôturé.</span>
      </div>
     ):exam.status==='results_published'?(
      <div className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#eef9f3] px-3 py-2 text-xs font-semibold text-[#145c3d]">
       <CheckCircle2 className="h-3.5 w-3.5 shrink-0"/>
       <span>Épreuve terminée · résultats disponibles.</span>
      </div>
     ):isInProgress?(
      <button type="button" onClick={()=>void start(exam.id)} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#2fa36b] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#248556] sm:text-[13px]">
       <Play className="h-4 w-4 fill-current"/>
       <span>Reprendre l’examen</span>
      </button>
     ):exam.class_eligible===false?(
      <div className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#f5f9fc] px-3 py-2 text-xs font-semibold text-[#607f93]">
       <Lock className="h-3.5 w-3.5 shrink-0"/>
       <span>Cet examen n’est plus ouvert à de nouvelles tentatives pour votre classe.</span>
      </div>
     ):isScheduled?(
      <div className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#edf5fa] px-3 py-2 text-xs font-semibold text-[#0b3c5d]">
       <CalendarDays className="h-3.5 w-3.5 shrink-0"/>
       <span>Examen programmé · ouverture le {new Date(exam.opens_at!).toLocaleString()}.</span>
      </div>
     ):isEndedWindow?(
      <div className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#f5f9fc] px-3 py-2 text-xs font-semibold text-[#607f93]">
       <Lock className="h-3.5 w-3.5 shrink-0"/>
       <span>Période terminée · {exam.results_published?'résultats publiés':'résultats en attente de publication'}.</span>
      </div>
     ):isCompleted?(
      <div className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#f5f9fc] px-3 py-2 text-xs font-semibold text-[#46657a]">
       <Lock className="h-3.5 w-3.5 shrink-0 text-[#607f93]"/>
       <span>Tentative enregistrée · {exam.results_published?'Résultats publiés':'En attente de publication'}</span>
      </div>
     ):(
      <button type="button" onClick={()=>void start(exam.id)} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] active:scale-[.99] sm:text-[13px]">
       <Play className="h-4 w-4 fill-current"/>
       <span>{exam.attempt_status?'Nouvelle tentative':'Commencer l’examen'}</span>
      </button>
     )}
    </LearningCardFooter>
   </LearningCard>;
  })}</div>}
 </div>;
};
