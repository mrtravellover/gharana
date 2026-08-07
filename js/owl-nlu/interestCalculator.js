// ============================================================
// interestCalculator.js — wraps the app's REAL interest engine
// (js/interest.js: periodInterest / daysBetween / formatDuration).
// Deliberately does NOT reimplement any interest math itself — this
// module must be loaded after interest.js, and simply packages its
// output into a clean result object for responseGenerator.js to
// display. This guarantees the chatbot's numbers can never drift
// from what the real loan pages show.
//
// Exposes window.OwlNLU.interestCalculator
// ============================================================

(function () {
  window.OwlNLU = window.OwlNLU || {};

  function calculate({ principal, rate, fromDate, toDate, interestType }) {
    if (typeof periodInterest !== "function" || typeof daysBetween !== "function") {
      throw new Error("interestCalculator.js requires js/interest.js to be loaded first.");
    }
    const type = interestType || "simple";
    const to = toDate || new Date();
    const days = daysBetween(fromDate, to);
    const interest = periodInterest(principal, rate, fromDate, to, type);
    const floorValue = Math.round(principal * (rate / 100) * 100) / 100;
    const minimumApplied = days > 0 && interest <= floorValue + 0.01;

    return {
      principal,
      rate,
      fromDate,
      toDate: to,
      days,
      interest,
      totalPayable: Math.round((principal + interest) * 100) / 100,
      interestType: type,
      minimumApplied,
    };
  }

  window.OwlNLU.interestCalculator = { calculate };
})();
