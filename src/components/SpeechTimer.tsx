import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Clock, 
  AlertCircle, 
  CheckCircle2,
  BellRing,
  Volume1
} from 'lucide-react';

interface SpeechTimerProps {
  maxSeconds?: number;
  initialElapsedSeconds?: number;
  onTimeChange?: (data: {
    durationUsedSeconds: number;
    maxDurationSeconds: number;
    timerStatus: 'completed' | 'stopped_manually' | 'not_timed';
    isExpired: boolean;
  }) => void;
}

export const SpeechTimer: React.FC<SpeechTimerProps> = ({
  maxSeconds = 180,
  initialElapsedSeconds = 0,
  onTimeChange
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(initialElapsedSeconds);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [hasStarted, setHasStarted] = useState<boolean>(initialElapsedSeconds > 0);
  const [activeAlert, setActiveAlert] = useState<string | null>(null);
  const [testBeepSuccess, setTestBeepSuccess] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alertedCheckpoints = useRef<{ [key: number]: boolean }>({});

  const remainingSeconds = Math.max(0, maxSeconds - elapsedSeconds);
  const isExpired = elapsedSeconds >= maxSeconds;
  const progressPct = Math.min(100, Math.round((elapsedSeconds / maxSeconds) * 100));

  // Initialisation et déverrouillage de l'AudioContext sur geste utilisateur
  const getOrCreateAudioContext = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch (e) {
      console.warn('Audio non initialisé:', e);
      return null;
    }
  }, []);

  // Beeper sonore universel (Web Audio API sans dépendance externe)
  const playBeeperSound = useCallback((type: 'time_up' | 'countdown' | 'warning' | 'test') => {
    if (!soundEnabled) return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'time_up') {
        // Alarme de fin de temps : 4 bips puissants et percutants (880Hz / 1046Hz)
        const sequence = [
          { freq: 880, start: 0, dur: 0.16 },
          { freq: 1046, start: 0.20, dur: 0.16 },
          { freq: 880, start: 0.40, dur: 0.16 },
          { freq: 1174, start: 0.60, dur: 0.35 }
        ];

        sequence.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = 'square'; // timbre avertisseur / buzzer d'examen
          osc.frequency.setValueAtTime(freq, now + start);

          // Enveloppe d'amplitude (évite les claquements audio)
          gain.gain.setValueAtTime(0.001, now + start);
          gain.gain.exponentialRampToValueAtTime(0.30, now + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + start);
          osc.stop(now + start + dur);
        });
      } else if (type === 'test') {
        // Double bip test agréable pour vérifier les haut-parleurs
        [587.33, 880].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = idx * 0.14;
          const dur = 0.12;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + start);
          gain.gain.setValueAtTime(0.001, now + start);
          gain.gain.exponentialRampToValueAtTime(0.20, now + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + start);
          osc.stop(now + start + dur);
        });
      } else if (type === 'countdown') {
        // 3 bips courts de compte à rebours
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.10);
      } else if (type === 'warning') {
        // Bip discret d'avertissement
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.20);
      }
    } catch (e) {
      console.warn('Erreur lecture beeper:', e);
    }
  }, [soundEnabled, getOrCreateAudioContext]);

  // Alerte manuelle / Test du beeper
  const handleTestBeep = () => {
    getOrCreateAudioContext();
    playBeeperSound('test');
    setTestBeepSuccess(true);
    setTimeout(() => {
      setTestBeepSuccess(false);
    }, 3000);
  };

  // Rejouer le buzzer lorsque le temps est expiré
  const handleReplayEndAlarm = () => {
    getOrCreateAudioContext();
    playBeeperSound('time_up');
  };

  // Synchronisation des alertes intermédiaires : 60s, 30s, 10s
  useEffect(() => {
    if (!isRunning) return;

    if (remainingSeconds === 60 && !alertedCheckpoints.current[60]) {
      alertedCheckpoints.current[60] = true;
      setActiveAlert("Attention : Il ne reste plus qu'1 minute de parole !");
      playBeeperSound('warning');
    } else if (remainingSeconds === 30 && !alertedCheckpoints.current[30]) {
      alertedCheckpoints.current[30] = true;
      setActiveAlert('Plus que 30 secondes restantes !');
      playBeeperSound('warning');
    } else if (remainingSeconds === 10 && !alertedCheckpoints.current[10]) {
      alertedCheckpoints.current[10] = true;
      setActiveAlert('Dernières 10 secondes : conclure la présentation !');
      playBeeperSound('countdown');
    }
  }, [remainingSeconds, isRunning, playBeeperSound]);

  // Interval de chronomètre avec beeper à 3 min et tolérance de 4 secondes supplémentaire
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next === maxSeconds) {
            // Premier bip à 3 minutes (180s)
            playBeeperSound('time_up');
            setActiveAlert("⏰ Temps de 3 minutes écoulé ! Tolérance de 4 secondes supplémentaire en cours (+4s)...");
          }
          if (next >= maxSeconds + 4) {
            setIsRunning(false);
            // Second bip final après les 4 secondes de tolérance
            playBeeperSound('time_up');
            setActiveAlert("⏰ Fin définitive après la tolérance de 4 secondes (184s).");
            return maxSeconds + 4;
          }
          return next;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, maxSeconds, playBeeperSound]);

  const lastReportedRef = useRef<{
    elapsed: number;
    status: string;
    max: number;
    expired: boolean;
  }>({
    elapsed: -1,
    status: '',
    max: -1,
    expired: false
  });

  // Propagation au parent
  useEffect(() => {
    if (onTimeChange) {
      const status: 'completed' | 'stopped_manually' | 'not_timed' = 
        !hasStarted && elapsedSeconds === 0 
          ? 'not_timed' 
          : isExpired 
            ? 'completed' 
            : 'stopped_manually';

      const prev = lastReportedRef.current;
      if (
        prev.elapsed !== elapsedSeconds ||
        prev.status !== status ||
        prev.max !== maxSeconds ||
        prev.expired !== isExpired
      ) {
        lastReportedRef.current = {
          elapsed: elapsedSeconds,
          status,
          max: maxSeconds,
          expired: isExpired
        };

        onTimeChange({
          durationUsedSeconds: elapsedSeconds,
          maxDurationSeconds: maxSeconds,
          timerStatus: status,
          isExpired
        });
      }
    }
  }, [elapsedSeconds, maxSeconds, isExpired, hasStarted, onTimeChange]);

  const handleStart = () => {
    if (isExpired) return;
    getOrCreateAudioContext();
    setIsRunning(true);
    setHasStarted(true);
    setActiveAlert(null);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    setHasStarted(false);
    setActiveAlert(null);
    alertedCheckpoints.current = {};
  };

  // Formatage mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Couleur dynamique selon le temps restant
  const getProgressColor = () => {
    if (remainingSeconds <= 10) return 'bg-rose-600';
    if (remainingSeconds <= 30) return 'bg-orange-500';
    if (remainingSeconds <= 60) return 'bg-amber-500';
    return 'bg-emerald-600';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-xs space-y-3">
      {/* Header Chrono & Contrôle du Beeper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${isRunning ? 'text-amber-800 animate-spin' : 'text-slate-500'}`} style={{ animationDuration: '3s' }} />
          <h4 className="font-semibold text-slate-900 text-sm">
            Chronomètre de Parole (3 minutes + 4s de tolérance)
          </h4>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Bouton Test Beeper */}
          <button
            type="button"
            onClick={handleTestBeep}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors min-h-[36px] cursor-pointer"
            title="Tester le beeper sonore sur vos haut-parleurs"
          >
            <BellRing className="w-3.5 h-3.5 text-amber-800" />
            <span>Tester beeper</span>
          </button>

          {/* Bouton Activer / Couper son */}
          <button
            type="button"
            onClick={() => {
              getOrCreateAudioContext();
              setSoundEnabled(!soundEnabled);
            }}
            className={`p-2 rounded-lg text-xs transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
              soundEnabled ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-100'
            }`}
            title={soundEnabled ? 'Désactiver les bips sonores' : 'Activer les bips sonores'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-700" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>
          
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-medium ${
            isRunning 
              ? 'bg-emerald-50 text-emerald-800' 
              : isExpired 
                ? 'bg-rose-50 text-rose-800 font-bold' 
                : hasStarted 
                  ? 'bg-amber-50 text-amber-800' 
                  : 'bg-slate-100 text-slate-600'
          }`}>
            {isRunning ? '● En cours' : isExpired ? '⏰ Temps écoulé (Bip)' : hasStarted ? 'En pause' : 'Prêt'}
          </span>
        </div>
      </div>

      {/* Confirmation test beeper */}
      {testBeepSuccess && (
        <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-900 text-xs font-medium animate-in fade-in duration-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>✓ Beeper testé avec succès : le son retentira automatiquement à la fin des 3 minutes.</span>
        </div>
      )}

      {/* Main Digital Timer Readout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center text-center py-2 bg-slate-50 rounded-lg border border-slate-100">
        <div>
          <span className="text-[11px] text-slate-400 block font-medium">Temps écoulé</span>
          <span className="font-mono text-xl sm:text-2xl font-bold text-slate-800">
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-400 block font-medium">Temps restant</span>
          <span className={`font-mono text-xl sm:text-2xl font-bold ${
            remainingSeconds <= 10 
              ? 'text-rose-600 animate-pulse' 
              : remainingSeconds <= 30 
                ? 'text-orange-600' 
                : remainingSeconds <= 60 
                  ? 'text-amber-700' 
                  : 'text-slate-900'
          }`}>
            {formatTime(remainingSeconds)}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-400 block font-medium">Durée max</span>
          <span className="font-mono text-base sm:text-lg font-semibold text-slate-600">
            03:00
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-400 block font-medium">Progression</span>
          <span className="font-mono text-base sm:text-lg font-semibold text-amber-900">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Progress Bar (Visual time remaining) */}
      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ${getProgressColor()}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Alerte visuelle & sonore contextuelle */}
      {activeAlert && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs animate-fade-in ${
          isExpired 
            ? 'bg-rose-100 text-rose-900 border-2 border-rose-400' 
            : remainingSeconds <= 30 
              ? 'bg-orange-100 text-orange-900 border border-orange-200' 
              : 'bg-amber-100 text-amber-900 border border-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <BellRing className={`w-4 h-4 shrink-0 ${isExpired ? 'text-rose-700 animate-bounce' : 'text-amber-700'}`} />
            <span>{activeAlert}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isExpired && (
              <button
                type="button"
                onClick={handleReplayEndAlarm}
                className="px-2.5 py-1 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded shadow-xs flex items-center gap-1 min-h-[30px] cursor-pointer"
                title="Faire retentir le beeper à nouveau"
              >
                <BellRing className="w-3 h-3" />
                <span>Sonner à nouveau</span>
              </button>
            )}
            <button 
              type="button" 
              onClick={() => setActiveAlert(null)}
              className="text-xs text-slate-500 hover:text-slate-800 px-1.5 py-1 flex items-center cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Controls: Démarrer, Pause, Reprendre, Réinitialiser */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {!isRunning ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={isExpired}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-1.5 text-xs font-semibold rounded-md shadow-2xs transition-colors min-h-[44px] cursor-pointer ${
                isExpired 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-amber-800 hover:bg-amber-900 text-white active:bg-amber-950'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{hasStarted ? 'Reprendre' : 'Démarrer (3 min)'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-1.5 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 rounded-md shadow-2xs transition-colors min-h-[44px] cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Mettre en pause</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center gap-1 px-3 py-2.5 sm:py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors min-h-[44px] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Réinitialiser</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 italic">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span>Beeper sonore automatique à 03:00</span>
        </div>
      </div>
    </div>
  );
};

