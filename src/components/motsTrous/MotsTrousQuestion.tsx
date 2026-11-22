import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, GripVertical, RotateCcw, X } from 'lucide-react';
import {
  banqueRestanteMots,
  deplacerOuEchangerMot,
  noterMotsTrous,
  parseMotsTrousAnswers,
  placerMot,
  retirerMot,
  type MotsTrousAnswerKeyPhrase,
  type MotsTrousAnswers,
  type MotsTrousDefinition
} from '../../utils/motsTrous';

type Props = {
  definition: MotsTrousDefinition;
  answer: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  showCorrection?: boolean;
  answerKey?: MotsTrousAnswerKeyPhrase[];
};

type DragPayload =
  | { source: 'bank'; word: string }
  | { source: 'phrase'; phraseId: string; word: string };

type TouchDragState = {
  payload: DragPayload;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  active: boolean;
  hoverTarget: { kind: 'phrase'; phraseId: string } | { kind: 'bank' } | null;
};

export const MotsTrousQuestion: React.FC<Props> = ({
  definition,
  answer,
  onChange,
  disabled = false,
  showCorrection = false,
  answerKey
}) => {
  const phrases = definition.phrases || [];
  const banque = definition.banque || [];
  const answers = useMemo(() => parseMotsTrousAnswers(answer, phrases), [answer, phrases]);
  const remaining = useMemo(() => banqueRestanteMots(banque, answers), [banque, answers]);
  const completedCount = useMemo(
    () => phrases.filter(phrase => Boolean(answers[String(phrase.id)])).length,
    [phrases, answers]
  );
  const hasAnyPlaced = completedCount > 0;

  const effectiveKey = useMemo(() => {
    if (answerKey && answerKey.length > 0) return answerKey;
    const inline = phrases as Array<{ id: string | number; debut: string; fin: string; mot?: string }>;
    if (inline.some(item => typeof item.mot === 'string' && item.mot.trim())) {
      return inline.map(item => ({
        id: item.id,
        debut: item.debut,
        fin: item.fin,
        mot: String(item.mot || '')
      }));
    }
    return undefined;
  }, [answerKey, phrases]);

  const score = useMemo(
    () => (showCorrection && effectiveKey ? noterMotsTrous(definition, answers, effectiveKey) : null),
    [showCorrection, effectiveKey, definition, answers]
  );

  // Selection state for 2-tap / keyboard placement
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [targetedPhraseId, setTargetedPhraseId] = useState<string | null>(null);

  // HTML5 desktop drag state
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [dragOverPhraseId, setDragOverPhraseId] = useState<string | null>(null);
  const [dragOverBank, setDragOverBank] = useState(false);

  // Touch drag state (Android/iOS mobile)
  const [touchDrag, setTouchDrag] = useState<TouchDragState | null>(null);
  const touchDragRef = useRef<TouchDragState | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    if (selectedWord && !remaining.includes(selectedWord)) {
      setSelectedWord(null);
    }
  }, [remaining, selectedWord]);

  const publish = useCallback(
    (next: MotsTrousAnswers) => {
      onChange(JSON.stringify(next));
    },
    [onChange]
  );

  const applyDropOnPhrase = useCallback(
    (phraseId: string, payload: DragPayload) => {
      if (disabled) return;
      if (payload.source === 'bank') {
        publish(placerMot(answers, phraseId, payload.word));
      } else if (payload.phraseId !== phraseId) {
        publish(deplacerOuEchangerMot(answers, payload.phraseId, phraseId));
      }
      setSelectedWord(null);
      setTargetedPhraseId(null);
    },
    [answers, disabled, publish]
  );

  const applyDropOnBank = useCallback(
    (payload: DragPayload) => {
      if (disabled) return;
      if (payload.source === 'phrase') {
        publish(retirerMot(answers, payload.phraseId));
      }
      setSelectedWord(null);
      setTargetedPhraseId(null);
    },
    [answers, disabled, publish]
  );

  const handleBankWordClick = (word: string) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (disabled) return;

    if (targetedPhraseId) {
      publish(placerMot(answers, targetedPhraseId, word));
      setTargetedPhraseId(null);
      setSelectedWord(null);
      return;
    }

    setSelectedWord(prev => (prev === word ? null : word));
  };

  const handleGapClick = (phraseId: string) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (disabled) return;

    if (selectedWord) {
      publish(placerMot(answers, phraseId, selectedWord));
      setSelectedWord(null);
      setTargetedPhraseId(null);
      return;
    }

    if (targetedPhraseId && targetedPhraseId !== phraseId && answers[targetedPhraseId]) {
      publish(deplacerOuEchangerMot(answers, targetedPhraseId, phraseId));
      setTargetedPhraseId(null);
      return;
    }

    setTargetedPhraseId(prev => (prev === phraseId ? null : phraseId));
  };

  const handleRemoveFromPhrase = (phraseId: string) => {
    if (disabled) return;
    publish(retirerMot(answers, phraseId));
    if (targetedPhraseId === phraseId) {
      setTargetedPhraseId(null);
    }
  };

  const handleResetAll = () => {
    if (disabled || !hasAnyPlaced) return;
    publish({});
    setSelectedWord(null);
    setTargetedPhraseId(null);
  };

  // Detect dropzone under finger coordinates
  const detectTouchTarget = useCallback(
    (clientX: number, clientY: number): TouchDragState['hoverTarget'] => {
      if (typeof document === 'undefined') return null;
      const elements = document.elementsFromPoint
        ? document.elementsFromPoint(clientX, clientY)
        : [document.elementFromPoint(clientX, clientY)].filter(Boolean);

      for (const el of elements) {
        if (!(el instanceof Element)) continue;
        const phraseEl = el.closest('[data-mots-trous-phrase-id]');
        if (phraseEl) {
          const phraseId = phraseEl.getAttribute('data-mots-trous-phrase-id');
          if (phraseId) return { kind: 'phrase', phraseId };
        }
        const bankEl = el.closest('[data-mots-trous-bank]');
        if (bankEl) {
          return { kind: 'bank' };
        }
      }
      return null;
    },
    []
  );

  const startTouchDrag = (e: React.TouchEvent, payload: DragPayload) => {
    if (disabled || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const initial: TouchDragState = {
      payload,
      startX: touch.clientX,
      startY: touch.clientY,
      clientX: touch.clientX,
      clientY: touch.clientY,
      active: false,
      hoverTarget: null
    };
    touchDragRef.current = initial;
    setTouchDrag(initial);
  };

  useEffect(() => {
    if (!touchDrag) return;

    const handleTouchMove = (e: TouchEvent) => {
      const current = touchDragRef.current;
      if (!current || e.touches.length === 0) return;
      const touch = e.touches[0];
      const dx = touch.clientX - current.startX;
      const dy = touch.clientY - current.startY;
      const distance = Math.hypot(dx, dy);

      const becameActive = current.active || distance > 8;
      if (!becameActive) return;

      e.preventDefault();
      const hoverTarget = detectTouchTarget(touch.clientX, touch.clientY);
      const nextState: TouchDragState = {
        ...current,
        active: true,
        clientX: touch.clientX,
        clientY: touch.clientY,
        hoverTarget
      };
      touchDragRef.current = nextState;
      setTouchDrag(nextState);
    };

    const handleTouchEnd = () => {
      const current = touchDragRef.current;
      touchDragRef.current = null;
      setTouchDrag(null);
      if (!current || !current.active) return;

      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 250);

      if (current.hoverTarget?.kind === 'phrase') {
        applyDropOnPhrase(current.hoverTarget.phraseId, current.payload);
      } else if (current.hoverTarget?.kind === 'bank') {
        applyDropOnBank(current.payload);
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [Boolean(touchDrag), applyDropOnBank, applyDropOnPhrase, detectTouchTarget]);

  const progressPct = phrases.length > 0 ? Math.round((completedCount / phrases.length) * 100) : 0;

  return (
    <section className="w-full min-w-0 space-y-4 text-[#072a3f]" lang="it">
      {(definition.titre || definition.consigne) && (
        <div className="rounded-2xl border border-[#d8e6ee] bg-[#edf5fa] px-4 py-3">
          {definition.titre && <h3 className="text-base font-extrabold text-[#072a3f]">{definition.titre}</h3>}
          {definition.consigne && (
            <p className="mt-1 text-sm leading-relaxed text-[#46657a]">{definition.consigne}</p>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {remaining.length > 0
          ? `${remaining.length} mot${remaining.length > 1 ? 's' : ''} disponible${remaining.length > 1 ? 's' : ''} dans la banque.`
          : 'Tous les mots de la banque sont placés.'}{' '}
        {completedCount} phrase{completedCount > 1 ? 's' : ''} complétée{completedCount > 1 ? 's' : ''} sur {phrases.length}.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(250px,310px)_minmax(0,1fr)] lg:items-start">
        {/* Sticky Word Bank */}
        <aside className="min-w-0 lg:sticky lg:top-2">
          <div
            data-mots-trous-bank="true"
            onDragOver={e => {
              if (disabled || !dragPayload || dragPayload.source !== 'phrase') return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverBank(true);
            }}
            onDragLeave={() => setDragOverBank(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOverBank(false);
              if (disabled) return;
              let payload = dragPayload;
              if (!payload) {
                try {
                  payload = JSON.parse(e.dataTransfer.getData('application/json')) as DragPayload;
                } catch {
                  payload = null;
                }
              }
              if (payload) applyDropOnBank(payload);
              setDragPayload(null);
            }}
            className={`rounded-2xl border p-4 transition ${
              dragOverBank || (touchDrag?.active && touchDrag.hoverTarget?.kind === 'bank')
                ? 'border-[#0b3c5d] bg-[#e6f1f8] ring-2 ring-[#0b3c5d]/20'
                : 'border-[#d8e6ee] bg-[#f3f8fb]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0b3c5d]">
                  Banque de mots
                </p>
                <p className="mt-0.5 text-xs text-[#46657a]">
                  Glissez-déposez chaque mot dans le trou de la phrase correspondante (ou touchez un mot puis un trou).
                </p>
              </div>
              {!disabled && hasAnyPlaced && (
                <button
                  type="button"
                  onClick={handleResetAll}
                  title="Replacer tous les mots dans la banque"
                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl border border-[#cfe1ec] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#0b3c5d] transition hover:bg-[#edf5fa]"
                >
                  <RotateCcw size={13} />
                  Réinitialiser
                </button>
              )}
            </div>

            {selectedWord && !disabled && (
              <div className="mt-2.5 rounded-xl border border-[#0b3c5d]/30 bg-white px-3 py-2 text-xs font-semibold text-[#072a3f]">
                Mot sélectionné : <span className="font-black text-[#0b3c5d]">« {selectedWord} »</span> — touchez un trou pour le placer.
              </div>
            )}

            {targetedPhraseId && !selectedWord && !disabled && (
              <div className="mt-2.5 rounded-xl border border-[#2fa36b]/40 bg-[#eef9f3] px-3 py-2 text-xs font-semibold text-[#145c3d]">
                Trou {phrases.findIndex(p => String(p.id) === targetedPhraseId) + 1} prêt — touchez un mot de la banque ci-dessous.
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {remaining.length > 0 ? (
                remaining.map(word => {
                  const isSelected = selectedWord === word;
                  const isBeingDragged =
                    (dragPayload?.source === 'bank' && dragPayload.word === word) ||
                    (touchDrag?.active && touchDrag.payload.source === 'bank' && touchDrag.payload.word === word);

                  return (
                    <button
                      key={word}
                      type="button"
                      disabled={disabled}
                      draggable={!disabled}
                      aria-pressed={isSelected}
                      onDragStart={e => {
                        if (disabled) return;
                        const payload: DragPayload = { source: 'bank', word };
                        setDragPayload(payload);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('application/json', JSON.stringify(payload));
                        e.dataTransfer.setData('text/plain', word);
                      }}
                      onDragEnd={() => {
                        setDragPayload(null);
                        setDragOverPhraseId(null);
                        setDragOverBank(false);
                      }}
                      onTouchStart={e => startTouchDrag(e, { source: 'bank', word })}
                      onClick={() => handleBankWordClick(word)}
                      className={`inline-flex min-h-[44px] touch-manipulation select-none items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-bold shadow-xs transition active:scale-[.97] ${
                        disabled
                          ? 'cursor-default border-[#d8e6ee] bg-white/80 text-[#46657a]'
                          : isSelected
                          ? 'cursor-pointer border-[#0b3c5d] bg-[#072a3f] text-white ring-2 ring-[#0b3c5d]/25'
                          : isBeingDragged
                          ? 'cursor-grabbing border-[#0b3c5d] bg-[#edf5fa] opacity-50'
                          : 'cursor-grab border-[#cfe1ec] bg-white text-[#072a3f] hover:border-[#0b3c5d] hover:bg-[#edf5fa]'
                      }`}
                    >
                      {!disabled && <GripVertical size={14} className="shrink-0 opacity-45" aria-hidden="true" />}
                      <span>{word}</span>
                    </button>
                  );
                })
              ) : (
                <p className="py-1.5 text-sm font-semibold text-[#145c3d]">
                  ✓ Tous les mots de la banque ont été utilisés
                </p>
              )}
            </div>

            <div className="mt-3.5 space-y-1.5 border-t border-[#ddeaf2] pt-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[#46657a]">
                <span>Phrases complétées</span>
                <span className="tabular-nums font-bold text-[#072a3f]">
                  {completedCount} / {phrases.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#ddeaf2]">
                <div
                  className="h-full rounded-full bg-[#2fa36b] transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {banque.length > phrases.length && (
                <p className="text-[11px] font-medium text-[#607f93]">
                  Attention : {banque.length - phrases.length} mot(s) intrus dans la banque.
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* Sentences with Interactive Dropzones */}
        <div className="min-w-0 space-y-3">
          {phrases.map((phrase, index) => {
            const id = String(phrase.id);
            const chosen = answers[id] || '';
            const phraseScore = score?.phrases.find(item => String(item.id) === id);
            const isTargeted = targetedPhraseId === id;
            const isDragHover =
              dragOverPhraseId === id ||
              (touchDrag?.active &&
                touchDrag.hoverTarget?.kind === 'phrase' &&
                touchDrag.hoverTarget.phraseId === id);

            let cardClasses =
              'rounded-2xl border bg-white p-4 shadow-[0_4px_14px_rgba(7,42,63,0.04)] transition';
            if (showCorrection && phraseScore) {
              cardClasses += phraseScore.correct
                ? ' border-[#2fa36b] bg-[#eef9f3]/35'
                : ' border-rose-400 bg-rose-50/35';
            } else if (isDragHover) {
              cardClasses += ' border-[#0b3c5d] bg-[#edf5fa] ring-2 ring-[#0b3c5d]/20';
            } else if (isTargeted) {
              cardClasses += ' border-[#2fa36b] ring-2 ring-[#2fa36b]/20';
            } else {
              cardClasses += ' border-[#d8e6ee]';
            }

            return (
              <article
                key={id}
                data-mots-trous-phrase-id={id}
                onDragOver={e => {
                  if (disabled) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverPhraseId !== id) setDragOverPhraseId(id);
                }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setDragOverPhraseId(prev => (prev === id ? null : prev));
                  }
                }}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverPhraseId(null);
                  if (disabled) return;
                  let payload = dragPayload;
                  if (!payload) {
                    try {
                      payload = JSON.parse(e.dataTransfer.getData('application/json')) as DragPayload;
                    } catch {
                      payload = null;
                    }
                  }
                  if (payload) applyDropOnPhrase(id, payload);
                  setDragPayload(null);
                }}
                className={cardClasses}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#edf5fa] text-xs font-extrabold text-[#0b3c5d]"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1 text-base leading-[2.3] text-[#072a3f] sm:text-[17px]">
                    {phrase.debut && <span>{phrase.debut}</span>}

                    {chosen ? (
                      <span className="mx-1 inline-flex items-center align-middle">
                        <span
                          draggable={!disabled}
                          tabIndex={disabled ? -1 : 0}
                          role="button"
                          aria-label={`Phrase ${index + 1}, mot placé : ${chosen}${
                            disabled ? '' : '. Cliquez ou glissez pour déplacer, ou retirez avec Supprimer.'
                          }`}
                          onDragStart={e => {
                            if (disabled) return;
                            const payload: DragPayload = { source: 'phrase', phraseId: id, word: chosen };
                            setDragPayload(payload);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('application/json', JSON.stringify(payload));
                            e.dataTransfer.setData('text/plain', chosen);
                          }}
                          onDragEnd={() => {
                            setDragPayload(null);
                            setDragOverPhraseId(null);
                            setDragOverBank(false);
                          }}
                          onTouchStart={e => startTouchDrag(e, { source: 'phrase', phraseId: id, word: chosen })}
                          onClick={() => handleGapClick(id)}
                          onKeyDown={e => {
                            if (disabled) return;
                            if (e.key === 'Backspace' || e.key === 'Delete') {
                              e.preventDefault();
                              handleRemoveFromPhrase(id);
                            } else if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleGapClick(id);
                            }
                          }}
                          className={`inline-flex min-h-[44px] touch-manipulation select-none items-center gap-1.5 rounded-xl border px-3 py-1 text-sm font-extrabold transition ${
                            showCorrection && phraseScore
                              ? phraseScore.correct
                                ? 'border-[#2fa36b] bg-[#eef9f3] text-[#145c3d]'
                                : 'border-rose-400 bg-rose-50 text-rose-900'
                              : isTargeted
                              ? 'border-[#2fa36b] bg-[#eef9f3] text-[#072a3f] ring-2 ring-[#2fa36b]/25'
                              : disabled
                              ? 'border-[#cfe1ec] bg-[#f5f9fc] text-[#072a3f]'
                              : 'cursor-grab border-[#0b3c5d] bg-[#edf5fa] text-[#072a3f] hover:bg-[#dfeef8]'
                          }`}
                        >
                          {!disabled && (
                            <GripVertical size={13} className="shrink-0 opacity-50" aria-hidden="true" />
                          )}
                          <span>{chosen}</span>
                          {!disabled && (
                            <button
                              type="button"
                              aria-label={`Retirer le mot ${chosen} de la phrase ${index + 1}`}
                              onClick={e => {
                                e.stopPropagation();
                                handleRemoveFromPhrase(id);
                              }}
                              className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#46657a] transition hover:bg-white/90 hover:text-rose-700"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Trou de la phrase ${index + 1}${
                          selectedWord ? `. Cliquer pour placer « ${selectedWord} »` : ''
                        }`}
                        onClick={() => handleGapClick(id)}
                        className={`mx-1.5 inline-flex min-h-[44px] min-w-[124px] max-w-full touch-manipulation items-center justify-center rounded-xl border-2 border-dashed px-3.5 py-1 align-middle text-xs font-bold transition ${
                          isDragHover
                            ? 'border-[#0b3c5d] bg-[#dcecf7] text-[#072a3f] scale-[1.02]'
                            : selectedWord
                            ? 'border-[#0b3c5d] bg-[#edf5fa] text-[#0b3c5d] hover:bg-[#dfeef8]'
                            : isTargeted
                            ? 'border-[#2fa36b] bg-[#eef9f3] text-[#145c3d]'
                            : disabled
                            ? 'border-[#cfe1ec] bg-[#f8fbfd] text-[#607f93]'
                            : 'border-[#7fa3ba] bg-[#f7fafc] text-[#46657a] hover:border-[#0b3c5d] hover:bg-[#edf5fa]'
                        }`}
                      >
                        {isDragHover
                          ? 'Déposer ici'
                          : selectedWord
                          ? `Placer « ${selectedWord} »`
                          : isTargeted
                          ? 'Choisissez un mot…'
                          : 'Trou à compléter'}
                      </button>
                    )}

                    {phrase.fin && <span>{phrase.fin}</span>}
                  </div>
                </div>

                {showCorrection && phraseScore && (
                  <div
                    className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-xs font-bold ${
                      phraseScore.correct
                        ? 'bg-[#eef9f3] text-[#145c3d]'
                        : 'bg-rose-50 text-rose-900'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {phraseScore.correct ? (
                        <>
                          <Check size={14} aria-hidden="true" />
                          Correct ({phraseScore.points}/{phraseScore.maxPoints} pt)
                        </>
                      ) : (
                        <>
                          <X size={14} aria-hidden="true" />
                          Attendu : <strong className="font-black">{phraseScore.expectedWord}</strong> ({phraseScore.points}/{phraseScore.maxPoints} pt)
                        </>
                      )}
                    </span>
                  </div>
                )}
              </article>
            );
          })}

          {showCorrection && score && (
            <div className="rounded-2xl border border-[#d8e6ee] bg-[#edf5fa] p-4 text-center">
              <p aria-live="polite" className="text-2xl font-black tabular-nums text-[#072a3f]">
                {score.score} / {score.maxScore}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#46657a]">
                {score.score === score.maxScore
                  ? 'Excellent ! Toutes les phrases sont correctement complétées.'
                  : score.score >= score.maxScore * 0.6
                  ? 'Bien, continuez ainsi !'
                  : 'À retravailler : relisez le sens de chaque phrase.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Floating Ghost Pill during Mobile Touch Drag */}
      {touchDrag?.active && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-[#0b3c5d] bg-[#072a3f] px-3.5 py-2 text-sm font-extrabold text-white shadow-xl"
          style={{ left: touchDrag.clientX, top: touchDrag.clientY }}
        >
          {touchDrag.payload.word}
        </div>
      )}
    </section>
  );
};
