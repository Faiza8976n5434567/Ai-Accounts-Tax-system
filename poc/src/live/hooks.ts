/** Small shared hooks for the live screens (P1-18: keeps the strict React rules satisfied). */
import { useCallback, useEffect, useState } from "react";

/** Today's date (yyyy-mm-dd), read once when the screen opens — not on every redraw. */
export function useToday(): string {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  return today;
}

type Loaded<T> = { data: T | undefined; error: unknown; loading: boolean };

/**
 * Loads data when `fetcher` changes (pass a useCallback-memoised or module-level function) and
 * again on `reload()`. State is only set from promise callbacks, never synchronously in an effect.
 */
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ data: undefined, error: null, loading: true });
  useEffect(() => {
    let live = true;
    fetcher().then(
      (data) => { if (live) setState({ data, error: null, loading: false }); },
      (error: unknown) => { if (live) setState((s) => ({ data: s.data, error, loading: false })); },
    );
    return () => { live = false; };
  }, [fetcher]);
  const reload = useCallback(() => {
    fetcher().then(
      (data) => setState({ data, error: null, loading: false }),
      (error: unknown) => setState((s) => ({ data: s.data, error, loading: false })),
    );
  }, [fetcher]);
  return { ...state, reload };
}
