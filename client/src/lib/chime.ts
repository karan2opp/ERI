// A short, soft two-note chime for a new notification, made in the browser (no sound file to download).

const SOUND_KEY = 'plantree.notifySound';

let ctx: AudioContext | null = null;

const audio = (): AudioContext | null => {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
};

/**
 * Browsers only allow sound after the person has touched or clicked the page once, so the sound is unlocked
 * on the first tap anywhere. Call once when the page starts.
 */
export const unlockChimeOnFirstTap = () => {
  const unlock = () => {
    const a = audio();
    if (a && a.state === 'suspended') void a.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
};

/** Plays the chime (silently does nothing if the browser won't allow sound yet). */
export const playChime = () => {
  const a = audio();
  if (!a) return;
  try {
    if (a.state === 'suspended') void a.resume();
    const start = a.currentTime;
    // Two notes, a fifth apart, each fading out
    for (const [freq, delay] of [
      [880, 0],
      [1320, 0.13],
    ]) {
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(0.16, start + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.6);
      osc.connect(gain).connect(a.destination);
      osc.start(start + delay);
      osc.stop(start + delay + 0.65);
    }
  } catch {
    // No sound is fine
  }
};

/** Whether new notifications play the chime (on unless the person switched it off on this device). */
export const chimeEnabled = (): boolean => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setChimeEnabled = (on: boolean) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Remembering it is only a convenience
  }
};
