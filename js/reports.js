let mode = "monthly"; // monthly | yearly
let entryKind = "out"; // out | in
let periods = {}; // key -> { out, in, interest, outEntries, inEntries }
let sortedKeys = [];

requireAuth(async () => {
  renderShell({ active: "reports", title: "Reports" });

  document.querySelectorAll("#periodTabs button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#periodTabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      mode = b.dataset.mode;
      buildPeriods();
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
  document.getElementById("periodPicker").addEventListener("change", renderEntries);

  await loadData();
});

let allDisbEvents = [], allPayEvents = [];

async function loadData() {
  const loanSnap = await db.collection("loans").get();
  allDisbEvents = [];
  allPayEvents = [];

  for (const doc of loanSnap.docs) {
    const loan = { id: doc.id, ...doc.data() };
    const [disbSnap, paySnap] = await Promise.all([
      db.collection("loans").doc(loan.id).collection("disbursements").get(),
      db.collection("loans").doc(loan.id).collection("payments").get(),
    ]);
    const disbursements = disbSnap.docs.map((d) => d.data());
    const paymentsRaw = paySnap.docs.map((d) => d.data());
    const summary = calcLoanSummary(disbursements, paymentsRaw);

    disbursements.forEach((d) => {
      allDisbEvents.push({ date: d.date, amount: d.amount, loanNumber: loan.loanNumber, customerName: loan.customerName });
    });
    summary.paymentBreakdown.forEach((p) => {
      allPayEvents.push({ date: p.date, amount: p.amount, interestPortion: p.interestPortion, principalPortion: p.principalPortion, loanNumber: loan.loanNumber, customerName: loan.customerName });
    });
  }

  buildPeriods();
}

function buildPeriods() {
  const keyFn = mode === "monthly" ? monthKey : yearKey;
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
  renderCompareChart();
  renderEntries();
}

function ensurePeriod(k) {
  if (!periods[k]) periods[k] = { out: 0, in: 0, interest: 0, outEntries: [], inEntries: [] };
}

function renderPeriodPicker() {
  const picker = document.getElementById("periodPicker");
  const labelFn = mode === "monthly" ? monthLabel : (k) => k;
  picker.innerHTML = sortedKeys.map((k) => `<option value="${k}">${labelFn(k)}</option>`).join("")
    || `<option>No data yet</option>`;
}

function renderCompareChart() {
  const showKeys = sortedKeys.slice(0, mode === "monthly" ? 12 : 8).reverse();
  const labelFn = mode === "monthly" ? monthLabel : (k) => k;
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
