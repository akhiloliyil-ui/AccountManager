import { convertMinor, type Currency, type Minor } from "./currency";

/**
 * Ledger maths. Every amount is in minor units of the account it belongs to:
 * `amount` in the source account's currency, `toAmount` in the destination's.
 * Dates are ISO "YYYY-MM-DD" strings, so comparisons are plain string compares.
 */

export type TxType = "income" | "expense" | "transfer" | "adjustment";

export interface LedgerTx {
  type: TxType;
  date: string;
  accountId: string;
  /** Destination of a transfer. */
  toAccountId?: string | null;
  /** Positive for income/expense/transfer; signed for adjustments (revaluations, corrections). */
  amount: Minor;
  /** Transfer amount received, in the destination account's currency. Defaults to `amount`. */
  toAmount?: Minor | null;
}

export interface LedgerAccount {
  id: string;
  currency: string;
  openingBalance: Minor;
  includeInTotals: boolean;
}

/** How a transaction changes one account's balance. */
export function accountDelta(tx: LedgerTx, accountId: string): Minor {
  let delta = 0;
  if (tx.accountId === accountId) {
    if (tx.type === "income" || tx.type === "adjustment") delta += tx.amount;
    else delta -= tx.amount;
  }
  if (tx.type === "transfer" && tx.toAccountId === accountId) delta += tx.toAmount ?? tx.amount;
  return delta;
}

/** Balance per account, optionally as of the end of `asOf` (inclusive). */
export function balances(accounts: LedgerAccount[], txs: LedgerTx[], asOf?: string): Map<string, Minor> {
  const result = new Map(accounts.map((a) => [a.id, a.openingBalance]));
  for (const tx of txs) {
    if (asOf && tx.date > asOf) continue;
    if (result.has(tx.accountId)) result.set(tx.accountId, result.get(tx.accountId)! + accountDelta(tx, tx.accountId));
    if (tx.type === "transfer" && tx.toAccountId && tx.toAccountId !== tx.accountId && result.has(tx.toAccountId)) {
      result.set(tx.toAccountId, result.get(tx.toAccountId)! + accountDelta(tx, tx.toAccountId));
    }
  }
  return result;
}

export interface NetWorth {
  /** Sum of positive balances, in base minor units. */
  assets: Minor;
  /** Sum of negative balances (a negative number), in base minor units. */
  liabilities: Minor;
  total: Minor;
}

/**
 * Net worth in the base currency. Like Money Manager, an account counts as an asset while its
 * balance is positive and as a liability while it is negative, whatever its group.
 */
export function netWorth(
  accounts: LedgerAccount[],
  balanceById: Map<string, Minor>,
  currencies: Map<string, Currency>,
  base: Currency,
): NetWorth {
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    if (!a.includeInTotals) continue;
    const currency = currencies.get(a.currency);
    if (!currency) continue;
    const value = convertMinor(balanceById.get(a.id) ?? a.openingBalance, currency, base);
    if (value >= 0) assets += value;
    else liabilities += value;
  }
  return { assets, liabilities, total: assets + liabilities };
}

/** Net worth at the end of each month in `monthEnds` (ISO dates), at today's exchange rates. */
export function netWorthSeries(
  accounts: LedgerAccount[],
  txs: LedgerTx[],
  currencies: Map<string, Currency>,
  base: Currency,
  monthEnds: string[],
): { date: string; worth: NetWorth }[] {
  return monthEnds.map((date) => ({ date, worth: netWorth(accounts, balances(accounts, txs, date), currencies, base) }));
}

/** Running balance after each transaction of one account, oldest first. */
export function runningBalance<T extends LedgerTx>(
  account: LedgerAccount,
  txs: T[],
): { tx: T; delta: Minor; balance: Minor }[] {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  let balance = account.openingBalance;
  return sorted.map((tx) => {
    const delta = accountDelta(tx, account.id);
    balance += delta;
    return { tx, delta, balance };
  });
}
