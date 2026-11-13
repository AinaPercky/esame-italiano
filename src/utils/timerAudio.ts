import { useEffect, useRef } from 'react';

const TIMER_BEEP_STORAGE_KEY = 'perckylingua_timer_beep_enabled';

let sharedAudioContext: AudioContext | null = null;
let cachedBeepEnabled: boolean | null = null;

function readInitialBeepPreference(): boolean {
  if (cachedBeepEnabled !== null) return cachedBeepEnabled;
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(TIMER_BEEP_STORAGE_KEY);
    cachedBeepEnabled = raw === null ? true : raw !== 'false';
  } catch {
    cachedBeepEnabled = true;
  }
  return cachedBeepEnabled;
}

export function isTimerBeepEnabled(): boolean {
  return readInitialBeepPreference();
}

export function setTimerBeepEnabled(enabled: boolean): void {
  cachedBeepEnabled = enabled;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TIMER_BEEP_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Stockage local indisponible
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new window.AudioContext();
    } catch {
      return null;
    }
  }

  return sharedAudioContext;
}

/** Initialise le moteur audio pendant un clic utilisateur pour éviter le blocage autoplay. */
export function primeTimerAudio(): void {
  const context = getAudioContext();
  if (context?.state === 'suspended') {
    void context.resume().catch(() => undefined);
  }
}

/** Joue une alerte brève en trois notes, sans fichier externe ni dépendance audio. */
export function playTimerBeep(force = false): void {
  if (!force && !isTimerBeepEnabled()) return;
  const context = getAudioContext();
  if (!context) return;

  const scheduleBeeps = () => {
    const startAt = context.currentTime + 0.015;
    [880, 660, 880].forEach((frequency, index) => {
      const onset = startAt + index * 0.15;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, onset);
      gain.gain.setValueAtTime(0.0001, onset);
      gain.gain.exponentialRampToValueAtTime(0.18, onset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, onset + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(onset);
      oscillator.stop(onset + 0.14);
    });
  };

  if (context.state === 'suspended') {
    void context.resume().then(scheduleBeeps).catch(() => undefined);
  } else {
    scheduleBeeps();
  }
}

export function getQuestionBeepCueSeconds(questionTotalSeconds: number): Set<number> {
  const safeTotal = Math.max(1, Math.round(questionTotalSeconds));
  return new Set([Math.ceil(safeTotal / 2), 5, 3, 2, 1]);
}

export interface UseAssessmentTimerBeeperOptions {
  active: boolean;
  paused?: boolean;
  questionKey: string;
  questionTotalSeconds: number;
  questionSecondsRemaining: number | null;
  totalSecondsRemaining?: number | null;
  soundEnabled?: boolean;
}

/**
 * Unifie le déclenchement du beeper sonore sur les Quiz, Exercices et Examens :
 * - Bips question : à la moitié du temps imparti, puis à 5s, 3s, 2s et 1s.
 * - Bips fin de session globale : chaque seconde durant les 5 dernières secondes.
 */
export function useAssessmentTimerBeeper({
  active,
  paused = false,
  questionKey,
  questionTotalSeconds,
  questionSecondsRemaining,
  totalSecondsRemaining = null,
  soundEnabled = true
}: UseAssessmentTimerBeeperOptions): void {
  const questionCueRef = useRef<{ key: string; played: Set<number> }>({ key: '', played: new Set() });
  const finalGlobalSecondRef = useRef<number>(-1);

  useEffect(() => {
    if (!active) {
      questionCueRef.current = { key: '', played: new Set() };
      finalGlobalSecondRef.current = -1;
    }
  }, [active]);

  // Alerte globale sur les 5 dernières secondes
  useEffect(() => {
    if (!active || paused || !soundEnabled) return;
    if (totalSecondsRemaining === null || totalSecondsRemaining <= 0 || totalSecondsRemaining > 5) return;
    if (finalGlobalSecondRef.current === totalSecondsRemaining) return;
    finalGlobalSecondRef.current = totalSecondsRemaining;
    playTimerBeep();
  }, [active, paused, soundEnabled, totalSecondsRemaining]);

  // Alertes dédiées à la question en cours
  useEffect(() => {
    if (!active || paused || !soundEnabled) return;
    if (questionSecondsRemaining === null || questionSecondsRemaining <= 0) return;
    if (totalSecondsRemaining !== null && totalSecondsRemaining <= 5) return;

    if (questionCueRef.current.key !== questionKey) {
      questionCueRef.current = { key: questionKey, played: new Set() };
    }

    const cues = getQuestionBeepCueSeconds(questionTotalSeconds);
    if (!cues.has(questionSecondsRemaining) || questionCueRef.current.played.has(questionSecondsRemaining)) return;

    questionCueRef.current.played.add(questionSecondsRemaining);
    playTimerBeep();
  }, [active, paused, soundEnabled, questionKey, questionTotalSeconds, questionSecondsRemaining, totalSecondsRemaining]);
}
