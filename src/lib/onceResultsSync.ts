import { addResults, getAllResults, type DrawResult } from '@/lib/resultsDb';

export interface OnceSyncResult {
  addedBundled: number;
  addedLatest: number;
  total: number;
  latestOnline: boolean;
  latestDraw?: Omit<DrawResult, 'id'>;
  error?: string;
}

interface BundledOnceResult {
  number: string;
  date: string;
  period: string;
}

export async function syncOnceResults(loadBundledIfEmpty = true): Promise<OnceSyncResult> {
  let addedBundled = 0;
  let addedLatest = 0;
  let latestOnline = false;
  let latestDraw: Omit<DrawResult, 'id'> | undefined;
  const errors: string[] = [];

  if (loadBundledIfEmpty && getAllResults().length === 0) {
    try {
      const bundled = await fetchBundledHistory();
      addedBundled = addResults(bundled).length;
    } catch (bundledError) {
      errors.push(
        bundledError instanceof Error ? bundledError.message : 'Error cargando base local'
      );
    }
  }

  const all = getAllResults();
  if (all.length > 0) {
    latestDraw = { number: all[0].number, date: all[0].date, period: all[0].period };
    latestOnline = true;
  }

  return {
    addedBundled,
    addedLatest,
    total: getAllResults().length,
    latestOnline,
    latestDraw,
    error: errors.length > 0 ? errors.join(' ') : undefined,
  };
}

async function fetchBundledHistory(): Promise<Omit<DrawResult, 'id'>[]> {
  const response = await fetch('/once-triplex-history.json');
  if (!response.ok) {
    throw new Error('Unable to load bundled ONCE Triplex history');
  }
  const data = (await response.json()) as BundledOnceResult[];
  return data.map((result) => ({
    number: result.number,
    date: result.date,
    period: result.period,
  }));
}
