import { useEffect, useState } from 'react';
import { fetchLatestOnceResults, type OnceLatestResult } from '@/lib/onceTriplex';

interface OnceLatestState {
  results: OnceLatestResult[];
  loading: boolean;
  error: boolean;
  updatedAt: string | null;
}

export function useOnceLatestResults(): OnceLatestState {
  const [state, setState] = useState<OnceLatestState>({
    results: [],
    loading: true,
    error: false,
    updatedAt: null,
  });

  useEffect(() => {
    let cancelled = false;

    const loadResults = async () => {
      try {
        const results = await fetchLatestOnceResults();
        if (cancelled) {
          return;
        }

        setState({
          results,
          loading: false,
          error: results.length === 0,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        if (!cancelled) {
          setState((current) => ({ ...current, loading: false, error: true }));
        }
      }
    };

    loadResults();
    const intervalId = window.setInterval(loadResults, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return state;
}
