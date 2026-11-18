import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatOralExamTime, getOralExamCheckpoint, normalizeOralExamDurationSeconds } from '../utils/oralExamTiming';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Clock,
  CheckCircle2,
  BellRing
} from 'lucide-react';

interface SpeechTimerProps {
  /** Durée maximale de cette épreuve, en secondes. */
  maxSeconds?: number;
  /** Temps déjà consommé lors du chargement d'une évaluation existante. */
  initialElapsedSeconds?: number;
  onTimeChange?: (data: {
    durationUsedSeconds: number;
    maxDurationSeconds: number;
    timerStatus: 'completed' | 'stopped_manually' | 'not_timed';
    isExpired: boolean;
  }) => void;
}

type BeepType = 'time_up' | 'warning' | 'countdown' | 'test';

export const SpeechTimer: React.FC<SpeechTimerProps> = ({
  maxSeconds = 180,
  initialElapsedSeconds = 0,
  onTimeChange
}) => {
  const safeMaxSeconds = normalizeOralExamDurationSeconds(maxSeconds);
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.min(safeMaxSeconds, Math.max(0, Math.floor(initialElapsedSeconds)))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(initialElapsedSeconds > 0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeAlert, setActiveAlert] = useState<string | null>(
    initialElapsedSeconds >= safeMaxSeconds ? 'Temps imparti déjà écoulé pour cette évaluation.' : null
  );
  const [testBeepSuccess, setTestBeepSuccess] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alertedCheckpointsRef = useRef<Set<number>>(new Set());
  const endAlarmPlayedRef = useRef(false);
  const lastReportedRef = useRef('');

  const remainingSeconds = Math.max(0, safeMaxSeconds - elapsedSeconds);
  const isExpired = elapsedSeconds >= safeMaxSeconds;
  const progressPct = Math.min(100, Math.round((elapsedSeconds / safeMaxSeconds) * 100));

  const getAudioContext = useCallback((): AudioContext | null => {
    try {
      const AudioContextConstructor = window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return null;
      if (!audioContextRef.current) audioContextRef.current = new AudioContextConstructor();
      if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume();
      }
      return audioContextRef.current;
    } catch (error) {
      console.warn('Impossible d’initialiser le son du chronomètre :', error);
      return null;
    }
  }, []);

  const playBeep = useCallback((type: BeepType) => {
    if (!soundEnabled) return;
    const context = getAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const tones = type === 'time_up'
      ? [{ frequency: 880, start: 0, duration: 0.2 }, { frequency: 1046, start: 0.24, duration: 0.2 }, { frequency: 880, start: 0.48, duration: 0.2 }, { frequency: 1174, start: 0.72, duration: 0.42 }]
      : type === 'test'
        ? [{ frequency: 587, start: 0, duration: 0.13 }, { frequency: 880, start: 0.17, duration: 0.13 }]
        : type === 'countdown'
          ? [{ frequency: 740, start: 0, duration: 0.12 }, { frequency: 740, start: 0.18, duration: 0.12 }, { frequency: 880, start: 0.36, duration: 0.16 }]
          : [{ frequency: 587, start: 0, duration: 0.18 }];

    tones.forEach(({ frequency, start, duration }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type === 'time_up' ? 'square' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + start);
      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(type === 'time_up' ? 0.24 : 0.16, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration);
    });
  }, [getAudioContext, soundEnabled]);

  const handleStart = () => {
    if (isExpired || isRunning) return;
    getAudioContext(); // Déverrouille l'audio après le clic du professeur.
    startedAtRef.current = Date.now() - elapsedSeconds * 1000;
    setHasStarted(true);
    setActiveAlert(null);
    setIsRunning(true);
  };

  const handlePause = () => {
    if (startedAtRef.current !== null) {
      const elapsed = Math.min(safeMaxSeconds, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setElapsedSeconds(elapsed);
    }
    startedAtRef.current = null;
    setIsRunning(false);
  };

  const handleReset = () => {
    startedAtRef.current = null;
    setIsRunning(false);
    setElapsedSeconds(0);
    setHasStarted(false);
    setActiveAlert(null);
    alertedCheckpointsRef.current.clear();
    endAlarmPlayedRef.current = false;
  };

  const handleTestBeep = () => {
    getAudioContext();
    playBeep('test');
    setTestBeepSuccess(true);
    window.setTimeout(() => setTestBeepSuccess(false), 2500);
  };

  const handleReplayEndAlarm = () => {
    getAudioContext();
    playBeep('time_up');
  };

  // Horloge basée sur l'heure réelle : elle ne dérive pas si le navigateur ralentit les intervalles.
  useEffect(() => {
    if (!isRunning || startedAtRef.current === null) return;

    intervalRef.current = setInterval(() => {
      const elapsed = Math.min(
        safeMaxSeconds,
        Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000)
      );
      setElapsedSeconds(elapsed);

      if (elapsed >= safeMaxSeconds) {
        startedAtRef.current = null;
        setIsRunning(false);
        setActiveAlert('Temps écoulé ! Le passage de cet étudiant est terminé.');
        if (!endAlarmPlayedRef.current) {
          endAlarmPlayedRef.current = true;
          playBeep('time_up');
        }
      }
    }, 200);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isRunning, safeMaxSeconds, playBeep]);

  // Alertes sonores à 1 minute, 30 secondes et 10 secondes restantes.
  useEffect(() => {
    if (!isRunning) return;
    const checkpoint = getOralExamCheckpoint(remainingSeconds);
    if (checkpoint !== null && !alertedCheckpointsRef.current.has(checkpoint)) {
      alertedCheckpointsRef.current.add(checkpoint);
      if (checkpoint === 60) {
        setActiveAlert('Attention : il reste une minute.');
        playBeep('warning');
      } else if (checkpoint === 30) {
        setActiveAlert('Attention : il reste 30 secondes.');
        playBeep('warning');
      } else {
        setActiveAlert('Dernières 10 secondes : conclure la présentation.');
        playBeep('countdown');
      }
    }
  }, [remainingSeconds, isRunning, playBeep]);

  useEffect(() => {
    if (!onTimeChange) return;
    const timerStatus: 'completed' | 'stopped_manually' | 'not_timed' =
      isExpired ? 'completed' : hasStarted ? 'stopped_manually' : 'not_timed';
    const signature = `${elapsedSeconds}:${safeMaxSeconds}:${timerStatus}`;
    if (lastReportedRef.current === signature) return;
    lastReportedRef.current = signature;
    onTimeChange({
      durationUsedSeconds: elapsedSeconds,
      maxDurationSeconds: safeMaxSeconds,
      timerStatus,
      isExpired
    });
  }, [elapsedSeconds, safeMaxSeconds, isExpired, hasStarted, onTimeChange]);

  const progressColor = remainingSeconds <= 10
    ? 'bg-rose-600'
    : remainingSeconds <= 30
      ? 'bg-orange-500'
      : remainingSeconds <= 60
        ? 'bg-amber-500'
        : 'bg-emerald-600';

  return (
    <section
      aria-label="Chronomètre de l'épreuve orale"
      className="rounded-xl border border-[#cfe1ec] bg-white p-4 shadow-xs space-y-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Clock className={`h-5 w-5 ${isRunning ? 'text-emerald-700' : 'text-[#0b3c5d]'}`} />
          <div>
            <h3 className="text-sm font-bold text-[#072a3f]">Chronomètre de l’épreuve</h3>
            <p className="text-[11px] text-slate-500">Durée prévue pour cet examen : {formatOralExamTime(safeMaxSeconds)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleTestBeep} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8e6ee] bg-[#f5f9fc] px-2.5 text-xs font-semibold text-[#0b3c5d] hover:bg-[#e6f0f7]">
            <BellRing className="h-3.5 w-3.5" /> Tester le bip
          </button>
          <button
            type="button"
            onClick={() => {
              getAudioContext();
              setSoundEnabled(value => !value);
            }}
            aria-label={soundEnabled ? 'Désactiver le son' : 'Activer le son'}
            title={soundEnabled ? 'Son activé' : 'Son désactivé'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8e6ee] text-[#0b3c5d] hover:bg-[#f5f9fc]"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
          </button>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isRunning ? 'bg-emerald-50 text-emerald-800' : isExpired ? 'bg-rose-50 text-rose-800' : hasStarted ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
            {isRunning ? 'En cours' : isExpired ? 'Temps écoulé' : hasStarted ? 'En pause' : 'Prêt'}
          </span>
        </div>
      </div>

      {testBeepSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Test sonore effectué. Vérifiez le volume de vos haut-parleurs.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-[#f5f9fc] p-3 text-center sm:grid-cols-4">
        <div>
          <span className="block text-[11px] text-slate-500">Temps écoulé</span>
          <strong className="font-mono text-xl text-[#072a3f]">{formatOralExamTime(elapsedSeconds)}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">Temps restant</span>
          <strong aria-live="off" className={`font-mono text-xl ${remainingSeconds <= 10 ? 'animate-pulse text-rose-700' : remainingSeconds <= 30 ? 'text-orange-700' : 'text-[#072a3f]'}`}>
            {formatOralExamTime(remainingSeconds)}
          </strong>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">Durée maximale</span>
          <strong className="font-mono text-xl text-[#072a3f]">{formatOralExamTime(safeMaxSeconds)}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">Progression</span>
          <strong className="font-mono text-xl text-[#0b3c5d]">{progressPct}%</strong>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Temps de parole consommé"
        aria-valuemin={0}
        aria-valuemax={safeMaxSeconds}
        aria-valuenow={elapsedSeconds}
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className={`h-full rounded-full transition-[width] duration-200 ${progressColor}`} style={{ width: `${progressPct}%` }} />
      </div>

      {activeAlert && (
        <div role="status" aria-live="polite" className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs font-semibold ${isExpired ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <span className="flex items-center gap-2"><BellRing className="h-4 w-4 shrink-0" />{activeAlert}</span>
          {isExpired && (
            <button type="button" onClick={handleReplayEndAlarm} className="rounded-lg bg-rose-700 px-3 py-1.5 text-white hover:bg-rose-800">
              Rejouer le signal
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!isRunning ? (
            <button type="button" onClick={handleStart} disabled={isExpired} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#072a3f] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-40">
              <Play className="h-4 w-4 fill-current" /> {hasStarted ? 'Reprendre' : 'Démarrer le chrono'}
            </button>
          ) : (
            <button type="button" onClick={handlePause} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#e6f0f7] px-4 py-2 text-xs font-bold text-[#072a3f] hover:bg-[#d8eaf5]">
              <Pause className="h-4 w-4 fill-current" /> Mettre en pause
            </button>
          )}
          <button type="button" onClick={handleReset} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
          </button>
        </div>
        <p className="text-[11px] text-slate-500">Signal sonore automatique à 00:00 · Sans tolérance supplémentaire</p>
      </div>
    </section>
  );
};
