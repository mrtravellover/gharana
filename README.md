# Gharana Ledger — Gold & Silver Loan Register

## Folder structure

```
gold-loan-app/
├── index.html          ← login page (stays at root)
├── robots.txt           ← blocks search engines from indexing this private tool
├── firestore.rules
├── css/style.css
├── js/                  ← all shared logic
└── pages/                ← every other screen lives here
    ├── dashboard.html
    ├── customers.html
    ├── customer-profile.html
    ├── loan-create.html
    ├── loan-detail.html
    ├── loans.html
    └── reports.html
```

Core version (Phase 1). Covers: customers, ornament entry (with Haali/Paat
silver auto-category), loan creation, multiple disbursements per loan with
per-disbursement interest, payments, and the release → return-photo → closed
workflow. Reports, WhatsApp/SMS reminders, printable slips, and Android are
Phase 2 — not built yet.

**Fixed:** a flash of raw, unstyled text (e.g. customer name overlapping the
page title) that could briefly appear on slow connections before the sidebar
and layout finished loading. There's now a proper "Loading Gharana Ledger…"
screen instead, and the page content stays hidden until it's fully wrapped
in the app layout.

## 1. Create your Firebase project (10 min)

1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `shah-gold-loans`).
2. **Build → Authentication** → Get started → enable **Email/Password**.
   Then **Users → Add user** — create one login for yourself and one for your father.
3. **Build → Firestore Database** → Create database → **Start in production mode** → pick a region close to India (e.g. `asia-south1`).
4. **Build → Storage** → Get started (used for all photos — customer, loan, disbursement, return).
5. **Project settings (gear icon) → General → Your apps → Web (</>)** → register an app (no hosting needed) → copy the `firebaseConfig` object.
6. Paste those values into `js/firebase-config.js` in this project, replacing the `PASTE_...` placeholders.
7. **Firestore → Rules tab** → paste the contents of `firestore.rules` (in this folder) → Publish.
   This restricts all data to signed-in users only — i.e. you and your father.
8. **Storage → Rules tab** → paste the contents of `storage.rules` (in this folder) → Publish.
   **This step is important** — without it, Storage defaults to denying every read/write, which is exactly why photo uploads can hang or silently fail (customer creation "just loading" when you take a photo, etc.). If you've already deployed and photos aren't saving, this is almost certainly why — go set this now.

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
- **Months** are rounded **up** — any part of a month started counts as a full month, minimum 1 month (matches your 30-day sarafa convention). Kept for 1 day → charged 1 month. Kept for 45 days → charged 2 months. This lives in `js/interest.js` as `ROUND_MODE = "roundup"` — change it to `"exact"` there if you ever want daily pro-rating instead. The breakdown table shows the exact day count next to the months actually charged, so it's easy to check by hand.
- Each disbursement is tracked independently, with its own rate and its own running principal — then summed for the combined loan total.

**Payment waterfall** — every payment (whatever type you label it) is applied automatically:
1. It clears any interest owed first.
2. Anything left over reduces the principal.
3. From that point on, interest on the reduced principal is counted fresh from the **payment date** — shown in the breakdown as "Interest counted from." The **original disbursement date** is always kept too, so you can still see when the money first went out.

If one payment is large enough to cover more than one disbursement, it settles the oldest disbursement first before moving to the next.

The "Payment type" dropdown (interest / partial principal / full closure) is just a label for your own records — it doesn't change how the money is applied; the waterfall rule above always runs the same way.

## What's built (Phase 1 — core)

- Customer add/search/profile
- Loan creation with multiple ornaments (Gold/Silver, weight, qty, purity)
- Silver Haali (<75 purity) / Paat (≥75) auto-category with manual override
- **One locker note per loan** — a single note for the whole pledged package (e.g. "Blue pack, white bag, tag #3"), not repeated on every item. Click "Locker note" above the ornaments table to add or edit it.
- **Ornament belongs to: Self or someone else** — when a relative's item is pledged under a customer's account (e.g. Ramesh's item under Suresh's account), pick "Someone else" and enter their name, mobile, Aadhaar, and address; it's recorded and shown everywhere as "Ramesh In Suresh's Account" along with those details
- **Edit customer details anytime** — name, mobile number, Aadhaar, and address can all be updated from the customer's profile page (click "Edit" next to their name). If the name changes, every loan already recorded for that customer updates to match automatically.
- **Account status: Active / On hold / Closed** — shown as a colored dot next to each customer in the list (green = active, yellow = on hold, red = closed). Closing or holding an account always asks for a remark first, and nothing is ever deleted — closed accounts can be reactivated anytime, and the full history of status changes (with remarks) is kept on the customer's profile.
- **Customer notes, editable anytime** — set at customer creation or edit later from the customer's profile page (e.g. "Ask customer to clear Shah Jewellers due")
- **Live in-page camera capture** — every photo field opens an actual camera preview inside the app with a "📸 Capture" button (not the phone's file picker). You see the live feed, tap capture, and can retake before confirming. Falls back to a normal file picker automatically if camera access is denied or unavailable (e.g. testing on a desktop without a webcam). All photos — captured or picked from a gallery — are automatically resized/compressed before upload so they stay fast on a phone connection.
- **Payment is mandatory to close a loan** — if there's still a balance due when you hit "Capture return photo & close," the app shows the exact amount, records it as a payment automatically (so it correctly shows up in Reports as money collected), and only then closes the loan. The return photo itself stays optional.
- **Photos at four points**: customer profile (with a "📷 Retake" option anytime), when a new loan is created, when a disbursement is made, and when jewellery is finally handed back (optional — closing the loan doesn't require a photo, but does require the balance to be cleared)
- **Change interest rate mid-loan** — e.g. lent at 2%, but you want to charge 2.5% at collection. Every disbursement card has a "Change rate →" button, and it's also right inside the "Mark ready to release" and "Add payment" screens, so you can adjust it at the exact moment you're collecting money — no need to go hunting for it. Interest already counted at the old rate is locked in, and only interest after your chosen effective date uses the new rate.
- **Simple or compounding interest — monthly or annually** — pick per disbursement. Compounding (monthly) compounds every month; Compounding (annually) accrues simple interest monthly but only folds it into the principal once every 12 months. Changeable later from the same rate-change screen.
- **Release a single item mid-loan** — e.g. customer pledged 4 items for ₹1,00,000 and wants to take back just 1 by paying its share of interest + ₹25,000 principal. Each ornament row has a "Release item" button — enter what they paid, and it flows through the same interest-first waterfall; the loan stays active for the rest
- Multiple disbursements per loan, each with its own date and rate
- Per-disbursement + combined interest breakdown, with day count next to the minimum-month charge
- Payment waterfall: interest first, then principal, with the interest clock resetting from the payment date
- **Search by item name** — the Loans list and each customer's profile can be searched by ornament name (e.g. "chain", "kada"), not just loan number or customer name
- Release workflow: Active → Ready to release → (photo capture) → Closed
- **Dashboard "Ready to release" list** — loans waiting for physical return show up right on the dashboard with the locker note and, if there's still a balance, a clear "Payment due" amount — so you know exactly what to collect and which item to pull, without opening each loan
- **Ready-to-release confirmation** — before moving a loan to "ready to release," you see principal, interest, and the **real duration** for each disbursement clearly (e.g. "9 months, 22 days") next to what it's actually charged as under the minimum-month rule (e.g. "10 months (min. rule)") — not just a rounded number with no explanation. You can close this screen anytime without acting on it (Cancel or ✕), then choose to record the payment first or move it to release anyway with the due amount tracked and shown until it's settled.
- **Give a new loan again on a "ready to release" mortgage** — if the customer needs money again on the same package before you've physically handed it back, just use "+ Add disbursement" on that loan; it automatically moves back to Active
- Dashboard with active loan count, principal outstanding, interest accrued, today's collections
- **Reports** page — money in (collections), money out (disbursements), and interest earned, viewable month-by-month or year-by-year, each period's transactions listed with loan/customer detail, plus a compare chart across recent periods

## Suggested Phase 2 (once Phase 1 is tested in daily use)

- Gold vs silver / Haali vs Paat summary reports
- Printable receipt / PDF loan slip
- WhatsApp/SMS due reminders
- Excel export/backup
- Village-wise and Aadhaar search filters on the customer list
- Audit trail (who changed what)
- Android wrapper (like your rate-board app)
