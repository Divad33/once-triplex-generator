const RESULTS_KEY = 'once_triplex_results';

const PERIOD_ORDER: Record<string, number> = { S1: 0, S2: 1, S3: 2, S4: 3, S5: 4 };

function periodWeight(period: string): number {
  return PERIOD_ORDER[period] ?? 0;
}

export interface DrawResult {
  id: string | number;
  date: string;
  number: string;
  period: string;
  fireball?: string;
}

export { PERIOD_ORDER };

function isDrawResult(r: unknown): r is DrawResult {
  if (
    r != null &&
    typeof r === 'object' &&
    typeof (r as Record<string, unknown>).number === 'string' &&
    typeof (r as Record<string, unknown>).date === 'string' &&
    typeof (r as Record<string, unknown>).period === 'string'
  ) {
    const id = (r as Record<string, unknown>).id;
    return id === undefined || typeof id === 'string' || typeof id === 'number';
  }

  return false;
}

function readAll(): DrawResult[] {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return [];
    const parsed: unknown[] = JSON.parse(raw);
    return Array.isArray(parsed) ? addMissingIds(parsed.filter(isDrawResult)) : [];
  } catch {
    return [];
  }
}

function persist(results: DrawResult[]): void {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

function resultKey(result: Pick<DrawResult, 'date' | 'number' | 'period'>): string {
  return `${result.date}|${result.period.toLowerCase()}|${result.number}`;
}

function stringId(id: string | number): string {
  return String(id);
}

function makeResultId(result: Pick<DrawResult, 'date' | 'number' | 'period'>): string {
  return resultKey(result).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

function normalizeEntry(entry: Omit<DrawResult, 'id'>): DrawResult | null {
  const number = entry.number.replace(/\D/g, '').slice(0, 3);
  const date = entry.date.trim();
  const period = entry.period.trim() || '-';

  if (number.length !== 3 || !date) {
    return null;
  }

  return {
    id: makeResultId({ date, number, period }),
    date,
    number,
    period,
    fireball: entry.fireball,
  };
}

function addMissingIds(results: DrawResult[]): DrawResult[] {
  return results.map((result) => ({
    ...result,
    id: String(result.id || makeResultId(result)),
  }));
}

export function getAllResults(): DrawResult[] {
  return readAll().sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return periodWeight(b.period) - periodWeight(a.period);
  });
}

export function addResult(entry: Omit<DrawResult, 'id'>): DrawResult {
  const all = readAll();
  const item = normalizeEntry(entry);
  if (!item) {
    throw new Error('Invalid result');
  }
  all.push(item);
  persist(all);
  return item;
}

export function addResults(entries: Omit<DrawResult, 'id'>[]): DrawResult[] {
  const all = readAll();
  const existingKeys = new Set(all.map(resultKey));
  const added: DrawResult[] = [];

  for (const entry of entries) {
    const item = normalizeEntry(entry);
    if (!item || existingKeys.has(resultKey(item))) {
      continue;
    }
    existingKeys.add(resultKey(item));
    added.push(item);
  }

  all.push(...added);
  persist(all);
  return added;
}

export function deleteResult(id: string): void {
  persist(readAll().filter(r => stringId(r.id) !== id));
}

export function clearAllResults(): void {
  localStorage.removeItem(RESULTS_KEY);
}

export function importResults(json: string): number {
  const parsed: unknown[] = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Invalid format: expected an array');
  const valid = parsed.filter(isDrawResult);
  return addResults(valid.map((result) => ({
    number: result.number,
    date: result.date,
    period: result.period,
    fireball: result.fireball,
  }))).length;
}

export function exportResults(): string {
  return JSON.stringify(readAll(), null, 2);
}
