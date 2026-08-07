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
- **Interest uses the real calendar (365/366-day) method** — Principal × annual rate (monthly rate × 12) × the exact fraction of a real year elapsed, using 365 days in a normal year and 366 in a leap year (correctly split if a period crosses a leap-year boundary). This is now **one consistent method for every disbursement on every loan** — first disbursement, top-ups, re-lends, all identical — and it applies **retroactively**: today's interest-due figure on every loan, active or otherwise, is computed this way. A **minimum of 1 month's interest** (Principal × monthly rate%) always applies once any time has passed, however short — kept for 1 day still owes 1 month's interest. Above that floor, interest is exact to the day, with no rounding to whole months. This lives in `js/interest.js` (`periodInterest()` / `yearFraction()`); the breakdown table shows the exact day count next to a note on whether the minimum kicked in, so it's easy to check by hand.
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

- **Favicon** — the Gharana "G" mark, generated as a proper multi-size icon set (`favicon.ico`, 16×16, 32×32, Apple touch icon, Android Chrome icons) plus `site.webmanifest` so it looks sharp in the browser tab and works correctly if the site is added to a phone's home screen
- **Custom 404 page** — `404.html` at the root; Vercel automatically serves this for any broken/unknown link, matching the app's look instead of a blank error
- **Smoother loading** — a small spinner now shows while the page loads instead of raw text, and content fades in once ready (no more flash of unstyled content)
- **Responsive pass** — tables scroll horizontally on phones instead of squeezing or clipping, form inputs use 16px text on mobile (stops iOS Safari from auto-zooming when you tap a field), modals fit narrow screens properly, and buttons/cards/menus have subtle transitions instead of snapping instantly
- Confirmed layout holds up from small phones through tablets to full laptop/desktop widths

## Phase 2 — done

- **Reports CSV exports** — three separate exports (Money out / Money in / Interest earned), each with date, loan number, and customer for every entry, matching the same UTF-8 BOM format the Loans page's export already uses (opens directly in Excel, no encoding issues). Defaults to the **complete history**; check "Export only the currently selected period" to instead export just the month/quarter/half-year/year currently picked via the existing period tabs and dropdown above it — reuses that same sorting mechanism rather than adding a separate picker. Interest earned pulls from the same payment records as Money in, filtered to just the interest portion of each payment.

- **Reports page rebuilt to scale to hundreds/thousands of loans, and to cost far less** — the old version fetched *every* loan's *entire* disbursement and payment history on every single visit to the page, regardless of which period you were actually looking at. With a handful of test loans that's invisible; with 1,000+ real loans it's potentially tens of thousands of Firestore document reads every time someone opens Reports — and Firestore bills per read, so this was a genuine cost problem, not just a speed one.
  - Now it only loads however far back the **currently selected period tab** actually needs (e.g. viewing "Today" only needs the last ~45 days; switching to "Yearly" pulls in more). Loans with zero activity in that window are never touched at all.
  - A loan's interest/principal split for a given payment genuinely depends on that loan's *entire* prior history (the payment waterfall), so this couldn't just be a simple date-filtered query — instead, a lightweight **collection-group query** first cheaply discovers *which* loans had any activity in the window, and only *those* loans get their full history fetched and run through the existing calculation. Already-processed loans are cached in memory for the rest of your visit, so switching between period tabs never re-fetches the same loan twice.
  - **"Export complete history"** (the CSV default) is the one case that genuinely needs every record ever — it explicitly widens the loaded window all the way back before exporting, showing "Loading complete history…" on the button while it does, so this cost is only ever paid when you actually ask for it, not on every page visit.
  - **One-time setup required, same as the deposits/withdrawals feature earlier:** this uses collection-group queries with a date range filter on both `disbursements` and `payments`, which Firestore requires a manual index for the first time each is used. If Reports looks empty or incomplete after deploying this, open your browser's developer console — Firestore's error message includes a direct link that creates the exact index needed, one click each for `disbursements` and `payments`. After that one-time setup, both work automatically going forward.

- **Splash screen — login only** — shows only on `index.html` (the real entry point / app cold start) while it checks whether you're signed in. It only reveals itself if that check takes longer than 350ms — on a fast connection it's skipped entirely, no flash. Once inside the app, every other page (Dashboard, Loans, Customers, etc.) loads with just a quick, plain content fade — no splash, no overlay — since showing a full branded screen on every click was making normal navigation feel slower, not smoother. `pages/splash.html` still exists as a standalone, fully working reference version, but nothing in the app links to it.
- **Faster page-to-page navigation + native-app feel as a PWA** — a service worker (`sw.js`) now caches the app's own pages, CSS, and JS, so repeat visits and navigation load from cache almost instantly instead of re-downloading everything on every click. It self-updates in the background (fetches a fresh copy after serving the cached one) so it can never get permanently stuck on old code after an update — worst case, one extra reload before you see a change. Also opted into the browser's View Transitions API, which gives a smooth crossfade between pages in modern Chrome/Edge instead of a hard cut (harmlessly ignored in browsers that don't support it yet). Combined with the existing `site.webmanifest` (`display: standalone`), installing this as a PWA on a phone now hides the browser address bar and feels close to a native app. **Honest limit:** this is still a multi-page site, not a single-page app — true zero-flicker instant transitions would need a full SPA rewrite, a much bigger job than I think is worth it here; the service worker gets most of the real-world speed benefit without that risk.
- **Sidebar collapse toggle** (desktop/laptop) — a chevron button in the sidebar shrinks it to icon-only width, giving the page more room; your choice is remembered across pages and future visits. Also fixed a real bug where the sidebar would stop staying pinned ("end early") on any page taller than one screen — it was capped to exactly one viewport's height, which broke its ability to stick while scrolling; it now properly grows to match the page and stays in view the whole way down.
- **Gharana Assistant** — a floating chat widget (Dashboard, Customers, Loans, Customer Profile) for quick lookups without navigating anywhere. Read-only — never writes anything. Sits bottom-right (the dashboard's old "+ New Loan" FAB spot, now removed). Starts collapsed; on mobile it's a labeled pill button, on desktop/laptop it's just the bare owl icon with no button chrome — tap/click it to open the chat. Account lookups ("check account of...") now also show any surplus funds the customer has with you — remaining balance (highlighted so it's never confused with the original deposit amount) and interest if applicable — alongside their loans, not just loans. A customer with surplus funds but no open loans still shows their deposit info instead of being reported as having nothing on record.
  - **Project a real customer's account to a future date** — "Kavish till 31-08-2025", "Kavish till end of month", or just "Kavish till 31" all work, projecting their actual current loan principal and surplus deposits forward to that date using the real 365/366-day engine, so you can answer "what will they owe on the 31st" instantly. The card is clearly labeled "As of [date]" and notes that it assumes no payments happen between now and then, since those obviously can't be known in advance.
  - **Two-date range calculator** — the quick what-if calc ("10000 2.5 24-07-2025") now correctly supports a second date too ("10000 2.5 24-07-2025 to 31-08-2025") for interest between two specific dates, not just from a date to today. (Found and fixed a real bug while building this: the word "to" — as in "date A **to** date B" — was being mistaken for a typo of "today" by the typo-tolerance matching, silently swallowing the second date. Fixed by requiring an exact match for words 2 characters or shorter.)
- **Aadhaar numbers are encrypted at rest** — the one field in the app that's genuinely safe to encrypt without breaking anything, since it's never searched, sorted, or filtered by Firestore itself (only ever displayed back to a signed-in user). Uses AES-256-GCM via the browser's built-in Web Crypto API (`js/crypto.js`) — no external library. Applies to both the customer's own Aadhaar and a loan's "pledged by someone else" Aadhaar, including saved drafts. **Fully backward-compatible**: every existing customer/loan already in the database keeps working exactly as before — old plain-text values are detected and passed through unchanged, only newly-saved values get encrypted going forward. **Honest limits, worth understanding**: this protects against someone browsing the raw Firestore database directly (console access, an export, a leaked backup) or a future security-rules mistake — but since this is a static site with no backend server, the decryption key has to live in the client code itself (same situation as the Firebase config already being public), so it does *not* protect against someone who has the app's own source code. That's a real tradeoff of a serverless setup, not a bug — see the comment at the top of `js/crypto.js` for the full reasoning.

- **Loans without collateral (unsecured loans)** — the New Loan form no longer requires at least one ornament. A loan with zero ornaments is flagged everywhere it appears: a live warning while filling the form, a "⚠ No collateral" badge on the Loans list, and a prominent banner on that loan's detail page. Same interest rules as any other loan — this only removes the collateral, not the interest calculation. (`hasCollateral: true/false` on the loan document; existing loans from before this feature don't have this field set and are correctly left un-flagged rather than wrongly shown as unsecured.)

- **Customer surplus funds** — money a customer has left with you for safekeeping, tracked separately from their loans (this is money *you* owe *them*, the reverse of a loan). Lives on each customer's profile page under "💰 Surplus funds held." Interest is optional per deposit, since you said it varies — when it applies, it's a simple calculation on today's remaining balance (deliberately not recalculated period-by-period as the balance changes, by your choice, for simplicity). **Supports partial withdrawals**: deposit ₹2,00,000, withdraw ₹1,00,000, later withdraw another ₹5,000 — the remaining ₹95,000 stays correctly tracked, and you can keep withdrawing from the same deposit as many times as needed. Each withdrawal is recorded as either **"Giving it now"** (instant — reduces the balance immediately) or **"Need to bring it"** (pending — the balance only reduces once you actually mark it as given, so it still shows as held until then). The moment a withdrawal is marked pending, it appears on the **Dashboard's "💰 Funds to return" section**, right next to "Ready to release" — so if a customer has both a loan ready for release *and* cash they're waiting on, you see both together and don't forget to bring one without the other. **One-time setup required:** this dashboard section uses a Firestore *collection-group* query on the `withdrawals` subcollection (to find every pending withdrawal across every customer in one call, without looping through customers individually) — Firestore requires a manual index for this the first time it's used. If the section doesn't appear after marking a withdrawal as pending, open your browser's developer console; Firestore's error message includes a direct link that creates the exact index needed with one click. After that first time, it works automatically going forward.
  - **Real conversational understanding, entirely rule-based (no AI, no external API)** — parsing was rebuilt into a modular NLU pipeline in `js/owl-nlu/` (see its own README for the architecture: `numberParser` → `dateParser` → `entityExtractor` → `intentParser` → `responseGenerator`, plus `conversationMemory` and `interestCalculator`). It understands amount/rate/date **in any order**, with or without "%"; month-name dates ("24 Jul 2025"); relative dates ("today"/"aaj"/"आज"/"આજે"); durations ("interest for 150 days"); **English, Hindi, Gujarati, and Hinglish** ("50000 ka byaaj", "વ્યાજ બતાવો"); common typos ("intrest", "byaj", "todya"); and **remembers a partial conversation across turns** — send "10000", it asks for the rate, send "2.5", it asks for the date, never re-asking for what it already has. Shows an "I understood: Principal / Rate / From / To" confirmation before calculating.
  - **Account/customer lookups** — type a customer's name (or a loan/receipt number, or a mobile number) to see open loans, principal, and interest due — pulled from real Firestore data through the same `calcLoanSummary()` the actual loan pages use, never a separate/different number.
  - **Quick what-if calculator** — e.g. "10000 2.5 24-07-2025", using the exact same 365/366-day engine and rounding rules as a real disbursement. Add "CA" for compounding annually.
- **Edit a disbursement's amount or date** — for fixing a data-entry mistake after the fact. "✏️ Edit amount/date" sits next to "Change rate →" on each disbursement card. If the date changes, the rate history's origin date updates to match so interest still calculates from the right point. Logged in Activity like other edits.
- **Ornament metal defaults to Silver** — was defaulting to Gold; now Silver is pre-selected on the New Loan form (still fully changeable per item, of course).
- **Dashboard greeting uses your actual name** — set on the Profile page ("My Profile" → Full name), not guessed from your email address anymore. Falls back to the old email-based guess only if no profile name has been set yet.
- **"My Profile" section** — Full name, which business you deal in (Gold / Silver / Both), and an optional phone number. Lives on the Profile page, separate from the Danger Zone reset (this is account-level info, not business data, so Reset Whole Panel never touches it).
- **Disbursement date follows the loan date** — when entering an old/backdated loan and you change the loan date, the first disbursement's date now moves to match automatically, so you don't have to set both dates separately. Stops auto-following the moment you edit the disbursement date yourself.

- **Modern dashboard redesign** — a time-of-day greeting, four stat cards with real trend indicators (not fake numbers — active loans vs new loans last month, principal vs disbursed last month, interest vs collected last month, today's collections vs yesterday's), a monthly collection area chart with a peak-value tooltip, a recent activity feed pulled from real payment records, and a quick-actions grid. The sidebar/top navigation itself is unchanged — only the dashboard's own content was redesigned, since rebuilding the shared navigation shell across all 9 pages would be a much larger, riskier job than reskinning one page. (The dashboard's floating "+ New Loan" button was later removed — see the Gharana Assistant entry below, which now sits in that same spot.)

- ✅ Gold vs Silver / Haali vs Paat summary — on the Reports page
- ✅ Printable loan receipt — "🖨 Print receipt" button on any loan, opens the browser print dialog with a clean paper-style layout (items, disbursements, totals, signature lines)
- ✅ WhatsApp reminders — "💬 WhatsApp reminder" button on any loan opens WhatsApp with a pre-filled message (principal, interest, total due) to the customer's saved mobile number
- ✅ Excel/CSV export — "⬇ Export CSV" on the Loans page downloads every loan's key figures, opens directly in Excel
- ✅ Village-wise and Aadhaar search — already built into the Customers search bar (searches name, mobile, Aadhaar, and address/village together)
- ✅ Audit trail — every disbursement, payment, rate change, item release, ready-to-release move, and closure is logged with who did it and when, shown in an "Activity" section on each loan page
- ✅ Multi-period report comparison (today/month/quarter/half-year/year, current vs previous two) — see Reports above

## Photo Backup & Restore (new)

A separate "Photos" section on the Profile page, alongside the existing data Backup — deliberately kept apart, since photos can add up to real size and time, so downloading them is its own action rather than folded into every routine backup.

- **"Download all photos"** — every customer photo, loan photo, disbursement photo, return photo, and gallery photo, bundled into one ZIP, organized into a folder per customer (named after the customer, as you asked — e.g. `Ramesh Kumar/Profile Photo.jpg`, `Ramesh Kumar/O-U-140 - Disbursement 1.jpg`). Two customers who happen to share a name are correctly kept separate (`Ramesh Kumar` and `Ramesh Kumar (2)`), verified directly. Progress shown live ("Downloading photo 12 of 47…"); a single broken photo URL is skipped rather than failing the whole download.
- **Restore reconnects everything automatically** — alongside the photos, the ZIP includes a small `manifest.json` mapping each photo file to the exact Firestore document and field it belongs to. Restore reads this and, for each photo, uploads it and updates the right record directly — no manual re-attaching, no guessing from filenames.
- **One deliberate difference from data restore, worth understanding, not just skimming:** data restore requires a completely empty account, since it recreates whole documents from nothing. Photo restore doesn't — it only ever updates a photo-URL *field* on a document that has to already exist, which normally means you've just run a data restore first. Requiring an empty account here wouldn't make sense; there'd be nothing to attach the photos to. Instead, each photo is only restored if its target record genuinely exists — anything that doesn't match (e.g. this ZIP is from a different backup than what's currently loaded) is safely skipped and counted in the summary, never applied to the wrong record.
- **Same safety level as data restore otherwise** — the identical double-password-confirm-with-countdown flow, built as its own separate flow with its own state (same reasoning as before: no shared state between two destructive actions).
- New dependency: JSZip (from cdnjs, verified the exact URL before using it) — genuinely necessary here, since there's no way to build a ZIP file in plain browser JavaScript.

Touches: `pages/profile.html` (Photos section, 4 new modals), `js/profile.js` (all download/restore logic).

## Mortgage valuation limit — soft over-lending warning (new)

Found already fully implemented when I went to check this — matching every one of your five requirements. Verified it carefully rather than assuming it was correct, the same way I did with the minimum-interest-period discovery earlier: read through the complete logic in both files, tested the arithmetic directly against your exact example, and confirmed every piece of UI wiring.

- **Optional field on New Loan** — "Valuation limit (₹)," blank by default. A loan with nothing entered here behaves exactly as before; nothing changes unless you actually set one.
- **Checks the cumulative total across every disbursement on the loan**, not each one in isolation — exactly your example: ₹80,000 already given, asking for ₹30,000 more, correctly warns at ₹1,10,000 total against a ₹1,00,000 limit, ₹10,000 over.
- **A warning, not a wall** — "Go back and check" or "Proceed anyway." Choosing to proceed genuinely proceeds; this never blocks a disbursement outright.
- **Editable any time** from the loan detail page (shown right in the loan header, with an inline edit link) — the existing hint text already explains why: gold/silver rates change, so a limit set at loan creation may need revising later.
- **Applies to reactivation the same way as a plain top-up** — both go through the exact same disbursement-saving code path, so there's no separate logic to keep in sync for that case.

Touches: `js/loan-create.js`, `js/loan-detail.js`, `pages/loan-create.html`, `pages/loan-detail.html`.

## Ornament weight summary, highlighted (added)

A small highlighted summary now sits above the ornaments table on the loan detail page — Haali weight, Paat weight, Total silver weight, and Total gold weight, each shown as a colored chip. Only shows the categories actually present on that loan, so a gold-only loan doesn't show a meaningless "Haali: 0g" chip, and vice versa.

Touches: `pages/loan-detail.html`, `js/loan-detail.js`.

## Four corrections from real usage, checked and fixed before deploying

**1) No-collateral loans were showing "Mark ready to release."** That workflow exists to track physically handing pledged items back — meaningless for a loan with nothing pledged. These loans now go straight to a "Close loan" button once settled, skipping the release step entirely. The photo-capture prompt in the closing flow is also hidden for them, since there's no item to photograph.

**2) Reactivation flow — two real problems, both fixed.** The disbursement date field was only ever set to "today" once, at page load — if the tab stayed open a while before actually being used, the date could go stale by the time someone opened the form. Now it resets to today every time the modal opens (still fully editable, so a genuinely backdated entry is still just as easy). Separately, there was no way to add new items when giving more money on an existing loan — Add Disbursement only had money fields, nothing for identity/weight/etc. Added a full, optional item-entry section (same fields as New Loan) — leave empty for a plain top-up against existing items, or add new ones if new items are actually being pledged with this disbursement. If the loan had no collateral before, adding an item here correctly flips that.

**3) Timeline not generating — a real, significant bug found and fixed.** Every time the timeline failed to load (most likely: a missing Firestore composite index), the error was being silently overwritten immediately afterward by an unconditional render call that replaced it with a generic "No history recorded" message — making a genuinely broken timeline look identical to a customer who simply has no history. This has likely been happening since the feature was first built, since the bug was in the *original* code path, not something introduced recently. Fixed to actually surface the real error, and specifically detect a missing-index failure and point directly to the fix (open the browser console for a one-click link to create it).

**4) Activity log showing raw emails with no visible separator — two separate bugs, not one.** The missing space wasn't a formatting oversight in the text — the layout genuinely had no CSS separating the two pieces of information at all. And email addresses are now resolved to real display names (the ones already set in Profile) everywhere activity is shown — the loan detail page's activity log and the Customer Timeline both now read like "Kavish — Loan created: ₹2,000 to Ramesh" instead of a raw address running straight into the next word. Falls back to the email's username portion if no display name has been set for that account.

Touches: `js/loan-detail.js`, `pages/loan-detail.html`, `js/customer-profile.js`. No new Firestore index needed for any of these four (Timeline's fix surfaces an *existing* index requirement more clearly — it doesn't add a new one).

## Fixed: Item Return Receipt showed nothing for loans closed as a whole

Real bug, and a good catch — this app actually has two separate "item returned" paths that had never been connected: releasing one specific item while a loan stays active (which sets that item's own `released` flag), and closing an entire loan at once (which only updated the loan's own status/photo, never touched each item's flag individually). A loan closed the second way — the far more common case for a simple one-item loan — would show a completely empty "Select released item" dropdown on the Item Return Receipt, even with a return photo already captured and the loan clearly closed.

**Fixed two ways together:**
- **Retroactively, for every loan already closed** — the receipt picker now treats every item on a closed loan as returned, falling back to the loan's own closure date and remark for any item that was never individually marked. This fixes existing closed loans immediately, with no data changes needed.
- **Going forward** — closing a whole loan now also marks every not-yet-individually-released item as released, using the loan's actual closure date and remark, so the underlying data is correct at the source too, not just patched at display time.

Touches: `js/loan-detail.js` only.

## Three more Loan Receipt fixes, found through real testing

**1. "Due from" date was showing the wrong date entirely.** It used the disbursement's *original* date, always — even when a payment had since cleared that disbursement's interest up to a later date. If interest was fully settled up to 6 August, saying the outstanding principal is "due from 1 August" wrongly implies interest has been quietly building the whole time. Fixed to use the *live* effective date instead — the point interest is actually counting from right now, which correctly moves forward every time a payment resets it.

**2. "Partially paid" could show incorrectly on a disbursement nothing was actually paid toward.** Caused by ordinary floating-point imprecision — an internal value like `99999.999999...` displays as a clean "₹1,00,000" but technically fails a strict "is this less than the original amount" check. Fixed with a small tolerance (1 paisa) so this kind of computational noise doesn't get mistaken for a real payment — verified this doesn't mask *genuine* small differences (a real 23-paise principal reduction still correctly shows as "Partially paid").

**3. The payment history now shows which disbursement each payment actually applied to** — a new "Disbursement" column, showing the relevant disbursement's date. Required a small engine addition: `calcLoanSummary` now tracks which disbursement(s) each payment genuinely made progress on (not just guessed after the fact) as part of its existing payment-processing loop, and receipts read that directly rather than trying to re-derive it.

All three verified together against a reconstructed version of the exact scenario that surfaced them: an untargeted payment correctly shown against the oldest disbursement (FIFO), a targeted payment correctly shown against the one it was aimed at, and the "due from" date correctly reflecting the most recent settlement rather than the original disbursement date.

Touches: `js/interest.js` (tracking which disbursement(s) a payment touched), `js/receipt.js` (all three fixes above).

## Principal outstanding now shows which date it's due from (added)

Small addition to the Loan Receipt: "Principal outstanding" now shows "(due from [date])" next to the figure — the disbursement date the remaining amount has been outstanding since. Uses the same status logic as the disbursement table above it, so a disbursement that's already been paid off never shows up here, even if others on the same loan are still active. If more than one disbursement is still outstanding, all their dates are listed rather than picking just one.

Touches: `js/receipt.js` only.

## Loan Receipt now shows per-disbursement status and a real payment history (fixed)

Two real gaps you found, both fixed the same way — pulling from data the engine already computes rather than adding new tracking:

- **Multiple disbursements now show which one is Active, Partially Paid, or Closed** — a new "Principal remaining" and "Status" column on the disbursement table, computed fresh from `summary.perDisbursement` every time (so it's always the true current state, not just what was originally disbursed). Before this, a receipt for a loan with two disbursements — one fully paid off, one still outstanding — looked identical to one where neither had been touched at all.
- **Multiple payments now show as a real history**, not just one lump "Amount already paid" total — a new table listing every payment's date, type, and amount, sorted chronologically. The lump total is still shown too, just no longer the only figure available.

Verified directly: a loan with one closed disbursement and one active one correctly shows ₹0 remaining / Closed for the first and full principal / Active for the second, and a loan with two separate payments shows both individually, in date order.

Touches: `js/receipt.js` only.

## Targeted payments — pay off one specific disbursement without touching others (new)

A real gap you found: with more than one disbursement on a loan, every payment always went to the oldest one first (the FIFO waterfall) — there was no way to pay off a newer, smaller disbursement on its own if an older one was still outstanding.

Fixed with an optional "Apply this payment to" selector, on both Add Payment and Edit Payment — only shown when a loan actually has more than one disbursement (a single-disbursement loan never sees it, since there's nothing to choose between). Pick a specific disbursement and the payment applies its interest and principal to that one only, leaving every other disbursement on the loan completely untouched — still accruing its own interest normally, at its own rate, on its own schedule. Leave it on the default ("All disbursements, oldest first") and everything works exactly as it always has.

**Built to reuse the existing, already-tested payment logic rather than duplicate it** — targeting a disbursement just narrows which disbursement(s) the existing full/partial/shortfall logic considers, rather than being a separate code path with its own risk of drifting out of sync. Verified directly: paying off a second, smaller disbursement in full (principal + its own interest) leaves the first, larger disbursement completely unchanged — same principal, same accrual, as if the payment never happened from its perspective. Also reran the full existing test suite (single-disbursement loans, the rounding-spillover fix, Advance Interest) to confirm none of it regressed.

If a payment references a disbursement that's since been removed somehow, it safely falls back to normal FIFO rather than the payment silently applying nowhere.

Touches: `pages/loan-detail.html` (the selector, on both Add and Edit), `js/loan-detail.js` (populating it, saving/editing the target), `js/interest.js` (the actual targeting logic).

## Minimum interest period rule removed entirely — pure day-wise, always, no exceptions

A one-time "1 month minimum, then day-wise forever" rule was built and refined across several rounds of testing (documented in prior versions of this file). In practice it added real confusion — different disbursements behaving differently depending on history, a note that could mislead, edge cases needing careful tracking. Rather than keep patching it, the rule has been **removed completely, on your explicit instruction**: every disbursement, on every loan, always uses pure exact day-wise interest (the 365/366-day actual-calendar method) from day one — no floor, no minimum, no special first-month treatment, no exceptions for top-ups or reactivations. This is simpler, more predictable, and removes an entire category of the bugs found while the minimum rule existed.

Verified directly: your exact reported case (₹1,00,000 @ 3% for 5 days, ₹5,000 @ 2% for 1 day) now correctly shows ₹493.15 and ₹3.29 — pure day-wise, nothing floored — and the Advance Interest feature and the earlier rounding-spillover fix (a separate, still-valid fix, unrelated to the minimum rule) both continue working correctly.

**Cleaned up thoroughly, not just patched over**: removed the `startsMinimumPeriod` field being written at disbursement creation (`loan-create.js`, `loan-detail.js`), the now-pointless "Note" column from both interest breakdown tables (every row would say the same thing now, so it added nothing), and all related internal tracking in the engine itself (`usesMinimumRule`, `minimumWindowEnd`, `minimumTransitioned`, and the `addOneMonth` helper, which had no other use). The one part left untouched: `periodInterest()`, which still carries a minimum-charge floor — that function is used only by the separate Surplus Deposits feature, not loans, and wasn't part of this request.

Touches: `js/interest.js`, `js/loan-create.js`, `js/loan-detail.js`, `pages/loan-detail.html`.

## Serious bug fixed: incidental rounding spillover was corrupting a *different* disbursement's interest

**Found through your own testing, not something I'd have caught otherwise — this is a real, pre-existing bug that predates the Advance Interest work entirely**, just newly surfaced because it needs a specific combination: a loan with more than one disbursement, and a payment amount that doesn't *exactly* match the app's precise day-based interest calculation (e.g. staff estimated ₹7,106 owed, the app's precise figure was ₹7,068.49 — a routine ₹37.51 rounding difference).

**What was happening:** that trivial ₹37.51 leftover, after fully closing the first disbursement, spilled into the *next* disbursement on the same loan — and because it wasn't enough to cover what was "due" there, it triggered the same logic as a genuine partial interest payment. That reset the second disbursement's interest clock to the payment date and **permanently locked in a full month's minimum interest**, even though nobody paid anything toward it and only a few days had actually passed since it was taken out. The result: "interest due" on a completely untouched disbursement was inflated by a rounding artifact from a different one.

**The fix:** a partial/shortfall payment can only reset a disbursement's clock if it's the *first* one a payment actually reaches. Any spillover reaching a later disbursement now only affects it if there's enough money to make real progress there (fully or partially clear real principal or interest) — otherwise that disbursement is left completely untouched, and the trivial leftover is simply absorbed as rounding noise rather than treated as a deliberate payment.

**Verified directly against your exact numbers** — after the fix, the untouched disbursement correctly shows its own real date, its own real 4-day-old accrual, and the honest 1-month-minimum floor (₹2,000) — exactly matching your own hand calculation, not the inflated ₹3,962. Also re-ran the existing test suite (single-disbursement payments, a *genuinely* sufficient payment that legitimately closes multiple disbursements at once, and the Advance Interest scenario) to confirm nothing else regressed.

**Nothing in your stored data needs correcting** — `calcLoanSummary` recalculates everything fresh from your payment/disbursement records every time a loan is viewed, so the corrected figures appear automatically the moment this fix is deployed; there's no migration step.

Touches: `js/interest.js` only — the one file where the actual money math lives.

## Four real gaps fixed after testing Advance Interest in practice

**1. Payments couldn't be edited or deleted, at all.** A genuine gap — if ₹20,000 got typed instead of ₹2,000, there was no way to fix it. Every payment row now has an ✏️ edit button (matching the existing disbursement-edit pattern), including a Delete option, both logged to the Timeline with a reason. Since the interest engine recalculates everything fresh from the stored payment records every time, correcting or removing a payment automatically recomputes interest/principal from that point forward — no separate "fix the math" step needed.

**2. The settled-vs-credit split of an advance interest payment was invisible.** The engine was already computing this internally, just never surfacing it. Now the payment history table shows it directly under each advance-interest row — e.g. "₹1,536 settled interest, ₹464 became credit" — and the loan detail page shows a live projection: "₹1,424.66 advance credit — covers interest until about 31-Oct-2026". That projection is a genuinely new calculation (not a display of something already computed) — it searches forward day-by-day for when ongoing accrual will exhaust the current credit, accounting for the same 1-month-minimum floor rule that already governs the rest of the engine.

**3. Receipts only ever showed the total amount, never the breakdown.** Fixed on both the Payment Receipt and Interest Receipt: generating either for an advance-interest payment now shows the settled amount, the credit amount, and principal remaining, clearly separated — not just "₹2,000 deposited." Also fixed a real omission in the Interest Receipt picker: it was filtering advance-interest payments out entirely (since they show `0` as their immediate interest contribution, by design, for the deferred-recognition reason from the original build) — meaning there was previously no way to generate an Interest Receipt for one at all. Fixed to include them, clearly labeled "(advance interest)" in the picker.

**4. "Gold Return Receipt" renamed to "Item Return Receipt."** To be clear on this one: the feature already worked correctly for silver — it just displays whichever `metalType` the specific item actually has, gold or silver, and always has. The name itself was just misleadingly gold-specific, which is a legitimate, separate thing to fix from the feature actually being broken (it wasn't). Renamed everywhere it appears in the app; the underlying data and logic are unchanged.

Touches: `js/interest.js` (the settled/credit split + exhaustion-date projection), `pages/loan-detail.html` (edit-payment modal, new table column), `js/loan-detail.js` (edit/delete logic, payment-history display, receipt picker fix), `js/receipt.js` (receipt content + rename).

## Advance Interest Payment (new) — a real change to the interest engine

Built carefully and slowly over several conversations, since this touches `calcLoanSummary()` — the single piece of logic every other number in this app (Dashboard, Reports, Village Analytics, the Owl Assistant, receipts) depends on.

**What it does:** a customer can pay interest *ahead of time* — e.g. "take ₹400 now to cover interest until the end of the month." New payment type on the Add Payment form: **"Advance interest payment"**. Unlike the other three types (which are just labels — every payment already clears interest then principal automatically), this one genuinely changes behavior:

- Doesn't touch principal, and doesn't just settle what's currently owed — the money becomes a credit against interest that hasn't accrued yet
- **"Interest due" shows as a green credit** (not a confusing negative number) for as long as the credit exceeds what's actually accrued — shown consistently everywhere interest due appears: the loan detail page, the Loans list, the Owl Assistant, receipts
- The credit **depletes automatically as real interest accrues**, with no manual step — once it's used up, "interest due" quietly returns to showing a normal amount owed
- Works correctly through a **mid-credit rate change**
- If the loan is **paid off before the credit is used up**, the unused portion effectively reduces what's owed — verified this directly: pay exactly what the app shows as due, and both principal and interest land on exactly zero
- **Multiple advance payments on the same loan accumulate** into the same credit, kept low-key in the UI (no separate "credit balance" screen) so it doesn't add visible complexity for everyday use

**Reused ~95% of the existing, already-tested waterfall logic rather than replacing it.** The engine already has a variable, `unpaidInterest`, that represents interest owed but not yet settled — it gets added to newly-accrued interest at every checkpoint. The entire feature comes from one deliberate choice: letting an advance-interest overpayment push that same variable *negative* instead of reducing principal like a normal overpayment would. Every other requirement — the credit showing correctly, it depleting naturally over time, surviving a rate change, coming out exactly right at full payoff — falls out of math the engine was already doing everywhere else, not new special-case logic for each one.

**A real interaction with an existing rule, found through testing rather than assumed, and settled by your explicit choice:** this app has a locked rule that a minimum of 1 month's interest always applies once any time has passed, however short — originally meant for real lending periods. Since an advance-interest payment resets the "clock" the same way any payment does, that same floor rule applies to the credit too — meaning **the credit gets consumed faster than a simple "amount ÷ daily rate" calculation would suggest.** In direct testing: ₹170 of leftover credit, which should cover roughly 26 days at a smooth daily rate, actually got used up in about 10 days because of this floor. You chose to keep this behavior (Option A — consistent with how every other reset in this engine already works) rather than build a separate, unfloored calculation just for this one payment type. Worth remembering when quoting a customer how long a given advance amount will realistically cover.

**One consequence of that same choice, worth knowing:** because *each* advance-interest payment resets the clock and re-triggers the floor, **paying in one combined amount goes further than paying the same total across several smaller payments on different days** — each additional payment "wastes" some of the floor on itself. Noted directly in the in-app hint text when this payment type is selected, not hidden.

**Interest earned is only counted in Reports once the credit is actually consumed, not the moment it's paid** (your explicit choice) — an advance-interest payment shows `0` as its own interest contribution the moment it's recorded; the real, net interest gets correctly attributed later, whenever a subsequent payment or the loan's closure actually draws the credit down. Verified this directly: paid ₹400 advance, then closed the loan later — the advance payment's own record shows zero interest earned, and the closing payment's record shows exactly the net amount that was actually realized.

Touches: `js/interest.js` (the core engine change — the only file where the actual money math lives), `pages/loan-detail.html` (new payment type option + hint text), `js/loan-detail.js` (hint logic, Timeline event labeling), `js/loans.js`, `js/owl-assistant.js`, `js/receipt.js` (credit-aware display everywhere interest due is shown).

## Receipts now show mortgage return details, with photo (fixed)

- **Loan Receipt, generated for an already-closed loan**, now shows a prominent green "✓ This loan is fully closed — mortgage handed back to customer" banner, with the actual date it was handed back, any remarks recorded at closing, and the return photo embedded directly in the printed/PDF receipt. Before this, a receipt for a closed loan looked no different from one for an active loan except a plain word "closed" in the status line.
- **Gold Return Receipt** (for a single released item) now shows the item's *actual* release date and any remarks recorded for that specific release — previously it just said "Item returned to customer" with no date, no remark, and nothing to back it up.
- **Two fields were missing entirely and had to be added first**: there was nowhere to enter a remark when closing a loan or releasing an individual item, so I added a "Remarks (optional)" field to both flows. Also added a "Date handed back" field to the closure flow, since it previously always used the exact moment the button was clicked rather than letting you record an accurate date for a backdated entry.
- **Found and fixed a real pre-existing bug while doing this**: the per-item release flow already *had* a date picker on screen, but the code silently ignored it and saved the server's current timestamp instead — so the date you actually selected was never what got recorded. Fixed to use the date you actually pick.
- Both new embedded photos (the closure banner's and the gold-return receipt's) are automatically covered by the image-loading fix from the digital signature feature — that fix already waits for *every* image in a receipt before printing, not just specific ones, so this needed no additional work to stay safe from the earlier pagination bug.
- Touches `pages/loan-detail.html` (new fields on two modals), `js/loan-detail.js` (capturing the new fields, plus the date bug fix), `js/receipt.js` (the actual receipt content).

## New Loan customer field made searchable (fixed)

- The Customer field on the New Loan form was a plain dropdown — fine with a handful of customers, unusable once you're past 100. Replaced with a real searchable combobox: type a few letters of a name **or village** and matching customers appear instantly, each showing name + village + mobile so you can tell people with similar names apart. Same typo tolerance and match-highlighting as the rest of the app's search (reuses `smartMatchAny`/`highlightText` from Universal Smart Search, not a separate implementation). Arrow keys + Enter work too, not just clicking.
- **Built to be low-risk**: the original `<select>` element is still there underneath, just hidden — every existing piece of code that reads its value (saving a loan, saving a draft, restoring a draft, the "Will be recorded under…" hint) keeps working completely unchanged. The new search box just drives that hidden select instead of replacing the logic around it.
- **Found and fixed a real validation gap this change would have introduced**: the old dropdown blocked submission via the browser's native "required field" behavior on a *visible* select — which doesn't reliably work once that same element is hidden. Added an explicit check instead: if you type something but never actually pick a customer from the suggestions, saving is blocked with a clear message, rather than silently creating a loan with no customer attached.
- Touches `pages/loan-create.html`, `js/loan-create.js`, `css/style.css`. Also added `search.js` to this page's script list, needed for the search logic — wasn't loaded here before.

## Optional digital signature (new)

- On the Generate Receipt picker, a new checkbox: **"✍️ Capture customer's signature digitally"** — unchecked by default. Leave it unchecked and receipts work exactly as before, with the plain printed line. Check it, and after clicking Print or Share, a signature pad opens (hand-drawn, works with mouse or a finger/stylus on a touchscreen) before the receipt is generated — the captured signature is embedded directly into the receipt as an image, replacing the blank line for the customer's side specifically ("Authorized signature" always stays a printed line).
- **No new library** — the signature pad is a plain HTML canvas with mouse/touch drawing, hand-built rather than pulling in a dependency for something this simple. Sized against the device's actual pixel ratio so strokes stay crisp on high-DPI phone screens, not blurry.
- **The signature is never uploaded or stored anywhere** — it exists only as an image embedded directly into that one receipt's HTML for printing, then discarded like the rest of the receipt's content. It's not saved to Storage and not included in the public verification record (which stays exactly as minimal as before — shop name, amount, date, nothing else).
- **Caught and fixed a real risk before shipping this**, based directly on the pagination bug from a few features back: the fix I applied then only watched the *logo* image before printing, not any other image on the receipt. Since a signature is now a second image that can appear on a receipt, I generalized that check to wait for *every* image in the receipt (however many there end up being) before opening the print dialog — not just special-cased for the logo specifically.
- Every receipt type supports this (Loan, Payment, Interest, Renewal, Gold Return) — the checkbox applies regardless of which type you're generating.
- New file: `js/signature-pad.js`. Touches `pages/loan-detail.html` (checkbox + new modal), `js/loan-detail.js` (the flow + the generalized image-wait fix), `js/receipt.js`, `css/style.css`.

## QR receipt verification (new)

- Every receipt's QR code now links to a real, public verification page (`verify.html`) instead of encoding plain text — scan it and a customer sees **"✓ Genuine Receipt"** with the shop name, receipt type, receipt number, date, and amount. Nothing about themselves, the loan, or any other detail — the bare-minimum scope you chose.
- **A real architectural change was needed to make this work, not just a new page**: receipts weren't previously saved anywhere — each one was built fresh in the browser purely for printing, then discarded, so there was nothing to actually verify against. Generating any receipt now also saves a minimal record to a new `receipts` collection, which the verification page looks up by the receipt number in the URL.
- **The security model got a deliberate, narrow exception, explained here since it's the first time this app has anything public-facing**: every other part of this app requires being signed in — no exceptions. A customer scanning a QR code isn't signed in, so `firestore.rules` now has one small carve-out: anyone can look up ONE specific receipt if they already know its exact number (`allow get: if true`), but nobody — signed in or not — can query/list the whole `receipts` collection to browse everything ever issued (`allow list: if false`), which would leak business volume and timing even without exposing names. Everything else in the app is completely unaffected.
- **The stored record is genuinely minimal, not just hidden in the UI** — worth understanding why this matters: Firestore's `get` permission exposes the *entire* document to anyone who can read it, not just the fields a page's UI chooses to display. So the `receipts` document itself only ever contains what's approved for public exposure (receipt number, type, amount, date, shop name/logo) — no loan ID, no customer ID, nothing else. Internal traceability back to the loan still exists via the existing Timeline/activity log, so nothing was lost by keeping the public record minimal.
- **Old receipts generated before this update have no record to verify against** — scanning an old receipt's QR (which encoded plain text, not a link, before this change) won't do anything, since it was never a scannable link in the first place. Any receipt generated from now on will verify correctly.
- No new Firestore index needed (a direct document lookup by ID never requires one). No Storage rules changes needed either — the shop logo's URL is already safely public by design (Firebase's download URLs carry their own access token).
- New files: `verify.html`, `js/verify.js` (deliberately self-contained — doesn't load the authenticated app's shared files, which assume a signed-in sidebar shell that doesn't exist here). Touches `firestore.rules`, `js/receipt.js`, `js/loan-detail.js`, `pages/loan-detail.html`.

## Loans & Customers pages made scalable (fixed)

- **Loans page** — same underlying problem the Reports rewrite fixed, applied here: it used to fetch *every* loan (active, released, closed) plus all of their subcollections, every single visit, regardless of which status tab you actually opened. Now it only fetches the currently selected status tab's loans — since "Active" is the default tab, that's the only thing loaded on a normal visit. Switching tabs fetches just that status if it hasn't been loaded yet; already-loaded statuses are cached in memory for the rest of your visit, so flipping between tabs never re-fetches the same loans twice. "All" and CSV export both explicitly widen to fetch everything — deliberate, not automatic, the same pattern as Reports' "complete history" export.
- **Customers page** — a smaller but real fix: it used to fetch *every loan ever created* just to compute a loan-count number per customer. Now it uses Firestore's `count()` aggregation instead — each customer's count is one lightweight query that returns just a number, not the loan documents themselves, billed as a single read regardless of how many loans that customer has. Cost now scales with your number of *customers*, not your number of *loans ever created* — a real difference once customers build up loan history over time.
- Files: `js/loans.js` (the main rewrite), `pages/loans.html` (one button update), `js/customers.js`.

## Smart village grouping (fixed)

- **Village Analytics now correctly merges "Jhabua" and "jhabua"** — previously an exact-string-match limitation we'd flagged and left as-is; now fixed with two complementary changes:
  1. **Repair (fixes existing data):** grouping now uses a normalized key (trimmed, lowercased, extra spaces collapsed) instead of the raw text — so inconsistent spelling already in your data merges correctly. The displayed village name still shows real, human-written text (whichever exact casing was used most often within the group), not a forced-lowercase version.
  2. **Prevention (stops new inconsistency from forming):** every village field in the app — New Customer, editing a customer, and the "Someone else" pledged-by section on New Loan — now has **autocomplete suggesting villages already in use**, so typing "Jha…" shows "Jhabua" if that's already how it's spelled elsewhere, encouraging reuse of the existing spelling instead of quietly creating a new near-duplicate.
- Tested directly: three loans with "Jhabua" / "jhabua" / " Jhabua " (extra spaces) now correctly report as one village with the combined total, displaying as "Jhabua."
- New shared helpers in `js/nav.js` (`normalizeVillageKey`, `populateVillageDatalist`), reused across every page that needed them — no duplicate logic. Touches `js/reports.js` (the actual grouping fix), `pages/customers.html` + `js/customers.js`, `pages/loan-create.html` + `js/loan-create.js`, `js/customer-profile.js` (one new lightweight fetch, since this page doesn't otherwise load the full customer list).

## Manual Backup & Restore (new) — the last of the 7 planned features

- **Backup** — a new "Backup" card on the Profile page, separate from the Danger Zone (this one's safe — it's purely read-only). "Download backup" fetches every customer, loan, ornament, disbursement, payment, surplus deposit, gallery photo reference, and activity log entry into a single JSON file, with live progress shown on the button while it works (e.g. "Fetching loans… (14/40)"). Shows "Last backup: [date]" so you can see at a glance if it's been a while.
- **Restore lives in the Danger Zone**, not next to Backup — per our discussion, restore is inherently destructive (it overwrites what's currently there), so it gets the same treatment as Reset Whole Panel, not the safe treatment Backup gets.
- **Restore only works on a completely empty account** (your requested restriction) — if there are any customers or loans currently in the app, restore is blocked with a clear message telling you to reset first. This exists specifically to prevent an old backup silently overwriting real, current data.
- **Same double-confirmation as Reset** (re-enter your password twice, with a 10-second forced wait in between) — built as a **fully separate, parallel flow** from Reset's existing confirmation modals rather than reusing/modifying them, specifically to avoid any risk of a shared-state bug between two genuinely destructive actions.
- **Shows a preview before you confirm anything** — backup date, who created it, and exactly how many customers and loans it contains — so you're never guessing what you're about to restore.
- **Two limitations worth actually understanding, not just skimming:**
  1. **This backs up Firestore data only, not Storage files.** All your records — amounts, dates, customer details, loan history — are fully protected. Photo *images* (customer photos, jewellery gallery photos) are not included in the file itself; a restore brings back the photo URLs, but if the actual image files were separately deleted (e.g. by a Reset), those specific images won't come back — just a broken link. Given your original disaster-recovery scenario was about a stolen laptop wiping your business records, this covers exactly what matters most; if you want photo files backed up too, that's a bigger, separate feature (Firebase Storage doesn't have a simple JSON-export equivalent).
  2. **Personal account settings (display name, theme, language) aren't included** — those are tied to your individual login, not the shop's shared data, so they're out of scope here.
- **Found and fixed a real, separate bug while building this**: Reset Whole Panel was written before the Jewellery Gallery and Surplus Deposits features existed, and was never updated to clean up their subcollections (`galleryPhotos`, `deposits`/`withdrawals`) or the `loan-gallery` Storage folder — meaning a reset would have left orphaned data behind. Fixed as part of this same session, since Backup/Restore needed a complete, accurate picture of the data model anyway.
- Touches: `pages/profile.html` (Backup card, Restore section, 3 new confirmation modals), `js/profile.js` (all backup/restore logic, plus the Reset fix). No new Firestore index needed.

## Professional Receipt Generator (new)

- Replaces the old single "Print Receipt" button on a loan's detail page with "🧾 Generate Receipt" — pick from **five receipt types**: Loan Receipt, Payment Receipt, Interest Receipt, Renewal Receipt, and Gold Return Receipt. For the last four, a second dropdown lets you pick the specific payment, disbursement, or released item the receipt is about.
- Every receipt includes: your shop's logo and details, customer and loan info, a unique receipt number, date, a QR code, signature lines, terms & conditions, and a footer — genuinely branded, not just a plain printout.
- **"Download PDF" and "Print" both come from the same mechanism** — your browser's own print dialog. Every modern browser (desktop and mobile) has a "Save as PDF" option built into that dialog, so this gets you a real PDF file with zero new dependencies for that part, reusing the exact print mechanism this app already had.
- **"Share" is WhatsApp only** (no email, per your call on scope) — sends a text summary of the receipt (shop name, receipt number, loan number, customer, amount, date), not the actual PDF file itself. There's no reliable way for a plain web page to attach a generated file to a WhatsApp message automatically — the workflow is: Print/Save as PDF for the actual file, WhatsApp share to quickly notify the customer.
- **One genuinely new dependency**, worth being upfront about: a small QR code library (`qrcodejs`, from cdnjs — verified the exact URL and API before shipping it) since there's no way to generate a QR code with plain browser JavaScript. The QR encodes a short text summary (shop, receipt type, receipt number, loan number, date) rather than a link — there's no public/logged-out page in this app to link to.
- **Shop details are no longer hardcoded** — fixed after you rightly flagged this. There's now a **"Shop details" section on the Profile page** (Shop name, tagline, address, phone), stored in Firestore and shared between both your accounts — whoever edits it updates it for both of you, since it's one shop, not a personal preference. The Receipt Generator reads from there dynamically instead of from a fixed value in the code. If it's never been filled in, receipts show an obviously-generic placeholder ("Your Shop Name" / "Set your shop details in Profile → Shop Details") rather than silently displaying someone else's real business details — exactly the commercialization concern you raised. New: `settings/shop` in Firestore, no new index needed (single-document read).
- **Shop logo upload, added to the same section** — choose an image on the Profile page and it appears on every receipt going forward. Uploaded to Firebase Storage at a fixed path (`shop-logo/logo.png`), so re-uploading a new one automatically replaces the old — no leftover files. Deliberately kept as **PNG, not compressed to JPEG like other photos in this app** — a JPEG can't have a transparent background, and baking a white box behind a logo that's meant to sit cleanly on the receipt would look wrong. Resized to a reasonable max size (400px) before upload either way. **Kept the same fix from the earlier pagination bug** — explicit width/height on the image regardless of whether it's the uploaded logo or the built-in fallback, and the print button still waits for it to actually finish loading before opening the print dialog, which matters even more here since a Storage-hosted image takes longer to load than a same-origin file. Caught and fixed one more real bug while building this: saving the text fields (name/address/etc.) was using a plain `.set()`, which would have silently wiped out the logo URL every time — fixed to merge instead of overwrite.
- New file: `js/receipt.js`. Touches `pages/loan-detail.html` (new picker modal, QR library script tag), `js/loan-detail.js` (replaced the old single-purpose print function with the new type-picker logic), and `css/style.css` (professional A4 print layout — logo header, QR placement, terms, footer).
- **Two bugs fixed after real-world testing:**
  1. **Loan Receipt was missing "amount already paid"** — showed principal outstanding and interest due, but not what the customer had already paid toward the loan. Added.
  2. **PDF/print output had a blank first page, then a page with just a giant logo, then the actual receipt on page 3.** Root cause: the logo asset is a large 1080×1080px image, and it was only constrained with CSS (`height:52px`), not real HTML width/height attributes — so the browser didn't reserve layout space for it until the image finished loading, and printing before that finished caused the print engine to miscalculate page breaks. Fixed three ways: explicit HTML `width`/`height` attributes (reserves the correct space immediately, before the image even loads), switched to the smaller compact icon logo instead of the full text lockup (more proportionate at this size anyway), and the print button now waits for the image to actually finish loading instead of a fixed guessed delay.

## Dedicated village field (new)

- Split "Address / village" into two separate fields — **Village** and **Address** — in three places: the New Customer form, editing a customer's details on their profile page, and the "Someone else" pledged-by section on the New Loan form.
- **This is what Village Analytics was actually missing** — it was grouping by whatever was typed into the combined address field, which mixed full addresses in with village names. Now it groups by the dedicated `village` field specifically.
- **Fully backward-compatible** — for any customer created before this change (who only has the old combined `address` field, no separate `village`), everything that reads village — the customer list, search, and Village Analytics — falls back to `address` automatically. Nothing breaks, nothing needs migrating; new/edited customers just get more accurate grouping going forward.
- Also shown on the loan detail page for "pledged by someone else" loans, alongside their address.
- Touches: `pages/customers.html`, `js/customers.js`, `js/customer-profile.js`, `pages/loan-create.html`, `js/loan-create.js`, `js/loan-detail.js`, `js/reports.js` (the village lookup Village Analytics uses).

## Village Analytics (new) — lives inside Reports, not a separate page

- Merged into the existing Reports page rather than its own page/nav entry, per your call — one home for all analytics instead of two places to check. Scroll to the bottom of Reports.
- **Shares Reports' existing period selection** (the same Daily/Monthly/Quarterly/Half-yearly/Yearly tabs and dropdown at the top) instead of having its own separate date-range controls — pick a period once, both the trend numbers above and the village breakdown below update together.
- **Zero extra Firestore reads for loan data** — this was the main design constraint, and worth explaining honestly. The original standalone version of this feature fetched *every* loan, always, completely independent of Reports' own scaled-down loading. Merging them naively would have meant paying for two different loading strategies on one page — including reintroducing the expensive "fetch everything" pattern I'd specifically removed from Reports for cost reasons a few features back. Instead, Village Analytics now reads from the *exact same* loan data Reports already fetches for whatever period is selected (`processedLoansCache`, built as a byproduct of the loan fetch Reports needs anyway) — the only genuinely new read is one extra `ornaments` subcollection fetch per newly-discovered loan (needed for the weight metric) and one cheap one-time fetch of the customers collection (for village lookup, no subcollections).
- Top Villages chart, metrics table (customers, active/closed, interest earned, avg loan, avg weight, recovery %), click a bar or row to expand and see that village's customers.
- **One real behavior change from the standalone version, worth knowing:** there's no distinct "All Time" village view anymore — village breakdown always reflects whatever single period is currently selected (a specific month, quarter, year, etc.), matching how the rest of Reports already works, rather than a separate arbitrary date range. If you want an all-time village view back, it's doable, but would need its own explicit widen-everything action (like the CSV export's "complete history" button) rather than being always-on.
- **Bug fixed (previously only worked reliably in Yearly mode):** Village Analytics originally only counted a loan toward a period if the loan *originated* in that exact period. Since most transaction activity in any given month or quarter is *payments on older loans*, not brand-new loans, narrower periods usually had zero matching loans even with plenty of real collection activity happening — while Yearly's much wider bucket was likely to catch at least one loan's origination, making it look like the only mode that worked. Fixed: a loan now counts toward a period if it had *any* activity there — origination, a disbursement, or a payment — matching how the rest of Reports already thinks about "this period's activity."
- **Village grouping is still a plain exact match** on the customer's address field — "Jhabua" and "jhabua" count separately. Same simplification as before, unchanged.
- **No new Firestore index needed** — reuses Reports' existing collection-group queries, which you already set up.
- Removed: the standalone `pages/village-analytics.html` and `js/village-analytics.js`, and the sidebar/mobile nav entry for it (nav.js, i18n.js) — everything now lives in `pages/reports.html` / `js/reports.js`.



## Jewellery Gallery (new)

- On each loan's detail page — 7 photo categories (Front, Back, Hallmark, Weight Slip, Close-up, Customer Holding, Additional), each with its own tab and count badge.
- **Fullscreen viewer** with a real carousel (prev/next, arrow keys), **pinch-to-zoom on mobile** and **scroll-to-zoom on desktop** (both built with plain touch/wheel events, no library — double-tap/double-click also toggles zoom), download, and delete, all from inside the viewer.
- **Drag to reorder** photos within a category (native HTML5 drag-and-drop).
- **Replace** a photo in place — keeps its category and position, just swaps the image (old file is cleaned up from Storage automatically).
- **Real upload progress**, not a fake spinner — uses Firebase Storage's actual upload progress events, shown as a fill bar on the photo tile while it uploads.
- **Lazy loading** — thumbnails use the browser's native `loading="lazy"`, so photos off-screen don't load until you scroll to them.
- **Compression matches the rest of the app** — reuses `camera.js`'s existing capture/compression pipeline unchanged (1280px max dimension, JPEG quality 0.75) for every category, including close-ups — deliberately "normally compressed," not full-resolution, per your call on this.
- **No video** — left out of this build, per your call on scope.
- **No new Firestore index needed** — the gallery's only query is a simple `orderBy("order")` on a normal subcollection, which Firestore indexes automatically. Storage rules already cover the new `loan-gallery/` path (same blanket sign-in-required rule as everywhere else), so nothing to configure there either.
- New file: `js/gallery.js`. Touches `pages/loan-detail.html`, `js/loan-detail.js` (one line, calling gallery init once at load — deliberately *not* inside the function that re-runs after every payment/edit, so routine loan actions never re-fetch the gallery needlessly), and `css/style.css`.

## Universal Smart Search (new)

- **Loans page** — real search bar (search icon, live result count, clear button) searching loan #, customer name, mobile, village, item names, locker note, status, and amount — all at once, no separate searches needed. **Typo-tolerant** (e.g. "ravi paetl" still finds "Ravi Patel") and **highlights matches** directly in the results table.
- **Filters panel** (⚙ Filters, with an active-count badge) — Village, Loan amount range, Gold/silver weight range, Date range, plus three special filters: **Today's loans**, **Overdue**, and **Renewals**.
- **Honest definitions for the two filters that don't map to a stored field** — Firestore doesn't track "overdue" or "renewal" as concepts, so these are defined here as reasonable business heuristics, spelled out right in the filter dropdown: **Overdue** = an active loan with no payment recorded in the last 90 days. **Renewals** = a loan that's been topped up more than once (2+ disbursements). Both are easy to adjust later if you'd rather define them differently.
- **Customers page** got the same search bar treatment — name, mobile, Aadhaar, village, and notes, same typo tolerance and highlighting.
- **One thing intentionally left out:** "Occupation" was on the original feature list, but there's no occupation field anywhere in the app today — it's not something currently collected on the customer form, so there's nothing to search. Say the word if you want it added as a real field first.
- New file: `js/search.js` (shared matching/highlighting logic, reused by both pages). Loans search also does one extra lightweight fetch of the customers collection (metadata only, no subcollections) so mobile/village can be searched even though those live on the customer record, not the loan.

## Customer profile — "Belongs to" column (new)

- The Loans table on each customer's profile page now shows a **Belongs to** column — a green "Self" badge, or a gold badge with the actual person's name if the item was pledged by someone else (in this customer's account). Pulled directly from the same `pledgedByMode`/`pledgedByName` fields already recorded at loan creation — no new data, just a column that was missing before.

## Customer Timeline (new)

- A beautiful vertical timeline on each customer's profile page — icon, title, exact timestamp, who performed it, and an optional description for every significant thing that's happened on their account: customer created/updated, loan created, disbursement added, interest collected, partial payment, mortgage renewed (re-lending on a released loan), item edited, rate changed, item released, ready-to-release, loan closed, receipt printed, surplus deposit added, withdrawal recorded.
- **Reuses your existing `activityLog` collection** rather than creating a separate one — every action that already wrote an activity log entry now also tags it with `customerId`, so this is genuinely free (no new writes added anywhere), just a new way of viewing data you were already recording. The one truly new write is logging customer-created/customer-updated, which didn't have any activity logging before.
- **Real pagination, not a fake one** — loads 20 events at a time via a proper `limit()` + `startAfter()` query; scrolling down triggers loading the next real page only when you actually reach it (via `IntersectionObserver`), never "fetch everything up front."
- **Searchable** — filters whatever's currently loaded, with matched text highlighted, same client-side pattern used everywhere else in this app (Owl Assistant, customer search).
- **Honest limitation:** only events from *after* this update was deployed will show up on the Timeline — activity from before this (loans created, payments collected, etc. prior to today) was never tagged with a `customerId`, so there's nothing to query for it. Nothing needs fixing for this — it's not a bug, just the natural boundary of turning on a new kind of tracking; everything going forward is captured correctly.
- **One-time setup required, same pattern as the deposits/reports features:** the Timeline query (`customerId` + sorted by time) needs a Firestore composite index. If Timeline shows an error or stays empty after deploying, check your browser console — Firestore gives a direct one-click link to create the exact index needed.
- Files: `js/nav.js` (event icon/color config + the extended `logActivity()`), every file that already called `logActivity` (`js/loan-create.js`, `js/loan-detail.js`, `js/customers.js`, `js/customer-profile.js`), plus `pages/customer-profile.html` and `css/style.css` for the timeline UI itself.

## Dark mode (new)

- **Light / Dark / System**, with a quick toggle in the sidebar and a fuller one on the Profile page under "Appearance." Uses genuinely designed dark colors (very dark navy background, dark blue cards, soft white text, gold accent) rather than simply inverting the light palette — same navy=structural/gold=accent relationship as light mode, just remapped to dark-appropriate shades.
- **No flash of the wrong theme on load** — a tiny inline script in every page's `<head>` applies the saved preference before first paint, so there's never a flash of light mode before dark kicks in (or vice versa).
- **"System" stays live** — if your phone or laptop's OS theme changes while the app is open (e.g. auto night mode), it follows automatically without a reload.
- The Owl Assistant's chat bubbles and the dashboard's SVG chart already used the shared color-variable system, so they adapt automatically — no separate dark-mode styling needed for them.
- **Printed receipts are intentionally excluded** and always stay black-on-white regardless of your theme choice, since dark backgrounds don't print well and waste ink.
- New file: `js/theme.js`. Touches every page's `<head>` (the tiny inline script) and script list (`theme.js` tag), plus `css/style.css` for the palette, `js/nav.js` for the sidebar toggle, `pages/profile.html` + `js/profile.js` for the fuller Appearance section, and `js/owl-assistant.js` (recolored to use the shared variables instead of its own hardcoded hex values).

## Still remaining (needs infrastructure beyond this web app)

- **Android wrapper** — like your rate-board app; a separate Android Studio project, not part of this web app
- **SMS reminders** — WhatsApp reminders are free (open WhatsApp with a message), but SMS needs a paid gateway (e.g. Twilio, MSG91) with its own account and API keys — tell me if you want this wired in once you've picked a provider
