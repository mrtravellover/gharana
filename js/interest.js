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
 * Minimum charge: any part-month counts as a full month (see monthsElapsed).
 * So a loan kept for 1 day still owes 1 month's interest; a loan kept for
 * 45 days owes 2 months. The per-disbursement breakdown below shows the
 * exact day count alongside the months actually charged, so it's easy to
 * verify by hand.
 */
function calcLoanSummary(disbursements, payments = [], asOfDate = new Date()) {
  // Running state per disbursement, oldest first.
  const states = [...disbursements]
    .sort((a, b) => toJsDate(a.date) - toJsDate(b.date))
    .map((d) => ({
      originalDate: d.date,
      rate: d.rate,
      originalAmount: d.amount,
      principal: d.amount,
      periodStart: toJsDate(d.date),
      unpaidInterest: 0,
    }));

  const sortedPayments = [...payments].sort((a, b) => toJsDate(a.date) - toJsDate(b.date));

  let interestPaidTotal = 0;
  let principalPaidTotal = 0;

  for (const p of sortedPayments) {
    let remaining = Number(p.amount) || 0;
    const pd = toJsDate(p.date);

    for (const s of states) {
      if (remaining <= 0) break;
      if (s.principal <= 0 && s.unpaidInterest <= 0) continue; // already settled

      const months = monthsElapsed(s.periodStart, pd);
      const interestThisPeriod = round2(s.principal * (s.rate / 100) * months);
      const totalDue = round2(s.unpaidInterest + interestThisPeriod);

      if (remaining >= totalDue + s.principal) {
        // fully settles this disbursement
        interestPaidTotal += totalDue;
        principalPaidTotal += s.principal;
        remaining = round2(remaining - totalDue - s.principal);
        s.principal = 0;
        s.unpaidInterest = 0;
        s.periodStart = pd;
      } else if (remaining >= totalDue) {
        const towardPrincipal = round2(remaining - totalDue);
        interestPaidTotal += totalDue;
        principalPaidTotal += towardPrincipal;
        s.principal = round2(s.principal - towardPrincipal);
        s.unpaidInterest = 0;
        s.periodStart = pd;
        remaining = 0;
      } else {
        interestPaidTotal += remaining;
        s.unpaidInterest = round2(totalDue - remaining);
        s.periodStart = pd; // clock still resets; the shortfall carries forward as unpaidInterest
        remaining = 0;
      }
    }
    // any leftover after all disbursements are settled is a credit — not tracked yet (edge case)
  }

  // Final open period, as of today (or asOfDate)
  const perDisbursement = states.map((s) => {
    const days = daysBetween(s.periodStart, asOfDate);
    const months = monthsElapsed(s.periodStart, asOfDate);
    const openInterest = round2(s.principal * (s.rate / 100) * months);
    const interest = round2(s.unpaidInterest + openInterest);
    return {
      originalDate: s.originalDate,
      effectiveDate: s.periodStart,
      dateChanged: toJsDate(s.periodStart).getTime() !== toJsDate(s.originalDate).getTime(),
      rate: s.rate,
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
