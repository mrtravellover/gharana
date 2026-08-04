let allLoans = [];
let currentStatus = "active";

requireAuth(async () => {
  renderShell({ active: "loans", title: "Loans" });
  document.querySelectorAll("#statusTabs button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#statusTabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      currentStatus = b.dataset.status;
      render();
    })
  );
  document.getElementById("searchInput").addEventListener("input", () => {
    document.getElementById("searchClearBtn").style.display = document.getElementById("searchInput").value ? "flex" : "none";
    render();
  });
  document.getElementById("searchClearBtn").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    document.getElementById("searchClearBtn").style.display = "none";
    render();
  });
  ["filterVillage", "filterAmountMin", "filterAmountMax", "filterWeightMin", "filterWeightMax", "filterDateFrom", "filterDateTo", "filterSpecial"].forEach((id) => {
    document.getElementById(id).addEventListener("input", render);
  });
  await loadLoans();
});

// ---------- Universal Smart Search data loading ----------
// Loan documents don't carry the customer's mobile/village directly, but
// those are two of the most useful things to search by — so after loading
// loans, do one lightweight fetch of just the customers collection (no
// subcollections) and denormalize mobile/village onto each loan in memory.
// This is a single extra collection read, not per-loan.
async function loadLoans() {
  const [loanSnap, custSnap] = await Promise.all([
    db.collection("loans").get(),
    db.collection("customers").get(),
  ]);
  const custMap = {};
  custSnap.docs.forEach((d) => { custMap[d.id] = d.data(); });

  allLoans = await Promise.all(loanSnap.docs.map(async (doc) => {
    const loan = { id: doc.id, ...doc.data() };
    const [disbSnap, paySnap, ornSnap] = await Promise.all([
      db.collection("loans").doc(loan.id).collection("disbursements").get(),
      db.collection("loans").doc(loan.id).collection("payments").get(),
      db.collection("loans").doc(loan.id).collection("ornaments").get(),
    ]);
    const disbursements = disbSnap.docs.map((d) => d.data());
    const payments = paySnap.docs.map((d) => d.data());
    const ornaments = ornSnap.docs.map((d) => d.data());
    const summary = calcLoanSummary(disbursements, payments);
    const cust = custMap[loan.customerId] || {};
    const totalWeight = ornaments.reduce((s, o) => s + (Number(o.weight) || 0) * (Number(o.qty) || 1), 0);
    const lastPaymentDate = payments.length ? payments.map((p) => toJsDate(p.date)).sort((a, b) => b - a)[0] : null;

    return {
      ...loan, summary, ornaments,
      customerMobile: cust.mobile || "",
      customerVillage: cust.address || "",
      totalWeight,
      disbursementCount: disbursements.length,
      lastPaymentDate,
    };
  }));
  render();
}

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return `"${s.replace(/"/g, '""')}"`;
}

function exportLoansCsv() {
  const headers = ["Loan Number", "Customer", "Pledged By", "Loan Date", "Original Principal", "Principal Outstanding", "Interest Due", "Total Payable", "Status", "Locker Note"];
  const rows = allLoans.map((l) => [
    l.loanNumber,
    l.customerName,
    l.pledgedByMode === "other" ? l.pledgedByName : "Self",
    fmtDate(l.date),
    l.summary.totalPrincipal,
    l.summary.principalOutstanding,
    l.summary.interestOutstanding,
    l.summary.totalPayableToday,
    l.status,
    l.itemsIdentityNote || "",
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gharana-ledger-loans-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV downloaded — opens directly in Excel");
}

// ---------- Filters panel ----------
function toggleFiltersPanel() {
  const panel = document.getElementById("filtersPanel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function clearFilters() {
  ["filterVillage", "filterAmountMin", "filterAmountMax", "filterWeightMin", "filterWeightMax", "filterDateFrom", "filterDateTo"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("filterSpecial").value = "";
  render();
}

function countActiveFilters() {
  const ids = ["filterVillage", "filterAmountMin", "filterAmountMax", "filterWeightMin", "filterWeightMax", "filterDateFrom", "filterDateTo", "filterSpecial"];
  return ids.filter((id) => document.getElementById(id).value.trim() !== "").length;
}

// "Overdue" and "Renewals" don't exist as stored fields — defined here as
// reasonable business heuristics, not something Firestore tracks directly:
//   Overdue  = active loan with no payment recorded in the last 90 days
//   Renewals = loan that's been topped up more than once (2+ disbursements)
function matchesSpecialFilter(l, special) {
  if (!special) return true;
  if (special === "today") return dayKey(l.date) === dayKey(new Date());
  if (special === "overdue") {
    if (l.status !== "active") return false;
    const daysSincePayment = l.lastPaymentDate ? daysBetween(l.lastPaymentDate, new Date()) : daysBetween(l.date, new Date());
    return daysSincePayment >= 90;
  }
  if (special === "renewals") return l.disbursementCount > 1;
  return true;
}

function render() {
  const q = document.getElementById("searchInput").value.trim();
  const village = document.getElementById("filterVillage").value.trim();
  const amountMin = parseFloat(document.getElementById("filterAmountMin").value);
  const amountMax = parseFloat(document.getElementById("filterAmountMax").value);
  const weightMin = parseFloat(document.getElementById("filterWeightMin").value);
  const weightMax = parseFloat(document.getElementById("filterWeightMax").value);
  const dateFrom = document.getElementById("filterDateFrom").value;
  const dateTo = document.getElementById("filterDateTo").value;
  const special = document.getElementById("filterSpecial").value;

  let rows = allLoans.filter((l) => currentStatus === "all" || l.status === currentStatus);

  if (q) {
    rows = rows.filter((l) => smartMatchAny([
      l.loanNumber, l.customerName, l.pledgedByName, l.customerMobile, l.customerVillage,
      (l.itemNames || []).join(" "), l.itemsIdentityNote, l.status,
      String(l.summary.principalOutstanding), String(l.summary.interestOutstanding), l.totalWeight.toFixed(2),
    ], q));
  }
  if (village) rows = rows.filter((l) => smartTextMatch(l.customerVillage, village));
  if (!isNaN(amountMin)) rows = rows.filter((l) => l.summary.principalOutstanding >= amountMin);
  if (!isNaN(amountMax)) rows = rows.filter((l) => l.summary.principalOutstanding <= amountMax);
  if (!isNaN(weightMin)) rows = rows.filter((l) => l.totalWeight >= weightMin);
  if (!isNaN(weightMax)) rows = rows.filter((l) => l.totalWeight <= weightMax);
  if (dateFrom) rows = rows.filter((l) => toJsDate(l.date) >= new Date(dateFrom));
  if (dateTo) rows = rows.filter((l) => toJsDate(l.date) <= new Date(dateTo + "T23:59:59"));
  if (special) rows = rows.filter((l) => matchesSpecialFilter(l, special));

  rows.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));

  const activeFilterCount = countActiveFilters();
  document.getElementById("filtersActiveCount").textContent = activeFilterCount ? activeFilterCount : "";
  document.getElementById("searchResultCount").textContent = `${rows.length} loan${rows.length === 1 ? "" : "s"} found`;

  const isReleasedView = currentStatus === "released";
  document.getElementById("loansTableHead").innerHTML = isReleasedView
    ? `<tr><th>Loan #</th><th>Customer</th><th>Pledged by</th><th>Date</th><th>Locker note</th><th>Payment due</th><th>Status</th></tr>`
    : `<tr><th>Loan #</th><th>Customer</th><th>Pledged by</th><th>Date</th><th>Locker note</th><th>Principal</th><th>Interest due</th><th>Status</th></tr>`;

  const body = document.getElementById("loanBody");
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="color:var(--ink-soft);padding:20px 0;">No loans found${q || activeFilterCount ? " — try a different search or clear filters" : ""}.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((l) => isReleasedView ? `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${highlightText(l.loanNumber, q)}${l.hasCollateral === false ? ` <span class="badge" style="background:var(--warn-soft);color:var(--warn);" title="No collateral">⚠ No collateral</span>` : ""}</td>
      <td>${highlightText(l.customerName, q)}</td>
      <td>${l.pledgedByMode === "other" ? highlightText(l.pledgedByName, q) : "Self"}</td>
      <td>${fmtDate(l.date)}</td>
      <td>${l.itemsIdentityNote ? highlightText(l.itemsIdentityNote, q) : `<span style="color:var(--warn);">not set</span>`}</td>
      <td class="mono">${l.summary.totalPayableToday > 0 ? `<span style="color:var(--danger);">${fmtMoney(l.summary.totalPayableToday)}</span>` : `<span style="color:var(--good);">Paid</span>`}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>` : `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${highlightText(l.loanNumber, q)}${l.hasCollateral === false ? ` <span class="badge" style="background:var(--warn-soft);color:var(--warn);" title="No collateral">⚠ No collateral</span>` : ""}</td>
      <td>${highlightText(l.customerName, q)}</td>
      <td>${l.pledgedByMode === "other" ? highlightText(l.pledgedByName, q) + ` <span class="hint" style="display:inline;">(in ${escapeHtml(l.customerName)}'s a/c)</span>` : "Self"}</td>
      <td>${fmtDate(l.date)}</td>
      <td>${l.itemsIdentityNote ? highlightText(l.itemsIdentityNote, q) : `<span style="color:var(--ink-soft);">—</span>`}</td>
      <td class="mono">${fmtMoney(l.summary.principalOutstanding)}</td>
      <td class="mono">${fmtMoney(l.summary.interestOutstanding)}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>`).join("");
}
