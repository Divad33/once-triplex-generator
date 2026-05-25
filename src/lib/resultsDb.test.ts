import { describe, it, expect, beforeEach } from 'vitest';
import {
  addResult,
  addResults,
  clearAllResults,
  deleteResult,
  exportResults,
  getAllResults,
  importResults,
} from './resultsDb';

beforeEach(() => {
  localStorage.clear();
});

describe('addResult / getAllResults', () => {
  it('persists a single entry and returns it from getAllResults', () => {
    const added = addResult({ date: '2024-01-01', number: '123', period: 'S1' });
    expect(added.number).toBe('123');
    expect(added.id).toBeDefined();

    const all = getAllResults();
    expect(all).toHaveLength(1);
    expect(all[0].number).toBe('123');
  });

  it('strips non-digit characters from the number and pads short numbers stays as-is at 3 digits', () => {
    const added = addResult({ date: '2024-01-01', number: '1-2-3', period: 'S5' });
    expect(added.number).toBe('123');
  });

  it('throws when the number cannot be normalized to 3 digits', () => {
    expect(() => addResult({ date: '2024-01-01', number: '12', period: 'S1' })).toThrow();
    expect(() => addResult({ date: '2024-01-01', number: 'abc', period: 'S1' })).toThrow();
  });

  it('throws when the date is missing', () => {
    expect(() => addResult({ date: '   ', number: '123', period: 'S1' })).toThrow();
  });

  it('uses "-" as the period when the input period is empty', () => {
    const added = addResult({ date: '2024-01-01', number: '123', period: '   ' });
    expect(added.period).toBe('-');
  });

  it('returns results sorted by date descending', () => {
    addResult({ date: '2024-01-01', number: '111', period: 'S1' });
    addResult({ date: '2024-01-03', number: '333', period: 'S1' });
    addResult({ date: '2024-01-02', number: '222', period: 'S1' });

    const all = getAllResults();
    expect(all.map(r => r.date)).toEqual(['2024-01-03', '2024-01-02', '2024-01-01']);
  });

  it('within the same date, S5 is sorted after S1 (higher period weight)', () => {
    addResult({ date: '2024-02-01', number: '111', period: 'S1' });
    addResult({ date: '2024-02-01', number: '222', period: 'S5' });
    addResult({ date: '2024-02-02', number: '333', period: 'S1' });
    addResult({ date: '2024-02-02', number: '444', period: 'S5' });

    const all = getAllResults();
    expect(all.map(r => `${r.date}|${r.period}|${r.number}`)).toEqual([
      '2024-02-02|S5|444',
      '2024-02-02|S1|333',
      '2024-02-01|S5|222',
      '2024-02-01|S1|111',
    ]);
  });

  it('places the S5 result after S1 when inserted before the same-date S1', () => {
    addResult({ date: '2024-03-15', number: '777', period: 'S5' });
    addResult({ date: '2024-03-15', number: '111', period: 'S1' });

    const all = getAllResults();
    expect(all[0].period).toBe('S5');
    expect(all[1].period).toBe('S1');
  });
});

describe('addResults (bulk)', () => {
  it('inserts new entries and reports only the ones added', () => {
    const added = addResults([
      { date: '2024-01-01', number: '111', period: 'S1' },
      { date: '2024-01-02', number: '222', period: 'S1' },
    ]);
    expect(added).toHaveLength(2);
    expect(getAllResults()).toHaveLength(2);
  });

  it('deduplicates by date|period|number', () => {
    addResult({ date: '2024-01-01', number: '111', period: 'S1' });

    const added = addResults([
      { date: '2024-01-01', number: '111', period: 'S1' },
      { date: '2024-01-01', number: '111', period: 'S5' },
    ]);
    expect(added).toHaveLength(1);
    expect(getAllResults()).toHaveLength(2);
  });

  it('silently drops entries that fail normalization', () => {
    const added = addResults([
      { date: '2024-01-01', number: '111', period: 'S1' },
      { date: '', number: '222', period: 'S1' },
      { date: '2024-01-02', number: 'abc', period: 'S1' },
    ]);
    expect(added).toHaveLength(1);
  });
});

describe('deleteResult', () => {
  it('removes a single entry by id', () => {
    const added = addResult({ date: '2024-01-01', number: '111', period: 'S1' });
    deleteResult(String(added.id));
    expect(getAllResults()).toHaveLength(0);
  });

  it('is a no-op when the id does not exist', () => {
    addResult({ date: '2024-01-01', number: '111', period: 'S1' });
    deleteResult('does-not-exist');
    expect(getAllResults()).toHaveLength(1);
  });
});

describe('clearAllResults', () => {
  it('removes everything from storage', () => {
    addResult({ date: '2024-01-01', number: '111', period: 'S1' });
    addResult({ date: '2024-01-02', number: '222', period: 'S1' });
    clearAllResults();
    expect(getAllResults()).toHaveLength(0);
  });
});

describe('import / export', () => {
  it('exportResults returns a parseable JSON string', () => {
    addResult({ date: '2024-01-01', number: '111', period: 'S1' });
    const json = exportResults();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].number).toBe('111');
  });

  it('importResults loads valid entries and returns the count added', () => {
    const payload = JSON.stringify([
      { date: '2024-01-01', number: '111', period: 'S1' },
      { date: '2024-01-02', number: '222', period: 'S5' },
    ]);
    expect(importResults(payload)).toBe(2);
    expect(getAllResults()).toHaveLength(2);
  });

  it('importResults skips entries that fail validation', () => {
    const payload = JSON.stringify([
      { date: '2024-01-01', number: '111', period: 'S1' },
      { date: '2024-01-02', number: 42, period: 'S1' },
      { foo: 'bar' },
    ]);
    expect(importResults(payload)).toBe(1);
    expect(getAllResults()).toHaveLength(1);
  });

  it('importResults throws on non-array JSON', () => {
    expect(() => importResults('{"foo": "bar"}')).toThrow();
  });
});

describe('storage robustness', () => {
  it('getAllResults returns [] when storage holds invalid JSON', () => {
    localStorage.setItem('once_triplex_results', 'not json');
    expect(getAllResults()).toEqual([]);
  });

  it('getAllResults filters out malformed entries when storage is partially corrupted', () => {
    localStorage.setItem(
      'once_triplex_results',
      JSON.stringify([
        { date: '2024-01-01', number: '111', period: 'S1' },
        { foo: 'bar' },
        null,
        { date: '2024-01-02', number: '222', period: 'S5' },
      ]),
    );
    const all = getAllResults();
    expect(all).toHaveLength(2);
    expect(all.map(r => r.number).sort()).toEqual(['111', '222']);
  });
});
