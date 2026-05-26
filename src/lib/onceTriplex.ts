const PROXY_API_URL = 'https://pick3-results-proxy.onrender.com/once/latest';
const API_TIMEOUT_MS = 10000;

export interface TriplexDraw {
  id: string;
  number: string;
  sorteo: number;
  drawDate: string;
}

export interface OnceLatestResult {
  id: string;
  gameName: string;
  number: string;
  sorteo: number;
  drawDate: string;
}

interface OnceLatestProxyResponse {
  results: OnceLatestResult[];
  updatedAt: string;
  source: string;
}

export async function fetchLatestTriplexDraws(): Promise<TriplexDraw[]> {
  const proxyResults = await fetchTriplexFromProxy();
  if (proxyResults.length > 0) {
    return proxyResults
      .map(toTriplexDraw)
      .sort(compareDraws);
  }

  return [];
}

export async function fetchLatestOnceResults(): Promise<OnceLatestResult[]> {
  const proxyResults = await fetchTriplexFromProxy();
  if (proxyResults.length > 0) {
    return proxyResults.sort(compareLatestResults);
  }

  return [];
}

function toTriplexDraw(result: OnceLatestResult): TriplexDraw {
  return {
    id: `${result.drawDate.slice(0, 10)}-S${result.sorteo}`,
    number: result.number,
    sorteo: result.sorteo,
    drawDate: result.drawDate,
  };
}

async function fetchTriplexFromProxy(): Promise<OnceLatestResult[]> {
  try {
    const response = await fetchWithTimeout(PROXY_API_URL);
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as OnceLatestProxyResponse;
    if (!Array.isArray(data.results)) {
      return [];
    }

    return data.results.filter(isOnceLatestResult);
  } catch {
    return [];
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isOnceLatestResult(draw: unknown): draw is OnceLatestResult {
  return (
    draw != null &&
    typeof draw === 'object' &&
    typeof (draw as Record<string, unknown>).id === 'string' &&
    typeof (draw as Record<string, unknown>).gameName === 'string' &&
    typeof (draw as Record<string, unknown>).number === 'string' &&
    typeof (draw as Record<string, unknown>).sorteo === 'number' &&
    typeof (draw as Record<string, unknown>).drawDate === 'string'
  );
}

function compareLatestResults(a: OnceLatestResult, b: OnceLatestResult): number {
  const dateComparison = b.drawDate.localeCompare(a.drawDate);
  if (dateComparison !== 0) {
    return dateComparison;
  }

  return b.sorteo - a.sorteo;
}

function compareDraws(a: TriplexDraw, b: TriplexDraw): number {
  const dateComparison = b.drawDate.localeCompare(a.drawDate);
  if (dateComparison !== 0) {
    return dateComparison;
  }

  return b.sorteo - a.sorteo;
}
