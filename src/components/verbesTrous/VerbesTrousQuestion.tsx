import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  banqueRestante, noterQuiz, parseVerbesTrousAnswers, placerVerbe, rendreVerbe,
  trouverPhraseVide, type VerbesTrousDefinition, type VerbesTrousAnswerKeyPhrase,
  type VerbesTrousAnswers
} from '../../utils/verbesTrous';

type Props = {
  definition: VerbesTrousDefinition;
  answer: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  showCorrection?: boolean;
  answerKey?: VerbesTrousAnswerKeyPhrase[];
  onSubmit?: () => void;
  onEnterPress?: () => void;
};

const ACCENTS = ['à', 'è', 'é', 'ì', 'ò', 'ù'];

export const VerbesTrousQuestion: React.FC<Props> = ({
  definition, answer, onChange, disabled = false, showCorrection = false, answerKey, onSubmit, onEnterPress
}) => {
  const phrases = definition.phrases || [];
  const answers = useMemo(() => parseVerbesTrousAnswers(answer), [answer]);
  const remaining = useMemo(() => banqueRestante(definition.banque || [], answers), [definition.banque, answers]);
  const [activeId, setActiveId] = useState<string>(String(phrases[0]?.id ?? ''));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeInput = focusedId ? inputRefs.current[focusedId] : null;
  const score = useMemo(() => answerKey ? noterQuiz(definition, answer, answerKey) : null, [answerKey, answer, definition]);

  useEffect(() => {
    if (!phrases.some((phrase) => String(phrase.id) === activeId)) setActiveId(String(phrases[0]?.id ?? ''));
  }, [phrases, activeId]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboardOffset(focusedId ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)) : 0);
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); };
  }, [focusedId]);

  const publish = useCallback((next: VerbesTrousAnswers) => onChange(JSON.stringify(next)), [onChange]);
  const choose = (verb: string) => {
    if (disabled || !remaining.includes(verb)) return;
    const target = answers[activeId]?.verbe_choisi ? trouverPhraseVide(phrases, answers) : activeId;
    if (!target) return;
    const next = placerVerbe(answers, target, verb);
    setActiveId(target);
    publish(next);
    requestAnimationFrame(() => {
      inputRefs.current[target]?.focus();
      inputRefs.current[target]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };
  const remove = (id: string) => {
    if (disabled) return;
    setActiveId(id);
    publish(rendreVerbe(answers, id));
    setFocusedId(null);
  };
  const updateText = (id: string, value: string) => {
    if (disabled) return;
    publish({ ...answers, [id]: { ...answers[id], texte_saisi: value } });
  };
  const insertAccent = (accent: string) => {
    if (!activeInput || disabled) return;
    const start = activeInput.selectionStart ?? activeInput.value.length;
    const end = activeInput.selectionEnd ?? start;
    const nextValue = activeInput.value.slice(0, start) + accent + activeInput.value.slice(end);
    updateText(focusedId!, nextValue);
    requestAnimationFrame(() => {
      activeInput.focus();
      activeInput.setSelectionRange(start + accent.length, start + accent.length);
    });
  };
  const nextEmpty = (fromId: string) => {
    const rest = phrases.filter((phrase) => !answers[String(phrase.id)]?.verbe_choisi);
    const currentIndex = phrases.findIndex((phrase) => String(phrase.id) === fromId);
    return rest.find((phrase) => phrases.indexOf(phrase) > currentIndex) || rest[0] || null;
  };

  return (
    <section className="verbes-trous w-full min-w-0 space-y-3" lang="it">
      <style>{`
        .verbes-trous{--vt-bg:#f4f6fb;--vt-card:#fff;--vt-text:#17243a;--vt-muted:#62728a;--vt-blue:#1f4e8c;--vt-chip:#e7eef9;--vt-border:#d3dbe8;--vt-ok:#1a7a45;--vt-ok-bg:#e1f4e9;--vt-ko:#b3261e;--vt-ko-bg:#fbe6e4;color:var(--vt-text)}
        @media(prefers-color-scheme:dark){.verbes-trous{--vt-bg:#0f141c;--vt-card:#18212e;--vt-text:#e8edf5;--vt-muted:#9aa8bd;--vt-blue:#6ea4ee;--vt-chip:#25324a;--vt-border:#33425b;--vt-ok:#62d08f;--vt-ok-bg:#17332a;--vt-ko:#ff8a80;--vt-ko-bg:#3a1c1a}}
        .vt-bank{position:sticky;top:0;z-index:5;background:var(--vt-bg);padding:10px 0;border-bottom:1px solid var(--vt-border)}
        .vt-slot{min-height:44px;padding:4px 8px;touch-action:manipulation}
        @media(min-width:600px) and (max-width:1023px){.verbes-trous{max-width:720px;margin-inline:auto}}
        @media(max-width:599px){.vt-bank.keyboard-open{padding:5px 0}.vt-bank.keyboard-open .vt-bank-list{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.vt-bank.keyboard-open .vt-chip{white-space:nowrap;min-height:40px;padding:7px 10px}}
        .vt-chip{min-height:46px;touch-action:manipulation;border:1px solid var(--vt-border);border-radius:12px;background:var(--vt-card);padding:9px 13px;font-size:1rem;font-weight:700}
        .vt-chip:active{transform:scale(.96)}
        .vt-card{min-width:0;border:2px solid var(--vt-border);border-radius:16px;background:var(--vt-card);padding:14px;box-shadow:0 2px 8px #14285012}
        .vt-card.active{border-color:var(--vt-blue)}
        .vt-card.ok{border-color:var(--vt-ok)}.vt-card.ko{border-color:var(--vt-ko)}
        .vt-sentence{font-size:1.08rem;line-height:2;overflow-wrap:anywhere}
        .vt-slot{display:inline-block;min-width:110px;max-width:100%;border-bottom:2px dashed var(--vt-blue);text-align:center;overflow-wrap:anywhere}
        .vt-input{width:100%;min-height:48px;font-size:16px;border:2px solid var(--vt-border);border-radius:12px;background:var(--vt-bg);padding:10px 12px;color:var(--vt-text)}
        .vt-actions{position:sticky;bottom:0;z-index:6;background:var(--vt-bg);padding:10px 0 calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--vt-border)}
        .vt-accents{display:flex;gap:6px;margin-bottom:8px}
        .vt-accents button{min-height:44px;min-width:44px;flex:1;border:1px solid var(--vt-border);border-radius:10px;background:var(--vt-card);color:var(--vt-text);font-size:18px}
        @media(min-width:1024px){.vt-layout{display:grid;grid-template-columns:minmax(250px,320px) minmax(0,1fr);gap:20px}.vt-bank{align-self:start;top:12px}.vt-actions{position:sticky}}
        @media(orientation:landscape) and (max-width:899px){.vt-bank{position:relative}}
        @media(prefers-reduced-motion:reduce){.verbes-trous *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
      `}</style>
      {(definition.titre || definition.consigne) && <div className="rounded-xl p-3" style={{ background: 'var(--vt-chip)' }}>
        {definition.titre && <h3 className="text-base font-bold">{definition.titre}</h3>}
        {definition.consigne && <p className="mt-1 text-sm" style={{ color: 'var(--vt-muted)' }}>{definition.consigne}</p>}
      </div>}
      <div className="vt-layout">
        <aside className="min-w-0">
          <div className={'vt-bank ' + (keyboardOffset > 0 ? 'keyboard-open' : '')}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--vt-muted)' }}>Banque des verbes · utilisez chaque verbe une fois</p>
            <div className={'vt-bank-list flex gap-2 ' + (keyboardOffset > 0 ? 'flex-nowrap overflow-x-auto' : 'flex-wrap')}>
              {remaining.length ? remaining.map((verb) => <button type="button" key={verb} className="vt-chip" disabled={disabled} onClick={() => choose(verb)}>{verb}</button>) : <p className="py-2 text-sm font-semibold" style={{ color: 'var(--vt-ok)' }}>✓ Tous les verbes sont placés</p>}
            </div>
            <div className="mt-3 flex justify-between gap-2 text-xs" style={{ color: 'var(--vt-muted)' }}>
              <span>Verbes placés {phrases.filter((p) => answers[String(p.id)]?.verbe_choisi).length}/{phrases.length}</span>
              <span>Conjugués {phrases.filter((p) => answers[String(p.id)]?.texte_saisi?.trim()).length}/{phrases.length}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--vt-chip)' }}><div className="h-full" style={{ width: (phrases.length ? phrases.filter((p) => answers[String(p.id)]?.verbe_choisi && answers[String(p.id)]?.texte_saisi?.trim()).length / phrases.length * 100 : 0) + '%', background: 'var(--vt-blue)' }} /></div>
          </div>
          <div className="vt-actions hidden lg:block">
            {focusedId && !disabled && <div className="vt-accents" style={{ position: keyboardOffset > 0 ? 'fixed' : 'relative', left: keyboardOffset > 0 ? 0 : undefined, right: keyboardOffset > 0 ? 0 : undefined, bottom: keyboardOffset > 0 ? keyboardOffset + 'px' : undefined, zIndex: 40, background: 'var(--vt-bg)', padding: '8px 12px' }}>{ACCENTS.map((accent) => <button type="button" key={accent} onPointerDown={(event) => event.preventDefault()} onClick={() => insertAccent(accent)}>{accent}</button>)}</div>}
            {onSubmit && <button type="button" onClick={onSubmit} className="w-full rounded-xl bg-[#1f4e8c] px-4 py-3 font-bold text-white">Terminer</button>}
          </div>
        </aside>
        <div className="min-w-0 space-y-3">
          {phrases.map((phrase, index) => {
            const id = String(phrase.id);
            const chosen = answers[id]?.verbe_choisi || null;
            const phraseScore = score?.phrases.find((item) => String(item.id) === id);
            const correct = Boolean(showCorrection && phraseScore?.correct);
            return <article key={id} className={'vt-card ' + (showCorrection ? (correct ? 'ok' : 'ko') : activeId === id ? 'active' : '')} onClick={() => !disabled && setActiveId(id)}>
              <div className="vt-sentence"><span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--vt-chip)', color: 'var(--vt-blue)' }}>{index + 1}</span>{phrase.debut}{chosen ? <button type="button" disabled={disabled} className="vt-chip inline-flex items-center gap-2 align-middle" aria-label={'Retirer le verbe ' + chosen} onClick={(event) => { event.stopPropagation(); remove(id); }}>{chosen}{!disabled && ' ✕'}</button> : <button type="button" className="vt-slot" disabled={disabled} onClick={(event) => { event.stopPropagation(); setActiveId(id); }}>{'touche un verbe'}</button>}{phrase.fin}</div>
              {chosen && <div className="mt-2 space-y-1">
                <label className="block text-xs font-semibold" htmlFor={'vt-' + id} style={{ color: 'var(--vt-muted)' }}>Conjugue « {chosen} » avec le sujet de la phrase</label>
                <input ref={(node) => { inputRefs.current[id] = node; }} id={'vt-' + id} className="vt-input" lang="it" value={answers[id]?.texte_saisi || ''} disabled={disabled} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="next" onFocus={() => setFocusedId(id)} onBlur={() => setFocusedId((current) => current === id ? null : current)} onChange={(event) => updateText(id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const next = nextEmpty(id); if (next) { setActiveId(String(next.id)); requestAnimationFrame(() => inputRefs.current[String(next.id)]?.focus()); } else { (event.currentTarget as HTMLInputElement).blur(); onEnterPress?.(); } } }} />
              </div>}
              {showCorrection && phraseScore && <div className={'mt-3 rounded-xl p-3 text-sm ' + (correct ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900')}>{phraseScore.total}/3 · Réponse : <strong>{phraseScore.expectedVerb} → {phraseScore.expectedAnswers[0] || '—'}</strong></div>}
            </article>;
          })}
          {showCorrection && score && <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--vt-chip)' }}><p className="text-2xl font-black">{score.score} / {score.maxScore}</p><p className="text-sm">{score.score === score.maxScore ? 'Excellent !' : score.score >= score.maxScore * .6 ? 'Bien, continue !' : 'À retravailler'}</p></div>}
        </div>
      </div>
      {focusedId && !disabled && <div className="vt-actions lg:hidden">
        <div className="vt-accents">{ACCENTS.map((accent) => <button type="button" key={accent} onPointerDown={(event) => event.preventDefault()} onClick={() => insertAccent(accent)}>{accent}</button>)}</div>
      </div>}
    </section>
  );
};
