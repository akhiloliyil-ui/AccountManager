/**
 * Evaluates what people type into an amount field: "1,250.50", "12+8.5", "3*24.99", "100/3", "(20+5)*2".
 * A tiny recursive-descent parser — never eval(). Returns null for anything else.
 */
export function evaluateAmount(input: string): number | null {
  const src = input.replace(/,/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!src || !/^[\d.+\-*/()]+$/.test(src)) return null;
  let i = 0;

  const peek = () => src[i];
  const number = (): number | null => {
    const m = /^\d*\.?\d+|^\d+\./.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number | null => {
    if (peek() === "-") {
      i++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") return null;
      i++;
      return v;
    }
    return number();
  };
  const term = (): number | null => {
    let v = factor();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = src[i++];
      const r = factor();
      if (r === null || (op === "/" && r === 0)) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = src[i++];
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };

  const value = expr();
  return value !== null && i === src.length && Number.isFinite(value) ? value : null;
}

/** Minor units -> editable text ("1250.5" for 125050 with 2 decimals). */
export function minorToInput(minor: number, decimals = 2): string {
  return String(minor / 10 ** decimals);
}
