import { fetchLatestTriplexDraws, type TriplexDraw } from "@/lib/onceTriplex";
import { addResults, getAllResults, type DrawResult } from "@/lib/resultsDb";

export interface OnceSyncResult {
  addedBundled: number;
  addedLatest: number;
  total: number;
  latestOnline: boolean;
  latestDraw?: Omit<DrawResult, "id">;
  error?: string;
}

interface BundledOnceResult { number: string; date: string; period: string; }

const SORTEO_PERIOD: Record<number, string> = { 1: "S1", 2: "S2", 3: "S3", 4: "S4", 5: "S5" };

export async function syncOnceResults(loadBundledIfEmpty = true): Promise<OnceSyncResult> {
  let addedBundled = 0, addedLatest = 0, latestOnline = false;
  let latestDraw: Omit<DrawResult, "id"> | undefined;
  const errors: string[] = [];

  if (loadBundledIfEmpty && getAllResults().length === 0) {
    try { addedBundled = addResults(await fetchBundledHistory()).length; }
    catch (e) { errors.push(e instanceof Error ? e.message : "Error base local"); }
  }

  try {
    const latest = await fetchLatestTriplexDraws();
    const results = latest.map(drawToResult);
    if (results.length > 0) { latestDraw = results[0]; addedLatest = addResults(results).length; latestOnline = true; }
  } catch (e) { errors.push(e instanceof Error ? e.message : "Error online"); }

  if (!latestDraw) { const all = getAllResults(); if (all.length > 0) latestDraw = { number: all[0].number, date: all[0].date, period: all[0].period }; }

  return { addedBundled, addedLatest, total: getAllResults().length, latestOnline, latestDraw, error: errors.length ? errors.join(" ") : undefined };
}

async function fetchBundledHistory(): Promise<Omit<DrawResult, "id">[]> {
  const r = await fetch("/once-triplex-history.json");
  if (!r.ok) throw new Error("No se pudo cargar historial");
  return (await r.json()).map((x: any) => ({ number: x.number, date: x.date, period: x.period }));
}

function drawToResult(draw: TriplexDraw): Omit<DrawResult, "id"> {
  return { number: draw.number, date: draw.drawDate.slice(0, 10), period: SORTEO_PERIOD[draw.sorteo] || "S" + draw.sorteo };
}
