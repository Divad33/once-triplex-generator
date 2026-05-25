import { useState, useCallback, useEffect } from 'react';
import { enableDrawNotifications as enableDrawNotificationsNative, ensureDrawNotificationsIfEnabled } from '@/lib/drawNotifications';
import { GENERATION_COUNT, genNumbers, normalizeSeed } from '@/lib/pick3Generator';

const HIST_KEY = 'pick3_hist_27';
const LEGACY_HIST_KEY = 'pick3_hist_14';
const THEME_KEY = 'pick3_theme';

const DIGIT_COLORS = [
  '#8ab4f8', '#81c995', '#fdd663', '#f28b82', '#c58af9',
  '#78d9ec', '#a7ffeb', '#ffb4a2', '#b3c7ff', '#ffd6a5'
];

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h_ = hex.replace('#', '').trim();
  const full = h_.length === 3 ? h_.split('').map(c => c + c).join('') : h_;
  const n = parseInt(full, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const lum = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hue = ((b - r) / d + 2) / 6; break;
      case b: hue = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(hue * 360), s: Math.round(sat * 100), l: Math.round(lum * 100) };
}

export interface HistoryItem {
  seed: string;
  when: string;
}

export interface MessageState {
  text: string;
  kind: '' | 'ok' | 'warn';
}

export function usePick3() {
  const [numbers, setNumbers] = useState<string[]>([]);
  const [seed, setSeed] = useState('');
  const [message, setMessage] = useState<MessageState>({ 
    text: `Escribe <b>3 dígitos</b> y toca <b>Generar ${GENERATION_COUNT}</b>.`, 
    kind: '' 
  });
  const [status, setStatus] = useState<{ text: string; warn: boolean }>({ text: 'Listo', warn: false });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [dynamicColor, setDynamicColor] = useState<string>('#8ab4f8');

  // Load history and theme on mount
  useEffect(() => {
    try {
      const savedHist = localStorage.getItem(HIST_KEY) || localStorage.getItem(LEGACY_HIST_KEY);
      if (savedHist) {
        setHistory(JSON.parse(savedHist));
        localStorage.setItem(HIST_KEY, savedHist);
      }
    } catch {
      // Ignore invalid stored history.
    }

    const savedTheme = localStorage.getItem(THEME_KEY) as 'dark' | 'light' | null;
    const initialTheme = savedTheme || 'dark';
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  }, []);

  // Apply dynamic color based on seed's first digit
  const applyDynamicColor = useCallback((seedStr: string) => {
    const s = normalizeSeed(seedStr);
    const first = s[0] && s[0] >= '0' && s[0] <= '9' ? parseInt(s[0], 10) : null;
    const base = first === null ? '#8ab4f8' : DIGIT_COLORS[first];
    setDynamicColor(base);

    const { h, s: sat, l } = hexToHsl(base);
    const root = document.documentElement;
    
    root.style.setProperty('--primary', `${h} ${sat}% ${l}%`);
    root.style.setProperty('--primary-h', `${h}`);
    root.style.setProperty('--primary-s', `${sat}%`);
    root.style.setProperty('--primary-l', `${l}%`);
    
    const isDark = theme === 'dark';
    root.style.setProperty('--primary-container', `${h} ${Math.round(sat * 0.5)}% ${isDark ? 20 : 95}%`);
    root.style.setProperty('--primary-hover', `${h} ${Math.round(sat * 0.5)}% ${isDark ? 18 : 93}%`);
    root.style.setProperty('--ripple-color', `hsla(${h}, ${sat}%, ${l}%, ${isDark ? 0.25 : 0.18})`);
  }, [theme]);

  const haptic = useCallback((ms = 10) => {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      // Ignore unsupported vibration APIs.
    }
  }, []);

  const hapticStrong = useCallback(() => {
    try {
      if (navigator.vibrate) navigator.vibrate([12, 18, 12]);
    } catch {
      // Ignore unsupported vibration APIs.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      localStorage.setItem(THEME_KEY, newTheme);
      return newTheme;
    });
  }, []);

  // Re-apply color when theme changes
  useEffect(() => {
    applyDynamicColor(seed);
  }, [theme, applyDynamicColor, seed]);

  const updateSeed = useCallback((value: string) => {
    const normalized = normalizeSeed(value);
    setSeed(normalized);
    applyDynamicColor(normalized);
    haptic(6);
  }, [applyDynamicColor, haptic]);

  const generate = useCallback(() => {
    const cleanSeed = normalizeSeed(seed).padStart(3, '0');
    setSeed(cleanSeed);
    applyDynamicColor(cleanSeed);

    if (cleanSeed.length !== 3) {
      setStatus({ text: 'Faltan dígitos', warn: true });
      setMessage({ text: 'Pon exactamente <b>3 dígitos</b>.', kind: 'warn' });
      return;
    }

    const list = genNumbers(cleanSeed);
    setNumbers(list);
    setStatus({ text: 'Listo', warn: false });
    setMessage({ text: `Generados <b>${GENERATION_COUNT}</b> resultados desde <b>${cleanSeed}</b>.`, kind: 'ok' });

    // Save to history
    const when = new Date().toLocaleString();
    setHistory(prev => {
      const entry = { seed: cleanSeed, when };
      const next = [entry, ...prev.filter(x => x.seed !== cleanSeed)].slice(0, 18);
      localStorage.setItem(HIST_KEY, JSON.stringify(next));
      return next;
    });
  }, [seed, applyDynamicColor]);

  const copyNumber = useCallback((text: string) => {
    if (!text) return;
    
    const doCopy = () => {
      hapticStrong();
      setMessage({ text: 'Copiado ✅', kind: 'ok' });
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(doCopy).catch(() => {
        fallbackCopy(text);
        doCopy();
      });
    } else {
      fallbackCopy(text);
      doCopy();
    }
  }, [hapticStrong]);

  const copyAll = useCallback(() => {
    const txt = numbers.join(' ');
    if (!txt) {
      setMessage({ text: `Primero genera los ${GENERATION_COUNT}.`, kind: 'warn' });
      return;
    }
    copyNumber(txt);
  }, [numbers, copyNumber]);

  const clearAll = useCallback(() => {
    setSeed('');
    setNumbers([]);
    setStatus({ text: 'Listo', warn: false });
    setMessage({ text: 'Listo. Limpio ✅', kind: '' });
    applyDynamicColor('');
  }, [applyDynamicColor]);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(HIST_KEY);
    localStorage.removeItem(LEGACY_HIST_KEY);
    setHistory([]);
    setMessage({ text: 'Historial borrado ✅', kind: 'ok' });
  }, []);

  const loadFromHistory = useCallback((historySeed: string) => {
    setSeed(historySeed);
    applyDynamicColor(historySeed);
    // Generate immediately
    const cleanSeed = normalizeSeed(historySeed).padStart(3, '0');
    const list = genNumbers(cleanSeed);
    setNumbers(list);
    setStatus({ text: 'Listo', warn: false });
    setMessage({ text: `Generados <b>${GENERATION_COUNT}</b> resultados desde <b>${cleanSeed}</b>.`, kind: 'ok' });
  }, [applyDynamicColor]);

  const enableDrawNotifications = useCallback(async () => {
    setStatus({ text: 'Trabajando…', warn: false });
    try {
      const result = await enableDrawNotificationsNative();
      if (result.pushRegistered && result.pushServerReady) {
        setMessage({
          text: 'Push FCM y recordatorios locales activados para los sorteos.',
          kind: 'ok',
        });
        return;
      }

      if (result.localEnabled) {
        setMessage({
          text: result.pushRegistered
            ? 'Recordatorios locales activados. Push FCM queda listo cuando el servidor tenga Firebase.'
            : 'Recordatorios locales activados. Push FCM queda pendiente de configuración Firebase.',
          kind: 'ok',
        });
        return;
      }

      setMessage({
        text: 'No se pudieron activar las notificaciones. Revisa el permiso de notificaciones en Android.',
        kind: 'warn',
      });
    } catch {
      setMessage({ text: 'No se pudieron programar las notificaciones.', kind: 'warn' });
    } finally {
      setStatus({ text: 'Listo', warn: false });
    }
  }, []);

  useEffect(() => {
    ensureDrawNotificationsIfEnabled().catch(() => {});
  }, []);

  const getBallDigits = useCallback((): [string, string, string] => {
    const s = normalizeSeed(seed);
    return [s[0] || '•', s[1] || '•', s[2] || '•'];
  }, [seed]);

  const getDigitColor = useCallback((digit: string, fallbackIndex: number): string => {
    if (digit >= '0' && digit <= '9') {
      return DIGIT_COLORS[parseInt(digit, 10)];
    }
    const fallbacks = ['#8ab4f8', '#81c995', '#fdd663'];
    return fallbacks[fallbackIndex] || '#8ab4f8';
  }, []);

  return {
    numbers,
    seed,
    updateSeed,
    message,
    status,
    history,
    theme,
    dynamicColor,
    generate,
    copyNumber,
    copyAll,
    clearAll,
    clearHistory,
    loadFromHistory,
    enableDrawNotifications,
    toggleTheme,
    haptic,
    getBallDigits,
    getDigitColor,
  };
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // Ignore browsers that block execCommand.
  }
  document.body.removeChild(ta);
}
