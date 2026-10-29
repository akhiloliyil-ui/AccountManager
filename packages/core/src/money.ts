/** Money is always integer fils: 1 AED = 100 fils. */
export type Fils = number;

/** Rounds half-up to a whole fil. Small epsilon absorbs float noise (6.375 * 100 = 637.4999...). */
export function roundFils(value: number): Fils {
  return Math.floor(value + 0.5 + 1e-9);
}

export function aedToFils(aed: number): Fils {
  return roundFils(aed * 100);
}

export function formatMoney(fils: Fils, currency = "AED"): string {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  return `${sign}${currency} ${(abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
