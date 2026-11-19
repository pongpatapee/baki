import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { db } from '@/db/client';
import { parseSettingsRows, type Settings } from '@/db/repositories/settings';
import { settings as settingsTable } from '@/db/schema';

import { darkTheme, lightTheme, type Theme } from './tokens';

const SettingsContext = createContext<Settings | null>(null);
const ThemeContext = createContext<Theme>(darkTheme);

/** Provides live settings (re-renders when the settings table changes) and the resolved theme. */
export function AppProviders({ children }: { children: ReactNode }) {
  const { data } = useLiveQuery(db.select().from(settingsTable));
  const settings = useMemo(() => parseSettingsRows(data ?? []), [data]);
  const scheme = useColorScheme();
  const theme = useMemo(() => {
    const pref = settings.theme;
    const dark = pref === 'system' ? scheme !== 'light' : pref === 'dark';
    return dark ? darkTheme : lightTheme;
  }, [settings.theme, scheme]);

  return (
    <SettingsContext.Provider value={settings}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </SettingsContext.Provider>
  );
}

/** Live app settings. Write with `setSetting` from '@/db/repositories/settings'. */
export function useSettings(): Settings {
  const s = useContext(SettingsContext);
  if (!s) throw new Error('useSettings must be used inside <AppProviders>');
  return s;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
