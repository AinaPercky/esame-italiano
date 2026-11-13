import React, { useState, useRef, useEffect } from 'react';
import { QuizQuestion } from '../types';
import { getQuestionExpectedAnswers, parseStudentAnswers } from '../utils/quizAnswerMatcher';

export interface QuizClozeInputProps {
  question: QuizQuestion;
  answer: string;
  onChange: (newAnswerJson: string) => void;
  disabled?: boolean;
  theme?: 'amber' | 'navy';
  autoFocus?: boolean;
  onEnterPress?: () => void;
  customSentence?: string; // Phrase spécifique avec les trous (si extraite de la consigne)
}

const ITALIAN_ACCENTS = ['à', 'á', 'è', 'é', 'ì', 'í', 'ò', 'ó', 'ù', 'ú'];

// Détection de tous les formats de cases vides / trous courants :
// - Underscores : ___, ____, ________
// - Points : ..., .....
// - Crochets : [___], [ ], [1], [....]
// - Parenthèses : (___), (....), ( )
export const BLANK_REGEX = /(_{2,}|\[_+\]|\[\s*\]|\[\d+\]|\.{3,}|\((?:_{2,}|\.{2,}|\s*)\)|\[(?:\.{2,}|\s*)\])/g;

/**
 * Découpe un énoncé pour séparer une consigne éventuelle (avant ':') de la phrase à compléter
 */
export function parseQuestionClozePrompt(questionText: string): { prompt: string; sentence: string; hasBlanks: boolean } {
  const text = (questionText || '').trim();
  const testRegex = new RegExp(BLANK_REGEX.source);
  const hasBlanks = testRegex.test(text);

  if (!hasBlanks) {
    return { prompt: text, sentence: '', hasBlanks: false };
  }

  // Si le texte contient un double-point (ex: "Coniuga i verbi : Io (andare) _____ ...")
  const colonIndex = text.indexOf(':');
  if (colonIndex > -1 && colonIndex < text.length - 2) {
    const beforeColon = text.slice(0, colonIndex + 1).trim();
    const afterColon = text.slice(colonIndex + 1).trim();
    if (new RegExp(BLANK_REGEX.source).test(afterColon)) {
      return { prompt: beforeColon, sentence: afterColon, hasBlanks: true };
    }
  }

  // Si pas de double-point, la consigne générique est affichée et la phrase complète contient les trous
  return { prompt: 'Complétez la phrase :', sentence: text, hasBlanks: true };
}

/**
 * Nombre réel de champs à afficher : tient compte des trous présents dans l'énoncé
 * même lorsque le serveur ne fournit qu'une seule réponse attendue.
 */
export function getClozeRenderedBlankCount(question: QuizQuestion, customSentence?: string): number {
  const expectedCount = Math.max(
    1,
    Number(question.blank_count) || getQuestionExpectedAnswers(question).length
  );
  const text = (customSentence || question.question || '').trim();
  const textBlankCount = Array.from(text.matchAll(new RegExp(BLANK_REGEX.source, 'g'))).length;
  return textBlankCount > 0 ? Math.max(textBlankCount, expectedCount) : expectedCount;
}

/** Met à jour un champ sans perdre les autres valeurs déjà saisies. */
export function updateClozeAnswer(
  answer: string,
  index: number,
  value: string,
  blankCount: number
): string {
  const updated = parseStudentAnswers(answer, blankCount);
  updated[index] = value;
  return blankCount === 1 ? value : JSON.stringify(updated);
}

export const QuizClozeInput: React.FC<QuizClozeInputProps> = ({
  question,
  answer,
  onChange,
  disabled = false,
  theme = 'amber',
  autoFocus = false,
  onEnterPress,
  customSentence
}) => {
  const isNavy = theme === 'navy';
  const expectedAnswers = getQuestionExpectedAnswers(question);
  const blankCount = Math.max(1, Number(question.blank_count) || expectedAnswers.length);

  // Texte et nombre réel de champs : il faut parser la réponse avec ce nombre,
  // sinon parseStudentAnswers tronque le tableau à expectedAnswers.length.
  const rawText = (customSentence || question.question || '').trim();
  const textMatches = Array.from(rawText.matchAll(BLANK_REGEX));
  const hasBlanksInText = textMatches.length > 0;
  const renderedBlankCount = getClozeRenderedBlankCount(question, customSentence);

  // Valeurs actuelles : toutes les cases restent contrôlées même si l'élève en remplit 3+.
  const currentValues = parseStudentAnswers(answer, renderedBlankCount);

  // Suivi du trou actuellement actif pour la barre d'accents
  const [activeBlankIndex, setActiveBlankIndex] = useState<number>(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Calcul des segments de texte entourant chaque trou
  const segments: string[] = [];
  if (hasBlanksInText) {
    let lastIndex = 0;
    for (const match of textMatches) {
      const matchIndex = match.index ?? 0;
      segments.push(rawText.slice(lastIndex, matchIndex));
      lastIndex = matchIndex + match[0].length;
    }
    segments.push(rawText.slice(lastIndex));
  }

  // Mise à jour indépendante d'un trou sans effacer les autres champs.
  const handleValueChange = (index: number, val: string) => {
    onChange(updateClozeAnswer(answer, index, val, renderedBlankCount));
  };

  // Insertion d'un caractère accentué italien dans le trou actif
  const handleInsertChar = (char: string) => {
    if (disabled) return;
    const targetIdx = Math.min(Math.max(0, activeBlankIndex), renderedBlankCount - 1);
    const inputEl = inputRefs.current[targetIdx];
    const currentVal = currentValues[targetIdx] || '';

    if (inputEl) {
      const start = inputEl.selectionStart ?? currentVal.length;
      const end = inputEl.selectionEnd ?? currentVal.length;
      const nextVal = currentVal.slice(0, start) + char + currentVal.slice(end);
      handleValueChange(targetIdx, nextVal);

      requestAnimationFrame(() => {
        inputEl.focus();
        const nextPos = start + char.length;
        inputEl.setSelectionRange(nextPos, nextPos);
      });
    } else {
      handleValueChange(targetIdx, currentVal + char);
    }
  };

  // Navigation fluide entre trous (Enter ou Tab)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index < renderedBlankCount - 1) {
        inputRefs.current[index + 1]?.focus();
      } else if (onEnterPress) {
        onEnterPress();
      }
    }
  };

  // Focus automatique au chargement
  useEffect(() => {
    if (autoFocus && !disabled && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus, disabled, question.id]);

  const activeColor = isNavy ? 'text-[#0b3c5d]' : 'text-amber-950';
  const borderFocusColor = isNavy 
    ? 'border-[#0b3c5d] ring-2 ring-[#0b3c5d]/25 bg-sky-50/90 shadow-sm' 
    : 'border-amber-700 ring-2 ring-amber-500/30 bg-amber-50/90 shadow-sm';
  const bgFilledColor = isNavy ? 'bg-[#e6f0f7]/90' : 'bg-amber-100/70';
  const bgEmptyColor = isNavy ? 'bg-slate-50' : 'bg-amber-50/30';

  const filledCount = currentValues.filter(v => Boolean(v?.trim())).length;

  return (
    <div className="space-y-3.5">
      {/* Conteneur principal de la phrase à compléter */}
      <div className={`relative rounded-2xl border border-[#d8e6ee] p-4 sm:p-6 shadow-xs transition-all ${
        disabled 
          ? 'bg-[#f7fafc] border-[#d8e6ee]' 
          : 'bg-white border-[#d8e6ee] hover:border-[#b9cfdd]'
      }`}>
        
        {/* En-tête informatif si plusieurs trous (ex: 4 verbes) */}
        {renderedBlankCount > 1 && (
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Complétez les {renderedBlankCount} cases vides dans la phrase :
            </span>
            <span className={`text-[10px] font-mono font-extrabold px-2.5 py-0.5 rounded-full transition-colors ${
              filledCount === renderedBlankCount 
                ? 'bg-emerald-100 text-emerald-800' 
                : 'bg-slate-100 text-slate-700'
            }`}>
              {filledCount} / {renderedBlankCount} rempli{renderedBlankCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Cas 1 : La phrase contient les trous inline façon Duolingo (ex: Come ______ Mario?) */}
        {hasBlanksInText ? (
          <div className="text-lg sm:text-2xl font-medium text-slate-800 leading-relaxed sm:leading-loose flex flex-wrap items-center gap-x-1.5 gap-y-3">
            {segments.map((seg, idx) => {
              const hasBlankAfter = idx < renderedBlankCount;
              const val = currentValues[idx] || '';
              // Largeur dynamique adaptative selon la longueur du mot saisi
              const dynamicWidth = Math.max(96, Math.min(380, Math.max(val.length, 3) * 14 + 34));

              return (
                <React.Fragment key={idx}>
                  {seg && <span className="align-baseline text-slate-900 select-text">{seg}</span>}
                  
                  {hasBlankAfter && (
                    <span className="relative inline-flex items-center align-baseline mx-1">
                      {/* Badge numéroté discret si plusieurs trous */}
                      {renderedBlankCount > 1 && (
                        <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 font-mono text-[9px] font-extrabold px-1.5 py-0.2 rounded-full shadow-2xs border ${
                          activeBlankIndex === idx 
                            ? (isNavy ? 'bg-[#0b3c5d] text-white border-[#0b3c5d]' : 'bg-amber-800 text-white border-amber-800')
                            : 'bg-white text-slate-500 border-slate-200'
                        }`}>
                          {idx + 1}
                        </span>
                      )}

                      <input
                        ref={(el) => { inputRefs.current[idx] = el; }}
                        type="text"
                        disabled={disabled}
                        value={val}
                        onFocus={() => setActiveBlankIndex(idx)}
                        onChange={(e) => handleValueChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx)}
                        placeholder="____"
                        style={{ width: `${dynamicWidth}px` }}
                        className={`min-h-[42px] text-center font-bold text-base sm:text-xl rounded-xl px-2.5 py-1 transition-all outline-hidden ${
                          disabled 
                            ? 'bg-slate-100 border-b-2 border-slate-300 text-slate-600' 
                            : val 
                              ? `${bgFilledColor} ${activeColor}` 
                              : `${bgEmptyColor} text-slate-800`
                        } ${
                          activeBlankIndex === idx && !disabled
                            ? borderFocusColor
                            : val 
                              ? (isNavy ? 'border-b-2 border-[#0b3c5d]' : 'border-b-2 border-amber-800')
                              : 'border-b-2 border-dashed border-slate-400 hover:border-slate-500'
                        }`}
                      />
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          /* Cas 2 : La consigne est une consigne brute (ex: Comment dit-on "bonjour" ? ou plusieurs verbes) */
          <div className="space-y-4">
            <p className="text-base sm:text-lg font-semibold text-slate-800">
              {rawText}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {Array.from({ length: renderedBlankCount }).map((_, idx) => {
                const val = currentValues[idx] || '';
                const dynamicWidth = Math.max(200, Math.min(460, Math.max(val.length, 8) * 14 + 44));

                return (
                  <div key={idx} className="flex items-center gap-2">
                    {renderedBlankCount > 1 && (
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                        Case {idx + 1} :
                      </span>
                    )}
                    <input
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      disabled={disabled}
                      value={val}
                      onFocus={() => setActiveBlankIndex(idx)}
                      onChange={(e) => handleValueChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      placeholder={renderedBlankCount > 1 ? `Réponse ${idx + 1}...` : "Écrivez votre réponse ici..."}
                      style={{ width: `${dynamicWidth}px` }}
                      className={`min-h-[44px] font-bold text-base sm:text-xl rounded-xl px-4 py-1.5 transition-all outline-hidden ${
                        disabled 
                          ? 'bg-slate-100 border-b-2 border-slate-300 text-slate-600' 
                          : val 
                            ? `${bgFilledColor} ${activeColor}` 
                            : `${bgEmptyColor} text-slate-800`
                      } ${
                        activeBlankIndex === idx && !disabled
                          ? borderFocusColor
                          : val 
                            ? (isNavy ? 'border-b-2 border-[#0b3c5d]' : 'border-b-2 border-amber-800')
                            : 'border-b-2 border-dashed border-slate-400 hover:border-slate-500'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Barre de caractères accentués italiens façon Duolingo */}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1 pl-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
            Accents :
          </span>
          {ITALIAN_ACCENTS.map((char) => (
            <button
              key={char}
              type="button"
              onClick={() => handleInsertChar(char)}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-slate-200 bg-white font-mono text-sm sm:text-base font-bold text-slate-800 shadow-2xs hover:border-slate-400 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              title={`Insérer ${char}`}
            >
              {char}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
