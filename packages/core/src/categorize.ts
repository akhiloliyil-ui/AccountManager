import { normalizeDescription } from "./statement";

export interface CategoryRule {
  /** Case-insensitive text the description must contain. */
  pattern: string;
  categoryId: string;
  /** Restrict to money in or out; undefined matches both. */
  kind?: "income" | "expense";
}

export interface CategorizedExample {
  description: string;
  categoryId: string;
  kind: "income" | "expense";
}

export interface Suggestion {
  categoryId: string;
  reason: "rule" | "history";
}

/**
 * Suggests a category for an imported line: explicit rules first (longest pattern wins), then
 * the user's own history — the same merchant text categorised before, matching on the first
 * two words when the full description differs (card numbers, branch names).
 */
export function suggestCategory(
  description: string,
  kind: "income" | "expense",
  rules: CategoryRule[],
  history: CategorizedExample[],
): Suggestion | null {
  const text = description.toLowerCase();
  const rule = rules
    .filter((r) => r.pattern.trim() && (!r.kind || r.kind === kind) && text.includes(r.pattern.trim().toLowerCase()))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (rule) return { categoryId: rule.categoryId, reason: "rule" };

  const normalized = normalizeDescription(description);
  if (!normalized) return null;
  const sameKind = history.filter((h) => h.kind === kind);
  const exact = sameKind.find((h) => normalizeDescription(h.description) === normalized);
  if (exact) return { categoryId: exact.categoryId, reason: "history" };

  const prefix = normalized.split(" ").slice(0, 2).join(" ");
  if (prefix.length < 4) return null;
  const similar = sameKind.find((h) => normalizeDescription(h.description).startsWith(prefix));
  return similar ? { categoryId: similar.categoryId, reason: "history" } : null;
}
