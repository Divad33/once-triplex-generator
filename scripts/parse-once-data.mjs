// Parse ONCE Triplex data from text format into JSON
import { readFileSync, writeFileSync, existsSync } from 'fs';

const MONTHS_ES = {
  'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
  'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
  'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
};

function parseTriplexText(text, defaultYear = '2026') {
  const results = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match lines like: "Triplex de la ONCE Jueves 14 de mayo, sorteo 1."
    const headerMatch = line.match(/Triplex de la ONCE\s+\w+\s+(\d+)\s+de\s+(\w+),?\s+sorteo\s+(\d+)/i);
    if (headerMatch) {
      const day = headerMatch[1].padStart(2, '0');
      const monthName = headerMatch[2].toLowerCase();
      const sorteo = parseInt(headerMatch[3], 10);
      const month = MONTHS_ES[monthName];

      if (!month) continue;

      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const numMatch = lines[j].trim().match(/Números?:\s*(\d)\s*,\s*(\d)\s*,\s*(\d)/i);
        if (numMatch) {
          const number = `${numMatch[1]}${numMatch[2]}${numMatch[3]}`;
          const date = `${defaultYear}-${month}-${day}`;
          results.push({ number, date, period: `S${sorteo}` });
          break;
        }
      }
    }

    // Also match: "Números para el primer sorteo del Triplex: 2, 1, 9."
    const altMatch = line.match(/Números para el\s+(\w+)\s+sorteo del Triplex:\s*(\d)\s*,\s*(\d)\s*,\s*(\d)/i);
    if (altMatch) {
      const sorteoMap = {
        'primer': 1, 'primero': 1, 'segundo': 2, 'tercer': 3, 'tercero': 3,
        'cuarto': 4, 'quinto': 5,
      };
      const sorteo = sorteoMap[altMatch[1].toLowerCase()];
      if (!sorteo) continue;

      const number = `${altMatch[2]}${altMatch[3]}${altMatch[4]}`;

      // Try to extract date from context (look backwards for date info)
      let date = null;
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        const dateMatch = lines[j].match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
        if (dateMatch) {
          const d = dateMatch[1].padStart(2, '0');
          const m = MONTHS_ES[dateMatch[2].toLowerCase()];
          const y = dateMatch[3];
          if (m) {
            date = `${y}-${m}-${d}`;
            break;
          }
        }
      }

      if (date) {
        results.push({ number, date, period: `S${sorteo}` });
      }
    }
  }

  return results;
}

const args = process.argv.slice(2);
const inputFiles = args.length > 0 ? args.slice(0, -1) : ['/tmp/once-raw-data.txt'];
const outputFile = args.length > 0 ? args[args.length - 1] : 'public/once-triplex-history.json';

const allResults = [];

for (const file of inputFiles) {
  if (!existsSync(file)) {
    console.warn(`Skipping missing file: ${file}`);
    continue;
  }
  const text = readFileSync(file, 'utf-8');
  const results = parseTriplexText(text);
  allResults.push(...results);
  console.log(`  ${file}: ${results.length} results`);
}

// Sort by date ascending, then sorteo ascending (oldest first)
allResults.sort((a, b) => {
  const dateCmp = a.date.localeCompare(b.date);
  if (dateCmp !== 0) return dateCmp;
  return parseInt(a.period.slice(1)) - parseInt(b.period.slice(1));
});

// Remove duplicates
const seen = new Set();
const unique = allResults.filter(r => {
  const key = `${r.date}|${r.period}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

writeFileSync(outputFile, JSON.stringify(unique, null, 2));
console.log(`Total: ${unique.length} unique results, saved to ${outputFile}`);
