import { addMonths, monthStartOf, todayIso, toMinor } from "@gpa/core";
import type { Db } from "./client";
import { createAccount, createTransaction, listAccounts } from "./services/money";

/**
 * Optional demo data (`npm run db:seed-demo`, or GPA_SEED_DEMO=1 on first start): a salary
 * account, two cards, NRI rupee accounts, a personal loan, an investment and three months
 * of everyday transactions. Skipped when any account besides "Cash" exists.
 */
export async function seedDemo(db: Db, today = todayIso()): Promise<boolean> {
  if ((await listAccounts(db, { includeArchived: true })).length > 1) return false;

  const aed = (n: number) => toMinor(n, 2);
  const salary = await createAccount(db, { groupId: "g-accounts", name: "Salary Account", currency: "AED", openingBalance: aed(52000) });
  const mashreq = await createAccount(db, { groupId: "g-card", name: "Mashreq Credit Card", currency: "AED", limitAmount: aed(20000) });
  const eib = await createAccount(db, { groupId: "g-card", name: "Emirates Islamic Credit Card", currency: "AED", limitAmount: aed(15000) });
  const esaf = await createAccount(db, { groupId: "g-savings", name: "ESAF (NRI)", currency: "INR", openingBalance: toMinor(185000, 2) });
  const sib = await createAccount(db, { groupId: "g-savings", name: "South Indian Bank (NRI)", currency: "INR", openingBalance: toMinor(92000, 2) });
  const loan = await createAccount(db, {
    groupId: "g-loan",
    name: "NBD Personal Loan",
    currency: "AED",
    openingBalance: -aed(2491) * 48,
    limitAmount: aed(2491) * 48,
    interestRate: 6.5,
    counterparty: "Emirates NBD",
  });
  const funds = await createAccount(db, { groupId: "g-investments", name: "Mutual funds", currency: "INR", openingBalance: toMinor(250000, 2) });
  await createAccount(db, { groupId: "g-friends", name: "Lent to a friend", currency: "AED", openingBalance: aed(1500), counterparty: "Friend" });

  const start = addMonths(monthStartOf(today), -2);
  const day = (monthOffset: number, d: number) => {
    const iso = addMonths(start, monthOffset, d);
    return iso > today ? null : iso;
  };
  const spend = async (date: string | null, accountId: string, amount: number, categoryId: string, note: string) => {
    if (date) await createTransaction(db, { type: "expense", date, accountId, amount: aed(amount), categoryId, note });
  };

  for (let m = 0; m < 3; m++) {
    const payday = day(m, 1);
    if (payday) await createTransaction(db, { type: "income", date: payday, accountId: salary, amount: aed(10500), categoryId: "i-salary", note: "Salary" });
    await spend(day(m, 3), salary, 4500, "e-utility-bills--house-rent", "Monthly rent");
    await spend(day(m, 6), mashreq, 412.1, "e-utility-bills--electricity", "DEWA");
    await spend(day(m, 7), mashreq, 349, "e-utility-bills--internet-wifi", "Home internet");
    await spend(day(m, 9), eib, 210.55, "e-car-expense--fuel", "ENOC");
    await spend(day(m, 12), mashreq, 186.4, "e-shopping--grocery", "Carrefour");
    await spend(day(m, 19), mashreq, 143.75, "e-shopping--grocery", "Lulu");
    await spend(day(m, 14), eib, 64.5, "e-food--eating-out", "Talabat");
    await spend(day(m, 21), mashreq, 120, "e-social-life--friend", "Dinner with friends");
    await spend(day(m, 24), eib, 65.75, "e-buy-now-pay-later--kitchen-accessories", "Kitchen accessories");
    const remit = day(m, 5);
    if (remit) {
      await createTransaction(db, {
        type: "transfer",
        date: remit,
        accountId: salary,
        toAccountId: esaf,
        amount: aed(1000),
        feeAmount: aed(15),
        note: "Remittance home",
      });
    }
    const cardPay = day(m, 27);
    if (cardPay) await createTransaction(db, { type: "transfer", date: cardPay, accountId: salary, toAccountId: mashreq, amount: aed(1200), note: "Card payment" });
  }

  // Personal loan EMI: 48 monthly transfers, the first 16 already paid.
  await createTransaction(db, {
    type: "transfer",
    date: addMonths(monthStartOf(today), -15, 27),
    accountId: salary,
    toAccountId: loan,
    amount: aed(2491) * 48,
    schedule: { mode: "installment", count: 48, frequency: "monthly" },
    note: "Monthly EMI",
  });

  await createTransaction(db, {
    type: "transfer",
    date: day(1, 15) ?? today,
    accountId: esaf,
    toAccountId: sib,
    amount: toMinor(32000, 2),
    note: "RD amount transfer",
  });
  await createTransaction(db, {
    type: "adjustment",
    date: day(2, 1) ?? today,
    accountId: funds,
    amount: toMinor(8400, 2),
    note: "Market value update",
  });
  return true;
}
