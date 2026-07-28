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
 * Interest for a single disbursement, as of a given date.
 * @param {{amount:number, rate:number, date:any}} disb
 * @param {Date|string} asOfDate
 */
function calcDisbursementInterest(disb, asOfDate = new Date()) {
  const months = monthsElapsed(disb.date, asOfDate);
  const days = daysBetween(disb.date, asOfDate);
  const interest = round2((disb.amount || 0) * ((disb.rate || 0) / 100) * months);
  return { days, months, rate: disb.rate, principal: disb.amount, interest };
}

/**
 * Full loan interest breakdown: per-disbursement + combined totals.
 * @param {Array} disbursements
 * @param {Array} payments - [{amount, type: 'interest'|'principal'|'full'}]
 * @param {Date} asOfDate
 */
function calcLoanSummary(disbursements, payments = [], asOfDate = new Date()) {
  const perDisbursement = disbursements.map((d) => ({
    ...d,
    ...calcDisbursementInterest(d, asOfDate),
  }));

  const totalPrincipal = sum(disbursements.map((d) => d.amount));
  const totalInterestAccrued = round2(sum(perDisbursement.map((d) => d.interest)));

  const interestPaid = sum(payments.filter((p) => p.type === "interest").map((p) => p.amount));
  const principalPaid = sum(payments.filter((p) => p.type === "principal" || p.type === "full").map((p) => p.amount));

  const principalOutstanding = round2(totalPrincipal - principalPaid);
  const interestOutstanding = round2(totalInterestAccrued - interestPaid);
  const totalPayableToday = round2(principalOutstanding + interestOutstanding);

  return {
    perDisbursement,
    totalPrincipal,
    totalInterestAccrued,
    interestPaid,
    principalPaid,
    principalOutstanding,
    interestOutstanding,
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
