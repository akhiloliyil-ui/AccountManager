# GPA — Grocery Planner & Money Manager

One app for weekly grocery planning and complete personal finances in AED, INR and any other currency.

- **Money manager** (modelled on Money Manager's flows): income, expense and transfer entry with categories and
  subcategories, a calculator amount field, transfer fees, cross-currency transfers that record the amount actually
  received, and repeating or installment transactions (Rep/Inst). Views are Daily, Calendar and Monthly, with
  filters and search.
- **Accounts:** Money Manager's account groups (Cash, Accounts, Card, Debit Card, Savings, Investments, Loan,
  Friends…) and accounts in any currency. Each account shows its running balance, credit limit or loan principal,
  and an archive and include-in-totals switch.
- **Net worth:** assets, liabilities and total in the base currency, with a 12-month trend.
- **Debts:** loans, cards and overdrafts with repayment progress and upcoming EMIs, plus money lent to friends.
- **Investments:** record market value updates. These are adjustments, so they change net worth without counting
  as income.
- **Stats:** a category donut with drill-down into subcategories for any week, month or year, and 12 months of
  income versus expenses.
- **Bank statement import:** CSV, `.xlsx` and `.xls`. Columns, the header row and the date order (DMY or MDY) are
  detected automatically. Categories come from rules or from what you chose before for the same merchant. Lines
  can be booked as transfers between your own accounts. Duplicates are fingerprinted, so re-importing a file is
  harmless, and every import can be undone.
- **Grocery planner:** weekly, monthly and saved lists, a store comparison with offers applied, and the cheapest
  single store or two-store split.
- **Promotion PDF upload and review:** GPA reads the flyer's text and proposes offers, matched to catalogue
  products. You correct them or add lines by hand, then publish into prices. Nothing goes live without review.
- **Basket to expense:** tick items while shopping, then "Confirm purchase" books them as one expense on the
  account you paid from, with the receipt amount and the planned estimate kept for comparison. The grocery budget
  counts real ledger spending. Deleting that expense puts the items back on the list.
- **Installable app:** add GPA to your phone's home screen or your computer's dock. It opens full screen, has
  shortcuts (add a transaction, this week's list, import), and shows an offline page instead of a browser error.
- **Exchange rates online (optional):** one switch keeps AED, INR and other rates current from a free daily
  source, or press "Update now". Off by default.

Everything is stored in **PostgreSQL**. This project is fully standalone: its own repository folder, packages,
database name, Docker volume and port. It shares nothing with other apps.

## Run it

Requires Node 22 (`nvm use`).

```sh
npm install
npm run dev            # http://localhost:3000
```

With no configuration the app uses **embedded PostgreSQL (PGlite)**, kept in `apps/web/.data/pglite`. The schema
is migrated and starter data seeded automatically: currencies, account groups, categories, merchant rules and a
sample grocery catalogue. To explore with demo data on an empty database:

```sh
npm run db:seed-demo   # salary, cards, NRI rupee accounts, a loan, investments, 3 months of transactions
```

### Use a PostgreSQL server

```sh
docker compose up -d                                        # postgres:18 on port 5434
cp .env.example apps/web/.env.local                         # then set:
# DATABASE_URL=postgres://gpa:gpa@localhost:5434/gpa_money
npm run db:migrate                                          # optional: the app also migrates on start
npm run build && npm start
```

Any PostgreSQL 14+ works (Neon, RDS, Supabase…). Migrations run under an advisory lock, so several app
instances can start together. Set `TZ` (for example `Asia/Dubai`) so "today", this week and this month match
your household.

### Passcode

GPA is protected by **one passcode for the household**. The first visit asks you to create it, so set it before
the app is reachable by anyone else. Devices stay signed in for 60 days.

- **Settings → Passcode & sign-in:** change the passcode (this signs out every other device), sign out other
  devices if a phone is lost, or sign out.
- **How it's protected:**
  - The passcode is stored only as a scrypt hash.
  - Sessions are HMAC-signed, HTTP-only cookies, marked Secure over HTTPS.
  - Every page, data download and Server Action checks the session on the server.
  - Wrong guesses lock sign-in for 30 seconds after 5 misses, doubling up to 15 minutes.
- **Reset the passcode** if it's forgotten. Run this on the machine that holds the database (stop the app first
  when using the embedded database). The next visit asks for a new passcode:

  ```sh
  npm run passcode:reset
  ```

- **Exposing it to the internet:** use HTTPS and a long passcode. It's a single shared passcode, not per-person
  accounts.

### Install it on your phone

Settings shows an **Install GPA** card with the right steps for your device: an Install button in Chrome and Edge,
or Share → **Add to Home Screen** in Safari on iPhone.

- **Chrome and Android need HTTPS.** They only install apps (and run the offline page) on a secure address, or on
  `localhost` on the same computer. To install on a phone from the computer running GPA, put it behind HTTPS (for
  example a reverse proxy with a certificate, or a private tunnel such as Tailscale Serve). iPhone's Add to Home
  Screen works over plain HTTP on your home network: `npm run build && npm start -- -H 0.0.0.0`, then open
  `http://<computer's LAN IP>:3000` in Safari.
- **Nothing financial is cached on the device.** The service worker caches only the app's build files and the
  offline page, so balances shown are always the server's current ones.

## Test

```sh
npm test               # unit + database integration tests (no server needed)
npm run e2e            # production build + browser tests in your installed Google Chrome
```

- `packages/core`: money and currency maths, ledger balances, net worth, stats, installment schedules, the CSV
  parser and column/date detection, duplicate fingerprints, auto-categorisation, and the flyer text parser.
- `packages/db`: every service against a real in-memory PostgreSQL (PGlite). Covers online exchange rates (with a
  fake network: updates, failures, base-currency changes and back-off), migrations, transfers with
  fees, installments, revaluation, net worth after a base-currency change, debts, statement import and undo
  (including a real `.xlsx` workbook), the PDF pipeline on a real PDF, and basket-to-expense, including releasing
  items when the expense is deleted.
- `packages/db` also covers the passcode: hashing, one-time setup, session signing, expiry and tampering, signing
  devices out, and the sign-in throttle.
- `apps/web`: unit tests for the amount calculator. The Playwright end-to-end suite first creates the passcode,
  then walks the app as a new user would: accounts, expense, cross-currency transfer, installments, basket purchase, statement import twice, PDF
  publish, stats, categories, CSV export, the install manifest and icons, the service worker and the offline page. A final group checks that
  a signed-out browser, a forged cookie and a Server Action without a session can't reach any data, and that
  changing the passcode signs other devices out.

## Structure

```
packages/core   pure TypeScript domain logic, no I/O
packages/db     Drizzle schema + SQL migrations, PGlite/pg client, services, seed data, file readers
apps/web        Next.js 16 app (Server Components + Server Actions), mobile-first UI
```

To change the schema, edit `packages/db/src/schema.ts`, then run `npm run db:generate`. That writes SQL to
`packages/db/drizzle/` and bundles it into `src/migrations.gen.ts`, which the app applies on start.

## Notes and limits

- **Exchange rates:** you type them in Settings → Currencies, or switch on **Update rates online**. That fetches
  ExchangeRate-API's free daily rates (https://open.er-api.com, no key needed) at most twice a day, after a page
  has been served, so a slow or offline connection never delays the app. Currencies it doesn't list keep your
  rate. With the switch off, GPA makes no network calls. Totals in the base currency use current rates.
  Cross-currency transfers keep the amount actually received.
- **PDF reading uses the flyer's text layer.** Many supermarket flyers are images; for those the review screen
  says so, and you add offers by hand. OCR or AI extraction can slot into `createPdfImport` later.
- **The grocery catalogue's sample prices are illustrative** until replaced. You can record shelf prices on any
  product page or publish reviewed PDFs.
- **Old binary `.xls` and `.xlsx` are read with SheetJS** (installed from its official CDN, as SheetJS
  recommends).
- **Uploads are limited to 15 MB.** Serverless hosts with smaller request limits (Vercel: 4.5 MB) would need
  direct-to-storage uploads.
- **Back up regularly:** use `pg_dump`, or copy `apps/web/.data/pglite` while the app is stopped. Settings →
  Export transactions gives a CSV of everything.
