# Gharana — Mortgage Management

## Security — what's protected, what isn't

**What's actually protecting your data:**
- Nothing is visible without login — Firestore and Storage rules both require sign-in for any read/write, and `robots.txt` keeps search engines from listing the site.
- Passwords are hashed and managed by Google's own infrastructure (Firebase Auth) — never stored in plain text.
- All traffic runs over HTTPS (enforced by both Vercel and Firebase).
- The `apiKey` visible in `js/firebase-config.js` is not a secret — it just identifies which Firebase project to talk to. The real protection is the security rules above, not hiding this value.

**Known gaps, being honest about them:**
1. **Both logins have equal, total access** — no separation between what you and your father can see or do, and no per-record restriction. If either password leaks, the attacker has full access to everything: every customer's Aadhaar, every loan, every photo.
2. **No two-factor authentication is set up** — currently just email + password. Firebase supports 2FA (SMS or authenticator app) if this is ever wanted.
3. **A stolen, already-logged-in phone or laptop is a real risk** — Firebase sessions stay logged in by default, so physical device security matters as much as password strength.
4. **No automatic backups exist** — if data is deleted (by mistake, by Reset Whole Panel, or by someone with valid access), there's currently no automatic recovery. Firestore supports scheduled exports, but that needs separate setup.
5. **Business logic (interest calculation, payment waterfall) only runs in the browser** — someone with valid login credentials and enough technical knowledge could edit numbers directly through Firebase's own console, bypassing the app's rules entirely. This only matters as an insider-tampering risk, not a stranger-hacker risk.

**Recommended, in order of value for the effort:**
- Use strong, unique passwords for both logins — the single biggest lever available right now.
- Consider enabling 2FA.
- Periodically export a full backup (not yet built — a "download full backup" button on the Profile page, separate from the CSV export, would be the natural way to add this).
- Avoid leaving the app logged in on a phone that could be lost or borrowed.

## Folder structure

```
gharana/
├── index.html          ← login page (stays at root)
├── 404.html              ← custom error page
├── robots.txt            ← blocks search engines from indexing this private tool
├── firestore.rules
├── storage.rules
├── favicon.svg
├── assets/                ← logo files
│   ├── logo-navy.png       (navy logo, transparent — light backgrounds)
│   ├── logo-white.png      (white logo, transparent — dark backgrounds)
│   ├── logo-navy-bg.png    (navy background version)
│   └── logo-white-bg.png   (white background version)
├── css/style.css
├── js/                  ← all shared logic
└── pages/                ← every other screen lives here
    ├── dashboard.html
    ├── customers.html
    ├── customer-profile.html
    ├── loan-create.html
    ├── loan-detail.html
    ├── loans.html
    ├── reports.html
    └── profile.html
```

## Branding

- **Name:** Gharana &nbsp; **Tagline:** Mortgage Management
- **Colors** (set in `css/style.css` under `:root`):

| Purpose | Color | Hex |
|---|---|---|
| Primary | Deep Navy | `#0B2A5B` |
| Secondary | Royal Blue | `#184A8C` |
| Accent | Premium Gold | `#D4A017` |
| Background | Off White | `#F8FAFC` |
| Card | White | `#FFFFFF` |
| Success | Emerald | `#10B981` |
| Warning | Orange | `#F59E0B` |
| Error | Red | `#EF4444` |
| Text | Dark Slate | `#1E293B` |
| Secondary Text | Gray | `#64748B` |

Primary Navy is used for buttons, the sidebar, and login screen. Gold is reserved as an accent — badges, highlighted totals, the active nav indicator — rather than the main button color, to keep it feeling premium instead of overused. The logo (all four versions) lives in `assets/`; the sidebar uses the white version (dark background), the login screen uses the navy version (white card).

Core version (Phase 1). Covers: customers, ornament entry (with Haali/Paat
silver auto-category), loan creation, multiple disbursements per loan with
per-disbursement interest, payments, and the release → return-photo → closed
workflow. Reports, WhatsApp/SMS reminders, printable slips, and Android are
Phase 2 — not built yet.

**Fixed:** a flash of raw, unstyled text (e.g. customer name overlapping the
page title) that could briefly appear on slow connections before the sidebar
and layout finished loading. There's now a proper loading spinner
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
- **Months** are rounded **up only for the loan's first disbursement** — any part of a month started on it counts as a full month, minimum 1 month (matches your 30-day sarafa convention). Kept for 1 day → charged 1 month. Kept for 45 days → charged 2 months. Every disbursement **after** the first one (a top-up, a re-lend on a released mortgage, etc.) is charged for the **exact days it was actually held** instead — no rounding, no minimum. Example: ₹10,000 given 1 Jan + ₹2,000 given 25 Jan, customer settles everything 31 Jan → the ₹10,000 gets 1 full month (30 days), the ₹2,000 gets exact interest for its 6 days. This lives in `js/interest.js` — the first disbursement's rounding mode is set via `ROUND_MODE = "roundup"` (change to `"exact"` to remove the minimum entirely). The breakdown table shows the exact day count next to what's actually charged, so it's easy to check by hand.
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
- **Save as draft** — if a customer walks in while you're mid-way through filling out a new loan, hit "💾 Save as draft" and everything typed so far (customer, ornaments, amounts, everything except photos) is saved. It shows up at the top of the New Loan page next time as a card you can "Continue" or "Delete." Saving again while continuing a draft updates the same one instead of creating a duplicate.
- Silver Haali (<75 purity) / Paat (≥75) auto-category with manual override
- **One locker note per loan** — a single note for the whole pledged package (e.g. "Blue pack, white bag, tag #3"), not repeated on every item. Click "Locker note" above the ornaments table to add or edit it.
- **Ornament belongs to: Self or someone else** — when a relative's item is pledged under a customer's account (e.g. Ramesh's item under Suresh's account), pick "Someone else" and enter their name, mobile, Aadhaar, and address; it's recorded and shown everywhere as "Ramesh In Suresh's Account" along with those details
- **Edit an ornament's details anytime while it's kept** — weight, item name, metal, purity/category can all be corrected from the loan page (e.g. re-weighed, a typo, purity re-checked). Every edit is logged in Activity with what changed and why, so there's always a record.
- **Locker note visible everywhere loans are listed** — not just on the Ready-to-release screen; it now shows in the main Loans list (any status) and on each customer's profile loan list too, so you don't have to open a loan just to see which bag/pack it's in.
- **Edit customer details anytime** — name, mobile number, Aadhaar, and address can all be updated from the customer's profile page (click "Edit" next to their name). If the name changes, every loan already recorded for that customer updates to match automatically.
- **Profile page** — accessed from a small icon in the top-right corner on mobile (not in the bottom nav, since it's not a daily-use screen), or next to "Signed in as / Sign out" in the sidebar on laptop/desktop. Shows who's signed in, plus a "Danger zone" with **Reset whole panel**: requires your password, then a mandatory 10-second countdown with a clear disclaimer of what gets deleted, then your password again, before it permanently wipes every customer, loan, ornament, disbursement, payment, activity log, draft, and photo. Your login accounts are never touched — you can sign back in with the same email and password into a completely empty app.
- **Language selector** — on the Profile page: English, Hindi, Gujarati, or Marathi. Translates the navigation menu, sidebar, and login screen right now. Being upfront about scope: fully translating every field across all the loan/customer forms and reports would mean several hundred more strings — this covers what you see on every screen first. Say the word if you want the rest translated too.
- **Account status: Active / On hold / Closed** — shown as a colored dot next to each customer in the list (green = active, yellow = on hold, red = closed). Closing or holding an account always asks for a remark first, and nothing is ever deleted — closed accounts can be reactivated anytime, and the full history of status changes (with remarks) is kept on the customer's profile.
- **Customer notes, editable anytime** — set at customer creation or edit later from the customer's profile page (e.g. "Ask customer to clear dues")
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
- **Reports** page — money in (collections), money out (disbursements), and interest earned, viewable **Today / Monthly / Quarterly / Half-yearly / Yearly**, with a "Compare periods" card showing the current period against the previous two side by side (e.g. this month vs last month vs the month before that, or this year vs last year vs the year before that), a trend chart, per-period transaction detail, and a Gold vs Silver / Haali vs Paat metal summary for everything currently in the locker

## Finishing touches

- **Favicon** — a gold-coin mark (`favicon.svg`) shows in the browser tab and on phone home screens if the site is added there
- **Custom 404 page** — `404.html` at the root; Vercel automatically serves this for any broken/unknown link, matching the app's look instead of a blank error
- **Smoother loading** — a small spinner now shows while the page loads instead of raw text, and content fades in once ready (no more flash of unstyled content)
- **Responsive pass** — tables scroll horizontally on phones instead of squeezing or clipping, form inputs use 16px text on mobile (stops iOS Safari from auto-zooming when you tap a field), modals fit narrow screens properly, and buttons/cards/menus have subtle transitions instead of snapping instantly
- Confirmed layout holds up from small phones through tablets to full laptop/desktop widths

## Phase 2 — done

- ✅ Gold vs Silver / Haali vs Paat summary — on the Reports page
- ✅ Printable loan receipt — "🖨 Print receipt" button on any loan, opens the browser print dialog with a clean paper-style layout (items, disbursements, totals, signature lines)
- ✅ WhatsApp reminders — "💬 WhatsApp reminder" button on any loan opens WhatsApp with a pre-filled message (principal, interest, total due) to the customer's saved mobile number
- ✅ Excel/CSV export — "⬇ Export CSV" on the Loans page downloads every loan's key figures, opens directly in Excel
- ✅ Village-wise and Aadhaar search — already built into the Customers search bar (searches name, mobile, Aadhaar, and address/village together)
- ✅ Audit trail — every disbursement, payment, rate change, item release, ready-to-release move, and closure is logged with who did it and when, shown in an "Activity" section on each loan page
- ✅ Multi-period report comparison (today/month/quarter/half-year/year, current vs previous two) — see Reports above

## Still remaining (needs infrastructure beyond this web app)

- **Android wrapper** — like your rate-board app; a separate Android Studio project, not part of this web app
- **SMS reminders** — WhatsApp reminders are free (open WhatsApp with a message), but SMS needs a paid gateway (e.g. Twilio, MSG91) with its own account and API keys — tell me if you want this wired in once you've picked a provider
