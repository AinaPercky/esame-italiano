import React from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  LogOut,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  XCircle
} from 'lucide-react';
import { CORRECTION_DISPLAY_SECONDS } from '../utils/quizTiming';

export function formatAssessmentTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'qcm':
      return 'Choix unique';
    case 'reorder':
      return 'Ordre des éléments';
    case 'verbes_trous':
      return 'Banque de verbes et conjugaison';
    case 'text':
    default:
      return 'Réponse à compléter';
  }
}

export function getQuestionInstruction(type: string): string {
  switch (type) {
    case 'qcm':
      return 'Sélectionnez la proposition exacte ci-dessous.';
    case 'reorder':
      return 'Glissez-déposez ou déplacez les cartes pour les placer dans le bon ordre.';
    case 'verbes_trous':
      return 'Choisissez un verbe dans la banque pour chaque phrase, puis conjuguez-le.';
    case 'text':
    default:
      return 'Complétez directement les champs vides ci-dessous.';
  }
}

export interface AssessmentShellProps {
  modeTone?: 'official' | 'training' | 'exam';
  bannerLabel: string;
  bannerMobileLabel?: string;
  bannerRight?: React.ReactNode;
  onExit?: () => void;
  exitLabel?: string;
  kicker: string;
  title: string;
  questionIndex: number;
  totalQuestions: number;
  completedMap?: boolean[];
  questionSecondsRemaining: number | null;
  questionTotalSeconds: number;
  totalSecondsRemaining?: number | null;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  alerts?: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerAction: React.ReactNode;
  watermarkText?: string;
  zIndexClass?: string;
  modals?: React.ReactNode;
  children: React.ReactNode;
}

export const AssessmentShell: React.FC<AssessmentShellProps> = ({
  modeTone = 'official',
  bannerLabel,
  bannerMobileLabel,
  bannerRight,
  onExit,
  exitLabel = 'Quitter',
  kicker,
  title,
  questionIndex,
  totalQuestions,
  completedMap,
  questionSecondsRemaining,
  questionTotalSeconds,
  totalSecondsRemaining = null,
  soundEnabled = true,
  onToggleSound,
  alerts,
  footerLeft,
  footerAction,
  watermarkText,
  zIndexClass = 'z-[110]',
  modals,
  children
}) => {
  const safeTotalQ = Math.max(1, totalQuestions);
  const safeIndex = Math.min(Math.max(0, questionIndex), safeTotalQ - 1);
  const safeQSecs = Math.max(0, questionSecondsRemaining ?? 0);
  const maxQSecs = Math.max(1, questionTotalSeconds);
  const qRatio = Math.max(0, Math.min(1, safeQSecs / maxQSecs));
  const qPercent = Math.round(qRatio * 100);

  const qUrgent = questionSecondsRemaining !== null && (safeQSecs <= 5 || qRatio <= 0.2);
  const qWarning = !qUrgent && questionSecondsRemaining !== null && (safeQSecs <= 10 || qRatio <= 0.35);

  const totalUrgent = totalSecondsRemaining !== null && totalSecondsRemaining <= 15;
  const totalWarning = !totalUrgent && totalSecondsRemaining !== null && totalSecondsRemaining <= 60;

  const progressFillClass =
    qRatio <= 0.25
      ? 'bg-rose-500'
      : qRatio <= 0.5
        ? 'bg-amber-400'
        : 'bg-[#2fa36b]';

  const bannerClass =
    modeTone === 'official' || modeTone === 'exam'
      ? 'bg-[#051e2e] text-[#cfe4f2] border-white/10'
      : 'bg-[#09324d] text-[#d6ecf9] border-white/10';

  const shieldClass =
    modeTone === 'official' || modeTone === 'exam'
      ? 'text-[#7be0ad]'
      : 'text-[#89c9f0]';

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex min-h-0 flex-col overflow-hidden bg-[#f3f8fb] text-[#072a3f] animate-fade-in`}>
      {watermarkText && (
        <div
          className="pointer-events-none fixed bottom-16 right-3 z-20 rounded-lg border border-[#d8e6ee] bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-[#46657a] backdrop-blur-xs"
          aria-hidden="true"
        >
          {watermarkText}
        </div>
      )}

      {/* Bandeau contexte / sécurité compact */}
      <div className={`flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1 text-[10px] sm:px-5 sm:py-1 sm:text-[11px] ${bannerClass}`}>
        <div className="flex min-w-0 items-center gap-1.5 font-bold">
          <ShieldCheck className={`h-3.5 w-3.5 shrink-0 ${shieldClass}`} aria-hidden="true" />
          <span className="truncate sm:hidden">{bannerMobileLabel || bannerLabel}</span>
          <span className="hidden truncate sm:inline">{bannerLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {bannerRight && (
            <span className="hidden text-[10px] font-medium text-white/80 sm:inline">
              {bannerRight}
            </span>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2fa36b] sm:text-[11px]"
            >
              <LogOut className="h-3 w-3" aria-hidden="true" />
              <span>{exitLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* En-tête compact avec chronos sur une ligne, progression et beeper */}
      <header className="shrink-0 border-b border-[#164a6d] bg-gradient-to-b from-[#0b3c5d] to-[#072a3f] px-3 py-1.5 text-white shadow-sm sm:px-5 sm:py-2">
        <div className="mx-auto max-w-5xl space-y-1.5">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#7be0ad]">
                <span className="truncate">{kicker}</span>
                <span className="text-white/40" aria-hidden="true">·</span>
                <span className="tabular-nums text-white/95">
                  Q {safeIndex + 1}/{safeTotalQ}
                </span>
              </div>
              <h1 className="truncate font-display text-xs font-extrabold leading-snug text-white sm:text-base">
                {title}
              </h1>
            </div>

            {/* Beeper + Chronos compacts */}
            <div className="flex shrink-0 items-center gap-1.5">
              {onToggleSound && (
                <button
                  type="button"
                  onClick={onToggleSound}
                  aria-pressed={soundEnabled}
                  aria-label={soundEnabled ? 'Couper les bips sonores du chrono' : 'Activer les bips sonores du chrono'}
                  title={soundEnabled ? 'Beeper actif (cliquer pour couper)' : 'Beeper coupé (cliquer pour activer)'}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    soundEnabled
                      ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                      : 'border-white/15 bg-black/20 text-white/55 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>
              )}

              {questionSecondsRemaining !== null && (
                <div
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 transition-colors sm:px-2.5 ${
                    qUrgent
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : qWarning
                        ? 'border-amber-300 bg-amber-50 text-amber-950'
                        : 'border-white/20 bg-white/10 text-white'
                  }`}
                >
                  <Clock
                    className={`h-3.5 w-3.5 shrink-0 ${
                      qUrgent ? 'text-rose-600' : qWarning ? 'text-amber-700' : 'text-[#7be0ad]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden text-[10px] font-bold uppercase opacity-75 sm:inline">Q</span>
                  <span className="font-mono text-xs font-extrabold tabular-nums">
                    {formatAssessmentTime(safeQSecs)}
                  </span>
                </div>
              )}

              {totalSecondsRemaining !== null && totalSecondsRemaining !== undefined && (
                <div
                  className={`flex h-8 items-center gap-1 rounded-lg border px-2 transition-colors sm:px-2.5 ${
                    totalUrgent
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : totalWarning
                        ? 'border-amber-300 bg-amber-50 text-amber-950'
                        : 'border-white/15 bg-[#051e2e]/60 text-white'
                  }`}
                >
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider ${
                      totalUrgent ? 'text-rose-600' : totalWarning ? 'text-amber-800' : 'text-white/70'
                    }`}
                  >
                    Total
                  </span>
                  <span className="font-mono text-xs font-extrabold tabular-nums">
                    {formatAssessmentTime(totalSecondsRemaining)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Barre de progression temps question + stepper sur la même ligne fluide */}
          <div className="flex items-center gap-3">
            {questionSecondsRemaining !== null && (
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
                role="progressbar"
                aria-label={`Temps restant pour la question : ${safeQSecs} secondes`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={qPercent}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-linear ${progressFillClass}`}
                  style={{ width: `${qPercent}%` }}
                />
              </div>
            )}

            {safeTotalQ > 1 && (
              <div className="hidden max-w-xs flex-1 items-center gap-1 overflow-x-auto sm:flex" aria-label="Progression des questions">
                {Array.from({ length: safeTotalQ }, (_, idx) => {
                  const isCurrent = idx === safeIndex;
                  const isPassed = idx < safeIndex;
                  const isAnswered = completedMap ? Boolean(completedMap[idx]) : isPassed;
                  return (
                    <div
                      key={idx}
                      title={`Question ${idx + 1}`}
                      className={`h-1.5 min-w-[10px] flex-1 rounded-full transition-colors ${
                        isCurrent
                          ? 'bg-white ring-1 ring-[#2fa36b]'
                          : isPassed
                            ? isAnswered
                              ? 'bg-[#2fa36b]'
                              : 'bg-white/40'
                            : 'bg-white/20'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Zone de travail élargie pour énoncés et réponses */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 sm:px-5 sm:py-5">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          {alerts}
          <article className="space-y-4 rounded-[20px] border border-[#d8e6ee] bg-white p-4 shadow-[0_8px_26px_rgba(7,42,63,0.06)] sm:rounded-[24px] sm:p-6">
            {children}
          </article>
        </div>
      </main>

      {/* Barre d'action fixe compacte en bas */}
      <footer className="shrink-0 border-t border-[#d8e6ee] bg-white/95 px-3 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] shadow-[0_-6px_20px_rgba(7,42,63,0.05)] backdrop-blur sm:px-5 sm:py-2.5 sm:pb-[calc(env(safe-area-inset-bottom,0px)+0.625rem)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          {footerLeft ? (
            <div className="shrink-0">{footerLeft}</div>
          ) : (
            <span className="hidden text-xs font-semibold tabular-nums text-[#607f93] sm:inline">
              Question {safeIndex + 1} sur {safeTotalQ} · Pause pédagogique non décomptée
            </span>
          )}
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-initial">
            {footerAction}
          </div>
        </div>
      </footer>

      {modals}
    </div>
  );
};

interface AssessmentQuestionHeaderProps {
  questionNumber: number;
  type: string;
  points: number;
  prompt: React.ReactNode;
  instruction?: string;
  sectionTitle?: string;
}

export const AssessmentQuestionHeader: React.FC<AssessmentQuestionHeaderProps> = ({
  questionNumber,
  type,
  points,
  prompt,
  instruction,
  sectionTitle
}) => (
  <div className="space-y-2.5 border-b border-[#edf4f8] pb-3.5">
    <div className="flex flex-wrap items-center gap-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b3c5d] font-mono text-xs font-extrabold tabular-nums text-white shadow-xs sm:h-9 sm:w-9 sm:text-sm"
        aria-hidden="true"
      >
        {questionNumber}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-extrabold uppercase tracking-[0.07em] text-[#0b3c5d]">
        <span>{getQuestionTypeLabel(type)}</span>
        <span className="text-[#8ba6b8]" aria-hidden="true">·</span>
        <span className="tabular-nums text-[#145c3d]">
          {points} point{points > 1 ? 's' : ''}
        </span>
        {sectionTitle && (
          <>
            <span className="text-[#8ba6b8]" aria-hidden="true">·</span>
            <span className="truncate font-bold normal-case tracking-normal text-[#607f93]">
              {sectionTitle}
            </span>
          </>
        )}
      </div>
    </div>

    <h2 className="text-balance font-display text-lg font-extrabold leading-snug text-[#072a3f] sm:text-[23px] sm:leading-[1.35]">
      {prompt}
    </h2>

    <p className="text-xs font-medium text-[#46657a] sm:text-[13px]">
      {instruction || getQuestionInstruction(type)}
    </p>
  </div>
);

export interface QcmOptionItem {
  value: string;
  label: string;
}

interface AssessmentQcmOptionsProps {
  options: QcmOptionItem[];
  selectedValue: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const AssessmentQcmOptions: React.FC<AssessmentQcmOptionsProps> = ({
  options,
  selectedValue,
  onSelect,
  disabled = false,
  ariaLabel = 'Choix de réponse'
}) => {
  const maxLen = options.reduce((max, item) => Math.max(max, item.label.length), 0);
  const useTwoColumns = options.length >= 2 && options.length <= 6 && maxLen < 62;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid grid-cols-1 gap-3 ${useTwoColumns ? 'sm:grid-cols-2' : ''}`}
    >
      {options.map((opt, idx) => {
        const isSelected = selectedValue === opt.value;
        const letter = String.fromCharCode(65 + idx);
        return (
          <button
            key={`${opt.value}-${idx}`}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => !disabled && onSelect(opt.value)}
            className={`group flex min-h-[60px] w-full items-center gap-3.5 rounded-2xl border-2 px-4 py-3.5 text-left text-[15px] font-semibold transition-all sm:min-h-[68px] sm:px-5 sm:py-4 sm:text-base ${
              isSelected
                ? 'border-[#0b3c5d] bg-[#0b3c5d] text-white shadow-[0_8px_20px_rgba(11,60,93,0.18)]'
                : 'border-[#d8e6ee] bg-white text-[#072a3f] hover:border-[#0b3c5d]/50 hover:bg-[#f3f8fb]'
            } ${disabled ? 'cursor-default opacity-85' : 'cursor-pointer active:scale-[.99]'}`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-extrabold transition-colors ${
                isSelected
                  ? 'bg-white text-[#0b3c5d]'
                  : 'bg-[#edf5fa] text-[#0b3c5d] group-hover:bg-[#dcebf4]'
              }`}
            >
              {letter}
            </span>
            <span className="min-w-0 flex-1 break-words leading-snug">{opt.label}</span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isSelected
                  ? 'border-[#7be0ad] bg-[#2fa36b] text-white'
                  : 'border-[#c3d6e2] bg-white group-hover:border-[#0b3c5d]/50'
              }`}
              aria-hidden="true"
            >
              {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export interface AssessmentCorrectionModalProps {
  isOpen: boolean;
  isCorrect?: boolean;
  isTimeout?: boolean;
  questionNumber: number;
  questionText: string;
  studentAnswer: string;
  expectedAnswer: string;
  explanation?: string;
  points?: number;
  maxPoints?: number;
  countdownSeconds: number;
  totalCountdownSeconds?: number;
  isLastQuestion?: boolean;
  onContinue: () => void;
  disabled?: boolean;
}

export const AssessmentCorrectionModal: React.FC<AssessmentCorrectionModalProps> = ({
  isOpen,
  isCorrect = false,
  isTimeout = false,
  questionNumber,
  questionText,
  studentAnswer,
  expectedAnswer,
  explanation,
  points,
  maxPoints,
  countdownSeconds,
  totalCountdownSeconds = CORRECTION_DISPLAY_SECONDS,
  isLastQuestion = false,
  onContinue,
  disabled = false
}) => {
  if (!isOpen) return null;

  const safeTotal = Math.max(1, totalCountdownSeconds);
  const progressPct = Math.max(0, Math.min(100, (countdownSeconds / safeTotal) * 100));
  const isPartial = !isCorrect && (points ?? 0) > 0;

  const heading = isCorrect
    ? 'Bonne réponse !'
    : isTimeout
      ? 'Temps écoulé'
      : isPartial
        ? 'Réponse partiellement correcte'
        : 'Réponse incorrecte';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#051e2e]/75 p-3 backdrop-blur-xs animate-fade-in sm:p-5"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-correction-title"
        className={`flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-[24px] border bg-white shadow-2xl animate-scale-in ${
          isCorrect ? 'border-[#9ed9b9]' : 'border-[#f3c5cc]'
        }`}
      >
        {/* En-tête uniforme */}
        <div
          className={`flex items-center justify-between gap-3 px-4 py-4 text-white sm:px-6 ${
            isCorrect
              ? 'bg-gradient-to-r from-[#072a3f] to-[#0b3c5d]'
              : 'bg-gradient-to-r from-[#9f1239] to-[#7f1d1d]'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              {isCorrect ? (
                <CheckCircle2 className="h-6 w-6 text-[#7be0ad]" aria-hidden="true" />
              ) : (
                <XCircle className="h-6 w-6 text-rose-200" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${
                  isCorrect ? 'text-[#7be0ad]' : 'text-rose-200'
                }`}
              >
                Correction pédagogique
              </p>
              <h2 id="assessment-correction-title" className="truncate font-display text-base font-extrabold sm:text-lg">
                {heading}
              </h2>
            </div>
          </div>

          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/20 bg-black/25 px-3 py-1.5 font-mono text-sm font-extrabold tabular-nums">
            <Clock className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <span aria-live="polite">{countdownSeconds}s</span>
          </div>
        </div>

        {/* Barre de décompte linéaire */}
        <div className={`h-1.5 w-full overflow-hidden ${isCorrect ? 'bg-[#e6f0f7]' : 'bg-rose-100'}`}>
          <div
            className="h-full bg-[#2fa36b] transition-[width] duration-300 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Corps scrollable */}
        <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="rounded-2xl border border-[#e5eff5] bg-[#f7fafc] p-3.5">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#607f93]">
              Question #{questionNumber}
            </span>
            <p className="mt-1 text-sm font-bold leading-relaxed text-[#072a3f]">
              {questionText}
            </p>
          </div>

          <div className={`grid grid-cols-1 gap-3 ${!isCorrect ? 'sm:grid-cols-2' : ''}`}>
            <div
              className={`rounded-2xl border p-3.5 ${
                isCorrect ? 'border-[#bfe3ce] bg-[#eef9f3]' : 'border-[#f3c5cc] bg-[#fef2f4]'
              }`}
            >
              <div
                className={`mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider ${
                  isCorrect ? 'text-[#145c3d]' : 'text-[#9f1239]'
                }`}
              >
                {isCorrect ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Votre réponse</span>
              </div>
              <p
                className={`whitespace-pre-line break-words text-xs font-semibold leading-relaxed sm:text-sm ${
                  isCorrect ? 'text-[#072a3f]' : 'text-[#7f1d1d]'
                }`}
              >
                {studentAnswer ? `« ${studentAnswer} »` : '(Aucune réponse saisie)'}
              </p>
              {points !== undefined && maxPoints !== undefined && (
                <span
                  className={`mt-1.5 block text-[11px] font-bold tabular-nums ${
                    isCorrect ? 'text-[#145c3d]' : 'text-[#9f1239]'
                  }`}
                >
                  {points} / {maxPoints} point{maxPoints > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {!isCorrect && (
              <div className="rounded-2xl border border-[#bfe3ce] bg-[#eef9f3] p-3.5">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#145c3d]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Bonne réponse</span>
                </div>
                <p className="whitespace-pre-line break-words text-xs font-extrabold leading-relaxed text-[#072a3f] sm:text-sm">
                  « {expectedAnswer || '—'} »
                </p>
                <span className="mt-1.5 block text-[11px] font-bold text-[#145c3d]">
                  Réponse attendue
                </span>
              </div>
            )}
          </div>

          {explanation && (
            <div className="space-y-1.5 rounded-2xl border border-[#cfe1ec] bg-[#edf5fa] p-4">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0b3c5d]">
                <Sparkles className="h-4 w-4 text-[#2fa36b]" aria-hidden="true" />
                <span>Explication & règle</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-xs font-medium leading-relaxed text-[#072a3f] sm:text-sm">
                {explanation}
              </p>
            </div>
          )}

          <p className="text-center text-[11px] italic text-[#607f93]">
            Cette pause pédagogique n’est pas décomptée de votre temps.
          </p>
        </div>

        {/* Pied de modale */}
        <div className="flex flex-col-reverse items-stretch justify-between gap-2.5 border-t border-[#e5eff5] bg-[#f7fafc] p-4 sm:flex-row sm:items-center sm:px-6">
          <span className="text-center font-mono text-xs font-semibold tabular-nums text-[#607f93] sm:text-left">
            Passage automatique dans {countdownSeconds}s…
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onContinue}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#072a3f] px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#0b3c5d] disabled:opacity-50 sm:text-sm"
          >
            <span>{isLastQuestion ? 'Fermer la correction et terminer' : 'Fermer la correction et continuer'}</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
};
