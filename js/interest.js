// ============================================================
// INTEREST ENGINE — 365/366-day (actual/actual) method, pure day-wise,
// no minimum charge of any kind.
// Method: Principal × (annual rate / 100) × year-fraction, where the
// year-fraction counts real elapsed days against the REAL length of
// whichever calendar year(s) they fall in (365, or 366 in a leap year) —
// not a flat 30-day-month approximation. Annual rate = monthly rate × 12.
// If a period crosses a calendar year boundary (e.g. Dec into a leap
// year), each side of the boundary is weighted by its own year's real
// length, so leap years are handled correctly either side of the split.
//
// This is the SAME method for every disbursement on every loan — first
// disbursement, top-ups, re-lends, all identical, from day one. No 1-month
// minimum, no floor of any kind — interest is exact from the very first
// day, for every rupee, every time. (A separate function below,
// periodInterest(), still carries a minimum-charge floor — that one is
// used only by the unrelated Surplus Deposits feature, not loans.)
//
// Rate is entered manually per disbursement (varies per customer).
// ============================================================

function daysBetween(from, to) {
  const a = toJsDate(from), b = toJsDate(to);
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function toJsDate(d) {
  if (!d) return new Date();
  if (d.toDate) return d.toDate();
  return new Date(d);
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// Continuous year-fraction between two dates, weighting each calendar-year
// segment by its own real length (365 or 366 days) — correctly handles a
// period that spans a leap-year boundary.
function yearFraction(fromDate, toDate) {
  const from = toJsDate(fromDate), to = toJsDate(toDate);
  if (to <= from) return 0;
  let fraction = 0;
  let cursor = new Date(from);
  while (cursor < to) {
    const yearEnd = new Date(cursor.getFullYear() + 1, 0, 1);
    const segEnd = yearEnd < to ? yearEnd : to;
    const segDays = Math.round((segEnd - cursor) / 86400000);
    fraction += segDays / (isLeapYear(cursor.getFullYear()) ? 366 : 365);
    cursor = segEnd;
  }
  return fraction;
}

// Real elapsed duration as "9 months, 22 days" — a plain-language
// description of the gap, for display only. Not a billing unit anymore;
// the actual interest math uses yearFraction()/periodInterest() below.
function formatDuration(days) {
  if (days <= 0) return "0 days";
  const years = Math.floor(days / 365);
  const afterYears = days % 365;
  const months = Math.floor(afterYears / 30);
  const remDays = afterYears % 30;
  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (remDays > 0 || parts.length === 0) parts.push(`${remDays} day${remDays === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/**
 * Raw day-based interest with NO floor — Principal × (annual rate / 100) ×
 * year-fraction, using the real-calendar (365/366-day) method above. This
 * is what the loan engine uses for everything now — pure day-wise, always.
 */
function rawInterest(principal, monthlyRatePct, fromDate, toDate, type) {
  const days = daysBetween(fromDate, toDate);
  if (days <= 0 || principal <= 0) return 0;

  const annualRatePct = monthlyRatePct * 12;
  const yf = yearFraction(fromDate, toDate);
  let interest;

  if (type === "compound") {
    const months = yf * 12;
    interest = principal * (Math.pow(1 + monthlyRatePct / 100, months) - 1);
  } else if (type === "compound_annual") {
    let p = principal;
    const fullYears = Math.floor(yf);
    for (let i = 0; i < fullYears; i++) p += p * (annualRatePct / 100);
    const remainder = yf - fullYears;
    p += p * (annualRatePct / 100) * remainder;
    interest = p - principal;
  } else {
    interest = principal * (annualRatePct / 100) * yf;
  }

  return round2(interest);
}

/**
 * Interest on a principal from fromDate to toDate, at a given MONTHLY
 * rate, using the real-calendar (365/366-day) method above, WITH a floor
 * of 1 month's interest applied once any time has passed. Used ONLY by
 * the Surplus Deposits feature (customer-profile.js, owl-assistant.js) —
 * a separate, unrelated feature from loans. The loan engine below uses
 * rawInterest() (no floor) exclusively.
 *
 * INTEREST TYPE: "simple" (the standard method above), "compound"
 * (continuously compounds using the exact elapsed months as a fractional
 * exponent: Principal × ((1+rate%)^months − 1)), or "compound_annual"
 * (compounds once per full elapsed year, with a final simple-interest
 * remainder for any partial year left over).
 */
function periodInterest(principal, monthlyRatePct, fromDate, toDate, type) {
  const days = daysBetween(fromDate, toDate);
  if (days <= 0 || principal <= 0) return 0;
  const interest = rawInterest(principal, monthlyRatePct, fromDate, toDate, type);
  const minimum = principal * (monthlyRatePct / 100); // 1 month's worth — the floor
  return round2(Math.max(interest, minimum));
}

/**
 * PAYMENT WATERFALL (applies to every payment, regardless of the "type" label):
 *   1. Payment first clears any interest owed.
 *   2. Anything left over after interest reduces the principal.
 *   3. From that moment, interest on the (now smaller) principal starts
 *      counting fresh from the payment date — the "new date" — while the
 *      original disbursement date is always kept for reference/history.
 * Disbursements are settled oldest-first (FIFO) when one payment needs to
 * cover more than one disbursement.
 *
 * RATE CHANGES: a disbursement can carry a `rateHistory` — e.g. given at 2%,
 * later changed to 2.5% from a chosen date onward (recorded via "Edit rate"
 * in the app). When a rate change happens, interest already accrued at the
 * OLD rate up to that date is locked in (folded into unpaidInterest); only
 * interest AFTER that date uses the new rate. Nothing is recalculated
 * retroactively.
 */
function calcLoanSummary(disbursements, payments = [], asOfDate = new Date()) {
  const sortedDisbursements = [...disbursements].sort((a, b) => toJsDate(a.date) - toJsDate(b.date));
  const states = sortedDisbursements.map((d) => {
      const history = (d.rateHistory && d.rateHistory.length ? d.rateHistory : [{ date: d.date, rate: d.rate }])
        .slice()
        .sort((a, b) => toJsDate(a.date) - toJsDate(b.date));
      return {
        id: d.id,
        originalDate: d.date,
        originalAmount: d.amount,
        principal: d.amount,
        periodStart: toJsDate(d.date),
        unpaidInterest: 0,
        rate: history[0].rate,
        interestType: d.interestType || "simple",
        pendingRateChanges: history.slice(1),
      };
    });

  // How much interest is currently due for a disbursement — always pure
  // day-wise from periodStart to queryDate, no floor, no exceptions.
  function computeTotalDue(s, queryDate) {
    return round2(s.unpaidInterest + rawInterest(s.principal, s.rate, s.periodStart, queryDate, s.interestType));
  }

  // Merge payments + rate-change events into one chronological timeline.
  const events = [];
  payments.forEach((p) => events.push({
    kind: p.type === "advance_interest" ? "advance_interest" : "payment",
    date: toJsDate(p.date),
    amount: Number(p.amount) || 0,
    targetDisbursementId: p.targetDisbursementId || null,
  }));
  states.forEach((s, idx) => {
    s.pendingRateChanges.forEach((rc) => {
      events.push({ kind: "ratechange", date: toJsDate(rc.date), stateIndex: idx, newRate: rc.rate });
    });
  });
  events.sort((a, b) => a.date - b.date);

  let interestPaidTotal = 0;
  let principalPaidTotal = 0;
  const paymentBreakdown = []; // per-payment interest/principal split, for reports

  for (const ev of events) {
    if (ev.kind === "ratechange") {
      const s = states[ev.stateIndex];
      s.unpaidInterest = computeTotalDue(s, ev.date);
      s.periodStart = ev.date;
      s.rate = ev.newRate;
      continue;
    }

    if (ev.kind === "advance_interest") {
      // A prepayment against FUTURE interest — deliberately does not
      // reduce principal and does not count as "interest earned" yet
      // (that recognition happens naturally at whichever later event
      // finally draws the credit down — see paymentBreakdown below).
      // Applied to the oldest disbursement that still has outstanding
      // principal (the only kind that can still accrue interest against
      // it); for the common case of a single disbursement this is exact,
      // for a loan with several it concentrates the whole credit on the
      // oldest one — the combined total across all disbursements is
      // still correct either way, since interestOutstanding is a sum.
      let remaining = ev.amount;
      let settledPortion = 0; // how much of this payment covered interest already due at the time
      let touchedId = null;
      for (const s of states) {
        if (remaining <= 0) break;
        if (s.principal <= 0) continue; // nothing left here to ever accrue interest against
        const totalDue = computeTotalDue(s, ev.date);
        settledPortion = round2(Math.max(0, Math.min(totalDue, remaining)));
        // Whatever's already due gets covered; anything beyond that
        // becomes a NEGATIVE unpaidInterest — a credit that the engine's
        // existing "unpaidInterest + newly-accrued interest" math will
        // automatically net against as real interest keeps accruing.
        s.unpaidInterest = round2(totalDue - remaining);
        s.periodStart = ev.date;
        touchedId = s.id;
        remaining = 0;
      }
      const creditPortion = round2(ev.amount - settledPortion);
      // Deliberately NOT counted in interestPaidTotal here — see note above
      // on deferred recognition — but the split IS recorded for display
      // (receipts, the payment history) even though it isn't "earned" yet.
      paymentBreakdown.push({
        date: ev.date, amount: ev.amount, interestPortion: 0, principalPortion: 0,
        isAdvanceInterest: true, settledPortion, creditPortion,
        touchedDisbursementIds: touchedId ? [touchedId] : [],
      });
      continue;
    }

    let remaining = ev.amount;
    let interestPortion = 0, principalPortion = 0;
    let isFirstTouchedState = true;
    const touchedDisbursementIds = [];

    // A payment can optionally target one specific disbursement instead of
    // the usual oldest-first waterfall — e.g. paying off a smaller top-up
    // on its own without it going toward an older, unrelated disbursement
    // first. Falls back to the normal full waterfall if the targeted
    // disbursement can't be found (e.g. stale reference), rather than the
    // payment silently applying nowhere.
    const targeted = ev.targetDisbursementId ? states.filter((s) => s.id === ev.targetDisbursementId) : [];
    const statesToProcess = targeted.length ? targeted : states;

    for (const s of statesToProcess) {
      if (remaining <= 0) break;
      if (s.principal <= 0 && s.unpaidInterest <= 0) continue; // already settled

      const totalDue = computeTotalDue(s, ev.date);

      if (remaining >= totalDue + s.principal) {
        interestPaidTotal += totalDue;
        principalPaidTotal += s.principal;
        interestPortion += totalDue;
        principalPortion += s.principal;
        remaining = round2(remaining - totalDue - s.principal);
        s.principal = 0;
        s.unpaidInterest = 0;
        s.periodStart = ev.date;
        touchedDisbursementIds.push(s.id);
      } else if (remaining >= totalDue) {
        const towardPrincipal = round2(remaining - totalDue);
        interestPaidTotal += totalDue;
        principalPaidTotal += towardPrincipal;
        interestPortion += totalDue;
        principalPortion += towardPrincipal;
        s.principal = round2(s.principal - towardPrincipal);
        s.unpaidInterest = 0;
        s.periodStart = ev.date;
        remaining = 0;
        touchedDisbursementIds.push(s.id);
      } else if (isFirstTouchedState) {
        // A genuine partial/shortfall payment — only meaningful as an
        // intentional action on the FIRST disbursement a payment reaches.
        interestPaidTotal += remaining;
        interestPortion += remaining;
        s.unpaidInterest = round2(totalDue - remaining);
        s.periodStart = ev.date; // clock still resets; the shortfall carries forward as unpaidInterest
        remaining = 0;
        touchedDisbursementIds.push(s.id);
      } else {
        // Spillover reaching a LATER disbursement, too small to make real
        // progress there (doesn't fully cover its due interest) — almost
        // always just a rounding-level difference between a manually
        // estimated payoff amount and the app's precise day-based
        // calculation, not a deliberate payment toward this disbursement.
        // Leaving it untouched keeps its accrual clean and unaffected by
        // an incidental amount nobody actually intended for it. Not
        // recorded as "touched" — this disbursement genuinely wasn't paid.
        remaining = 0;
      }
      isFirstTouchedState = false;
    }
    paymentBreakdown.push({ date: ev.date, amount: ev.amount, interestPortion: round2(interestPortion), principalPortion: round2(principalPortion), touchedDisbursementIds });
  }

  // Final open period, as of today (or asOfDate)
  const perDisbursement = states.map((s) => {
    const interest = computeTotalDue(s, toJsDate(asOfDate));
    const days = daysBetween(s.periodStart, asOfDate);
    return {
      id: s.id,
      originalDate: s.originalDate,
      effectiveDate: s.periodStart,
      dateChanged: toJsDate(s.periodStart).getTime() !== toJsDate(s.originalDate).getTime(),
      rate: s.rate,
      interestType: s.interestType,
      originalAmount: s.originalAmount,
      principal: s.principal,
      days,
      interest,
      settled: s.principal <= 0 && interest <= 0,
    };
  });

  const totalPrincipal = sum(disbursements.map((d) => d.amount));
  const principalOutstanding = round2(sum(perDisbursement.map((d) => d.principal)));
  const interestOutstanding = round2(sum(perDisbursement.map((d) => d.interest)));
  const totalPayableToday = round2(principalOutstanding + interestOutstanding);

  // If there's an active advance-interest credit (interestOutstanding
  // negative), project forward — with no further payments assumed — to
  // find the date it naturally gets used up by ongoing accrual. Day-by-day
  // search rather than a closed-form formula, kept simple and exact.
  const advanceCreditRemaining = interestOutstanding < 0 ? Math.abs(interestOutstanding) : 0;
  let creditExhaustionDate = null;
  if (advanceCreditRemaining > 0) {
    let probe = toJsDate(asOfDate);
    for (let i = 0; i < 730; i++) { // safety cap — roughly 2 years out
      probe = new Date(probe.getTime() + 86400000);
      const interestThen = round2(sum(states.map((s) => computeTotalDue(s, probe))));
      if (interestThen >= 0) { creditExhaustionDate = probe; break; }
    }
  }

  return {
    perDisbursement,
    paymentBreakdown,
    totalPrincipal,
    principalOutstanding,
    interestOutstanding,
    interestPaid: round2(interestPaidTotal),
    principalPaid: round2(principalPaidTotal),
    totalPayableToday,
    advanceCreditRemaining,
    creditExhaustionDate,
  };
}

// A negative interestOutstanding means there's an active advance-interest
// credit still in effect (a surplus owed back, not a debt) — styled
// distinctly so it reads as a clearly good thing at a glance, not as an
// error or something owed.
function fmtInterestDue(value) {
  if (value < 0) {
    return `<span style="color:var(--good);font-weight:600;">${fmtMoney(Math.abs(value))} credit</span>`;
  }
  return fmtMoney(value);
}

function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
function round2(n) { return Math.round(n * 100) / 100; }

// Silver purity → category (Haali / Paat)
function silverCategory(purity) {
  const p = Number(purity);
  if (isNaN(p)) return "";
  return p < 75 ? "Haali" : "Paat";
}
