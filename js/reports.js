let mode = "daily"; // daily | monthly | quarterly | halfyearly | yearly
let entryKind = "out"; // out | in
let periods = {}; // key -> { out, in, interest, outEntries, inEntries }
let sortedKeys = [];

const PERIOD_CONFIG = {
  daily: { keyFn: dayKey, labelFn: dayLabel, trendCount: 14 },
  monthly: { keyFn: monthKey, labelFn: monthLabel, trendCount: 12 },
  quarterly: { keyFn: quarterKey, labelFn: quarterLabel, trendCount: 8 },
  halfyearly: { keyFn: halfKey, labelFn: halfLabel, trendCount: 6 },
  yearly: { keyFn: yearKey, labelFn: (k) => k, trendCount: 6 },
};

requireAuth(async () => {
  renderShell({ active: "reports", title: "Reports" });

  document.querySelectorAll("#periodTabs button").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll("#periodTabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      mode = b.dataset.mode;
      const tabButtons = document.querySelectorAll("#periodTabs button");
      tabButtons.forEach((x) => (x.disabled = true));
      try {
        await ensureWindowCovers(requiredWindowStart(mode));
        buildPeriods();
      } catch (err) {
        console.error("Reports: failed to load this period's data:", err);
        toast("Couldn't load this period — check your connection, or see the browser console for details");
      } finally {
        tabButtons.forEach((x) => (x.disabled = false));
      }
    })
  );
  document.querySelectorAll("#entryTabs button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#entryTabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      entryKind = b.dataset.kind;
      renderEntries();
    })
  );
  document.getElementById("periodPicker").addEventListener("change", () => { renderEntries(); updateExportPeriodLabel(); });
  document.getElementById("exportCurrentPeriodOnly").addEventListener("change", updateExportPeriodLabel);

  try {
    await ensureWindowCovers(requiredWindowStart(mode));
    buildPeriods();
  } catch (err) {
    console.error("Reports: initial load failed:", err);
    toast("Couldn't load report data — check your connection, or see the browser console for details");
  }
  await loadMetalSummary();
});

/* ============================================================
   DATA LOADING — designed to scale to hundreds/thousands of loans.
   ============================================================
   The old approach fetched EVERY loan and its full disbursement +
   payment history, every time the page loaded — fine for a handful
   of test loans, but with 1,000+ loans that's potentially tens of
   thousands of document reads (and Firestore bills you per read) on
   every single visit, even if all you want is this month's numbers.

   New approach:
   1. Use a collection-group query (across every loan's payments/
      disbursements subcollections at once) filtered by date, to
      cheaply DISCOVER which loans had any activity in the window
      being viewed — without touching loans that had none.
   2. Only for THOSE loans, fetch their full history and run the
      existing calcLoanSummary() waterfall — this part can't be
      shortcut, because a payment's interest-vs-principal split
      genuinely depends on everything that happened on that loan
      before it, not just what's in the visible date window.
   3. Cache which loans have already been fully processed, so
      switching between period tabs never re-fetches the same loan
      twice in one visit.
   4. Only widen the window (fetch further back) when the currently
      selected view actually needs it — e.g. switching to the
      Yearly tab, or exporting the complete history.
   ============================================================ */

let allDisbEvents = [], allPayEvents = [];
let loadedWindowStart = null; // earliest date currently covered by the two arrays above
let processedLoanIds = new Set();
let loadingWindow = false;

// How far back the current view actually needs data, based on the trend
// chart's period count for this granularity — with a little buffer so nothing
// gets cut off right at the edge.
function requiredWindowStart(forMode) {
  const cfg = PERIOD_CONFIG[forMode];
  const daysPerUnit = { daily: 1, monthly: 31, quarterly: 92, halfyearly: 183, yearly: 366 }[forMode];
  const daysBack = cfg.trendCount * daysPerUnit + 31;
  return new Date(Date.now() - daysBack * 86400000);
}

// A deliberately very old anchor, used only when exporting the complete
// history — this is the one case that genuinely needs everything, ever.
function beginningOfTime() {
  return new Date(2000, 0, 1);
}

async function ensureWindowCovers(targetStart) {
  if (loadedWindowStart && targetStart >= loadedWindowStart) return; // already covered, nothing to do
  await loadDataForWindow(targetStart);
}

async function loadDataForWindow(windowStart) {
  loadingWindow = true;
  const tsStart = firebase.firestore.Timestamp.fromDate(windowStart);

  // Step 1 — cheap discovery: which loans have activity in this window?
  const [disbGroupSnap, payGroupSnap] = await Promise.all([
    db.collectionGroup("disbursements").where("date", ">=", tsStart).get(),
    db.collectionGroup("payments").where("date", ">=", tsStart).get(),
  ]);
  const relevantLoanIds = new Set();
  disbGroupSnap.docs.forEach((d) => relevantLoanIds.add(d.ref.parent.parent.id));
  payGroupSnap.docs.forEach((d) => relevantLoanIds.add(d.ref.parent.parent.id));

  // Step 2 — only fetch full history for loans we haven't already processed.
  const newLoanIds = [...relevantLoanIds].filter((id) => !processedLoanIds.has(id));

  await Promise.all(newLoanIds.map(async (loanId) => {
    const loanRef = db.collection("loans").doc(loanId);
    const [loanDoc, disbSnap, paySnap] = await Promise.all([
      loanRef.get(),
      loanRef.collection("disbursements").get(),
      loanRef.collection("payments").get(),
    ]);
    if (!loanDoc.exists) return;
    const loan = { id: loanId, ...loanDoc.data() };
    const disbursements = disbSnap.docs.map((d) => d.data());
    const paymentsRaw = paySnap.docs.map((d) => d.data());
    const summary = calcLoanSummary(disbursements, paymentsRaw);

    disbursements.forEach((d) => {
      allDisbEvents.push({ date: d.date, amount: d.amount, loanNumber: loan.loanNumber, customerName: loan.customerName });
    });
    summary.paymentBreakdown.forEach((p) => {
      allPayEvents.push({ date: p.date, amount: p.amount, interestPortion: p.interestPortion, principalPortion: p.principalPortion, loanNumber: loan.loanNumber, customerName: loan.customerName });
    });
    processedLoanIds.add(loanId);
  }));

  loadedWindowStart = windowStart;
  loadingWindow = false;
}

async function loadMetalSummary() {
  const activeSnap = await db.collection("loans").where("status", "==", "active").get();
  let goldWt = 0, silverWt = 0, haaliWt = 0, paatWt = 0;

  await Promise.all(activeSnap.docs.map(async (doc) => {
    const ornSnap = await db.collection("loans").doc(doc.id).collection("ornaments").get();
    ornSnap.docs.forEach((o) => {
      const d = o.data();
      if (d.released) return; // already handed back, not in the locker anymore
      const wt = (Number(d.weight) || 0) * (Number(d.qty) || 1);
      if (d.metalType === "Gold") {
        goldWt += wt;
      } else {
        silverWt += wt;
        if (d.category === "Haali") haaliWt += wt; else if (d.category === "Paat") paatWt += wt;
      }
    });
  }));

  document.getElementById("metalGold").textContent = `${goldWt.toFixed(2)} g`;
  document.getElementById("metalSilver").textContent = `${silverWt.toFixed(2)} g`;
  document.getElementById("metalHaali").textContent = `${haaliWt.toFixed(2)} g`;
  document.getElementById("metalPaat").textContent = `${paatWt.toFixed(2)} g`;
}

function buildPeriods() {
  const { keyFn } = PERIOD_CONFIG[mode];
  periods = {};

  allDisbEvents.forEach((e) => {
    const k = keyFn(e.date);
    ensurePeriod(k);
    periods[k].out += Number(e.amount) || 0;
    periods[k].outEntries.push(e);
  });
  allPayEvents.forEach((e) => {
    const k = keyFn(e.date);
    ensurePeriod(k);
    periods[k].in += Number(e.amount) || 0;
    periods[k].interest += Number(e.interestPortion) || 0;
    periods[k].inEntries.push(e);
  });

  sortedKeys = Object.keys(periods).sort().reverse();
  renderPeriodPicker();
  renderCompareCards();
  renderCompareChart();
  renderEntries();
  updateExportPeriodLabel();
}

function ensurePeriod(k) {
  if (!periods[k]) periods[k] = { out: 0, in: 0, interest: 0, outEntries: [], inEntries: [] };
}

function renderPeriodPicker() {
  const picker = document.getElementById("periodPicker");
  const { labelFn } = PERIOD_CONFIG[mode];
  picker.innerHTML = sortedKeys.map((k) => `<option value="${k}">${labelFn(k)}</option>`).join("")
    || `<option>No data yet</option>`;
}

// Shows the current period vs the previous two, side by side — e.g. This
// month / Last month / The month before that, or This year / Last year /
// Year before that, depending on the selected granularity.
function renderCompareCards() {
  const { labelFn } = PERIOD_CONFIG[mode];
  const container = document.getElementById("compareCards");
  const currentKey = PERIOD_CONFIG[mode].keyFn(new Date());
  // Always anchor comparison on "now", not just whatever data exists, so empty recent periods still show as ₹0.
  const anchorKeys = [currentKey, ...sortedKeys.filter((k) => k !== currentKey)];
  const keys = [...new Set(anchorKeys)].slice(0, 3);
  const titles = ["This period", "Previous", "Before that"];

  container.innerHTML = keys.map((k, i) => {
    const p = periods[k] || { in: 0, out: 0, interest: 0 };
    return `
      <div class="card" style="box-shadow:none;border:1px solid var(--line);">
        <div class="label" style="margin-bottom:2px;">${titles[i]}</div>
        <div style="font-weight:600;font-size:14px;margin-bottom:10px;">${labelFn(k)}</div>
        <div class="stat" style="margin-bottom:8px;"><div class="label">Money in</div><div class="value" style="font-size:16px;color:var(--good);">${fmtMoney(p.in)}</div></div>
        <div class="stat" style="margin-bottom:8px;"><div class="label">Money out</div><div class="value" style="font-size:16px;color:var(--danger);">${fmtMoney(p.out)}</div></div>
        <div class="stat"><div class="label">Interest earned</div><div class="value" style="font-size:16px;color:var(--gold-deep);">${fmtMoney(p.interest)}</div></div>
      </div>`;
  }).join("");
}

function renderCompareChart() {
  const { labelFn, trendCount } = PERIOD_CONFIG[mode];
  const showKeys = sortedKeys.slice(0, trendCount).reverse();
  const maxVal = Math.max(1, ...showKeys.flatMap((k) => [periods[k].in, periods[k].out, periods[k].interest]));

  const chart = document.getElementById("compareChart");
  if (showKeys.length === 0) { chart.innerHTML = `<p style="color:var(--ink-soft);">No transactions recorded yet.</p>`; return; }

  chart.innerHTML = showKeys.map((k) => `
    <div style="margin-bottom:14px;">
      <div style="font-size:12.5px;font-weight:600;margin-bottom:4px;">${labelFn(k)}</div>
      ${bar("In", periods[k].in, maxVal, "var(--good)")}
      ${bar("Out", periods[k].out, maxVal, "var(--danger)")}
      ${bar("Interest", periods[k].interest, maxVal, "var(--gold)")}
    </div>
  `).join("");
}

function bar(label, value, max, color) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  return `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>
      <div class="bar-value mono">${fmtMoney(value)}</div>
    </div>`;
}

function renderEntries() {
  const k = document.getElementById("periodPicker").value;
  const p = periods[k] || { out: 0, in: 0, interest: 0, outEntries: [], inEntries: [] };

  document.getElementById("periodMoneyIn").textContent = fmtMoney(p.in);
  document.getElementById("periodMoneyOut").textContent = fmtMoney(p.out);
  document.getElementById("periodInterest").textContent = fmtMoney(p.interest);

  const head = document.getElementById("entryHead");
  const body = document.getElementById("entryBody");

  if (entryKind === "out") {
    head.innerHTML = `<tr><th>Date</th><th>Loan #</th><th>Customer</th><th>Amount given</th></tr>`;
    const rows = [...p.outEntries].sort((a, b) => toJsDate(b.date) - toJsDate(a.date));
    body.innerHTML = rows.map((e) => `
      <tr><td>${fmtDate(e.date)}</td><td class="mono">${escapeHtml(e.loanNumber)}</td><td>${escapeHtml(e.customerName)}</td><td class="mono">${fmtMoney(e.amount)}</td></tr>
    `).join("") || `<tr><td colspan="4" style="color:var(--ink-soft);padding:16px 0;">No disbursements this period.</td></tr>`;
  } else {
    head.innerHTML = `<tr><th>Date</th><th>Loan #</th><th>Customer</th><th>Amount paid</th><th>→ Interest</th><th>→ Principal</th></tr>`;
    const rows = [...p.inEntries].sort((a, b) => toJsDate(b.date) - toJsDate(a.date));
    body.innerHTML = rows.map((e) => `
      <tr><td>${fmtDate(e.date)}</td><td class="mono">${escapeHtml(e.loanNumber)}</td><td>${escapeHtml(e.customerName)}</td><td class="mono">${fmtMoney(e.amount)}</td><td class="mono">${fmtMoney(e.interestPortion)}</td><td class="mono">${fmtMoney(e.principalPortion)}</td></tr>
    `).join("") || `<tr><td colspan="6" style="color:var(--ink-soft);padding:16px 0;">No payments this period.</td></tr>`;
  }
}

// ---------- CSV export ----------
// Each export respects the "current period only" checkbox: checked, it
// exports only whatever period is currently selected (already loaded, no
// extra reads needed). Unchecked — the "complete history" default — now
// explicitly widens the loaded window all the way back before exporting,
// since that's the one case that genuinely needs every record ever, and
// only happens when you actually click an export button, not on every visit.
function csvCell(v) {
  const s = String(v == null ? "" : v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(filenamePrefix, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gharana-${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV downloaded — opens directly in Excel");
}

function updateExportPeriodLabel() {
  const onlyCurrent = document.getElementById("exportCurrentPeriodOnly").checked;
  const label = document.getElementById("exportPeriodLabel");
  if (!onlyCurrent) { label.textContent = "complete history"; return; }
  const k = document.getElementById("periodPicker").value;
  const { labelFn } = PERIOD_CONFIG[mode];
  label.textContent = k ? labelFn(k) : "no period selected";
}

// Returns either the complete all-time event list, or just the currently
// selected period's entries, depending on the export-scope checkbox.
function scopedEvents(allEvents, entriesKey) {
  const onlyCurrent = document.getElementById("exportCurrentPeriodOnly").checked;
  if (!onlyCurrent) return allEvents;
  const k = document.getElementById("periodPicker").value;
  const p = periods[k];
  return p ? p[entriesKey] : [];
}

// If exporting "complete history", makes sure everything has actually been
// loaded first (widens the window back to the beginning) before the export
// functions read from allDisbEvents/allPayEvents — otherwise a complete
// export taken before the user has browsed older periods could silently
// miss older records that were never fetched yet.
async function ensureCompleteHistoryIfNeeded(btn) {
  const onlyCurrent = document.getElementById("exportCurrentPeriodOnly").checked;
  if (onlyCurrent) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Loading complete history…";
  await ensureWindowCovers(beginningOfTime());
  buildPeriods();
  btn.disabled = false;
  btn.textContent = original;
}

async function exportMoneyOutCSV(btn) {
  await ensureCompleteHistoryIfNeeded(btn);
  const events = [...scopedEvents(allDisbEvents, "outEntries")].sort((a, b) => toJsDate(a.date) - toJsDate(b.date));
  const headers = ["Date", "Loan Number", "Customer", "Amount Given"];
  const rows = events.map((e) => [fmtDate(e.date), e.loanNumber, e.customerName, e.amount]);
  downloadCsv("money-out", headers, rows);
}

async function exportMoneyInCSV(btn) {
  await ensureCompleteHistoryIfNeeded(btn);
  const events = [...scopedEvents(allPayEvents, "inEntries")].sort((a, b) => toJsDate(a.date) - toJsDate(b.date));
  const headers = ["Date", "Loan Number", "Customer", "Amount Collected", "Interest Portion", "Principal Portion"];
  const rows = events.map((e) => [fmtDate(e.date), e.loanNumber, e.customerName, e.amount, e.interestPortion, e.principalPortion]);
  downloadCsv("money-in", headers, rows);
}

async function exportInterestEarnedCSV(btn) {
  await ensureCompleteHistoryIfNeeded(btn);
  const events = [...scopedEvents(allPayEvents, "inEntries")].sort((a, b) => toJsDate(a.date) - toJsDate(b.date));
  const headers = ["Date", "Loan Number", "Customer", "Interest Earned"];
  const rows = events.filter((e) => Number(e.interestPortion) > 0).map((e) => [fmtDate(e.date), e.loanNumber, e.customerName, e.interestPortion]);
  downloadCsv("interest-earned", headers, rows);
}
