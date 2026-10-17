let sharedAudioContext: AudioContext | null = null;

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

/** Joue deux bips très courts, sans fichier externe ni dépendance audio. */
export function playTimerBeep(): void {
  const context = getAudioContext();
  if (!context) return;

  const scheduleBeeps = () => {
    const startAt = context.currentTime + 0.015;
    [880, 660].forEach((frequency, index) => {
      const onset = startAt + index * 0.17;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, onset);
      gain.gain.setValueAtTime(0.0001, onset);
      gain.gain.exponentialRampToValueAtTime(0.12, onset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, onset + 0.11);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(onset);
      oscillator.stop(onset + 0.12);
    });
  };

  if (context.state === 'suspended') {
    void context.resume().then(scheduleBeeps).catch(() => undefined);
  } else {
    scheduleBeeps();
  }
}
