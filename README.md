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
- **Receipt scanning:** in Confirm purchase, photograph the till receipt. Claude (through Vercel AI Gateway) reads
  the store, date, total and lines; GPA fills in the purchase and can update that store's prices from it.
- **Bill reminders:** repeating payments and installments wait to be confirmed as paid (Transactions → Bills), with
  a morning push notification on devices that turn it on (My account).
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

### People and access

Up to **5 people** sign in with their own username and password: the owner plus 4 more. The first visit creates
the owner, so do that before the app is reachable by anyone else. Devices stay signed in for 60 days.

| Access | What they can do |
|---|---|
| **Read** | See their chosen accounts, those accounts' transactions, and reports. Change nothing. |
| **Write** | Also add, edit and delete transactions on their accounts, import statements into them, and use grocery lists, prices and offers. |
| **Admin** | Everything, on every account: people, accounts, categories, currencies, rules and settings. |

- **Settings → People & access** (admins): add a person, pick Read, Write or Admin, and choose their accounts or
  "All accounts, including new ones". You can also edit them, set a new password, sign them out or remove them.
  Changing someone's access signs them out, so the change applies at once.
- **Totals follow access.** Home, net worth, stats, debts, budget and the CSV export only count the accounts a
  person can see. A transfer between one of their accounts and a hidden one shows their side only, and they can't
  edit it. Grocery lists, the catalogue, prices and offers are shared by everyone.
- **Settings → My account** (everyone): change your password (your other devices are signed out), or sign out
  your other devices. Admins can also sign everyone out.
- **The owner** is always an admin and can't be removed. Only the owner can reset the owner's password.
- **How it's protected:**
  - Passwords are stored only as scrypt hashes.
  - Sessions are HMAC-signed, HTTP-only cookies, marked Secure over HTTPS.
  - Every page, data download and Server Action checks the session, the role and the accounts on the server. The
    UI only hides what a person can't use.
  - Wrong passwords lock that username for 30 seconds after 5 misses, doubling up to 15 minutes.
- **Forgot the owner password?** Run this on the machine that holds the database (stop the app first when using
  the embedded database). Anyone else asks an admin for a new password.

  ```sh
  GPA_NEW_PASSWORD='a new long password' npm run owner:reset
  ```

- **Exposing it to the internet:** use HTTPS and long passwords.

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
- `packages/db` also covers people and access: one-time owner setup, password hashing, session signing, expiry,
  tampering and revocation, the 5-person limit, roles, and every report limited to a person's accounts.
- `apps/web`: unit tests for the amount calculator. The Playwright end-to-end suite first creates the owner,
  then walks the app as a new user would: accounts, expense, cross-currency transfer, installments, basket purchase, statement import twice, PDF
  publish, stats, categories, CSV export, the install manifest and icons, the service worker and the offline page. A final group checks that
  a signed-out browser, a forged cookie and a Server Action without a session can't reach any data; that a Write
  member sees only their accounts and no admin settings; that a Read member can't change anything; the 5-person
  limit; and that changing a password signs other devices out.

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
- **Hosted extras and what they need:**
  - Receipt scanning: AI Gateway (OIDC on Vercel, or `AI_GATEWAY_API_KEY`). Vercel asks for a card on file before
    it serves AI requests. `GPA_RECEIPT_MODEL` picks another model.
  - Notifications: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`).
  - Daily job (`apps/web/vercel.json`, 09:00 Dubai): sends reminders and makes the weekly backup. It requires
    `CRON_SECRET`.
  - Automatic backups: a private Vercel Blob store (`BLOB_READ_WRITE_TOKEN`). The last 8 are kept, and they can be
    downloaded or restored from Settings → Backup & restore.
- **Back up regularly:** Settings → Backup & restore (admins) downloads everything as one `.json.gz` file. It
  covers accounts, transactions, budgets, people (with scrambled passwords) and grocery data; flyer PDF files are
  left out. The owner can restore a backup there: it replaces everything in one transaction (nothing changes if it
  fails) and signs everyone out. `pg_dump`, or copying `apps/web/.data/pglite` while the app is stopped, also work.
