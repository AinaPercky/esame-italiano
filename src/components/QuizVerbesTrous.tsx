import React, { useState, useEffect, useMemo, useRef } from 'react';
import { QuizQuestion, VerbesTrousPhrase } from '../types';
import {
  gradeVerbesTrousQuestion,
  parseVerbesTrousStudentAnswer,
  VerbesTrousGradingResult
} from '../utils/quizVerbesTrous';
import { RotateCcw, CheckCircle2, AlertCircle, X, Sparkles, BookOpen } from 'lucide-react';

export interface QuizVerbesTrousProps {
  question: QuizQuestion;
  answer?: string; // serialized JSON
  onChange?: (newAnswerJson: string) => void;
  disabled?: boolean;
  isValidated?: boolean;
  theme?: 'amber' | 'navy' | 'emerald';
  onCorrectSubmit?: () => void;
  showStandaloneCorrection?: boolean;
}

export const QuizVerbesTrous: React.FC<QuizVerbesTrousProps> = ({
  question,
  answer,
  onChange,
  disabled = false,
  isValidated = false,
  theme = 'navy',
  onCorrectSubmit,
  showStandaloneCorrection = false
}) => {
  const vt = question.verbes_trous || (question as any);
  const phrases: VerbesTrousPhrase[] = useMemo(() => {
    return Array.isArray(vt?.phrases) ? vt.phrases : Array.isArray(question.phrases) ? question.phrases : [];
  }, [vt?.phrases, question.phrases]);

  const totalPhrases = phrases.length;
  const pointsParPhrase = Number(vt?.points_par_phrase || (question as any).points_par_phrase) || 3;
  const totalMaxPoints = totalPhrases * pointsParPhrase;

  // Initialisation de la banque de verbes dans un ordre mélangé stable pour cette question
  const initialBank = useMemo(() => {
    const list = phrases.map(p => (p.verbe || '').trim()).filter(Boolean);
    // Pseudo-shuffle déterministe basé sur l'id de la question
    let seed = 0;
    for (let i = 0; i < (question.id || '').length; i++) {
      seed = (seed * 31 + question.id.charCodeAt(i)) % 1000;
    }
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [phrases, question.id]);

  // État des choix et des saisies
  const initialData = useMemo(() => {
    return parseVerbesTrousStudentAnswer(answer, totalPhrases);
  }, [answer, totalPhrases]);

  const [choices, setChoices] = useState<Record<number, string>>(initialData.choices);
  const [saisies, setSaisies] = useState<Record<number, string>>(initialData.saisies);
  const [activePhraseIndex, setActivePhraseIndex] = useState<number>(0);
  const [isLocallyCorrected, setIsLocallyCorrected] = useState<boolean>(false);
  const [lastFocusedIndex, setLastFocusedIndex] = useState<number | null>(null);

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Synchronisation si la prop answer change de l'extérieur
  useEffect(() => {
    const parsed = parseVerbesTrousStudentAnswer(answer, totalPhrases);
    setChoices(parsed.choices);
    setSaisies(parsed.saisies);
  }, [answer, totalPhrases]);

  // Notification du parent quand les choix ou saisies changent
  const notifyParent = (newChoices: Record<number, string>, newSaisies: Record<number, string>) => {
    if (onChange) {
      const payload = JSON.stringify({ choices: newChoices, saisies: newSaisies });
      onChange(payload);
    }
  };

  // Liste des verbes déjà placés
  const placedVerbs = useMemo(() => {
    return Object.values(choices).filter(Boolean);
  }, [choices]);

  // Verbes encore disponibles dans la banque
  const availableVerbs = useMemo(() => {
    const used = new Set(placedVerbs);
    return initialBank.filter(v => !used.has(v));
  }, [initialBank, placedVerbs]);

  // Statistiques
  const placedCount = placedVerbs.length;
  const conjugatedCount = Object.values(saisies).filter(s => (s || '').trim().length > 0).length;
  const progressPercent = totalPhrases > 0 ? ((placedCount + conjugatedCount) / (2 * totalPhrases)) * 100 : 0;

  // Calcul du résultat après correction
  const isCorrected = isValidated || isLocallyCorrected;
  const grading: VerbesTrousGradingResult = useMemo(() => {
    return gradeVerbesTrousQuestion(question, { choices, saisies });
  }, [question, choices, saisies]);

  // Recherche de la première phrase sans verbe
  const getNextEmptyIndex = (currentActive: number): number => {
    for (let i = 0; i < totalPhrases; i++) {
      if (!choices[i]) return i;
    }
    return currentActive;
  };

  // Action : Placer un verbe dans la phrase active ou la première vide
  const handleSelectVerb = (verb: string) => {
    if (disabled || isCorrected) return;

    let targetIndex = activePhraseIndex;
    if (choices[targetIndex]) {
      targetIndex = getNextEmptyIndex(targetIndex);
    }

    const nextChoices = { ...choices, [targetIndex]: verb };
    setChoices(nextChoices);
    setActivePhraseIndex(targetIndex);
    setLastFocusedIndex(targetIndex);
    notifyParent(nextChoices, saisies);

    // Focus automatique sur le champ de conjugaison
    setTimeout(() => {
      const inputEl = inputRefs.current[targetIndex];
      if (inputEl) {
        inputEl.focus();
      }
    }, 50);
  };

  // Action : Retirer un verbe d'une phrase (remet dans la banque et vide la saisie)
  const handleRemoveVerb = (phraseIndex: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (disabled || isCorrected) return;

    const nextChoices = { ...choices };
    delete nextChoices[phraseIndex];

    const nextSaisies = { ...saisies };
    delete nextSaisies[phraseIndex];

    setChoices(nextChoices);
    setSaisies(nextSaisies);
    setActivePhraseIndex(phraseIndex);
    setLastFocusedIndex(phraseIndex);
    notifyParent(nextChoices, nextSaisies);
  };

  // Action : Modification de la conjugaison textuelle
  const handleConjugationChange = (phraseIndex: number, text: string) => {
    if (disabled || isCorrected) return;

    const nextSaisies = { ...saisies, [phraseIndex]: text };
    setSaisies(nextSaisies);
    notifyParent(choices, nextSaisies);
  };

  // Insertion d'un caractère accentué dans le champ actif
  const handleInsertAccent = (accent: string) => {
    if (disabled || isCorrected) return;
    const targetIdx = lastFocusedIndex ?? activePhraseIndex;
    const inputEl = inputRefs.current[targetIdx];
    const currentVal = saisies[targetIdx] || '';

    if (inputEl) {
      const start = inputEl.selectionStart ?? currentVal.length;
      const end = inputEl.selectionEnd ?? currentVal.length;
      const updated = currentVal.substring(0, start) + accent + currentVal.substring(end);
      handleConjugationChange(targetIdx, updated);

      setTimeout(() => {
        inputEl.focus();
        inputEl.setSelectionRange(start + accent.length, start + accent.length);
      }, 10);
    } else {
      handleConjugationChange(targetIdx, currentVal + accent);
    }
  };

  // Touche Entrée : passe à la phrase suivante
  const handleKeyDown = (phraseIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIdx = getNextEmptyIndex(phraseIndex);
      if (nextIdx !== phraseIndex && !choices[nextIdx]) {
        setActivePhraseIndex(nextIdx);
      } else if (phraseIndex + 1 < totalPhrases) {
        setActivePhraseIndex(phraseIndex + 1);
        const nextInput = inputRefs.current[phraseIndex + 1];
        if (nextInput) nextInput.focus();
      } else {
        (e.target as HTMLInputElement).blur();
      }
    }
  };

  // Action : Recommencer l'exercice
  const handleReset = () => {
    if (disabled) return;
    const emptyChoices = {};
    const emptySaisies = {};
    setChoices(emptyChoices);
    setSaisies(emptySaisies);
    setActivePhraseIndex(0);
    setLastFocusedIndex(0);
    setIsLocallyCorrected(false);
    notifyParent(emptyChoices, emptySaisies);
  };

  // Action : Corriger / Soumettre
  const handleCorrect = () => {
    setIsLocallyCorrected(true);
    if (onCorrectSubmit) {
      onCorrectSubmit();
    }
  };

  // Message d'aide contextuel
  const tipMessage = useMemo(() => {
    if (isCorrected) return '';
    if (placedCount < totalPhrases) {
      const remaining = totalPhrases - placedCount;
      return `Place les ${remaining} verbe${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} dans les phrases.`;
    }
    if (conjugatedCount < totalPhrases) {
      const remaining = totalPhrases - conjugatedCount;
      return `Il reste ${remaining} conjugaison${remaining > 1 ? 's' : ''} à renseigner.`;
    }
    return 'Tous les verbes sont placés et conjugués ! Tu peux soumettre ta réponse.';
  }, [isCorrected, placedCount, conjugatedCount, totalPhrases]);

  // Message d'encouragement global en fonction du score
  const encouragement = useMemo(() => {
    if (totalMaxPoints <= 0) return '';
    const ratio = grading.awardedPoints / totalMaxPoints;
    if (ratio >= 0.8) return 'Eccellente ! Ottimo lavoro !';
    if (ratio >= 0.5) return 'Bene ! Continua così !';
    return 'Da ripassare ! Consulta le correzioni qui sotto.';
  }, [grading.awardedPoints, totalMaxPoints]);

  const primaryBadgeClass = theme === 'amber'
    ? 'bg-amber-100 text-amber-900 border-amber-300'
    : 'bg-blue-100 text-blue-900 border-blue-200';

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 text-slate-800 dark:text-slate-100">
      {/* En-tête de l'exercice */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-black">
              <BookOpen className="w-4 h-4" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {question.titre || question.question || 'Verbes à trous avec banque'}
            </h2>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {totalMaxPoints} points ({pointsParPhrase} pts / phrase)
          </span>
        </div>

        {question.consigne && (
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-3">
            {question.consigne}
          </p>
        )}

        {/* Compteurs et barre de progression */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Verbes placés : <strong className="text-slate-800 dark:text-slate-200">{placedCount}/{totalPhrases}</strong></span>
            <span>Conjugués : <strong className="text-slate-800 dark:text-slate-200">{conjugatedCount}/{totalPhrases}</strong></span>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
        </div>

        {/* Banque de verbes */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400 mb-2">
            Banca dei verbi · utilise chaque verbe une seule fois
          </div>
          <div className="flex flex-wrap gap-2 min-h-11 items-center">
            {availableVerbs.length > 0 ? (
              availableVerbs.map((verb) => (
                <button
                  key={verb}
                  type="button"
                  onClick={() => handleSelectVerb(verb)}
                  disabled={disabled || isCorrected}
                  className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 shadow-2xs hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {verb}
                </button>
              ))
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 py-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>✓ Tous les verbes sont placés dans les phrases</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bannière de résultat global après correction locale */}
      {isCorrected && (showStandaloneCorrection || isLocallyCorrected) && (
        <div className="bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-800 dark:to-emerald-950/30 rounded-2xl p-5 border-2 border-indigo-200 dark:border-indigo-800 text-center shadow-md animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-center mb-1">
            <span className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-indigo-950 dark:text-white">
            {grading.awardedPoints} <span className="text-lg font-bold text-slate-500 dark:text-slate-400">/ {totalMaxPoints}</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-200 mt-1">
            {encouragement}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {grading.phraseResults.filter(r => r.isFullyCorrect).length} phrase(s) sur {totalPhrases} entièrement réussie(s) (3/3)
          </p>
        </div>
      )}

      {/* Liste des phrases à trous */}
      <div className="space-y-3">
        {phrases.map((phrase, idx) => {
          const chosenVerb = choices[idx] || '';
          const writtenText = saisies[idx] || '';
          const isActive = activePhraseIndex === idx && !isCorrected;

          // Résultat de la phrase si corrigée
          const phraseResult = isCorrected ? grading.phraseResults[idx] : null;
          const isOk = phraseResult?.isFullyCorrect;
          const isKo = phraseResult && !phraseResult.isFullyCorrect;

          let cardBorderClass = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
          if (isOk) {
            cardBorderClass = 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20';
          } else if (isKo) {
            cardBorderClass = 'border-rose-400 bg-rose-50/40 dark:bg-rose-950/20';
          } else if (isActive) {
            cardBorderClass = 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-950 bg-white dark:bg-slate-900';
          }

          return (
            <div
              key={idx}
              onClick={() => {
                if (!isCorrected) {
                  setActivePhraseIndex(idx);
                }
              }}
              className={`rounded-2xl border-2 p-4 transition-all shadow-xs ${cardBorderClass} cursor-pointer`}
            >
              {/* Ligne de phrase avec le trou */}
              <div className="text-base sm:text-lg leading-relaxed flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                {/* Numéro dans un rond */}
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs mr-1">
                  {idx + 1}
                </span>

                {/* Début de la phrase */}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {phrase.debut}
                </span>

                {/* Trou / Verbe placé */}
                {chosenVerb ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-xs animate-in zoom-in-95 duration-150">
                    <span>{chosenVerb}</span>
                    {!isCorrected && !disabled && (
                      <button
                        type="button"
                        onClick={(e) => handleRemoveVerb(idx, e)}
                        title="Remettre ce verbe dans la banque"
                        className="hover:bg-indigo-700 rounded-full p-0.5 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center justify-center min-w-[130px] px-3 py-1 rounded-lg border-2 border-dashed font-semibold text-xs transition-all ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 animate-pulse'
                        : 'border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    touche un verbe
                  </span>
                )}

                {/* Fin de la phrase */}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {phrase.fin}
                </span>
              </div>

              {/* Champ de conjugaison (apparaît dès qu'un verbe est placé) */}
              {chosenVerb && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Conjugue « <strong className="text-indigo-600 dark:text-indigo-400">{chosenVerb}</strong> » avec le sujet de la phrase :
                  </label>
                  <input
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    type="text"
                    value={writtenText}
                    disabled={disabled || isCorrected}
                    onChange={(e) => handleConjugationChange(idx, e.target.value)}
                    onFocus={() => {
                      setActivePhraseIndex(idx);
                      setLastFocusedIndex(idx);
                    }}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    placeholder="Écris la forme conjuguée ici..."
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-base font-semibold rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {/* Feedback détaillé après correction */}
              {isCorrected && phraseResult && (
                <div className={`mt-3 p-3 rounded-xl text-xs sm:text-sm font-semibold flex flex-wrap items-center justify-between gap-2 ${
                  phraseResult.isFullyCorrect
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {phraseResult.isFullyCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                    <span>
                      {phraseResult.isFullyCorrect
                        ? '3 / 3 points'
                        : `${phraseResult.totalPoints} / 3 points (Verbe : ${phraseResult.verbPoints}/1, Conjugaison : ${phraseResult.conjugationPoints}/2)`}
                    </span>
                  </div>

                  {!phraseResult.isFullyCorrect && (
                    <div className="text-xs break-words">
                      Réponse attendue : <strong className="underline underline-offset-2">{phrase.verbe || '—'} → {phrase.reponses?.[0] || '—'}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Démon / Mascotte Percky indicateur d'aide */}
      <div className="flex items-center gap-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 p-3.5 border border-indigo-100 dark:border-indigo-900/50 text-xs text-indigo-900 dark:text-indigo-200">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-xs">
          🇮🇹
        </span>
        <div className="min-w-0">
          <strong className="block font-bold text-indigo-950 dark:text-white">Percky – Conseil conjugaison</strong>
          <span>Place chaque verbe dans sa phrase puis écris sa forme conjuguée au présent. Valide avec le bouton principal en bas !</span>
        </div>
      </div>
    </div>
  );
};
