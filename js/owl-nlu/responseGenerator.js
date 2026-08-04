// ============================================================
// responseGenerator.js — turns an intentParser result into the
// actual chat message(s) to show. Reuses the existing owl-w-* CSS
// classes/fmtMoney/fmtDate already defined in owl-assistant.js, so
// the look is identical to the rest of the chat — no new styling.
//
// Exposes window.OwlNLU.responseGenerator
// ============================================================

(function () {
  window.OwlNLU = window.OwlNLU || {};

  // Renders the "I understood: Principal ₹X, Rate Y%, From ..., To ..."
  // confirmation card, then the calculated result underneath it.
  function renderCalculation(memorySnapshot) {
    const result = window.OwlNLU.interestCalculator.calculate(memorySnapshot);
    const typeLabel = result.interestType === "compound_annual" ? "Compounding (annually)" : "Simple";

    const confirmationHtml = `
      <div class="owl-w-card-head"><span class="t">I understood</span><span class="s">Here's what I'm calculating</span></div>
      <div class="owl-w-card-body">
        <div class="owl-w-row"><span class="l">Principal</span><span class="v">${fmtMoney(result.principal)}</span></div>
        <div class="owl-w-row"><span class="l">Rate</span><span class="v">${result.rate}% / month</span></div>
        <div class="owl-w-row"><span class="l">Method</span><span class="v">${typeLabel}</span></div>
        <div class="owl-w-row"><span class="l">From</span><span class="v">${fmtDate(result.fromDate)}</span></div>
        <div class="owl-w-row"><span class="l">To</span><span class="v">${fmtDate(result.toDate)}</span></div>
      </div>`;

    const resultHtml = `
      <div class="owl-w-card-body">
        <div class="owl-w-row"><span class="l">Duration</span><span class="v">${formatDuration(result.days)}</span></div>
        <div class="owl-w-row"><span class="l">Interest</span><span class="v owl-w-v-gold">${fmtMoney(result.interest)}</span></div>
        <div class="owl-w-row" style="margin-top:6px;"><span class="l">Total payable</span><span class="v owl-w-v-emerald">${fmtMoney(result.totalPayable)}</span></div>
      </div>
      <div class="owl-w-hint" style="padding:0 14px 12px;">${result.minimumApplied ? "1-month minimum applied." : "Exact — 365/366-day method."}</div>`;

    return { confirmationHtml, resultHtml };
  }

  function renderClarification(question) {
    return `${question}`;
  }

  function renderUnclear() {
    return 'I couldn\'t fully understand that. Could you rephrase, or give me the amount, rate, and date — e.g. <b>"10000 2.5 24-07-2025"</b>?';
  }

  window.OwlNLU.responseGenerator = { renderCalculation, renderClarification, renderUnclear };
})();
