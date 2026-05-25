import { describe, it, expect } from 'vitest';
import { analyze } from './analysis';
import type { DrawResult } from './resultsDb';

function draw(number: string, date: string, period: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' = 'S1'): DrawResult {
  return { id: `${date}-${period}-${number}`, number, date, period };
}

describe('analyze', () => {
  it('returns the empty shape when no results are provided', () => {
    const a = analyze([]);
    expect(a.totalDraws).toBe(0);
    expect(a.numberFrequency).toEqual([]);
    expect(a.digitFrequency).toHaveLength(3);
    expect(a.digitFrequency[0]).toHaveLength(10);
    expect(a.digitFrequency[0].every(d => d.count === 0 && d.pct === 0)).toBe(true);
    expect(a.terminalDigitFrequency).toHaveLength(2);
    expect(a.terminalDigitFrequency[0]).toHaveLength(10);
    expect(a.terminalDigitFrequency[0].every(d => d.count === 0)).toBe(true);
    expect(a.hotNumbers).toEqual([]);
    expect(a.coldNumbers).toEqual([]);
    expect(a.hotTerminalPairs).toEqual([]);
    expect(a.coldTerminalPairs).toEqual([]);
    expect(a.pairs).toEqual([]);
    expect(a.terminalPairs).toEqual([]);
    expect(a.overdueTerminalPairs).toEqual([]);
    expect(a.lastAppearance.size).toBe(0);
    expect(a.predictions.byFrequency).toEqual([]);
    expect(a.predictions.byHotDigits).toEqual([]);
    expect(a.predictions.byPattern).toEqual([]);
    expect(a.predictions.combined).toEqual([]);
    expect(a.terminalPredictions.byFrequency).toEqual([]);
    expect(a.terminalPredictions.combined).toEqual([]);
  });

  it('totalDraws matches input length', () => {
    const a = analyze([
      draw('123', '2024-01-01'),
      draw('456', '2024-01-02'),
      draw('789', '2024-01-03'),
    ]);
    expect(a.totalDraws).toBe(3);
  });

  it('computes number frequency sorted descending and includes percentages', () => {
    const a = analyze([
      draw('123', '2024-01-01'),
      draw('456', '2024-01-02'),
      draw('123', '2024-01-03'),
      draw('456', '2024-01-04'),
      draw('456', '2024-01-05'),
    ]);
    expect(a.numberFrequency[0]).toEqual({ number: '456', count: 3, pct: 60 });
    expect(a.numberFrequency[1]).toEqual({ number: '123', count: 2, pct: 40 });
    expect(a.numberFrequency).toHaveLength(2);
  });

  it('pads numbers shorter than 3 digits with leading zeros', () => {
    const a = analyze([
      draw('5', '2024-01-01'),
      draw('5', '2024-01-02'),
      draw('05', '2024-01-03'),
    ]);
    expect(a.numberFrequency[0]).toEqual({ number: '005', count: 3, pct: 100 });
  });

  it('breaks input numbers into per-position digit frequencies (0-9 always present)', () => {
    const a = analyze([
      draw('111', '2024-01-01'),
      draw('122', '2024-01-02'),
    ]);
    expect(a.digitFrequency[0]).toHaveLength(10);
    expect(a.digitFrequency[0].find(d => d.digit === 1)?.count).toBe(2);
    expect(a.digitFrequency[1].find(d => d.digit === 1)?.count).toBe(1);
    expect(a.digitFrequency[1].find(d => d.digit === 2)?.count).toBe(1);
    expect(a.digitFrequency[2].find(d => d.digit === 1)?.count).toBe(1);
    expect(a.digitFrequency[2].find(d => d.digit === 2)?.count).toBe(1);
    expect(a.digitFrequency[0].find(d => d.digit === 9)?.count).toBe(0);
  });

  it('counts digit pairs (positions 0-1, 1-2, 0-2) and limits to top 20', () => {
    const a = analyze([
      draw('123', '2024-01-01'),
      draw('123', '2024-01-02'),
      draw('124', '2024-01-03'),
    ]);
    expect(a.pairs.find(p => p.pair === '12')?.count).toBe(3);
    expect(a.pairs.find(p => p.pair === '23')?.count).toBe(2);
    expect(a.pairs.find(p => p.pair === '14')?.count).toBe(1);
    expect(a.pairs.length).toBeLessThanOrEqual(20);
  });

  it('terminal pairs are the last 2 digits of each draw', () => {
    const a = analyze([
      draw('123', '2024-01-01'),
      draw('723', '2024-01-02'),
      draw('023', '2024-01-03'),
      draw('456', '2024-01-04'),
    ]);
    const tp23 = a.terminalPairs.find(t => t.pair === '23');
    expect(tp23?.count).toBe(3);
    expect(tp23?.pct).toBe(75);
    expect(a.terminalPairs.find(t => t.pair === '56')?.count).toBe(1);
  });

  it('terminalPairs tracks last appearance with drawsAgo', () => {
    const a = analyze([
      draw('012', '2024-01-01'),
      draw('345', '2024-01-02'),
      draw('678', '2024-01-03'),
      draw('945', '2024-01-04'),
    ]);
    const tp45 = a.terminalPairs.find(t => t.pair === '45');
    expect(tp45?.lastDate).toBe('2024-01-04');
    expect(tp45?.drawsAgo).toBe(0);
    const tp12 = a.terminalPairs.find(t => t.pair === '12');
    expect(tp12?.drawsAgo).toBe(3);
  });

  it('overdueTerminalPairs are ordered by drawsAgo descending', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 50; i++) {
      results.push(draw('900', `2024-02-${String(i + 1).padStart(2, '0')}`));
    }
    results[0] = draw('123', '2024-02-01');
    const a = analyze(results);
    expect(a.overdueTerminalPairs[0].pair).toBe('23');
    expect(a.overdueTerminalPairs[0].drawsAgo).toBeGreaterThanOrEqual(48);
  });

  it('hotNumbers and coldNumbers respect the average frequency split', () => {
    const a = analyze([
      draw('111', '2024-01-01'),
      draw('111', '2024-01-02'),
      draw('111', '2024-01-03'),
      draw('111', '2024-01-04'),
      draw('222', '2024-01-05'),
    ]);
    expect(a.hotNumbers).toContain('111');
    expect(a.hotNumbers).not.toContain('222');
    expect(a.coldNumbers).toContain('222');
  });

  it('predictions.byFrequency mirrors the top of numberFrequency', () => {
    const sample: DrawResult[] = [];
    for (let i = 0; i < 100; i++) sample.push(draw('111', `2024-01-${String(i + 1).padStart(2, '0')}`));
    sample.push(draw('222', '2024-04-10'));
    const a = analyze(sample);
    expect(a.predictions.byFrequency[0]).toBe('111');
  });

  it('predictions arrays are bounded to 14 entries', () => {
    const sample: DrawResult[] = [];
    for (let i = 100; i < 200; i++) {
      sample.push(draw(String(i), `2024-06-${String((i - 100) % 30 + 1).padStart(2, '0')}`));
    }
    const a = analyze(sample);
    expect(a.predictions.byFrequency.length).toBeLessThanOrEqual(14);
    expect(a.predictions.byHotDigits.length).toBeLessThanOrEqual(14);
    expect(a.predictions.byPattern.length).toBeLessThanOrEqual(14);
    expect(a.predictions.combined.length).toBeLessThanOrEqual(14);
  });

  it('predictions.combined contains only unique 3-digit strings', () => {
    const sample: DrawResult[] = [];
    for (let n = 0; n < 60; n++) {
      sample.push(draw(String(n).padStart(3, '0'), `2024-08-${String((n % 30) + 1).padStart(2, '0')}`));
    }
    const a = analyze(sample);
    const unique = new Set(a.predictions.combined);
    expect(unique.size).toBe(a.predictions.combined.length);
    for (const n of a.predictions.combined) {
      expect(n).toMatch(/^\d{3}$/);
    }
  });

  it('terminalPredictions.combined contains only unique 2-digit strings', () => {
    const sample: DrawResult[] = [];
    for (let n = 0; n < 60; n++) {
      sample.push(draw(String(n).padStart(3, '0'), `2024-09-${String((n % 30) + 1).padStart(2, '0')}`));
    }
    const a = analyze(sample);
    const unique = new Set(a.terminalPredictions.combined);
    expect(unique.size).toBe(a.terminalPredictions.combined.length);
    for (const t of a.terminalPredictions.combined) {
      expect(t).toMatch(/^\d{2}$/);
    }
  });

  it('byPattern returns an empty array when there are fewer than 3 draws', () => {
    const a = analyze([
      draw('123', '2024-01-01'),
      draw('456', '2024-01-02'),
    ]);
    expect(a.predictions.byPattern).toEqual([]);
    expect(a.terminalPredictions.byPattern).toEqual([]);
  });

  it('byPattern returns only unique numbers (no duplicates within the list)', () => {
    const sample: DrawResult[] = [];
    for (let n = 0; n < 30; n++) {
      sample.push(draw(String((n * 137) % 1000).padStart(3, '0'), `2024-11-${String((n % 30) + 1).padStart(2, '0')}`));
    }
    const a = analyze(sample);
    expect(a.predictions.byPattern.length).toBeGreaterThan(0);
    expect(new Set(a.predictions.byPattern).size).toBe(a.predictions.byPattern.length);
    expect(new Set(a.terminalPredictions.byPattern).size).toBe(a.terminalPredictions.byPattern.length);
  });

  it('byPattern stays unique even when recent draws are identical (avgDiff zero)', () => {
    const sample: DrawResult[] = [];
    for (let i = 0; i < 10; i++) {
      sample.push(draw('555', `2024-12-${String(i + 1).padStart(2, '0')}`));
    }
    const a = analyze(sample);
    expect(a.predictions.byPattern.length).toBe(14);
    expect(new Set(a.predictions.byPattern).size).toBe(14);
    expect(a.terminalPredictions.byPattern.length).toBe(14);
    expect(new Set(a.terminalPredictions.byPattern).size).toBe(14);
  });

  it('byPattern stays unique when recent draws form a 2-cycle (avgDiff = 5)', () => {
    const sample: DrawResult[] = [];
    for (let i = 0; i < 10; i++) {
      const num = i % 2 === 0 ? '000' : '555';
      sample.push(draw(num, `2025-01-${String(i + 1).padStart(2, '0')}`));
    }
    const a = analyze(sample);
    expect(a.predictions.byPattern.length).toBe(14);
    expect(new Set(a.predictions.byPattern).size).toBe(14);
    expect(a.terminalPredictions.byPattern.length).toBe(14);
    expect(new Set(a.terminalPredictions.byPattern).size).toBe(14);
  });

  it('is deterministic: same input produces the same output', () => {
    const sample: DrawResult[] = [];
    for (let n = 0; n < 40; n++) {
      sample.push(draw(String((n * 37) % 1000).padStart(3, '0'), `2024-10-${String((n % 30) + 1).padStart(2, '0')}`));
    }
    const a1 = analyze(sample);
    const a2 = analyze(sample);
    expect(a1.numberFrequency).toEqual(a2.numberFrequency);
    expect(a1.predictions).toEqual(a2.predictions);
    expect(a1.terminalPredictions).toEqual(a2.terminalPredictions);
    expect(a1.terminalPairs).toEqual(a2.terminalPairs);
  });

  it('is order-invariant: sorting by date is internal so shuffled input yields the same counts', () => {
    const ordered: DrawResult[] = [
      draw('100', '2024-01-01'),
      draw('200', '2024-01-02'),
      draw('300', '2024-01-03'),
      draw('400', '2024-01-04'),
      draw('500', '2024-01-05'),
    ];
    const shuffled = [ordered[3], ordered[0], ordered[4], ordered[2], ordered[1]];
    const a1 = analyze(ordered);
    const a2 = analyze(shuffled);
    expect(a1.numberFrequency).toEqual(a2.numberFrequency);
    expect(a1.predictions.byFrequency).toEqual(a2.predictions.byFrequency);
    expect(a1.terminalPairs.map(t => t.pair).sort()).toEqual(a2.terminalPairs.map(t => t.pair).sort());
  });

  it('terminal digit frequency tracks both positions and always returns 10 entries each', () => {
    const a = analyze([
      draw('012', '2024-01-01'),
      draw('312', '2024-01-02'),
      draw('945', '2024-01-03'),
    ]);
    expect(a.terminalDigitFrequency).toHaveLength(2);
    expect(a.terminalDigitFrequency[0]).toHaveLength(10);
    expect(a.terminalDigitFrequency[1]).toHaveLength(10);
    expect(a.terminalDigitFrequency[0].find(d => d.digit === 1)?.count).toBe(2);
    expect(a.terminalDigitFrequency[1].find(d => d.digit === 2)?.count).toBe(2);
    expect(a.terminalDigitFrequency[1].find(d => d.digit === 5)?.count).toBe(1);
  });

  it('lastAppearance reflects the latest date per number after internal sort', () => {
    const a = analyze([
      draw('123', '2024-01-05'),
      draw('123', '2024-01-01'),
      draw('123', '2024-01-03'),
    ]);
    expect(a.lastAppearance.get('123')).toBe('2024-01-05');
  });

  it('terminalTransitions detects perfect alternating pattern (80 -> 20 -> 80)', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 12; i++) {
      const num = i % 2 === 0 ? '180' : '120';
      results.push(draw(num, `2024-03-${String(i + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    const entry80 = a.terminalTransitions.byOrigin.find(e => e.origin === '80');
    const entry20 = a.terminalTransitions.byOrigin.find(e => e.origin === '20');
    expect(entry80).toBeDefined();
    expect(entry20).toBeDefined();
    expect(entry80?.followers[0].next).toBe('20');
    expect(entry80?.followers[0].pct).toBe(100);
    expect(entry80?.confidence).toBe(100);
    expect(entry20?.followers[0].next).toBe('80');
    expect(entry20?.followers[0].pct).toBe(100);
  });

  it('terminalTransitions strongestLinks ranks the most common transitions first', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 14; i++) {
      const num = i % 2 === 0 ? '180' : '120';
      results.push(draw(num, `2024-04-${String(i + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    const top = a.terminalTransitions.strongestLinks[0];
    expect(top).toBeDefined();
    expect(['80', '20']).toContain(top.origin);
    expect(['80', '20']).toContain(top.next);
    expect(top.count).toBeGreaterThanOrEqual(6);
  });

  it('terminalTransitions lastOriginPredictions uses the most recent draws terminal', () => {
    const results: DrawResult[] = [
      draw('180', '2024-05-01'),
      draw('120', '2024-05-02'),
      draw('180', '2024-05-03'),
      draw('120', '2024-05-04'),
      draw('180', '2024-05-05'),
      draw('120', '2024-05-06'),
      draw('180', '2024-05-07'),
    ];
    const a = analyze(results);
    expect(a.terminalTransitions.lastOrigin).toBe('80');
    expect(a.terminalTransitions.lastOriginPredictions[0]?.next).toBe('20');
  });

  it('terminalTransitions excludes origins with fewer than 3 occurrences', () => {
    const results: DrawResult[] = [
      draw('199', '2024-06-01'),
      draw('277', '2024-06-02'),
      draw('388', '2024-06-03'),
      draw('455', '2024-06-04'),
    ];
    const a = analyze(results);
    expect(a.terminalTransitions.byOrigin).toEqual([]);
  });

  it('terminalTransitions handles empty input gracefully', () => {
    const a = analyze([]);
    expect(a.terminalTransitions.byOrigin).toEqual([]);
    expect(a.terminalTransitions.strongestLinks).toEqual([]);
    expect(a.terminalTransitions.lastOrigin).toBe('');
    expect(a.terminalTransitions.lastOriginPredictions).toEqual([]);
  });

  it('decadeTransitions detects perfect alternating decade pattern (80s -> 20s)', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 30; i++) {
      const tens = i % 2 === 0 ? 8 : 2;
      const ones = i % 10;
      const num = `1${tens}${ones}`;
      results.push(draw(num, `2024-03-${String((i % 30) + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    const entry8 = a.decadeTransitions.all.byDigit.find(e => e.digit === 8);
    const entry2 = a.decadeTransitions.all.byDigit.find(e => e.digit === 2);
    expect(entry8).toBeDefined();
    expect(entry2).toBeDefined();
    expect(entry8?.followers[0].next).toBe(2);
    expect(entry8?.followers[0].pct).toBe(100);
    expect(entry2?.followers[0].next).toBe(8);
  });

  it('decadeTransitions strongestLinks ranks the most common decade transitions first', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 20; i++) {
      const num = i % 2 === 0 ? '180' : '120';
      results.push(draw(num, `2024-04-${String(i + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    const top = a.decadeTransitions.all.strongestLinks[0];
    expect(top).toBeDefined();
    expect([2, 8]).toContain(top.from);
    expect([2, 8]).toContain(top.to);
    expect(top.count).toBeGreaterThanOrEqual(8);
  });

  it('decadeTransitions filters dayToDay only includes S1-S4 transitions', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 30; i++) {
      results.push(draw('180', `2024-05-${String(i + 1).padStart(2, '0')}`, 'S1'));
      results.push(draw('123', `2024-05-${String(i + 1).padStart(2, '0')}`, 'S5'));
    }
    const a = analyze(results);
    expect(a.decadeTransitions.dayToDay.byDigit.find(e => e.digit === 8)).toBeDefined();
    expect(a.decadeTransitions.dayToDay.byDigit.find(e => e.digit === 2)).toBeUndefined();
    expect(a.decadeTransitions.nightToNight.byDigit.find(e => e.digit === 2)).toBeDefined();
    expect(a.decadeTransitions.nightToNight.byDigit.find(e => e.digit === 8)).toBeUndefined();
  });

  it('decadeTransitions excludes decades with fewer than 10 occurrences', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(draw('199', `2024-06-${String(i + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    expect(a.decadeTransitions.all.byDigit).toEqual([]);
  });

  it('decadeTransitions lastDigit uses the most recent draws decade', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 15; i++) {
      results.push(draw('180', `2024-07-${String(i + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    expect(a.decadeTransitions.all.lastDigit).toBe(8);
  });

  it('decadeTransitions handles empty input gracefully', () => {
    const a = analyze([]);
    expect(a.decadeTransitions.all.byDigit).toEqual([]);
    expect(a.decadeTransitions.dayToDay.byDigit).toEqual([]);
    expect(a.decadeTransitions.nightToNight.byDigit).toEqual([]);
    expect(a.decadeTransitions.all.lastDigit).toBe(-1);
  });

  it('hundredsTransitions detects perfect alternating hundreds pattern (1xx -> 5xx)', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 30; i++) {
      const h = i % 2 === 0 ? 1 : 5;
      const num = `${h}23`;
      results.push(draw(num, `2024-08-${String((i % 30) + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    const entry1 = a.hundredsTransitions.all.byDigit.find(e => e.digit === 1);
    const entry5 = a.hundredsTransitions.all.byDigit.find(e => e.digit === 5);
    expect(entry1).toBeDefined();
    expect(entry5).toBeDefined();
    expect(entry1?.followers[0].next).toBe(5);
    expect(entry5?.followers[0].next).toBe(1);
  });

  it('singleTerminalTransitions detects perfect alternating terminal pattern (xx3 -> xx7)', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 30; i++) {
      const t = i % 2 === 0 ? 3 : 7;
      const num = `12${t}`;
      results.push(draw(num, `2024-09-${String((i % 30) + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    const entry3 = a.singleTerminalTransitions.all.byDigit.find(e => e.digit === 3);
    const entry7 = a.singleTerminalTransitions.all.byDigit.find(e => e.digit === 7);
    expect(entry3).toBeDefined();
    expect(entry7).toBeDefined();
    expect(entry3?.followers[0].next).toBe(7);
    expect(entry7?.followers[0].next).toBe(3);
  });

  it('hundredsTransitions and singleTerminalTransitions are empty on empty input', () => {
    const a = analyze([]);
    expect(a.hundredsTransitions.all.byDigit).toEqual([]);
    expect(a.hundredsTransitions.all.lastDigit).toBe(-1);
    expect(a.singleTerminalTransitions.all.byDigit).toEqual([]);
    expect(a.singleTerminalTransitions.all.lastDigit).toBe(-1);
  });

  it('nextDrawForecast builds a 5x5 grid from decade and terminal followers', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 30; i++) {
      const decade = i % 2 === 0 ? 0 : 9;
      const terminal = i % 2 === 0 ? 3 : 1;
      const num = `1${decade}${terminal}`;
      results.push(draw(num, `2024-10-${String((i % 30) + 1).padStart(2, '0')}`));
    }
    const a = analyze(results);
    const forecast = a.nextDrawForecast.all;
    expect(forecast.lastDecade).toBe(9);
    expect(forecast.lastTerminal).toBe(1);
    expect(forecast.lastPair).toBe('91');
    expect(forecast.topDecades[0]).toBe(0);
    expect(forecast.topTerminals[0]).toBe(3);
    expect(forecast.rows).toHaveLength(forecast.topDecades.length);
    for (const row of forecast.rows) {
      expect(row.predictions).toHaveLength(forecast.topTerminals.length);
      for (let i = 0; i < row.predictions.length; i++) {
        expect(row.predictions[i]).toBe(`${row.decade}${forecast.topTerminals[i]}`);
      }
    }
  });

  it('nextDrawForecast is empty when there is not enough data', () => {
    const a = analyze([]);
    expect(a.nextDrawForecast.all.rows).toEqual([]);
    expect(a.nextDrawForecast.all.lastPair).toBe('');
    expect(a.nextDrawForecast.all.lastDecade).toBe(-1);
    expect(a.nextDrawForecast.all.lastTerminal).toBe(-1);
  });

  it('nextDrawForecast.dayToDay and nightToNight reflect their filtered sources', () => {
    const results: DrawResult[] = [];
    for (let i = 0; i < 30; i++) {
      const decade = i % 2 === 0 ? 2 : 4;
      const terminal = i % 2 === 0 ? 5 : 7;
      results.push(draw(`1${decade}${terminal}`, `2024-11-${String((i % 30) + 1).padStart(2, '0')}`, 'S1'));
    }
    for (let i = 0; i < 30; i++) {
      const decade = i % 2 === 0 ? 6 : 8;
      const terminal = i % 2 === 0 ? 1 : 9;
      results.push(draw(`1${decade}${terminal}`, `2024-12-${String((i % 30) + 1).padStart(2, '0')}`, 'S5'));
    }
    const a = analyze(results);
    const day = a.nextDrawForecast.dayToDay;
    const night = a.nextDrawForecast.nightToNight;
    expect([2, 4]).toContain(day.lastDecade);
    expect([5, 7]).toContain(day.lastTerminal);
    expect([6, 8]).toContain(night.lastDecade);
    expect([1, 9]).toContain(night.lastTerminal);
  });
});
