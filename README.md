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

## Professional Receipt Generator (new)

- Replaces the old single "Print Receipt" button on a loan's detail page with "🧾 Generate Receipt" — pick from **five receipt types**: Loan Receipt, Payment Receipt, Interest Receipt, Renewal Receipt, and Gold Return Receipt. For the last four, a second dropdown lets you pick the specific payment, disbursement, or released item the receipt is about.
- Every receipt includes: your shop's logo and details, customer and loan info, a unique receipt number, date, a QR code, signature lines, terms & conditions, and a footer — genuinely branded, not just a plain printout.
- **"Download PDF" and "Print" both come from the same mechanism** — your browser's own print dialog. Every modern browser (desktop and mobile) has a "Save as PDF" option built into that dialog, so this gets you a real PDF file with zero new dependencies for that part, reusing the exact print mechanism this app already had.
- **"Share" is WhatsApp only** (no email, per your call on scope) — sends a text summary of the receipt (shop name, receipt number, loan number, customer, amount, date), not the actual PDF file itself. There's no reliable way for a plain web page to attach a generated file to a WhatsApp message automatically — the workflow is: Print/Save as PDF for the actual file, WhatsApp share to quickly notify the customer.
- **One genuinely new dependency**, worth being upfront about: a small QR code library (`qrcodejs`, from cdnjs — verified the exact URL and API before shipping it) since there's no way to generate a QR code with plain browser JavaScript. The QR encodes a short text summary (shop, receipt type, receipt number, loan number, date) rather than a link — there's no public/logged-out page in this app to link to.
- **Shop details are a placeholder you should edit** — at the top of `js/receipt.js`, a `SHOP_INFO` object has your shop name, tagline, address, and phone. Fill in your actual phone number (currently blank) and double check the rest. A proper "Shop Settings" page to edit this from the UI instead of in code was flagged as a future item, not built yet.
- New file: `js/receipt.js`. Touches `pages/loan-detail.html` (new picker modal, QR library script tag), `js/loan-detail.js` (replaced the old single-purpose print function with the new type-picker logic), and `css/style.css` (professional A4 print layout — logo header, QR placement, terms, footer).

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
