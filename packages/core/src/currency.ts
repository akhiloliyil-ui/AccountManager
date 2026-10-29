/**
 * Multi-currency money. Amounts are always integer minor units of their own currency
 * (fils for AED, paise for INR). Rates are stored as "units of this currency per 1 unit
 * of the base currency", e.g. base AED, INR perBase 24.0 means AED 1 = INR 24.
 */

export type CurrencyCode = string;
export type Minor = number;

export interface Currency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  /** Units of this currency per 1 unit of the base currency. The base currency is 1. */
  perBase: number;
}

const scale = (decimals: number) => 10 ** decimals;

/** Rounds half away from zero, absorbing float noise (1.005 * 100 = 100.49999...). */
export function roundMinor(value: number): Minor {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) + 0.5 + 1e-9);
}

export function toMinor(amount: number, decimals = 2): Minor {
  return roundMinor(amount * scale(decimals));
}

export function fromMinor(minor: Minor, decimals = 2): number {
  return minor / scale(decimals);
}

/** Converts minor units between currencies through the base currency. */
export function convertMinor(minor: Minor, from: Currency, to: Currency): Minor {
  if (from.code === to.code) return minor;
  const major = fromMinor(minor, from.decimals);
  return toMinor((major / from.perBase) * to.perBase, to.decimals);
}

export function formatCurrency(
  minor: Minor,
  currency: Pick<Currency, "code" | "decimals"> & { symbol?: string },
  { signed = false, useSymbol = false }: { signed?: boolean; useSymbol?: boolean } = {},
): string {
  const sign = minor < 0 ? "-" : signed && minor > 0 ? "+" : "";
  const number = fromMinor(Math.abs(minor), currency.decimals).toLocaleString("en-US", {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
  const label = useSymbol && currency.symbol ? currency.symbol : currency.code;
  return `${sign}${label} ${number}`;
}

/**
 * Parses an amount as banks and people write it: "1,234.50", "(12.00)", "-12", "12.00 DR",
 * "AED 1,234", "1.234,50" (comma decimal). Returns major units, or null when unreadable.
 */
export function parseAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\b(dr|debit)\.?$/i.test(s)) negative = true;
  s = s.replace(/\b(cr|dr|credit|debit)\.?$/i, "");
  s = s.replace(/[A-Za-z₹$€£\s]|د\.إ/g, "");
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot && s.length - lastComma - 1 !== 3) {
    // "1.234,50" or "12,5": comma is the decimal separator.
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const value = Number(s);
  return negative ? -value : value;
}
