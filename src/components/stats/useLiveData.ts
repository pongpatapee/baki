import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and re-runs it (debounced) whenever any of `tables` changes.
 * drizzle's useLiveQuery only watches a query's main table; stats queries join several, and bulk
 * writes (imports) fire thousands of row events, hence the debounce.
 */
export function useLiveData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  tables: readonly string[],
  debounceMs = 250,
): { data: T | undefined; loading: boolean; error: Error | undefined } {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | undefined }>({
    data: undefined,
    loading: true,
    error: undefined,
  });
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const tablesKey = tables.join(',');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let seq = 0;
    const run = () => {
      const mine = ++seq;
      setState((s) => (s.loading ? s : { ...s, loading: true }));
      loadRef
        .current()
        .then((data) => {
          if (!cancelled && mine === seq) setState({ data, loading: false, error: undefined });
        })
        .catch((e: unknown) => {
          if (!cancelled && mine === seq)
            setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e : new Error(String(e)) }));
        });
    };
    run();
    const watched = new Set(tablesKey.split(','));
    const sub = addDatabaseChangeListener(({ tableName }) => {
      if (!watched.has(tableName)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, debounceMs);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tablesKey, debounceMs]);

  return state;
}
