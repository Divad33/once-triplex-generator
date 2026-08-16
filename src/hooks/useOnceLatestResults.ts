import { useEffect, useState } from 'react';
import { getAllResults } from '@/lib/resultsDb';
import type { OnceLatestResult } from '@/lib/onceTriplex';

interface OnceLatestState {
  results: OnceLatestResult[];
  loading: boolean;
  error: boolean;
  updatedAt: string | null;
}

function parseSorteo(period: string): number {
  const match = period.match(/S(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

function toOnceLatestResult(draw: { id: string | number; date: string; number: string; period: string }): OnceLatestResult {
  return {
    id: String(draw.id),
    gameName: 'Triplex',
    number: draw.number,
    sorteo: parseSorteo(draw.period),
    drawDate: ${draw.date}T00:00:00.000Z,
  };
}

export function useOnceLatestResults(): OnceLatestState {
  const [state, setState] = useState<OnceLatestState>({
    results: [],
    loading: true,
    error: false,
    updatedAt: null,
  });

  useEffect(() => {
    const loadResults = () => {
      try {
        const all = getAllResults();
        const latest = all.slice(0, 5).map(toOnceLatestResult);
        setState({
          results: latest,
          loading: false,
          error: latest.length === 0,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        setState({ results: [], loading: false, error: true, updatedAt: null });
      }
    };

    loadResults();
    const intervalId = window.setInterval(loadResults, 15 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return state;
}
