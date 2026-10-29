import { aedToFils, roundFils, type Promo } from "@gpa/core";
import type { AccountGroupType } from "./schema";

/** Starter data. Category ids are readable and stable so code (grocery default, tests) can refer to them. */

export const SEED_CURRENCIES = [
  { code: "AED", name: "UAE Dirham", symbol: "DH", decimals: 2, perBase: 1, isBase: true, active: true },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2, perBase: 24.1, isBase: false, active: true },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2, perBase: 0.2723, isBase: false, active: false },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2, perBase: 0.2347, isBase: false, active: false },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2, perBase: 0.2046, isBase: false, active: false },
  { code: "SAR", name: "Saudi Riyal", symbol: "SR", decimals: 2, perBase: 1.0211, isBase: false, active: false },
];

export const SEED_ACCOUNT_GROUPS: { id: string; name: string; type: AccountGroupType }[] = [
  { id: "g-cash", name: "Cash", type: "cash" },
  { id: "g-accounts", name: "Accounts", type: "bank" },
  { id: "g-card", name: "Card", type: "credit_card" },
  { id: "g-debit", name: "Debit Card", type: "debit_card" },
  { id: "g-savings", name: "Savings", type: "savings" },
  { id: "g-prepaid", name: "Top-Up/Prepaid", type: "prepaid" },
  { id: "g-investments", name: "Investments", type: "investment" },
  { id: "g-overdrafts", name: "Overdrafts", type: "overdraft" },
  { id: "g-loan", name: "Loan", type: "loan" },
  { id: "g-insurance", name: "Insurance", type: "insurance" },
  { id: "g-others", name: "Others", type: "other" },
  { id: "g-friends", name: "Friends", type: "receivable" },
];

type CategorySeed = [name: string, emoji: string | null, subs?: string[]];

export const EXPENSE_CATEGORIES: CategorySeed[] = [
  ["Food", "🍜", ["Lunch", "Dinner", "Eating out", "Beverages", "Family", "Snacks"]],
  ["Social Life", "👬", ["Friend", "Family", "Charity", "Other", "Lottery", "Badminton", "Club", "Party"]],
  ["Pets", "🐶"],
  ["Car Expense", "🚖", ["Fuel", "Car wash", "Spare parts", "Service charge", "Salik", "Parking", "Fines", "Insurance", "Registration", "Tyres", "Other"]],
  ["Culture", "🖼️", ["Other", "Movie", "Entertainment", "Apps", "Outing"]],
  ["Household", "🪑", ["Appliances", "Furniture", "Kitchen", "Toiletries", "Chemicals", "Cleaning", "Repairs", "Other"]],
  ["Shopping", "🛍️", ["Online", "Grocery", "Travel Ticket", "Other", "Garments/Fashion/Accessories", "Electronic/Mobile/Laptop/Accessories", "Kitchen Accessories"]],
  ["Health", "🧘", ["Health", "Sports", "Hospital", "Medicine", "Accessories"]],
  ["Education", "📙", ["School Fee", "Textbooks", "School supplies", "Other", "Courses"]],
  ["Gift", "🎁", ["Family", "Friends", "Office"]],
  ["Other", null, ["Bank fee", "Salary Deduction"]],
  ["Loan", "💵", ["Vehicle Finance", "Personal Finance", "Credit Card", "Home Loan", "Gold Loan", "Friends", "Other"]],
  ["Utility bills", "🧾", ["House rent", "Internet WIFI", "Electricity", "Sewa", "Mobile", "Water", "Gas", "DEWA", "Chiller", "Maintenance", "Netflix/Subscriptions", "Other"]],
  ["Payments", null, ["Credit card", "Other"]],
  ["Vacation expenses", null, ["Fuel", "Shopping- fashion/garments/accessories", "Food", "Hotel", "Flight", "Visa", "Transport", "Gifts", "Activities", "Other"]],
  ["Buy Now Pay Later", null, ["Garments/Fashion/Accessories", "Electronic/Mobile/Laptop/Accessories", "Kitchen accessories", "Household", "Travel", "Other"]],
];

export const INCOME_CATEGORIES: CategorySeed[] = [
  ["Allowance", "🤑", ["Housing", "Transport", "Other"]],
  ["Salary", "💰"],
  ["Petty cash", "💵"],
  ["Bonus", "🏅", ["Annual", "Performance"]],
  ["Loan", "🏦", ["Bank", "Friends"]],
  ["Cash", null],
  ["Cash adjusting", null],
  ["Interest", null],
  ["Refund", null],
  ["Leave salary + flight tickets", null],
];

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function categoryRows() {
  const rows: { id: string; kind: "income" | "expense"; parentId: string | null; name: string; emoji: string | null; sort: number }[] = [];
  const add = (kind: "income" | "expense", seeds: CategorySeed[]) =>
    seeds.forEach(([name, emoji, subs], i) => {
      const id = `${kind === "expense" ? "e" : "i"}-${slug(name)}`;
      rows.push({ id, kind, parentId: null, name, emoji, sort: i });
      subs?.forEach((sub, j) => rows.push({ id: `${id}--${slug(sub)}`, kind, parentId: id, name: sub, emoji: null, sort: j }));
    });
  add("expense", EXPENSE_CATEGORIES);
  add("income", INCOME_CATEGORIES);
  return rows;
}

export const GROCERY_CATEGORY_ID = "e-shopping--grocery";
export const BANK_FEE_CATEGORY_ID = "e-other--bank-fee";

/** Common UAE merchants. Users add their own on the Rules screen or while importing. */
export const SEED_RULES: { pattern: string; categoryId: string; kind?: "income" | "expense" }[] = [
  ["carrefour", GROCERY_CATEGORY_ID],
  ["lulu", GROCERY_CATEGORY_ID],
  ["union coop", GROCERY_CATEGORY_ID],
  ["spinneys", GROCERY_CATEGORY_ID],
  ["choithram", GROCERY_CATEGORY_ID],
  ["nesto", GROCERY_CATEGORY_ID],
  ["waitrose", GROCERY_CATEGORY_ID],
  ["talabat", "e-food--eating-out"],
  ["deliveroo", "e-food--eating-out"],
  ["careem food", "e-food--eating-out"],
  ["noon", "e-shopping--online"],
  ["amazon", "e-shopping--online"],
  ["dewa", "e-utility-bills--electricity"],
  ["sewa", "e-utility-bills--sewa"],
  ["etisalat", "e-utility-bills--internet-wifi"],
  ["e&", "e-utility-bills--internet-wifi"],
  ["du ", "e-utility-bills--mobile"],
  ["enoc", "e-car-expense--fuel"],
  ["adnoc", "e-car-expense--fuel"],
  ["eppco", "e-car-expense--fuel"],
  ["emarat", "e-car-expense--fuel"],
  ["salik", "e-car-expense--salik"],
  ["rta parking", "e-car-expense--parking"],
  ["netflix", "e-utility-bills--netflix-subscriptions"],
  ["vox cinemas", "e-culture--movie"],
  ["pharmacy", "e-health--medicine"],
  ["tabby", "e-buy-now-pay-later--other"],
  ["tamara", "e-buy-now-pay-later--other"],
  ["salary", "i-salary", "income"],
  ["interest", "i-interest", "income"],
  ["refund", "i-refund", "income"],
].map(([pattern, categoryId, kind]) => ({ pattern: pattern!, categoryId: categoryId!, kind: kind as "income" | undefined }));

/* ------------------------------------------------------------------ grocery catalogue */

export const SEED_STORES = [
  { id: "carrefour", name: "Carrefour", color: "#2f6fde" },
  { id: "lulu", name: "Lulu", color: "#16a34a" },
  { id: "union", name: "Union Coop", color: "#d97706" },
  { id: "spinneys", name: "Spinneys", color: "#7c3aed" },
  { id: "choithrams", name: "Choithrams", color: "#db2777" },
  { id: "nesto", name: "Nesto", color: "#0891b2" },
];

export const SEED_GROCERY_CATEGORIES = [
  { id: "fresh", name: "Fruit & Veg" },
  { id: "dairy", name: "Dairy & Eggs" },
  { id: "meat", name: "Meat & Fish" },
  { id: "bakery", name: "Bakery" },
  { id: "pantry", name: "Pantry" },
  { id: "drinks", name: "Drinks" },
  { id: "household", name: "Household" },
];

type ProductSeed = {
  id: string;
  name: string;
  brand?: string;
  categoryId: string;
  packSize: number;
  packUnit: "piece" | "kg" | "g" | "L" | "ml" | "pack";
  soldBy: "each" | "kg";
  baseAed: number;
};

export const SEED_PRODUCTS: ProductSeed[] = [
  { id: "milk", name: "Fresh full-cream milk", brand: "Al Rawabi", categoryId: "dairy", packSize: 2, packUnit: "L", soldBy: "each", baseAed: 10.25 },
  { id: "eggs", name: "White eggs, 30 pack", brand: "Al Jazira", categoryId: "dairy", packSize: 30, packUnit: "piece", soldBy: "each", baseAed: 19.5 },
  { id: "rice", name: "Basmati rice", brand: "India Gate", categoryId: "pantry", packSize: 5, packUnit: "kg", soldBy: "each", baseAed: 42 },
  { id: "chicken", name: "Chicken breast fillets", brand: "Al Ain", categoryId: "meat", packSize: 1, packUnit: "kg", soldBy: "each", baseAed: 27 },
  { id: "tomato", name: "Tomatoes", categoryId: "fresh", packSize: 1, packUnit: "kg", soldBy: "kg", baseAed: 4.25 },
  { id: "banana", name: "Bananas", categoryId: "fresh", packSize: 1, packUnit: "kg", soldBy: "kg", baseAed: 6.5 },
  { id: "onion", name: "Red onions", categoryId: "fresh", packSize: 1, packUnit: "kg", soldBy: "kg", baseAed: 3.25 },
  { id: "potato", name: "Potatoes", categoryId: "fresh", packSize: 1, packUnit: "kg", soldBy: "kg", baseAed: 3.75 },
  { id: "apple", name: "Royal Gala apples", categoryId: "fresh", packSize: 1, packUnit: "kg", soldBy: "kg", baseAed: 8.95 },
  { id: "cucumber", name: "Cucumbers", categoryId: "fresh", packSize: 1, packUnit: "kg", soldBy: "kg", baseAed: 4.5 },
  { id: "laban", name: "Laban up", brand: "Al Rawabi", categoryId: "dairy", packSize: 1, packUnit: "L", soldBy: "each", baseAed: 5.5 },
  { id: "yogurt", name: "Greek yogurt", brand: "Almarai", categoryId: "dairy", packSize: 500, packUnit: "g", soldBy: "each", baseAed: 9.75 },
  { id: "cheese", name: "Cheddar slices", brand: "Kraft", categoryId: "dairy", packSize: 200, packUnit: "g", soldBy: "each", baseAed: 11.5 },
  { id: "salmon", name: "Norwegian salmon fillet", categoryId: "meat", packSize: 1, packUnit: "kg", soldBy: "kg", baseAed: 79 },
  { id: "mince", name: "Beef mince", categoryId: "meat", packSize: 500, packUnit: "g", soldBy: "each", baseAed: 22 },
  { id: "bread", name: "White sliced bread", brand: "Modern Bakery", categoryId: "bakery", packSize: 1, packUnit: "pack", soldBy: "each", baseAed: 6.5 },
  { id: "arabic-bread", name: "Arabic bread, 6 pack", brand: "Al Jadeed", categoryId: "bakery", packSize: 6, packUnit: "piece", soldBy: "each", baseAed: 2.5 },
  { id: "oil", name: "Sunflower oil", brand: "Noor", categoryId: "pantry", packSize: 1.5, packUnit: "L", soldBy: "each", baseAed: 16.5 },
  { id: "pasta", name: "Spaghetti", brand: "Barilla", categoryId: "pantry", packSize: 500, packUnit: "g", soldBy: "each", baseAed: 7.25 },
  { id: "lentils", name: "Red lentils", brand: "Al Wadi", categoryId: "pantry", packSize: 1, packUnit: "kg", soldBy: "each", baseAed: 8.5 },
  { id: "water", name: "Drinking water, 12 x 500 ml", brand: "Masafi", categoryId: "drinks", packSize: 12, packUnit: "piece", soldBy: "each", baseAed: 9.5 },
  { id: "juice", name: "Orange juice", brand: "Almarai", categoryId: "drinks", packSize: 1.4, packUnit: "L", soldBy: "each", baseAed: 10.5 },
  { id: "detergent", name: "Laundry detergent", brand: "Ariel", categoryId: "household", packSize: 3, packUnit: "kg", soldBy: "each", baseAed: 45 },
  { id: "tissues", name: "Facial tissues, 5 x 200", brand: "Fine", categoryId: "household", packSize: 5, packUnit: "pack", soldBy: "each", baseAed: 21 },
];

/** Typical price level of each chain against the base price (illustrative). */
const storeLevel: Record<string, number> = { carrefour: 1.02, lulu: 0.96, union: 1.0, spinneys: 1.14, choithrams: 1.08, nesto: 0.97 };

function jitter(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 1 + ((h % 9) - 4) / 100;
}

/** Spec worked-example prices, kept exactly so Compare matches the planning document. */
const fixed: Record<string, number> = {
  "carrefour:milk": 10.5, "lulu:milk": 9.75, "union:milk": 10.25,
  "carrefour:eggs": 19.95, "lulu:eggs": 18.5, "union:eggs": 21,
  "carrefour:rice": 42, "lulu:rice": 39.95, "union:rice": 44.5,
  "carrefour:chicken": 28, "lulu:chicken": 27.5, "union:chicken": 26,
  "carrefour:tomato": 4.5, "lulu:tomato": 3.95, "union:tomato": 4.25,
};

const notStocked = new Set(["nesto:salmon", "choithrams:arabic-bread", "union:cheese"]);

const offers: { storeId: string; productId: string; promo: Promo; validInDays: number; label: string }[] = [
  { storeId: "carrefour", productId: "rice", promo: { type: "price_cut", priceFils: 3600 }, validInDays: 7, label: "Carrefour weekend offers (sample)" },
  { storeId: "lulu", productId: "chicken", promo: { type: "multi_buy", qty: 2, priceFils: 5000 }, validInDays: 6, label: "Lulu weekly saver (sample)" },
  { storeId: "lulu", productId: "detergent", promo: { type: "percent_off", percent: 25 }, validInDays: 6, label: "Lulu weekly saver (sample)" },
  { storeId: "union", productId: "oil", promo: { type: "bogo" }, validInDays: 4, label: "Union Coop flyer (sample)" },
  { storeId: "spinneys", productId: "salmon", promo: { type: "percent_off", percent: 20 }, validInDays: 5, label: "Spinneys fresh deals (sample)" },
  { storeId: "nesto", productId: "water", promo: { type: "multi_buy", qty: 2, priceFils: 1500 }, validInDays: 8, label: "Nesto hypermarket (sample)" },
  { storeId: "carrefour", productId: "yogurt", promo: { type: "price_cut", priceFils: 795 }, validInDays: 7, label: "Carrefour weekend offers (sample)" },
  { storeId: "choithrams", productId: "juice", promo: { type: "percent_off", percent: 30 }, validInDays: 3, label: "Choithrams flyer (sample)" },
];

export function seedPrices(today: string, addDays: (iso: string, n: number) => string) {
  return SEED_PRODUCTS.flatMap((p) =>
    SEED_STORES.filter((s) => !notStocked.has(`${s.id}:${p.id}`)).map((s) => {
      const key = `${s.id}:${p.id}`;
      const aed = fixed[key] ?? p.baseAed * storeLevel[s.id]! * jitter(key);
      // Shelf prices end in 0 or 5 fils.
      const priceFils = fixed[key] ? aedToFils(aed) : roundFils((aed * 100) / 5) * 5;
      const offer = offers.find((o) => o.storeId === s.id && o.productId === p.id);
      return {
        productId: p.id,
        storeId: s.id,
        priceFils,
        promo: offer?.promo ?? null,
        promoValidTo: offer ? addDays(today, offer.validInDays) : null,
        source: offer ? ("pdf" as const) : ("manual" as const),
        sourceLabel: offer?.label ?? "Sample price",
        observedAt: today,
      };
    }),
  );
}

export const SEED_LISTS: { key: string; type: "weekly" | "monthly" | "saved"; name: string; items: [string, number, boolean?][] }[] = [
  {
    key: "week",
    type: "weekly",
    name: "This week",
    items: [["milk", 2], ["eggs", 1], ["rice", 1], ["chicken", 2], ["tomato", 1.5], ["banana", 1], ["bread", 2], ["yogurt", 2]],
  },
  { key: "month", type: "monthly", name: "Monthly bulk", items: [["oil", 2], ["detergent", 1], ["water", 4], ["tissues", 1], ["lentils", 2]] },
  { key: "basics", type: "saved", name: "Weekly basics", items: [["milk", 2], ["eggs", 1], ["bread", 2], ["banana", 1], ["tomato", 1], ["laban", 4]] },
  { key: "bbq", type: "saved", name: "BBQ weekend", items: [["chicken", 3], ["mince", 2], ["arabic-bread", 3], ["onion", 1], ["cucumber", 1], ["juice", 2]] },
];
