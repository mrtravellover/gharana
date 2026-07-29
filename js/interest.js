// ============================================================
// INTEREST ENGINE
// Method: standard simple interest — Principal × (monthly rate / 100) × months.
// Rate is entered manually per disbursement (varies per customer).
// Partial-month rule: ROUND UP — any part of a month started counts as a
// full month (classic sarafa practice, matches your 30-day convention).
// Change ROUND_MODE to "exact" below to switch to daily pro-rating instead.
// ============================================================

const ROUND_MODE = "roundup"; // "roundup" | "exact"

function daysBetween(from, to) {
  const a = toJsDate(from), b = toJsDate(to);
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function toJsDate(d) {
  if (!d) return new Date();
  if (d.toDate) return d.toDate();
  return new Date(d);
}

function monthsElapsed(fromDate, toDate, mode = ROUND_MODE) {
  const days = daysBetween(fromDate, toDate);
  if (days <= 0) return 0;
  if (mode === "exact") return days / 30;
  return Math.ceil(days / 30); // round up to next full month
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
 *
 * INTEREST TYPE: each disbursement can be "simple" (Principal × rate% ×
 * months) or "compound" (monthly compounding: Principal × ((1+rate%)^months − 1)).
 * Note: compounding applies within each open period on the principal; any
 * interest already carried forward as unpaidInterest is not itself compounded
 * again — kept simple on purpose for a paper-ledger-style business.
 *
 * Minimum charge: any part-month counts as a full month (see monthsElapsed).
 * So a loan kept for 1 day still owes 1 month's interest; a loan kept for
 * 45 days owes 2 months. The per-disbursement breakdown shows the exact day
 * count alongside the months actually charged, so it's easy to verify by hand.
 */
function periodInterest(principal, ratePct, months, type) {
  if (months <= 0 || principal <= 0) return 0;
  if (type === "compound") {
    return round2(principal * (Math.pow(1 + ratePct / 100, months) - 1));
  }
  return round2(principal * (ratePct / 100) * months);
}

function calcLoanSummary(disbursements, payments = [], asOfDate = new Date()) {
  // Running state per disbursement, oldest first.
  const states = [...disbursements]
    .sort((a, b) => toJsDate(a.date) - toJsDate(b.date))
    .map((d) => {
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

  // Merge payments + rate-change events into one chronological timeline.
  const events = [];
  payments.forEach((p) => events.push({ kind: "payment", date: toJsDate(p.date), amount: Number(p.amount) || 0 }));
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
      const months = monthsElapsed(s.periodStart, ev.date);
      const interestThisPeriod = periodInterest(s.principal, s.rate, months, s.interestType);
      s.unpaidInterest = round2(s.unpaidInterest + interestThisPeriod);
      s.periodStart = ev.date;
      s.rate = ev.newRate;
      continue;
    }

    let remaining = ev.amount;
    let interestPortion = 0, principalPortion = 0;

    for (const s of states) {
      if (remaining <= 0) break;
      if (s.principal <= 0 && s.unpaidInterest <= 0) continue; // already settled

      const months = monthsElapsed(s.periodStart, ev.date);
      const interestThisPeriod = periodInterest(s.principal, s.rate, months, s.interestType);
      const totalDue = round2(s.unpaidInterest + interestThisPeriod);

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
      } else {
        interestPaidTotal += remaining;
        interestPortion += remaining;
        s.unpaidInterest = round2(totalDue - remaining);
        s.periodStart = ev.date; // clock still resets; the shortfall carries forward as unpaidInterest
        remaining = 0;
      }
    }
    // any leftover after all disbursements are settled is a credit — not tracked yet (edge case)
    paymentBreakdown.push({ date: ev.date, amount: ev.amount, interestPortion: round2(interestPortion), principalPortion: round2(principalPortion) });
  }

  // Final open period, as of today (or asOfDate)
  const perDisbursement = states.map((s) => {
    const days = daysBetween(s.periodStart, asOfDate);
    const months = monthsElapsed(s.periodStart, asOfDate);
    const openInterest = periodInterest(s.principal, s.rate, months, s.interestType);
    const interest = round2(s.unpaidInterest + openInterest);
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
      months,
      interest,
      settled: s.principal <= 0 && interest <= 0,
    };
  });

  const totalPrincipal = sum(disbursements.map((d) => d.amount));
  const principalOutstanding = round2(sum(perDisbursement.map((d) => d.principal)));
  const interestOutstanding = round2(sum(perDisbursement.map((d) => d.interest)));
  const totalPayableToday = round2(principalOutstanding + interestOutstanding);

  return {
    perDisbursement,
    paymentBreakdown,
    totalPrincipal,
    principalOutstanding,
    interestOutstanding,
    interestPaid: round2(interestPaidTotal),
    principalPaid: round2(principalPaidTotal),
    totalPayableToday,
  };
}

function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
function round2(n) { return Math.round(n * 100) / 100; }

// Silver purity → category (Haali / Paat)
function silverCategory(purity) {
  const p = Number(purity);
  if (isNaN(p)) return "";
  return p < 75 ? "Haali" : "Paat";
}
