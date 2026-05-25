import { fetchLatestTriplexDraws, type TriplexDraw } from '@/lib/onceTriplex';
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

const SORTEO_PERIOD: Record<number, string> = {
  1: 'S1',
  2: 'S2',
  3: 'S3',
  4: 'S4',
  5: 'S5',
};

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
      errors.push(formatSyncError(bundledError, 'No se pudo cargar la base local incluida'));
    }
  }

  try {
    const latestDraws = await fetchLatestTriplexDraws();
    const latestResults = latestDraws.map(drawToResult);
    latestDraw = latestResults[0];
    addedLatest = addResults(latestResults).length;
    latestOnline = latestDraws.length > 0;
  } catch (syncError) {
    errors.push(formatSyncError(syncError, 'No se pudo conectar con ONCE'));
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

function drawToResult(draw: TriplexDraw): Omit<DrawResult, 'id'> {
  return {
    number: draw.number,
    date: draw.drawDate.slice(0, 10),
    period: SORTEO_PERIOD[draw.sorteo] || `S${draw.sorteo}`,
  };
}

function formatSyncError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
