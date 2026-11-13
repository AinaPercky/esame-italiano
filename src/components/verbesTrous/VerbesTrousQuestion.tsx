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

export const VerbesTrousQuestion: React.FC<Props> = ({
  definition, answer, onChange, disabled = false, showCorrection = false, answerKey, onSubmit, onEnterPress
}) => {
  const phrases = definition.phrases || [];
  const answers = useMemo(() => parseVerbesTrousAnswers(answer), [answer]);
  const remaining = useMemo(() => banqueRestante(definition.banque || [], answers), [definition.banque, answers]);
  const [activeId, setActiveId] = useState<string>(String(phrases[0]?.id ?? ''));
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const score = useMemo(() => answerKey ? noterQuiz(definition, answer, answerKey) : null, [answerKey, answer, definition]);

  useEffect(() => {
    if (!phrases.some((phrase) => String(phrase.id) === activeId)) setActiveId(String(phrases[0]?.id ?? ''));
  }, [phrases, activeId]);

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
  };
  const updateText = (id: string, value: string) => {
    if (disabled) return;
    publish({ ...answers, [id]: { ...answers[id], texte_saisi: value } });
  };
  const nextEmpty = (fromId: string) => {
    const rest = phrases.filter((phrase) => !answers[String(phrase.id)]?.verbe_choisi);
    const currentIndex = phrases.findIndex((phrase) => String(phrase.id) === fromId);
    return rest.find((phrase) => phrases.indexOf(phrase) > currentIndex) || rest[0] || null;
  };

  return (
    <section className="verbes-trous w-full min-w-0 space-y-3" lang="it">
      <style>{`
        .verbes-trous{--vt-bg:#f3f8fb;--vt-card:#fff;--vt-text:#072a3f;--vt-muted:#46657a;--vt-blue:#0b3c5d;--vt-chip:#edf5fa;--vt-border:#d8e6ee;--vt-ok:#145c3d;--vt-ok-bg:#eef9f3;--vt-ko:#9f1239;--vt-ko-bg:#fef2f4;color:var(--vt-text)}
        @media(prefers-color-scheme:dark){.verbes-trous{--vt-bg:#f3f8fb;--vt-card:#fff;--vt-text:#072a3f;--vt-muted:#46657a;--vt-blue:#0b3c5d;--vt-chip:#edf5fa;--vt-border:#d8e6ee;--vt-ok:#145c3d;--vt-ok-bg:#eef9f3;--vt-ko:#9f1239;--vt-ko-bg:#fef2f4}}
        .vt-bank{position:sticky;top:0;z-index:5;background:var(--vt-bg);padding:12px;border:1px solid var(--vt-border);border-radius:16px}
        .vt-slot{min-height:44px;padding:4px 8px;touch-action:manipulation}
        .vt-chip{min-height:44px;touch-action:manipulation;border:1.5px solid var(--vt-border);border-radius:12px;background:var(--vt-card);padding:8px 14px;font-size:.95rem;font-weight:700;color:var(--vt-text);transition:border-color .15s,background-color .15s,transform .12s}
        .vt-chip:hover:not(:disabled){border-color:var(--vt-blue);background:var(--vt-chip)}
        .vt-chip:active{transform:scale(.97)}
        .vt-card{min-width:0;border:1.5px solid var(--vt-border);border-radius:18px;background:var(--vt-card);padding:15px 16px;box-shadow:0 4px 14px rgba(7,42,63,.04);transition:border-color .15s,box-shadow .15s}
        .vt-card.active{border-color:var(--vt-blue);box-shadow:0 6px 18px rgba(11,60,93,.09)}
        .vt-card.ok{border-color:#2fa36b}.vt-card.ko{border-color:#e11d48}
        .vt-feedback-ok{background:var(--vt-ok-bg);color:var(--vt-ok)}.vt-feedback-ko{background:var(--vt-ko-bg);color:var(--vt-ko)}
        .vt-sentence{font-size:1.05rem;line-height:1.95;overflow-wrap:anywhere}
        .vt-slot{display:inline-block;min-width:110px;max-width:100%;border-bottom:2px dashed var(--vt-blue);text-align:center;color:var(--vt-blue);font-weight:700;overflow-wrap:anywhere}
        .vt-input{width:100%;min-height:46px;font-size:16px;border:1.5px solid var(--vt-border);border-radius:12px;background:#fff;padding:10px 12px;color:var(--vt-text);transition:border-color .15s,box-shadow .15s}
        .vt-input:focus{outline:none;border-color:var(--vt-blue);box-shadow:0 0 0 3px rgba(11,60,93,.12)}
        .vt-actions{position:sticky;bottom:0;z-index:6;background:var(--vt-bg);padding:10px 0 calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--vt-border)}
        @media(min-width:900px){.vt-layout{display:grid;grid-template-columns:minmax(250px,300px) minmax(0,1fr);gap:18px}.vt-bank{align-self:start;top:8px}.vt-actions{position:sticky}}
        @media(orientation:landscape) and (max-width:899px){.vt-bank{position:relative}}
        @media(prefers-reduced-motion:reduce){.verbes-trous *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
      `}</style>
      {(definition.titre || definition.consigne) && <div className="rounded-xl p-3" style={{ background: 'var(--vt-chip)' }}>
        {definition.titre && <h3 className="text-base font-bold">{definition.titre}</h3>}
        {definition.consigne && <p className="mt-1 text-sm" style={{ color: 'var(--vt-muted)' }}>{definition.consigne}</p>}
      </div>}
      <p className="sr-only" aria-live="polite">{remaining.length ? 'Verbes disponibles : ' + remaining.length : 'Tous les verbes sont placés'}. {phrases.filter((phrase) => answers[String(phrase.id)]?.verbe_choisi).length} phrases avec un verbe placé.</p>
      <div className="vt-layout">
        <aside className="min-w-0">
          <div className="vt-bank">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--vt-muted)' }}>Banque des verbes · utilisez chaque verbe une fois</p>
            <div className="vt-bank-list flex gap-2 flex-wrap">
              {remaining.length ? remaining.map((verb) => <button type="button" key={verb} className="vt-chip" disabled={disabled} onClick={() => choose(verb)}>{verb}</button>) : <p className="py-2 text-sm font-semibold" style={{ color: 'var(--vt-ok)' }}>✓ Tous les verbes sont placés</p>}
            </div>
            <div className="mt-3 flex justify-between gap-2 text-xs" style={{ color: 'var(--vt-muted)' }}>
              <span>Verbes placés {phrases.filter((p) => answers[String(p.id)]?.verbe_choisi).length}/{phrases.length}</span>
              <span>Conjugués {phrases.filter((p) => answers[String(p.id)]?.texte_saisi?.trim()).length}/{phrases.length}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--vt-chip)' }}><div className="h-full" style={{ width: (phrases.length ? phrases.filter((p) => answers[String(p.id)]?.verbe_choisi && answers[String(p.id)]?.texte_saisi?.trim()).length / phrases.length * 100 : 0) + '%', background: 'var(--vt-blue)' }} /></div>
          </div>
          <div className="vt-actions hidden lg:block">
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
                <input ref={(node) => { inputRefs.current[id] = node; }} id={'vt-' + id} className="vt-input" lang="it" value={answers[id]?.texte_saisi || ''} disabled={disabled} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="next" onFocus={() => setActiveId(id)} onChange={(event) => updateText(id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const next = nextEmpty(id); if (next) { setActiveId(String(next.id)); requestAnimationFrame(() => inputRefs.current[String(next.id)]?.focus()); } else { (event.currentTarget as HTMLInputElement).blur(); onEnterPress?.(); } } }} />
              </div>}
              {showCorrection && phraseScore && <div className={'vt-feedback-' + (correct ? 'ok' : 'ko') + ' mt-3 rounded-xl p-3 text-sm'}>{phraseScore.total}/3 · Réponse : <strong>{phraseScore.expectedVerb} → {phraseScore.expectedAnswers[0] || '—'}</strong></div>}
            </article>;
          })}
          {showCorrection && score && <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--vt-chip)' }}><p aria-live="polite" className="text-2xl font-black">{score.score} / {score.maxScore}</p><p className="text-sm">{score.score === score.maxScore ? 'Excellent !' : score.score >= score.maxScore * .6 ? 'Bien, continue !' : 'À retravailler'}</p></div>}
        </div>
      </div>
    </section>
  );
};
