import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Promo } from "@gpa/core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
/** Integer minor units (fils, paise). bigint keeps large INR balances exact. */
const minor = (name: string) => bigint(name, { mode: "number" });
const isoDate = (name: string) => date(name, { mode: "string" });
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "bytea" });

/* ------------------------------------------------------------------ settings */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/* ------------------------------------------------------------------ users */

export const USER_ROLES = ["admin", "write", "read"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** People who can sign in: the owner plus up to four more. */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** Sign-in name, stored lowercase. */
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    /** scrypt hash; the password itself is never stored. */
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull(),
    /** The first admin. Can't be removed or demoted, so the household can't lock itself out. */
    isOwner: boolean("is_owner").notNull().default(false),
    /** Every account, including ones added later. Admins always have this. */
    allAccounts: boolean("all_accounts").notNull().default(false),
    /** Part of every session token; bumping it signs this user out everywhere. */
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_username_key").on(t.username),
    check("users_role_check", sql`${t.role} in ('admin', 'write', 'read')`),
  ],
);

/** Accounts a user without allAccounts may see (read) or also change (write). */
export const userAccounts = pgTable(
  "user_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.accountId] }), index("user_accounts_account_idx").on(t.accountId)],
);

/* ------------------------------------------------------------------ money */

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimals: integer("decimals").notNull().default(2),
  /** Units of this currency per 1 unit of the base currency. */
  perBase: doublePrecision("per_base").notNull(),
  isBase: boolean("is_base").notNull().default(false),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ACCOUNT_GROUP_TYPES = [
  "cash",
  "bank",
  "credit_card",
  "debit_card",
  "savings",
  "prepaid",
  "investment",
  "overdraft",
  "loan",
  "insurance",
  "receivable",
  "other",
] as const;
export type AccountGroupType = (typeof ACCOUNT_GROUP_TYPES)[number];

export const accountGroups = pgTable("account_groups", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").$type<AccountGroupType>().notNull().default("other"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => accountGroups.id),
    name: text("name").notNull(),
    currency: text("currency")
      .notNull()
      .references(() => currencies.code),
    openingBalance: minor("opening_balance").notNull().default(0),
    includeInTotals: boolean("include_in_totals").notNull().default(true),
    archived: boolean("archived").notNull().default(false),
    note: text("note"),
    /** Credit limit for cards, original principal for loans and money lent. */
    limitAmount: minor("limit_amount"),
    /** Annual interest rate in percent, for loans and savings. */
    interestRate: real("interest_rate"),
    /** Person or institution on the other side of a debt. */
    counterparty: text("counterparty"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("accounts_group_idx").on(t.groupId)],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    kind: text("kind").$type<"income" | "expense">().notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji"),
    sort: integer("sort").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("categories_parent_idx").on(t.parentId)],
);

/** Monthly spending limit per expense category, in the base currency's minor units. */
export const budgets = pgTable(
  "budgets",
  {
    categoryId: text("category_id")
      .primaryKey()
      .references(() => categories.id, { onDelete: "cascade" }),
    amount: minor("amount").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("budgets_amount_check", sql`${t.amount} > 0`)],
);

export const importBatches = pgTable("import_batches", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
  importedCount: integer("imported_count").notNull(),
  skippedCount: integer("skipped_count").notNull(),
  createdAt: createdAt(),
});

export const TX_SOURCES = ["manual", "import", "basket", "schedule"] as const;

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    type: text("type").$type<"income" | "expense" | "transfer" | "adjustment">().notNull(),
    date: isoDate("date").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    toAccountId: text("to_account_id").references(() => accounts.id, { onDelete: "cascade" }),
    /** Minor units of the source account's currency. Positive, except signed adjustments. */
    amount: minor("amount").notNull(),
    /** Transfer amount received, in the destination account's currency. */
    toAmount: minor("to_amount"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    description: text("description").notNull().default(""),
    source: text("source").$type<(typeof TX_SOURCES)[number]>().notNull().default("manual"),
    /** Fee expense created alongside a transfer points at its transfer. */
    parentId: text("parent_id").references((): AnyPgColumn => transactions.id, { onDelete: "cascade" }),
    /** Installment / repeat plan this transaction belongs to. */
    scheduleId: text("schedule_id"),
    scheduleNo: integer("schedule_no"),
    scheduleCount: integer("schedule_count"),
    importBatchId: text("import_batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    importHash: text("import_hash"),
    bookmarked: boolean("bookmarked").notNull().default(false),
    createdAt: createdAt(),
    /** Who added it and who last changed it. Null for rows from before sign-ins, or when that person was removed. */
    createdBy: text("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_account_idx").on(t.accountId, t.date),
    index("transactions_to_account_idx").on(t.toAccountId),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_schedule_idx").on(t.scheduleId),
    uniqueIndex("transactions_import_hash_idx").on(t.accountId, t.importHash),
    check(
      "transactions_shape",
      sql`(${t.type} = 'transfer' AND ${t.toAccountId} IS NOT NULL AND ${t.toAccountId} <> ${t.accountId})
          OR (${t.type} <> 'transfer' AND ${t.toAccountId} IS NULL)`,
    ),
    check("transactions_amount_sign", sql`${t.type} = 'adjustment' OR ${t.amount} > 0`),
  ],
);

export const categoryRules = pgTable("category_rules", {
  id: id(),
  pattern: text("pattern").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"income" | "expense">(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ groceries */

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const groceryCategories = pgTable("grocery_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const products = pgTable("products", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  brand: text("brand"),
  categoryId: text("category_id")
    .notNull()
    .references(() => groceryCategories.id),
  packSize: real("pack_size").notNull().default(1),
  packUnit: text("pack_unit").$type<"piece" | "kg" | "g" | "L" | "ml" | "pack">().notNull().default("piece"),
  soldBy: text("sold_by").$type<"each" | "kg">().notNull().default("each"),
  createdAt: createdAt(),
});

export const storePrices = pgTable(
  "store_prices",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    priceFils: integer("price_fils").notNull(),
    promo: jsonb("promo").$type<Promo>(),
    promoValidTo: isoDate("promo_valid_to"),
    source: text("source").$type<"pdf" | "manual" | "receipt" | "feed">().notNull().default("manual"),
    /** Where the offer came from, e.g. the PDF file name. */
    sourceLabel: text("source_label"),
    pdfImportId: text("pdf_import_id"),
    observedAt: isoDate("observed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.storeId] })],
);

export const groceryLists = pgTable("grocery_lists", {
  id: id(),
  type: text("type").$type<"weekly" | "monthly" | "saved">().notNull(),
  name: text("name").notNull(),
  /** Monday of the week or first of the month; null for saved templates. */
  periodStart: isoDate("period_start"),
  createdAt: createdAt(),
});

/** One confirmed shopping trip: the ticked items that became an expense transaction. */
export const groceryPurchases = pgTable("grocery_purchases", {
  id: id(),
  listId: text("list_id")
    .notNull()
    .references(() => groceryLists.id, { onDelete: "cascade" }),
  transactionId: text("transaction_id")
    .notNull()
    .unique()
    .references(() => transactions.id, { onDelete: "cascade" }),
  storeId: text("store_id").references(() => stores.id, { onDelete: "set null" }),
  /** Planned cost of the purchased items at that store, for estimate-vs-actual. */
  estimatedFils: integer("estimated_fils").notNull(),
  createdAt: createdAt(),
});

export const listItems = pgTable(
  "list_items",
  {
    id: id(),
    listId: text("list_id")
      .notNull()
      .references(() => groceryLists.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    text: text("text"),
    quantity: real("quantity").notNull().default(1),
    checked: boolean("checked").notNull().default(false),
    purchaseId: text("purchase_id").references(() => groceryPurchases.id, { onDelete: "set null" }),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("list_items_list_idx").on(t.listId)],
);

export const pdfImports = pgTable("pdf_imports", {
  id: id(),
  filename: text("filename").notNull(),
  storeId: text("store_id").references(() => stores.id, { onDelete: "set null" }),
  status: text("status").$type<"review" | "published" | "discarded">().notNull().default("review"),
  pageCount: integer("page_count").notNull().default(0),
  validTo: isoDate("valid_to"),
  file: bytea("file"),
  textLength: integer("text_length").notNull().default(0),
  createdAt: createdAt(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const pdfImportLines = pgTable(
  "pdf_import_lines",
  {
    id: id(),
    importId: text("import_id")
      .notNull()
      .references(() => pdfImports.id, { onDelete: "cascade" }),
    line: integer("line").notNull(),
    rawText: text("raw_text").notNull(),
    name: text("name").notNull(),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    matchScore: real("match_score"),
    priceFils: integer("price_fils").notNull(),
    regularFils: integer("regular_fils"),
    promo: jsonb("promo").$type<Promo>(),
    include: boolean("include").notNull().default(true),
  },
  (t) => [index("pdf_import_lines_import_idx").on(t.importId)],
);
