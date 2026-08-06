// ============================================================
// INTEREST ENGINE — 365/366-day (actual/actual) method
// Method: Principal × (annual rate / 100) × year-fraction, where the
// year-fraction counts real elapsed days against the REAL length of
// whichever calendar year(s) they fall in (365, or 366 in a leap year) —
// not a flat 30-day-month approximation. Annual rate = monthly rate × 12.
// If a period crosses a calendar year boundary (e.g. Dec into a leap
// year), each side of the boundary is weighted by its own year's real
// length, so leap years are handled correctly either side of the split.
//
// This is the SAME method for every disbursement on every loan — first
// disbursement, top-ups, re-lends, all identical. It also applies
// retroactively: today's interest-due figure on every loan, active or
// closed-then-reopened, is computed this way now.
//
// MINIMUM CHARGE: a floor of 1 month's worth of interest (Principal ×
// monthly rate%) always applies once any time has passed at all, however
// short — so 1 day still owes 1 month's interest, same as before. Above
// that floor, interest is fully continuous/exact — no rounding to whole
// months, no "10 months, minimum rule" style billing brackets.
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

// "Same date next month" — e.g. 3-Jun -> 3-Jul. If the target month is
// shorter and doesn't have that day (31-Jan -> Feb), rolls back to the
// target month's last real day rather than overflowing into March.
function addOneMonth(date) {
  const d = toJsDate(date);
  const targetMonth = d.getMonth() + 1;
  const result = new Date(d.getFullYear(), targetMonth, d.getDate());
  if (result.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    return new Date(d.getFullYear(), targetMonth + 1, 0); // last real day of the target month
  }
  return result;
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
 * year-fraction, using the real-calendar (365/366-day) method above. Used
 * directly by the loan engine's day-wise mode (see computeTotalDue
 * further below), where the minimum-period mechanism already handles the
 * "1 month minimum" requirement explicitly and precisely — applying
 * periodInterest()'s blanket floor on top of that would double up the
 * minimum incorrectly.
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
 * of 1 month's interest applied once any time has passed. Used by the
 * Surplus Deposits feature (customer-profile.js, owl-assistant.js) —
 * unchanged. The loan engine itself no longer uses this floor directly
 * (see rawInterest above, and computeTotalDue below) — its minimum-period
 * handling supersedes it with a precise, once-only rule instead of a
 * blanket floor reapplied on every accrual period.
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
  const states = sortedDisbursements.map((d, idx) => {
      const history = (d.rateHistory && d.rateHistory.length ? d.rateHistory : [{ date: d.date, rate: d.rate }])
        .slice()
        .sort((a, b) => toJsDate(a.date) - toJsDate(b.date));
      // Whether this disbursement gets the one-time "1 month minimum, then
      // day-wise forever" treatment: the loan's very first disbursement,
      // or one that reactivated a released loan — both set explicitly via
      // startsMinimumPeriod when the disbursement is created. Disbursements
      // from before this field existed fall back to "only the earliest one
      // qualifies" — the best available default for old data, and it's the
      // correct behavior for the very common case of a single-disbursement loan.
      const usesMinimumRule = d.startsMinimumPeriod !== undefined ? !!d.startsMinimumPeriod : idx === 0;
      const minimumRequired = usesMinimumRule ? round2(d.amount * (history[0].rate / 100)) : 0;
      return {
        id: d.id,
        originalDate: d.date,
        originalAmount: d.amount,
        principal: d.amount,
        periodStart: toJsDate(d.date),
        unpaidInterest: usesMinimumRule ? minimumRequired : 0,
        rate: history[0].rate,
        interestType: d.interestType || "simple",
        pendingRateChanges: history.slice(1),
        usesMinimumRule,
        minimumRequired,
        minimumWindowEnd: usesMinimumRule ? addOneMonth(d.date) : null,
        minimumTransitioned: false,
      };
    });

  // Computes how much interest is currently due for a disbursement, and
  // (as a side effect) permanently transitions it out of the minimum-period
  // phase the first time it's queried at or after the window's end date.
  //
  // Disbursements NOT using the minimum rule (or already transitioned past
  // it) behave exactly as before: unpaidInterest + newly-accrued day-wise
  // interest since periodStart.
  //
  // Disbursements still WITHIN their minimum window behave completely
  // differently, per the locked business rule: the entire first month's
  // interest is due in full from day one — not a day-by-day growing
  // amount — and however many payments it takes to fully cover that fixed
  // amount, NOTHING further is owed until the window's calendar end date,
  // no matter how many times the customer pays in between. unpaidInterest
  // here IS that remaining fixed amount — it starts at the full minimum
  // and only ever decreases as payments settle it; it does not grow with
  // time the way it does outside the window.
  function computeTotalDue(s, queryDate) {
    if (!s.usesMinimumRule || s.minimumTransitioned) {
      return round2(s.unpaidInterest + rawInterest(s.principal, s.rate, s.periodStart, queryDate, s.interestType));
    }
    if (queryDate < s.minimumWindowEnd) {
      return round2(Math.max(0, s.unpaidInterest));
    }
    // Window has ended: whatever's still unpaid toward the minimum stays
    // owed, and day-wise interest now starts fresh from the window's end
    // date — permanently, for the rest of this disbursement's life. No
    // floor from here on — rawInterest(), not periodInterest() — the
    // minimum requirement has already been fully accounted for above.
    s.minimumTransitioned = true;
    s.periodStart = s.minimumWindowEnd;
    return round2(s.unpaidInterest + rawInterest(s.principal, s.rate, s.periodStart, queryDate, s.interestType));
  }

  // Merge payments + rate-change events into one chronological timeline.
  const events = [];
  payments.forEach((p) => events.push({
    kind: p.type === "advance_interest" ? "advance_interest" : "payment",
    date: toJsDate(p.date),
    amount: Number(p.amount) || 0,
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
        remaining = 0;
      }
      const creditPortion = round2(ev.amount - settledPortion);
      // Deliberately NOT counted in interestPaidTotal here — see note above
      // on deferred recognition — but the split IS recorded for display
      // (receipts, the payment history) even though it isn't "earned" yet.
      paymentBreakdown.push({
        date: ev.date, amount: ev.amount, interestPortion: 0, principalPortion: 0,
        isAdvanceInterest: true, settledPortion, creditPortion,
      });
      continue;
    }

    let remaining = ev.amount;
    let interestPortion = 0, principalPortion = 0;
    let isFirstTouchedState = true;

    for (const s of states) {
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
      } else if (isFirstTouchedState) {
        // A genuine partial/shortfall payment — only meaningful as an
        // intentional action on the FIRST disbursement a payment reaches.
        interestPaidTotal += remaining;
        interestPortion += remaining;
        s.unpaidInterest = round2(totalDue - remaining);
        s.periodStart = ev.date; // clock still resets; the shortfall carries forward as unpaidInterest
        remaining = 0;
      } else {
        // Spillover reaching a LATER disbursement, too small to make real
        // progress there (doesn't fully cover its due interest) — almost
        // always just a rounding-level difference between a manually
        // estimated payoff amount and the app's precise day-based
        // calculation (see README), not a deliberate payment toward this
        // disbursement. Leaving it untouched matters: resetting its clock
        // here would prematurely lock in a full month's minimum interest
        // on a disbursement nobody actually paid anything meaningful
        // toward. The leftover is simply not applied anywhere further.
        remaining = 0;
      }
      isFirstTouchedState = false;
    }
    paymentBreakdown.push({ date: ev.date, amount: ev.amount, interestPortion: round2(interestPortion), principalPortion: round2(principalPortion) });
  }

  // Final open period, as of today (or asOfDate)
  const perDisbursement = states.map((s) => {
    const stillInWindow = s.usesMinimumRule && !s.minimumTransitioned && toJsDate(asOfDate) < s.minimumWindowEnd;
    const interest = computeTotalDue(s, toJsDate(asOfDate)); // may transition s.minimumTransitioned/s.periodStart as a side effect
    const days = daysBetween(stillInWindow ? s.originalDate : s.periodStart, asOfDate);
    const floorValue = round2(s.principal * (s.rate / 100));
    const minimumApplied = stillInWindow ? days > 0 : (days > 0 && interest <= floorValue + 0.01);
    return {
      id: s.id,
      originalDate: s.originalDate,
      effectiveDate: stillInWindow ? s.originalDate : s.periodStart,
      dateChanged: toJsDate(s.periodStart).getTime() !== toJsDate(s.originalDate).getTime(),
      rate: s.rate,
      interestType: s.interestType,
      originalAmount: s.originalAmount,
      principal: s.principal,
      days,
      minimumApplied,
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
  // search rather than a closed-form formula, since the 1-month-minimum
  // floor rule (which also applies here — see README) makes a clean
  // algebraic solution messy; a loop is simple, cheap, and exact.
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
