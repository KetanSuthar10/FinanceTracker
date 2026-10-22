/**
 * Turns spoken amounts into digits, e.g. "two hundred fifty" → "250", "one lakh twenty thousand" → "120000".
 * Speech-to-text usually returns digits, but not always. Indian units (lakh, crore) are supported.
 *
 * To avoid turning names into numbers ("one coffee", "OnePlus"), a lone small word (one … nineteen)
 * is only converted when followed by rupees/rs/bucks. Bigger phrases ("fifty", "two hundred") always are.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

const isNumberWord = (w: string) => w in UNITS || w in TENS || w in SCALES;
const CURRENCY = new Set(['rupees', 'rupee', 'rs', 'bucks']);

function valueOf(words: string[]): number {
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w in UNITS) current += UNITS[w]!;
    else if (w in TENS) current += TENS[w]!;
    else if (w === 'hundred') current = (current || 1) * 100;
    else if (w in SCALES) {
      total += (current || 1) * SCALES[w]!;
      current = 0;
    }
  }
  return total + current;
}

export function numberWordsToDigits(text: string): string {
  const tokens = text.split(' ');
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const start = i;
    const run: string[] = [];
    // "a hundred", "a thousand"
    if (tokens[i] === 'a' && tokens[i + 1] && tokens[i + 1]! in SCALES) {
      run.push('one');
      i++;
    }
    while (i < tokens.length) {
      const w = tokens[i]!;
      if (isNumberWord(w)) {
        run.push(w);
        i++;
      } else if (w === 'and' && run.length > 0 && tokens[i + 1] && isNumberWord(tokens[i + 1]!)) {
        i++; // "one hundred and fifty"
      } else {
        break;
      }
    }
    if (run.length === 0) {
      out.push(tokens[i]!);
      i++;
      continue;
    }
    const single = run.length === 1 && run[0]! in UNITS;
    const nextIsCurrency = CURRENCY.has(tokens[i] ?? '');
    // A bare "lakh"/"thousand" belongs to digits before it ("2 lakh"), which the amount reader handles.
    const hasNumber = run.some((w) => w in UNITS || w in TENS);
    if ((single && !nextIsCurrency) || !hasNumber) {
      out.push(...tokens.slice(start, i)); // leave "one coffee" and "2 lakh" alone
    } else {
      out.push(String(valueOf(run)));
    }
  }
  return out.join(' ');
}
