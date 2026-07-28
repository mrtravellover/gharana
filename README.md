# Gharana Ledger — Gold & Silver Loan Register

Core version (Phase 1). Covers: customers, ornament entry (with Haali/Paat
silver auto-category), loan creation, multiple disbursements per loan with
per-disbursement interest, payments, and the release → return-photo → closed
workflow. Reports, WhatsApp/SMS reminders, printable slips, and Android are
Phase 2 — not built yet.

## 1. Create your Firebase project (10 min)

1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `shah-gold-loans`).
2. **Build → Authentication** → Get started → enable **Email/Password**.
   Then **Users → Add user** — create one login for yourself and one for your father.
3. **Build → Firestore Database** → Create database → **Start in production mode** → pick a region close to India (e.g. `asia-south1`).
4. **Build → Storage** → Get started (keep default rules for now — used for return photos).
5. **Project settings (gear icon) → General → Your apps → Web (</>)** → register an app (no hosting needed) → copy the `firebaseConfig` object.
6. Paste those values into `js/firebase-config.js` in this project, replacing the `PASTE_...` placeholders.
7. **Firestore → Rules tab** → paste the contents of `firestore.rules` (in this folder) → Publish.
   This restricts all data to signed-in users only — i.e. you and your father.

## 2. Run it locally to test

Any static file server works, e.g. with Node installed:
```
npx serve .
```
Then open the printed `localhost` URL. Log in with the account you created in step 2.

## 3. Deploy (your usual Vercel workflow)

Push this folder to a GitHub repo → import into Vercel as a static site
(no build command needed, output directory = `/`). Same flow as your other projects.

## How the interest calculation works

Simple interest: `Principal × (monthly rate ÷ 100) × months`.
- **Rate** is typed in manually per disbursement — it varies by customer, as you described.
- **Months** are rounded **up** — any part of a month started counts as a full month (matches your 30-day sarafa convention). This lives in `js/interest.js` as `ROUND_MODE = "roundup"` — change it to `"exact"` there if you ever want daily pro-rating instead.
- Each disbursement is calculated independently from its own date, then summed for the loan total — exactly as you described (per-disbursement + combined view).

**Known simplification (flagging honestly):** interest for each disbursement is currently calculated on its *original* amount from its date to today, and any principal repayments just reduce the outstanding balance shown — they don't yet re-run interest on a *reduced* principal for the period after a partial payment. For most day-to-day use (interest-only payments, or paying off the full balance) this is exactly right. If you regularly make partial principal payments mid-loan and expect interest to shift after that specific payment date, tell me and I'll add that refinement next.

## What's built (Phase 1 — core)

- Customer add/search/profile
- Loan creation with multiple ornaments (Gold/Silver, weight, qty, purity)
- Silver Haali (<75 purity) / Paat (≥75) auto-category with manual override
- Multiple disbursements per loan, each with its own date and rate
- Per-disbursement + combined interest breakdown, shown live
- Payments: interest-only / partial principal / full closure
- Release workflow: Active → Ready to release → (photo capture) → Closed
- Dashboard with active loan count, principal outstanding, interest accrued, today's collections

## Suggested Phase 2 (once Phase 1 is tested in daily use)

- Reports screen (gold vs silver summary, Haali vs Paat, date-range collections, customer ledger export)
- Printable receipt / PDF loan slip
- WhatsApp/SMS due reminders
- Excel export/backup
- Village-wise and Aadhaar search filters on the customer list
- Audit trail (who changed what)
- Android wrapper (like your rate-board app)
