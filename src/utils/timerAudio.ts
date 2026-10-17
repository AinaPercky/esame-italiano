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

/** Joue une alerte brève en trois notes, sans fichier externe ni dépendance audio. */
export function playTimerBeep(): void {
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
