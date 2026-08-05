let allLoans = [];
let currentStatus = "active";
let loadedStatuses = new Set(); // which real statuses (active/released/closed) have been fetched so far
let customerMap = {}; // customerId -> {mobile, village/address} - built once, cheap (no subcollections)
let loadingLoans = false;

requireAuth(async () => {
  renderShell({ active: "loans", title: "Loans" });
  document.querySelectorAll("#statusTabs button").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll("#statusTabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      currentStatus = b.dataset.status;
      await ensureStatusLoaded(currentStatus);
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
  await loadCustomerMap();
  await ensureStatusLoaded("active"); // matches the default active tab — nothing else fetched until you ask for it
  render();
});

/* ============================================================
   DATA LOADING — designed to scale the same way the Reports rewrite did:
   don't fetch what the current view doesn't need.

   The old version always fetched EVERY loan (active, released, closed)
   plus all of their subcollections on every visit, regardless of which
   status tab you actually landed on. With a handful of test loans that's
   invisible; with hundreds/thousands of historical loans, most of them
   long closed, that's a lot of wasted reads every single time someone
   just wants to see today's active loans.

   Now: only the currently selected status tab's loans get fetched (with
   their full subcollections, since principal/interest still needs the
   complete disbursement+payment history to compute correctly — that part
   can't be shortcut). Switching tabs fetches only what hasn't been loaded
   yet; already-loaded loans are cached in memory for the rest of the
   visit. "All" and CSV export both explicitly widen to fetch everything,
   the same deliberate way Reports' "complete history" export does.
============================================================ */

async function loadCustomerMap() {
  const custSnap = await db.collection("customers").get();
  custSnap.docs.forEach((d) => { customerMap[d.id] = d.data(); });
}

async function ensureStatusLoaded(status) {
  const statusesNeeded = status === "all" ? ["active", "released", "closed"] : [status];
  const newStatuses = statusesNeeded.filter((s) => !loadedStatuses.has(s));
  if (!newStatuses.length) return;

  loadingLoans = true;
  const tabButtons = document.querySelectorAll("#statusTabs button");
  tabButtons.forEach((b) => (b.disabled = true));

  try {
    for (const s of newStatuses) {
      const snap = await db.collection("loans").where("status", "==", s).get();
      const loaded = await Promise.all(snap.docs.map((doc) => buildLoanRecord(doc)));
      allLoans.push(...loaded);
      loadedStatuses.add(s);
    }
  } catch (err) {
    console.error("Loans: failed to load status", newStatuses, err);
    toast("Couldn't load some loans — check your connection and try switching tabs again");
  }

  loadingLoans = false;
  tabButtons.forEach((b) => (b.disabled = false));
}

async function buildLoanRecord(doc) {
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
  const cust = customerMap[loan.customerId] || {};
  const totalWeight = ornaments.reduce((s, o) => s + (Number(o.weight) || 0) * (Number(o.qty) || 1), 0);
  const lastPaymentDate = payments.length ? payments.map((p) => toJsDate(p.date)).sort((a, b) => b - a)[0] : null;

  return {
    ...loan, summary, ornaments,
    customerMobile: cust.mobile || "",
    customerVillage: cust.village || cust.address || "",
    totalWeight,
    disbursementCount: disbursements.length,
    lastPaymentDate,
  };
}

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return `"${s.replace(/"/g, '""')}"`;
}

async function exportLoansCsv(btn) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Loading all loans…";
  await ensureStatusLoaded("all"); // export always covers everything, regardless of which tab you're currently viewing
  btn.disabled = false;
  btn.textContent = originalText;

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
