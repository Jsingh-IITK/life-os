import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme, useWindowDimensions } from 'react-native';

import {
  SIDEBAR_BREAKPOINT,
  breakpoint,
  palette,
  type ColorScheme,
  type Colors,
} from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'life-os.theme-mode';

interface ThemeValue {
  /** What the user chose. */
  mode: ThemeMode;
  /** What that resolves to right now. */
  scheme: ColorScheme;
  colors: Colors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme() ?? 'light';
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Restore the saved preference. Until it loads, 'system' is the correct
  // assumption rather than a guess, so there is no wrong-theme flash for
  // anyone who has not overridden it.
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && (stored === 'light' || stored === 'dark' || stored === 'system')) {
          setModeState(stored);
        }
      })
      .catch(() => {
        // A theme preference is not worth failing over.
      });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    // Applied immediately; persistence is a side effect, so a storage failure
    // cannot stop the theme from switching.
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  // In system mode this tracks the OS live — useSystemColorScheme re-renders
  // on change, so no reload is involved.
  const scheme: ColorScheme = mode === 'system' ? system : mode;

  const value = useMemo<ThemeValue>(
    () => ({ mode, scheme, colors: palette[scheme], setMode }),
    [mode, scheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return value;
}

/** Shorthand for the common case. */
export function useColors(): Colors {
  return useTheme().colors;
}

export interface Layout {
  width: number;
  /** Desktop sidebar instead of bottom navigation. */
  isWide: boolean;
  isTablet: boolean;
  isMobile: boolean;
}

export function useLayout(): Layout {
  const { width } = useWindowDimensions();
  return {
    width,
    isWide: width >= SIDEBAR_BREAKPOINT,
    isTablet: width >= breakpoint.tablet && width < SIDEBAR_BREAKPOINT,
    isMobile: width < breakpoint.tablet,
  };
}
