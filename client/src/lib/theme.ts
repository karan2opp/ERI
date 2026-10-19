import { useEffect, useMemo, useState } from 'react';

// Light unless you choose Dark in the profile menu
export type ThemeChoice = 'light' | 'dark';

const KEY = 'plantree.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const readChoice = (): ThemeChoice => {
  try {
    const saved = localStorage.getItem(KEY);
    // 'system' was an older "follow the device" choice: keep whatever it shows now
    if (saved === 'system') return media().matches ? 'dark' : 'light';
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const apply = (choice: ThemeChoice) => {
  const dark = choice === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  window.dispatchEvent(new Event('plantree:theme'));
};

/** The saved theme choice (light or dark), kept in localStorage. */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  const update = (next: ThemeChoice) => {
    try {
      if (next === 'light') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
    setChoice(next);
    apply(next);
  };

  return [choice, update];
}

/** Whether the page is currently dark (follows the data-theme attribute). */
export function useIsDark(): boolean {
  const read = () => document.documentElement.dataset.theme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const onChange = () => setDark(read());
    window.addEventListener('plantree:theme', onChange);
    const m = media();
    m.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('plantree:theme', onChange);
      m.removeEventListener('change', onChange);
    };
  }, []);
  return dark;
}

/**
 * Resolved theme colours for things that can't read CSS variables (Leaflet SVG attributes).
 * Recomputed when the theme changes.
 */
export function useThemeColors() {
  const dark = useIsDark();
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return { primary: v('--primary'), leaf: v('--leaf'), background: v('--background'), water: v('--water'), foreground: v('--foreground'), you: v('--you') };
  }, [dark]);
}
