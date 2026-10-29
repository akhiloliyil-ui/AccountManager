import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  convertMinor,
  netWorth,
  runningBalance,
  schedulePayments,
  todayIso,
  type Currency,
  type LedgerAccount,
  type NetWorth,
  type StatTx,
} from "@gpa/core";
import { rows as resultRows, type Db } from "../client";
import { accountGroups, accounts, categories, currencies, transactions, users, type AccountGroupType } from "../schema";
import { BANK_FEE_CATEGORY_ID } from "../seed-data";

export class ValidationError extends Error {}

const fail = (message: string): never => {
  throw new ValidationError(message);
};

/* ------------------------------------------------------------------ currencies */

export type CurrencyRow = typeof currencies.$inferSelect;

export interface CurrencyContext {
  base: Currency;
  byCode: Map<string, Currency>;
  rows: CurrencyRow[];
}

export async function getCurrencies(db: Db): Promise<CurrencyContext> {
  const rows = await db.select().from(currencies).orderBy(desc(currencies.isBase), desc(currencies.active), asc(currencies.code));
  const byCode = new Map(rows.map((r) => [r.code, r as Currency]));
  const base = rows.find((r) => r.isBase) ?? fail("No base currency configured");
  return { base, byCode, rows };
}

export async function updateCurrency(
  db: Db,
  code: string,
  patch: { perBase?: number; active?: boolean; symbol?: string; name?: string },
): Promise<void> {
  if (patch.perBase !== undefined && !(patch.perBase > 0)) fail("Exchange rate must be above zero");
  const [row] = await db.select().from(currencies).where(eq(currencies.code, code));
  if (!row) fail(`Unknown currency ${code}`);
  if (row!.isBase && patch.perBase !== undefined && patch.perBase !== 1) fail("The base currency's rate is always 1");
  if (row!.isBase && patch.active === false) fail("The base currency cannot be turned off");
  await db
    .update(currencies)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(currencies.code, code));
}

export async function addCurrency(
  db: Db,
  input: { code: string; name: string; symbol: string; decimals: number; perBase: number },
): Promise<void> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) fail("Use a three-letter ISO code, e.g. USD");
  if (!(input.perBase > 0)) fail("Exchange rate must be above zero");
  await db.insert(currencies).values({ ...input, code, active: true, isBase: false });
}

/** Makes another currency the base, re-expressing every rate against it. Balances are unchanged. */
export async function setBaseCurrency(db: Db, code: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(currencies);
    const next = rows.find((r) => r.code === code) ?? fail(`Unknown currency ${code}`);
    for (const r of rows) {
      await tx
        .update(currencies)
        .set({ perBase: r.code === code ? 1 : r.perBase / next.perBase, isBase: r.code === code, active: r.active || r.code === code })
        .where(eq(currencies.code, r.code));
    }
  });
}

/* ------------------------------------------------------------------ account groups */

export type AccountGroupRow = typeof accountGroups.$inferSelect;

/** Groups whose accounts normally hold money owed. */
export const LIABILITY_GROUP_TYPES: AccountGroupType[] = ["credit_card", "overdraft", "loan"];

export async function listAccountGroups(db: Db): Promise<AccountGroupRow[]> {
  return db.select().from(accountGroups).orderBy(asc(accountGroups.sort), asc(accountGroups.createdAt));
}

export async function createAccountGroup(db: Db, input: { name: string; type: AccountGroupType }): Promise<string> {
  const name = input.name.trim() || fail("Name the account group");
  const [{ max }] = (await db.select({ max: sql<number>`coalesce(max(${accountGroups.sort}), -1)::int` }).from(accountGroups)) as [
    { max: number },
  ];
  const [row] = await db.insert(accountGroups).values({ name, type: input.type, sort: max + 1 }).returning();
  return row!.id;
}

export async function updateAccountGroup(db: Db, id: string, input: { name?: string; type?: AccountGroupType }): Promise<void> {
  if (input.name !== undefined && !input.name.trim()) fail("Name the account group");
  await db
    .update(accountGroups)
    .set({ name: input.name?.trim(), type: input.type })
    .where(eq(accountGroups.id, id));
}

export async function deleteAccountGroup(db: Db, id: string): Promise<void> {
  const [used] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.groupId, id)).limit(1);
  if (used) fail("Move or delete this group's accounts first");
  await db.delete(accountGroups).where(eq(accountGroups.id, id));
}

export async function reorder(db: Db, table: "account_groups" | "accounts" | "categories", ids: string[]): Promise<void> {
  const target = { account_groups: accountGroups, accounts, categories }[table];
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(target).set({ sort: i }).where(eq(target.id, id));
  });
}

/* ------------------------------------------------------------------ accounts */

export type AccountRow = typeof accounts.$inferSelect;

export interface AccountView extends AccountRow {
  groupName: string;
  groupType: AccountGroupType;
  /** Balance in the account's own currency, as of the requested date. */
  balance: number;
  /** Balance converted to the base currency. */
  balanceBase: number;
}

/** Net movement per account up to and including `asOf`, computed in SQL. */
export async function accountMovements(db: Db, asOf: string): Promise<Map<string, number>> {
  const result = await db.execute(sql`
    select account_id as id, sum(delta)::float8 as delta from (
      select account_id, case when type in ('income', 'adjustment') then amount else -amount end as delta
        from transactions where date <= ${asOf}
      union all
      select to_account_id, coalesce(to_amount, amount) from transactions where type = 'transfer' and date <= ${asOf}
    ) d group by account_id`);
  return new Map(resultRows<{ id: string; delta: number }>(result).map((r) => [r.id, Number(r.delta)]));
}

/**
 * Accounts a signed-in user may see: null or undefined means every account. Read services take it as `accountIds`
 * and leave out everything else, so totals, reports and exports only ever add up what that person can see.
 */
export type AccountScope = string[] | null | undefined;

/** SQL condition limiting a column to the scope; no condition when the scope is every account. */
export const inScope = (scope: AccountScope, column: Parameters<typeof inArray>[0]) =>
  scope ? inArray(column, scope.length ? scope : [""]) : undefined;

export async function listAccounts(
  db: Db,
  { asOf = todayIso(), includeArchived = false, accountIds }: { asOf?: string; includeArchived?: boolean; accountIds?: AccountScope } = {},
): Promise<AccountView[]> {
  const [rows, movements, { byCode, base }] = await Promise.all([
    db
      .select({ account: accounts, groupName: accountGroups.name, groupType: accountGroups.type, groupSort: accountGroups.sort })
      .from(accounts)
      .innerJoin(accountGroups, eq(accounts.groupId, accountGroups.id))
      .where(and(includeArchived ? undefined : eq(accounts.archived, false), inScope(accountIds, accounts.id)))
      .orderBy(asc(accountGroups.sort), asc(accounts.sort), asc(accounts.createdAt)),
    accountMovements(db, asOf),
    getCurrencies(db),
  ]);
  return rows.map(({ account, groupName, groupType }) => {
    const balance = account.openingBalance + (movements.get(account.id) ?? 0);
    const currency = byCode.get(account.currency) ?? base;
    return { ...account, groupName, groupType, balance, balanceBase: convertMinor(balance, currency, base) };
  });
}

export interface AccountInput {
  groupId: string;
  name: string;
  currency: string;
  openingBalance?: number;
  includeInTotals?: boolean;
  note?: string | null;
  limitAmount?: number | null;
  interestRate?: number | null;
  counterparty?: string | null;
  archived?: boolean;
}

async function validateAccount(db: Db, input: Partial<AccountInput>) {
  if (input.name !== undefined && !input.name.trim()) fail("Name the account");
  if (input.currency !== undefined) {
    const [c] = await db.select().from(currencies).where(eq(currencies.code, input.currency));
    if (!c) fail(`Unknown currency ${input.currency}`);
  }
  if (input.groupId !== undefined) {
    const [g] = await db.select().from(accountGroups).where(eq(accountGroups.id, input.groupId));
    if (!g) fail("Choose an account group");
  }
  if (input.openingBalance !== undefined && !Number.isInteger(input.openingBalance)) fail("Opening balance must be in minor units");
}

export async function createAccount(db: Db, input: AccountInput): Promise<string> {
  await validateAccount(db, input);
  const [{ max }] = (await db
    .select({ max: sql<number>`coalesce(max(${accounts.sort}), -1)::int` })
    .from(accounts)
    .where(eq(accounts.groupId, input.groupId))) as [{ max: number }];
  const [row] = await db
    .insert(accounts)
    .values({ ...input, name: input.name.trim(), sort: max + 1 })
    .returning();
  return row!.id;
}

export async function updateAccount(db: Db, id: string, input: Partial<AccountInput>): Promise<void> {
  await validateAccount(db, input);
  const [current] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!current) fail("Account not found");
  if (input.currency && input.currency !== current!.currency) {
    const [used] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)))
      .limit(1);
    if (used) fail("The currency of an account with transactions cannot change");
  }
  await db
    .update(accounts)
    .set({ ...input, name: input.name?.trim() })
    .where(eq(accounts.id, id));
}

/** Deletes an account and, with it, every transaction that touches it. */
export async function deleteAccount(db: Db, id: string): Promise<void> {
  await db.delete(accounts).where(eq(accounts.id, id));
}

/**
 * Sets an account to a known balance on a date by booking the difference as an adjustment.
 * Used to revalue investments and to reconcile against a bank statement.
 */
export async function setAccountBalance(
  db: Db,
  input: { accountId: string; balance: number; date: string; note?: string; by?: string | null },
): Promise<string | null> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, input.accountId));
  if (!account) fail("Account not found");
  const movement = (await accountMovements(db, input.date)).get(input.accountId) ?? 0;
  const diff = input.balance - (account!.openingBalance + movement);
  if (diff === 0) return null;
  const [row] = await db
    .insert(transactions)
    .values({
      type: "adjustment",
      date: input.date,
      accountId: input.accountId,
      amount: diff,
      note: input.note?.trim() || "Balance update",
      createdBy: input.by ?? null,
    })
    .returning();
  return row!.id;
}

/* ------------------------------------------------------------------ categories */

export type CategoryRow = typeof categories.$inferSelect;

export async function listCategories(db: Db, { includeArchived = false } = {}): Promise<CategoryRow[]> {
  return db
    .select()
    .from(categories)
    .where(includeArchived ? undefined : eq(categories.archived, false))
    .orderBy(asc(categories.sort), asc(categories.createdAt));
}

export async function createCategory(
  db: Db,
  input: { kind: "income" | "expense"; name: string; emoji?: string | null; parentId?: string | null },
): Promise<string> {
  const name = input.name.trim() || fail("Name the category");
  if (input.parentId) {
    const [parent] = await db.select().from(categories).where(eq(categories.id, input.parentId));
    if (!parent) fail("Parent category not found");
    if (parent!.parentId) fail("Subcategories cannot have their own subcategories");
    if (parent!.kind !== input.kind) fail("A subcategory must match its parent's kind");
  }
  const [{ max }] = (await db
    .select({ max: sql<number>`coalesce(max(${categories.sort}), -1)::int` })
    .from(categories)
    .where(
      and(
        eq(categories.kind, input.kind),
        input.parentId ? eq(categories.parentId, input.parentId) : sql`${categories.parentId} is null`,
      ),
    )) as [{ max: number }];
  const [row] = await db
    .insert(categories)
    .values({ kind: input.kind, name, emoji: input.emoji?.trim() || null, parentId: input.parentId ?? null, sort: max + 1 })
    .returning();
  return row!.id;
}

export async function updateCategory(db: Db, id: string, input: { name?: string; emoji?: string | null }): Promise<void> {
  if (input.name !== undefined && !input.name.trim()) fail("Name the category");
  await db
    .update(categories)
    .set({ name: input.name?.trim(), emoji: input.emoji === undefined ? undefined : input.emoji?.trim() || null })
    .where(eq(categories.id, id));
}

/** Deletes a category and its subcategories; their transactions become uncategorised. */
export async function deleteCategory(db: Db, id: string): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

/* ------------------------------------------------------------------ transactions */

export type TxType = "income" | "expense" | "transfer" | "adjustment";
export type TxRow = typeof transactions.$inferSelect;

export interface TxInput {
  type: TxType;
  date: string;
  accountId: string;
  toAccountId?: string | null;
  /** Minor units of the source account's currency. */
  amount: number;
  /** Transfer amount received in the destination's currency; converted at current rates when omitted. */
  toAmount?: number | null;
  /** Transfer fee, booked as a separate expense on the source account. */
  feeAmount?: number | null;
  categoryId?: string | null;
  note?: string;
  description?: string;
  /** Repeat or split into installments (Money Manager's "Rep/Inst."). */
  schedule?: { mode: "installment" | "repeat"; count: number; frequency: "monthly" | "weekly" } | null;
  source?: TxRow["source"];
  importBatchId?: string | null;
  importHash?: string | null;
  /** The signed-in person making the change. */
  by?: string | null;
}

async function prepare(db: Db, input: TxInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fail("Pick a date");
  if (!Number.isInteger(input.amount)) fail("Amount must be in minor units");
  if (input.type === "adjustment" ? input.amount === 0 : input.amount <= 0) fail("Enter an amount above zero");

  const ids = [input.accountId, input.toAccountId].filter((x): x is string => !!x);
  const found = await db.select().from(accounts).where(inArray(accounts.id, ids));
  const from = found.find((a) => a.id === input.accountId) ?? fail("Choose an account");
  let to: AccountRow | undefined;
  let toAmount: number | null = null;

  if (input.type === "transfer") {
    if (!input.toAccountId) fail("Choose the account the money goes to");
    if (input.toAccountId === input.accountId) fail("Transfer to a different account");
    to = found.find((a) => a.id === input.toAccountId) ?? fail("Destination account not found");
    if (input.toAmount != null) {
      if (!Number.isInteger(input.toAmount) || input.toAmount <= 0) fail("Enter the amount received");
      toAmount = input.toAmount;
    } else if (to.currency !== from.currency) {
      const { byCode } = await getCurrencies(db);
      toAmount = convertMinor(input.amount, byCode.get(from.currency)!, byCode.get(to.currency)!);
    }
  }

  let categoryId: string | null = null;
  if (input.categoryId && (input.type === "income" || input.type === "expense")) {
    const [cat] = await db.select().from(categories).where(eq(categories.id, input.categoryId));
    if (!cat) fail("Category not found");
    if (cat!.kind !== input.type) fail(`Pick an ${input.type} category`);
    categoryId = cat!.id;
  }

  const fee = input.type === "transfer" && input.feeAmount ? input.feeAmount : 0;
  if (!Number.isInteger(fee) || fee < 0) fail("Fee must be zero or more");

  return { from, to, toAmount, categoryId, fee };
}

/** Creates a transaction, or one per occurrence when scheduled. Returns the new ids, earliest first. */
export async function createTransaction(db: Db, input: TxInput): Promise<string[]> {
  const { from, to, toAmount, categoryId, fee } = await prepare(db, input);
  const payments = input.schedule
    ? schedulePayments({ ...input.schedule, amount: input.amount, startDate: input.date })
    : [{ n: 1, count: 1, date: input.date, amount: input.amount }];
  const scheduleId = input.schedule ? crypto.randomUUID() : null;

  return db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const p of payments) {
      const share = p.amount / input.amount;
      const [row] = await tx
        .insert(transactions)
        .values({
          type: input.type,
          date: p.date,
          accountId: from.id,
          toAccountId: to?.id ?? null,
          amount: p.amount,
          toAmount: toAmount === null ? null : Math.round(toAmount * share),
          categoryId,
          note: input.note?.trim() ?? "",
          description: input.description?.trim() ?? "",
          source: input.source ?? (scheduleId ? "schedule" : "manual"),
          scheduleId,
          scheduleNo: scheduleId ? p.n : null,
          scheduleCount: scheduleId ? p.count : null,
          importBatchId: input.importBatchId ?? null,
          importHash: input.importHash ?? null,
          createdBy: input.by ?? null,
        })
        .returning();
      ids.push(row!.id);
      if (fee) await insertFee(tx as unknown as Db, row!, fee);
    }
    return ids;
  });
}

async function insertFee(db: Db, transfer: TxRow, fee: number) {
  const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, BANK_FEE_CATEGORY_ID));
  await db.insert(transactions).values({
    type: "expense",
    date: transfer.date,
    accountId: transfer.accountId,
    amount: fee,
    categoryId: cat?.id ?? null,
    note: transfer.note ? `Fee: ${transfer.note}` : "Transfer fee",
    parentId: transfer.id,
    source: transfer.source,
    createdBy: transfer.updatedBy ?? transfer.createdBy,
  });
}

/** Edits one transaction (one occurrence of a schedule). The fee of a transfer is replaced. */
export async function updateTransaction(db: Db, id: string, input: Omit<TxInput, "schedule">): Promise<void> {
  const [existing] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!existing) fail("Transaction not found");
  const { from, to, toAmount, categoryId, fee } = await prepare(db, input);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(transactions)
      .set({
        type: input.type,
        date: input.date,
        accountId: from.id,
        toAccountId: to?.id ?? null,
        amount: input.amount,
        toAmount,
        categoryId,
        note: input.note?.trim() ?? "",
        description: input.description?.trim() ?? "",
        updatedBy: input.by ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id))
      .returning();
    await tx.delete(transactions).where(eq(transactions.parentId, id));
    if (fee) await insertFee(tx as unknown as Db, row!, fee);
  });
}

/** Deletes one transaction, or for scheduled ones also the following or all occurrences. */
export async function deleteTransaction(db: Db, id: string, scope: "one" | "following" | "all" = "one"): Promise<number> {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!tx) return 0;
  let where: SQL | undefined = eq(transactions.id, id);
  if (tx.scheduleId && scope === "all") where = eq(transactions.scheduleId, tx.scheduleId);
  if (tx.scheduleId && scope === "following")
    where = and(eq(transactions.scheduleId, tx.scheduleId), gte(transactions.scheduleNo, tx.scheduleNo ?? 0));
  const deleted = await db.delete(transactions).where(where).returning({ id: transactions.id });
  return deleted.length;
}

export interface TxView extends TxRow {
  currency: string;
  toCurrency: string | null;
  /** Amount in the base currency (the source amount for transfers). */
  amountBase: number;
  /** Fee booked against this transfer, in the source currency. */
  feeAmount: number;
  /** Names of who added it and who last changed it, when known. */
  createdByName: string | null;
  updatedByName: string | null;
}

export interface TxFilter {
  from?: string;
  to?: string;
  accountId?: string;
  /** Matches the category and its subcategories. */
  categoryId?: string;
  types?: TxType[];
  q?: string;
  limit?: number;
  /** Only transactions touching these accounts (either side of a transfer). */
  accountIds?: AccountScope;
}

export async function listTransactions(db: Db, filter: TxFilter = {}): Promise<TxView[]> {
  const conditions: (SQL | undefined)[] = [
    filter.from ? gte(transactions.date, filter.from) : undefined,
    filter.to ? lte(transactions.date, filter.to) : undefined,
    filter.accountId ? or(eq(transactions.accountId, filter.accountId), eq(transactions.toAccountId, filter.accountId)) : undefined,
    filter.types?.length ? inArray(transactions.type, filter.types) : undefined,
    filter.accountIds ? or(inScope(filter.accountIds, transactions.accountId), inScope(filter.accountIds, transactions.toAccountId)) : undefined,
    filter.categoryId
      ? inArray(
          transactions.categoryId,
          db.select({ id: categories.id }).from(categories).where(or(eq(categories.id, filter.categoryId), eq(categories.parentId, filter.categoryId))),
        )
      : undefined,
    filter.q?.trim()
      ? sql`(${transactions.note} ilike ${`%${filter.q.trim()}%`} or ${transactions.description} ilike ${`%${filter.q.trim()}%`})`
      : undefined,
  ];
  const fromAccount = accounts;
  const rows = await db
    .select({ tx: transactions, currency: fromAccount.currency })
    .from(transactions)
    .innerJoin(fromAccount, eq(transactions.accountId, fromAccount.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(filter.limit ?? 5000);

  const [{ byCode, base }, allAccounts, people] = await Promise.all([
    getCurrencies(db),
    db.select({ id: accounts.id, currency: accounts.currency }).from(accounts),
    db.select({ id: users.id, name: users.displayName }).from(users),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const currencyOf = new Map(allAccounts.map((a) => [a.id, a.currency]));
  const transferIds = rows.filter((r) => r.tx.type === "transfer").map((r) => r.tx.id);
  const fees = transferIds.length
    ? await db
        .select({ parentId: transactions.parentId, amount: transactions.amount })
        .from(transactions)
        .where(inArray(transactions.parentId, transferIds))
    : [];
  const feeOf = new Map(fees.map((f) => [f.parentId, f.amount]));

  return rows.map(({ tx, currency }) => ({
    ...tx,
    currency,
    toCurrency: tx.toAccountId ? (currencyOf.get(tx.toAccountId) ?? null) : null,
    amountBase: convertMinor(tx.amount, byCode.get(currency) ?? base, base),
    feeAmount: feeOf.get(tx.id) ?? 0,
    createdByName: tx.createdBy ? (nameOf.get(tx.createdBy) ?? null) : null,
    updatedByName: tx.updatedBy ? (nameOf.get(tx.updatedBy) ?? null) : null,
  }));
}

export async function getTransaction(db: Db, id: string, accountIds?: AccountScope): Promise<TxView | null> {
  const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!row) return null;
  const views = await listTransactions(db, { from: row.date, to: row.date, accountId: row.accountId, accountIds });
  return views.find((v) => v.id === id) ?? null;
}

/** Transactions in a date range, converted to the base currency with their top-level category, for reports. */
export async function statTransactions(db: Db, range: { from: string; to: string }, accountIds?: AccountScope): Promise<StatTx[]> {
  const [txs, cats] = await Promise.all([
    listTransactions(db, { ...range, types: ["income", "expense"], accountIds }),
    db.select({ id: categories.id, parentId: categories.parentId }).from(categories),
  ]);
  const parentOf = new Map(cats.map((c) => [c.id, c.parentId ?? c.id]));
  return txs.map((t) => ({
    type: t.type,
    date: t.date,
    amountBase: t.amountBase,
    categoryId: t.categoryId,
    parentCategoryId: t.categoryId ? (parentOf.get(t.categoryId) ?? t.categoryId) : null,
  }));
}

/* ------------------------------------------------------------------ net worth, account detail, debts */

function ledgerAccounts(rows: AccountRow[]): LedgerAccount[] {
  return rows.map((a) => ({ id: a.id, currency: a.currency, openingBalance: a.openingBalance, includeInTotals: a.includeInTotals }));
}

export async function getNetWorth(db: Db, asOf = todayIso(), accountIds?: AccountScope): Promise<NetWorth> {
  const [rows, { byCode, base }] = await Promise.all([listAccounts(db, { asOf, includeArchived: true, accountIds }), getCurrencies(db)]);
  return netWorth(ledgerAccounts(rows), new Map(rows.map((r) => [r.id, r.balance])), byCode, base);
}

/** Net worth at each month end, at current exchange rates. */
export async function getNetWorthSeries(db: Db, monthEnds: string[], accountIds?: AccountScope): Promise<{ date: string; worth: NetWorth }[]> {
  return Promise.all(monthEnds.map(async (date) => ({ date, worth: await getNetWorth(db, date, accountIds) })));
}

export async function getAccountDetail(db: Db, id: string, accountIds?: AccountScope) {
  const [account] = (await listAccounts(db, { includeArchived: true, accountIds })).filter((a) => a.id === id);
  if (!account) return null;
  const txs = await listTransactions(db, { accountId: id });
  const today = todayIso();
  const ledger = runningBalance(ledgerAccounts([account])[0]!, [...txs].reverse());
  const rows = ledger.map((r) => ({ ...r.tx, delta: r.delta, runningBalance: r.balance })).reverse();
  const adjustments = txs.filter((t) => t.type === "adjustment" && t.date <= today).reduce((s, t) => s + t.amount, 0);
  const inflow = rows.filter((r) => r.delta > 0 && r.type !== "adjustment" && r.date <= today).reduce((s, r) => s + r.delta, 0);
  const outflow = rows.filter((r) => r.delta < 0 && r.type !== "adjustment" && r.date <= today).reduce((s, r) => s + r.delta, 0);
  return { account, rows, adjustments, inflow, outflow, upcoming: rows.filter((r) => r.date > today) };
}

/** Accounts that hold debt (cards, loans, overdrafts or any negative balance) and money owed to you. */
export async function getDebts(db: Db, today = todayIso(), accountIds?: AccountScope) {
  const all = await listAccounts(db, { asOf: today, accountIds });
  const owed = all.filter((a) => LIABILITY_GROUP_TYPES.includes(a.groupType) || (a.balance < 0 && a.groupType !== "receivable"));
  const receivable = all.filter((a) => a.groupType === "receivable" && !owed.includes(a));
  const ids = [...owed, ...receivable].map((a) => a.id);
  const upcoming = ids.length
    ? await db
        .select()
        .from(transactions)
        .where(
          and(
            gt(transactions.date, today),
            isNotNull(transactions.scheduleId),
            or(inArray(transactions.accountId, ids), inArray(transactions.toAccountId, ids)),
          ),
        )
        .orderBy(asc(transactions.date))
    : [];
  return { owed, receivable, upcoming };
}
