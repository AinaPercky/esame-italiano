/**
 * Conversion exacte des nombres cardinaux italiens (0 à 999) vers leur valeur.
 * Les variantes avec le suffixe « euro » sont également reconnues.
 */
const ITALIAN_UNITS = [
  'zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove',
  'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici',
  'diciassette', 'diciotto', 'diciannove'
] as const;

const ITALIAN_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'] as const;

function italianNumberUnder100(value: number): string {
  if (value < 20) return ITALIAN_UNITS[value];
  const tens = ITALIAN_TENS[Math.floor(value / 10)];
  const unit = value % 10;
  if (unit === 0) return tens;
  const stem = unit === 1 || unit === 8 ? tens.slice(0, -1) : tens;
  return stem + (unit === 3 ? 'tré' : ITALIAN_UNITS[unit]);
}

function italianNumberUnder1000(value: number): string {
  if (value < 100) return italianNumberUnder100(value);
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  let prefix = hundreds === 1 ? 'cento' : ITALIAN_UNITS[hundreds] + 'cento';
  if (remainder === 0) return prefix;
  const suffix = italianNumberUnder100(remainder);
  if (suffix.startsWith('otto') || suffix.startsWith('ottant')) {
    prefix = prefix.slice(0, -1);
  }
  return prefix + suffix;
}

const ITALIAN_NUMBER_VALUES = new Map<string, number>(
  Array.from({ length: 1000 }, (_, value) => [italianNumberUnder1000(value), value])
);

/**
 * Renvoie la valeur d'un nombre saisi en chiffres ou en lettres italiennes.
 * Les nombres composés de phrases ou les valeurs hors de 0..999 ne sont pas interprétés.
 */
export function parseItalianNumber(value: string): number | null {
  let normalized = (value || '').normalize('NFC').trim().toLowerCase();
  normalized = normalized.replace(/\s+euro$/, '').trim();
  if (!normalized) return null;

  if (/^\d{1,3}$/.test(normalized)) {
    const numericValue = Number(normalized);
    return numericValue >= 0 && numericValue <= 999 ? numericValue : null;
  }

  return ITALIAN_NUMBER_VALUES.get(normalized) ?? null;
}

/** Compare deux écritures exactes d'un même nombre italien. */
export function areEquivalentItalianNumbers(left: string, right: string): boolean {
  const leftValue = parseItalianNumber(left);
  const rightValue = parseItalianNumber(right);
  return leftValue !== null && rightValue !== null && leftValue === rightValue;
}
