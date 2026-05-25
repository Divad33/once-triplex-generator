import type { DrawResult } from './resultsDb';

export interface FrequencyEntry {
  number: string;
  count: number;
  pct: number;
}

export interface DigitFrequency {
  digit: number;
  count: number;
  pct: number;
}

export interface PairFrequency {
  pair: string;
  count: number;
}

export interface TerminalPairEntry {
  pair: string;
  count: number;
  pct: number;
  lastDate: string;
  lastPeriod: string;
  drawsAgo: number;
}

export interface TerminalTransition {
  next: string;
  count: number;
  pct: number;
}

export interface TerminalTransitionEntry {
  origin: string;
  total: number;
  followers: TerminalTransition[];
  confidence: number;
}

export interface TerminalTransitionLink {
  origin: string;
  next: string;
  count: number;
  pct: number;
}

export interface TerminalTransitionMatrix {
  byOrigin: TerminalTransitionEntry[];
  strongestLinks: TerminalTransitionLink[];
  lastOrigin: string;
  lastOriginPredictions: TerminalTransition[];
}

export interface DigitTransition {
  next: number;
  count: number;
  pct: number;
}

export interface DigitTransitionEntry {
  digit: number;
  total: number;
  followers: DigitTransition[];
  confidence: number;
}

export interface DigitTransitionLink {
  from: number;
  to: number;
  count: number;
  pct: number;
}

export interface DigitTransitionMatrix {
  byDigit: DigitTransitionEntry[];
  strongestLinks: DigitTransitionLink[];
  lastDigit: number;
  lastDigitPredictions: DigitTransition[];
  totalTransitions: number;
}

export interface DigitTransitionsBundle {
  all: DigitTransitionMatrix;
  dayToDay: DigitTransitionMatrix;
  nightToNight: DigitTransitionMatrix;
}

export interface ForecastRow {
  decade: number;
  terminal: number;
  predictions: string[];
}

export interface ForecastMatrix {
  lastPair: string;
  lastDecade: number;
  lastTerminal: number;
  topDecades: number[];
  topTerminals: number[];
  rows: ForecastRow[];
}

export interface ForecastBundle {
  all: ForecastMatrix;
  dayToDay: ForecastMatrix;
  nightToNight: ForecastMatrix;
}

export interface AnalysisResult {
  totalDraws: number;
  numberFrequency: FrequencyEntry[];
  digitFrequency: [DigitFrequency[], DigitFrequency[], DigitFrequency[]];
  terminalDigitFrequency: [DigitFrequency[], DigitFrequency[]];
  hotNumbers: string[];
  coldNumbers: string[];
  hotTerminalPairs: string[];
  coldTerminalPairs: string[];
  pairs: PairFrequency[];
  terminalPairs: TerminalPairEntry[];
  overdueTerminalPairs: TerminalPairEntry[];
  lastAppearance: Map<string, string>;
  predictions: PredictionSet;
  terminalPredictions: PredictionSet;
  terminalTransitions: TerminalTransitionMatrix;
  hundredsTransitions: DigitTransitionsBundle;
  decadeTransitions: DigitTransitionsBundle;
  singleTerminalTransitions: DigitTransitionsBundle;
  nextDrawForecast: ForecastBundle;
}

export interface PredictionSet {
  byFrequency: string[];
  byHotDigits: string[];
  byPattern: string[];
  combined: string[];
}

const PERIOD_ORDER: Record<string, number> = { S1: 0, S2: 1, S3: 2, S4: 3, S5: 4 };

const DAY_PERIODS = new Set(['S1', 'S2', 'S3', 'S4']);
const NIGHT_PERIODS = new Set(['S5']);
const MIN_ORIGIN_OCCURRENCES = 3;
const MIN_DIGIT_OCCURRENCES = 10;

export function analyze(results: DrawResult[]): AnalysisResult {
  const total = results.length;
  if (total === 0) {
    return emptyAnalysis();
  }

  const numCount = new Map<string, number>();
  const digitCounts: [Map<number, number>, Map<number, number>, Map<number, number>] = [
    new Map(), new Map(), new Map(),
  ];
  const pairCount = new Map<string, number>();
  const terminalPairCount = new Map<string, number>();
  const terminalPairLastSeen = new Map<string, { date: string; period: string; index: number }>();
  const lastSeen = new Map<string, string>();

  const sorted = [...results].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (PERIOD_ORDER[a.period] ?? 0) - (PERIOD_ORDER[b.period] ?? 0);
  });

  for (const [index, r] of sorted.entries()) {
    const n = r.number.padStart(3, '0');
    numCount.set(n, (numCount.get(n) || 0) + 1);
    lastSeen.set(n, r.date);

    for (let pos = 0; pos < 3; pos++) {
      const d = parseInt(n[pos], 10);
      digitCounts[pos].set(d, (digitCounts[pos].get(d) || 0) + 1);
    }

    const pairs = [`${n[0]}${n[1]}`, `${n[1]}${n[2]}`, `${n[0]}${n[2]}`];
    for (const p of pairs) {
      pairCount.set(p, (pairCount.get(p) || 0) + 1);
    }

    const terminalPair = n.slice(1);
    terminalPairCount.set(terminalPair, (terminalPairCount.get(terminalPair) || 0) + 1);
    terminalPairLastSeen.set(terminalPair, { date: r.date, period: r.period, index });
  }

  const numberFrequency: FrequencyEntry[] = [...numCount.entries()]
    .map(([number, count]) => ({ number, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);

  const sortedTerminalPairs = sorted.map((result) => result.number.padStart(3, '0').slice(1));

  const digitFrequency = digitCounts.map(posMap => {
    const entries: DigitFrequency[] = [];
    for (let d = 0; d <= 9; d++) {
      const count = posMap.get(d) || 0;
      entries.push({ digit: d, count, pct: total > 0 ? (count / total) * 100 : 0 });
    }
    return entries;
  }) as [DigitFrequency[], DigitFrequency[], DigitFrequency[]];

  const avgCount = total > 0 ? [...numCount.values()].reduce((s, c) => s + c, 0) / numCount.size : 0;
  const hotNumbers = numberFrequency.filter(f => f.count > avgCount).slice(0, 10).map(f => f.number);
  const coldNumbers = numberFrequency.filter(f => f.count <= avgCount).slice(-10).map(f => f.number);

  const pairs: PairFrequency[] = [...pairCount.entries()]
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const terminalPairs: TerminalPairEntry[] = [...terminalPairCount.entries()]
    .map(([pair, count]) => {
      const lastSeenInfo = terminalPairLastSeen.get(pair);
      return {
        pair,
        count,
        pct: (count / total) * 100,
        lastDate: lastSeenInfo?.date || '',
        lastPeriod: lastSeenInfo?.period || '',
        drawsAgo: lastSeenInfo ? total - lastSeenInfo.index - 1 : total,
      };
    })
    .sort((a, b) => b.count - a.count || a.drawsAgo - b.drawsAgo || a.pair.localeCompare(b.pair));

  const overdueTerminalPairs = [...terminalPairs]
    .sort((a, b) => b.drawsAgo - a.drawsAgo || b.count - a.count || a.pair.localeCompare(b.pair))
    .slice(0, 12);

  const terminalDigitFrequency = getTerminalDigitFrequency(sortedTerminalPairs);
  const avgTerminalCount = terminalPairs.length > 0
    ? terminalPairs.reduce((sum, entry) => sum + entry.count, 0) / terminalPairs.length
    : 0;
  const hotTerminalPairs = terminalPairs
    .filter(entry => entry.count > avgTerminalCount)
    .slice(0, 10)
    .map(entry => entry.pair);
  const coldTerminalPairs = terminalPairs
    .filter(entry => entry.count <= avgTerminalCount)
    .slice(-10)
    .map(entry => entry.pair);

  const predictions = generatePredictions(digitFrequency, numberFrequency, sorted);
  const terminalPredictions = generateTerminalPredictions(terminalPairs, sorted);
  const terminalTransitions = buildTerminalTransitions(sortedTerminalPairs);

  const chronologicalDraws = sorted.map(r => {
    const padded = r.number.padStart(3, '0');
    return {
      hundreds: parseInt(padded[0], 10),
      decade: parseInt(padded[1], 10),
      terminal: parseInt(padded[2], 10),
      period: r.period,
    };
  });

  function bundleByPosition(
    extract: (draw: (typeof chronologicalDraws)[number]) => number,
  ): DigitTransitionsBundle {
    return {
      all: buildDigitTransitions(chronologicalDraws.map(extract)),
      dayToDay: buildDigitTransitions(
        chronologicalDraws.filter(d => DAY_PERIODS.has(d.period)).map(extract),
      ),
      nightToNight: buildDigitTransitions(
        chronologicalDraws.filter(d => NIGHT_PERIODS.has(d.period)).map(extract),
      ),
    };
  }

  const hundredsTransitions = bundleByPosition(d => d.hundreds);
  const decadeTransitions = bundleByPosition(d => d.decade);
  const singleTerminalTransitions = bundleByPosition(d => d.terminal);

  const nextDrawForecast: ForecastBundle = {
    all: buildForecast(decadeTransitions.all, singleTerminalTransitions.all),
    dayToDay: buildForecast(decadeTransitions.dayToDay, singleTerminalTransitions.dayToDay),
    nightToNight: buildForecast(
      decadeTransitions.nightToNight,
      singleTerminalTransitions.nightToNight,
    ),
  };

  return {
    totalDraws: total,
    numberFrequency,
    digitFrequency,
    terminalDigitFrequency,
    hotNumbers,
    coldNumbers,
    hotTerminalPairs,
    coldTerminalPairs,
    pairs,
    terminalPairs,
    overdueTerminalPairs,
    lastAppearance: lastSeen,
    predictions,
    terminalPredictions,
    terminalTransitions,
    hundredsTransitions,
    decadeTransitions,
    singleTerminalTransitions,
    nextDrawForecast,
  };
}

function buildForecast(
  decadeMatrix: DigitTransitionMatrix,
  terminalMatrix: DigitTransitionMatrix,
): ForecastMatrix {
  const empty: ForecastMatrix = {
    lastPair: '',
    lastDecade: -1,
    lastTerminal: -1,
    topDecades: [],
    topTerminals: [],
    rows: [],
  };

  if (decadeMatrix.lastDigit < 0 || terminalMatrix.lastDigit < 0) {
    return empty;
  }

  const lastDecade = decadeMatrix.lastDigit;
  const lastTerminal = terminalMatrix.lastDigit;
  const lastPair = `${lastDecade}${lastTerminal}`;

  const topDecades = decadeMatrix.lastDigitPredictions.slice(0, 5).map(p => p.next);
  const topTerminals = terminalMatrix.lastDigitPredictions.slice(0, 5).map(p => p.next);

  if (topDecades.length === 0 || topTerminals.length === 0) {
    return { lastPair, lastDecade, lastTerminal, topDecades, topTerminals, rows: [] };
  }

  const fallbackTerminal = topTerminals[topTerminals.length - 1];
  const rows: ForecastRow[] = topDecades.map((decade, i) => ({
    decade,
    terminal: topTerminals[i] ?? fallbackTerminal,
    predictions: topTerminals.map(t => `${decade}${t}`),
  }));

  return { lastPair, lastDecade, lastTerminal, topDecades, topTerminals, rows };
}

function buildDigitTransitions(chronologicalDigits: number[]): DigitTransitionMatrix {
  const empty: DigitTransitionMatrix = {
    byDigit: [],
    strongestLinks: [],
    lastDigit: -1,
    lastDigitPredictions: [],
    totalTransitions: 0,
  };
  if (chronologicalDigits.length < 2) return empty;

  const transitions: number[][] = Array.from({ length: 10 }, () => Array(10).fill(0));
  const originCounts: number[] = Array(10).fill(0);
  let totalTransitions = 0;

  for (let i = 0; i < chronologicalDigits.length - 1; i++) {
    const from = chronologicalDigits[i];
    const to = chronologicalDigits[i + 1];
    transitions[from][to]++;
    originCounts[from]++;
    totalTransitions++;
  }

  const byDigit: DigitTransitionEntry[] = [];
  const allLinks: DigitTransitionLink[] = [];

  for (let digit = 0; digit < 10; digit++) {
    const total = originCounts[digit];
    if (total < MIN_DIGIT_OCCURRENCES) continue;

    const followers: DigitTransition[] = [];
    for (let next = 0; next < 10; next++) {
      const count = transitions[digit][next];
      if (count > 0) {
        followers.push({
          next,
          count,
          pct: (count / total) * 100,
        });
      }
    }
    followers.sort((a, b) => b.count - a.count || a.next - b.next);

    const topThree = followers.slice(0, 3);
    const confidence = (topThree.reduce((sum, f) => sum + f.count, 0) / total) * 100;

    byDigit.push({ digit, total, followers: topThree, confidence });

    for (const f of followers) {
      allLinks.push({
        from: digit,
        to: f.next,
        count: f.count,
        pct: f.pct,
      });
    }
  }

  byDigit.sort((a, b) =>
    b.confidence - a.confidence ||
    b.total - a.total ||
    a.digit - b.digit,
  );

  const strongestLinks = allLinks
    .sort((a, b) =>
      b.count - a.count ||
      b.pct - a.pct ||
      a.from - b.from ||
      a.to - b.to,
    )
    .slice(0, 10);

  const lastDigit = chronologicalDigits[chronologicalDigits.length - 1];
  const lastTotal = originCounts[lastDigit];
  const lastDigitPredictions: DigitTransition[] = lastTotal > 0
    ? Array.from({ length: 10 }, (_, next) => ({
        next,
        count: transitions[lastDigit][next],
        pct: (transitions[lastDigit][next] / lastTotal) * 100,
      }))
      .filter(p => p.count > 0)
      .sort((a, b) => b.count - a.count || a.next - b.next)
      .slice(0, 5)
    : [];

  return { byDigit, strongestLinks, lastDigit, lastDigitPredictions, totalTransitions };
}

function buildTerminalTransitions(chronologicalTerminals: string[]): TerminalTransitionMatrix {
  if (chronologicalTerminals.length < 2) {
    return { byOrigin: [], strongestLinks: [], lastOrigin: '', lastOriginPredictions: [] };
  }

  const transitions = new Map<string, Map<string, number>>();
  const originCounts = new Map<string, number>();

  for (let i = 0; i < chronologicalTerminals.length - 1; i++) {
    const origin = chronologicalTerminals[i];
    const next = chronologicalTerminals[i + 1];
    if (!transitions.has(origin)) {
      transitions.set(origin, new Map());
    }
    const followers = transitions.get(origin)!;
    followers.set(next, (followers.get(next) || 0) + 1);
    originCounts.set(origin, (originCounts.get(origin) || 0) + 1);
  }

  const byOrigin: TerminalTransitionEntry[] = [];
  const allLinks: TerminalTransitionLink[] = [];

  for (const [origin, followers] of transitions) {
    const total = originCounts.get(origin) || 0;
    const sortedFollowers = [...followers.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([next, count]) => ({
        next,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      }));
    const topFive = sortedFollowers.slice(0, 5);
    const confidence = total > 0
      ? (topFive.reduce((sum, f) => sum + f.count, 0) / total) * 100
      : 0;

    if (total >= MIN_ORIGIN_OCCURRENCES) {
      byOrigin.push({ origin, total, followers: topFive, confidence });
      for (const link of sortedFollowers) {
        allLinks.push({ origin, next: link.next, count: link.count, pct: link.pct });
      }
    }
  }

  byOrigin.sort((a, b) =>
    b.confidence - a.confidence ||
    b.total - a.total ||
    a.origin.localeCompare(b.origin)
  );

  const strongestLinks = allLinks
    .sort((a, b) => b.count - a.count || b.pct - a.pct || a.origin.localeCompare(b.origin))
    .slice(0, 10);

  const lastOrigin = chronologicalTerminals[chronologicalTerminals.length - 1] || '';
  const lastFollowersMap = transitions.get(lastOrigin);
  const lastTotal = originCounts.get(lastOrigin) || 0;
  const lastOriginPredictions: TerminalTransition[] = lastFollowersMap && lastTotal > 0
    ? [...lastFollowersMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([next, count]) => ({
          next,
          count,
          pct: (count / lastTotal) * 100,
        }))
    : [];

  return { byOrigin, strongestLinks, lastOrigin, lastOriginPredictions };
}

function generatePredictions(
  digitFreq: [DigitFrequency[], DigitFrequency[], DigitFrequency[]],
  numFreq: FrequencyEntry[],
  sorted: DrawResult[],
): PredictionSet {
  const topDigits = digitFreq.map(pos =>
    [...pos].sort((a, b) => b.count - a.count).slice(0, 3).map(d => d.digit),
  );

  const byHotDigits: string[] = [];
  for (const d0 of topDigits[0]) {
    for (const d1 of topDigits[1]) {
      for (const d2 of topDigits[2]) {
        byHotDigits.push(`${d0}${d1}${d2}`);
      }
    }
  }

  const byFrequency = numFreq.slice(0, 14).map(f => f.number);

  const byPattern = predictByPattern(sorted);

  const seen = new Set<string>();
  const combined: string[] = [];
  for (const list of [byHotDigits, byFrequency, byPattern]) {
    for (const n of list) {
      if (!seen.has(n)) {
        seen.add(n);
        combined.push(n);
      }
      if (combined.length >= 14) break;
    }
    if (combined.length >= 14) break;
  }

  return {
    byFrequency: byFrequency.slice(0, 14),
    byHotDigits: byHotDigits.slice(0, 14),
    byPattern: byPattern.slice(0, 14),
    combined: combined.slice(0, 14),
  };
}

function predictByPattern(sorted: DrawResult[]): string[] {
  if (sorted.length < 3) return [];

  const recent = sorted.slice(-10);
  const diffs: number[][] = [];

  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].number.padStart(3, '0');
    const curr = recent[i].number.padStart(3, '0');
    diffs.push([
      (parseInt(curr[0], 10) - parseInt(prev[0], 10) + 10) % 10,
      (parseInt(curr[1], 10) - parseInt(prev[1], 10) + 10) % 10,
      (parseInt(curr[2], 10) - parseInt(prev[2], 10) + 10) % 10,
    ]);
  }

  const avgDiff = [0, 1, 2].map(pos => {
    const sum = diffs.reduce((s, d) => s + d[pos], 0);
    return Math.round(sum / diffs.length) % 10;
  });

  const lastNum = sorted[sorted.length - 1].number.padStart(3, '0');
  const predictions: string[] = [];
  const seen = new Set<string>();
  let d0 = parseInt(lastNum[0], 10);
  let d1 = parseInt(lastNum[1], 10);
  let d2 = parseInt(lastNum[2], 10);
  let perturbStep = 0;
  const maxIterations = 200;
  let iterations = 0;

  while (predictions.length < 14 && iterations < maxIterations) {
    iterations++;
    d0 = (d0 + avgDiff[0]) % 10;
    d1 = (d1 + avgDiff[1]) % 10;
    d2 = (d2 + avgDiff[2]) % 10;
    const candidate = `${d0}${d1}${d2}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      predictions.push(candidate);
    } else {
      const pos = perturbStep % 3;
      perturbStep++;
      if (pos === 0) d0 = (d0 + 1) % 10;
      else if (pos === 1) d1 = (d1 + 1) % 10;
      else d2 = (d2 + 1) % 10;
    }
  }

  return predictions;
}

function generateTerminalPredictions(
  terminalFreq: TerminalPairEntry[],
  sorted: DrawResult[],
): PredictionSet {
  const terminalPairs = sorted.map((result) => result.number.padStart(3, '0').slice(1));
  const digitFreq = getTerminalDigitFrequency(terminalPairs);

  const topDigits = digitFreq.map(pos =>
    [...pos].sort((a, b) => b.count - a.count).slice(0, 4).map(d => d.digit),
  );

  const byHotDigits: string[] = [];
  for (const d0 of topDigits[0]) {
    for (const d1 of topDigits[1]) {
      byHotDigits.push(`${d0}${d1}`);
    }
  }

  const byFrequency = terminalFreq.slice(0, 14).map(f => f.pair);
  const byPattern = predictTerminalByPattern(terminalPairs);

  const seen = new Set<string>();
  const combined: string[] = [];
  for (const list of [byHotDigits, byFrequency, byPattern]) {
    for (const pair of list) {
      if (!seen.has(pair)) {
        seen.add(pair);
        combined.push(pair);
      }
      if (combined.length >= 14) break;
    }
    if (combined.length >= 14) break;
  }

  return {
    byFrequency: byFrequency.slice(0, 14),
    byHotDigits: byHotDigits.slice(0, 14),
    byPattern: byPattern.slice(0, 14),
    combined: combined.slice(0, 14),
  };
}

function getTerminalDigitFrequency(terminalPairs: string[]): [DigitFrequency[], DigitFrequency[]] {
  const digitCounts: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];

  for (const pair of terminalPairs) {
    const cleanPair = pair.padStart(2, '0');
    for (let pos = 0; pos < 2; pos++) {
      const digit = parseInt(cleanPair[pos], 10);
      digitCounts[pos].set(digit, (digitCounts[pos].get(digit) || 0) + 1);
    }
  }

  return digitCounts.map(posMap => {
    const entries: DigitFrequency[] = [];
    for (let digit = 0; digit <= 9; digit++) {
      const count = posMap.get(digit) || 0;
      entries.push({
        digit,
        count,
        pct: terminalPairs.length > 0 ? (count / terminalPairs.length) * 100 : 0,
      });
    }
    return entries;
  }) as [DigitFrequency[], DigitFrequency[]];
}

function predictTerminalByPattern(terminalPairs: string[]): string[] {
  if (terminalPairs.length < 3) return [];

  const recent = terminalPairs.slice(-10);
  const diffs: number[][] = [];

  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].padStart(2, '0');
    const curr = recent[i].padStart(2, '0');
    diffs.push([
      (parseInt(curr[0], 10) - parseInt(prev[0], 10) + 10) % 10,
      (parseInt(curr[1], 10) - parseInt(prev[1], 10) + 10) % 10,
    ]);
  }

  const avgDiff = [0, 1].map(pos => {
    const sum = diffs.reduce((total, diff) => total + diff[pos], 0);
    return Math.round(sum / diffs.length) % 10;
  });

  const lastPair = recent[recent.length - 1].padStart(2, '0');
  const predictions: string[] = [];
  const seen = new Set<string>();
  let d0 = parseInt(lastPair[0], 10);
  let d1 = parseInt(lastPair[1], 10);
  let perturbStep = 0;
  const maxIterations = 200;
  let iterations = 0;

  while (predictions.length < 14 && iterations < maxIterations) {
    iterations++;
    d0 = (d0 + avgDiff[0]) % 10;
    d1 = (d1 + avgDiff[1]) % 10;
    const candidate = `${d0}${d1}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      predictions.push(candidate);
    } else {
      const pos = perturbStep % 2;
      perturbStep++;
      if (pos === 0) d0 = (d0 + 1) % 10;
      else d1 = (d1 + 1) % 10;
    }
  }

  return predictions;
}

function emptyAnalysis(): AnalysisResult {
  const emptyDigits: DigitFrequency[] = Array.from({ length: 10 }, (_, i) => ({
    digit: i, count: 0, pct: 0,
  }));
  return {
    totalDraws: 0,
    numberFrequency: [],
    digitFrequency: [[...emptyDigits], [...emptyDigits], [...emptyDigits]],
    terminalDigitFrequency: [[...emptyDigits], [...emptyDigits]],
    hotNumbers: [],
    coldNumbers: [],
    hotTerminalPairs: [],
    coldTerminalPairs: [],
    pairs: [],
    terminalPairs: [],
    overdueTerminalPairs: [],
    lastAppearance: new Map(),
    predictions: { byFrequency: [], byHotDigits: [], byPattern: [], combined: [] },
    terminalPredictions: { byFrequency: [], byHotDigits: [], byPattern: [], combined: [] },
    terminalTransitions: { byOrigin: [], strongestLinks: [], lastOrigin: '', lastOriginPredictions: [] },
    hundredsTransitions: emptyDigitTransitionsBundle(),
    decadeTransitions: emptyDigitTransitionsBundle(),
    singleTerminalTransitions: emptyDigitTransitionsBundle(),
    nextDrawForecast: emptyForecastBundle(),
  };
}

function emptyForecastBundle(): ForecastBundle {
  return { all: emptyForecastMatrix(), dayToDay: emptyForecastMatrix(), nightToNight: emptyForecastMatrix() };
}

function emptyForecastMatrix(): ForecastMatrix {
  return { lastPair: '', lastDecade: -1, lastTerminal: -1, topDecades: [], topTerminals: [], rows: [] };
}

function emptyDigitTransitionsBundle(): DigitTransitionsBundle {
  return {
    all: emptyDigitMatrix(),
    dayToDay: emptyDigitMatrix(),
    nightToNight: emptyDigitMatrix(),
  };
}

function emptyDigitMatrix(): DigitTransitionMatrix {
  return { byDigit: [], strongestLinks: [], lastDigit: -1, lastDigitPredictions: [], totalTransitions: 0 };
}
