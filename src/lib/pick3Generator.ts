export const GENERATION_COUNT = 27;

const EXCEL_STEPS = [4, 5, 9] as const;

export const mod10 = (n: number): number => ((n % 10) + 10) % 10;

export function normalizeSeed(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(0, 3);
}

export function stepPattern(i: number): [number, number, number] {
  const a = EXCEL_STEPS[Math.floor(i / 9)];
  const b = EXCEL_STEPS[Math.floor((i % 9) / 3)];
  const c = EXCEL_STEPS[i % 3];
  return [a, b, c];
}

export function genNumbers(seed: string): string[] {
  let a = parseInt(seed[0], 10);
  let b = parseInt(seed[1], 10);
  let c = parseInt(seed[2], 10);
  const res: string[] = [];

  for (let i = 0; i < GENERATION_COUNT; i++) {
    const [pa, pb, pc] = stepPattern(i);
    a = mod10(a + pa);
    b = mod10(b + pb);
    c = mod10(c + pc);
    res.push(`${a}${b}${c}`);
  }
  return res;
}
