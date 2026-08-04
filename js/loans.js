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
  document.getElementById("searchInput").addEventListener("input", render);
  await loadLoans();
});

async function loadLoans() {
  const snap = await db.collection("loans").get();
  allLoans = await Promise.all(snap.docs.map(async (doc) => {
    const loan = { id: doc.id, ...doc.data() };
    const [disbSnap, paySnap, ornSnap] = await Promise.all([
      db.collection("loans").doc(loan.id).collection("disbursements").get(),
      db.collection("loans").doc(loan.id).collection("payments").get(),
      db.collection("loans").doc(loan.id).collection("ornaments").get(),
    ]);
    const summary = calcLoanSummary(disbSnap.docs.map((d) => d.data()), paySnap.docs.map((d) => d.data()));
    return { ...loan, summary, ornaments: ornSnap.docs.map((d) => d.data()) };
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

function render() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  let rows = allLoans.filter((l) => currentStatus === "all" || l.status === currentStatus);
  if (q) rows = rows.filter((l) =>
    [l.loanNumber, l.customerName, l.pledgedByName].some((v) => (v || "").toLowerCase().includes(q)) ||
    (l.itemNames || []).some((n) => n.includes(q))
  );
  rows.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));

  const isReleasedView = currentStatus === "released";
  document.getElementById("loansTableHead").innerHTML = isReleasedView
    ? `<tr><th>Loan #</th><th>Customer</th><th>Pledged by</th><th>Date</th><th>Locker note</th><th>Payment due</th><th>Status</th></tr>`
    : `<tr><th>Loan #</th><th>Customer</th><th>Pledged by</th><th>Date</th><th>Locker note</th><th>Principal</th><th>Interest due</th><th>Status</th></tr>`;

  const body = document.getElementById("loanBody");
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="color:var(--ink-soft);padding:20px 0;">No loans found.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((l) => isReleasedView ? `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${escapeHtml(l.loanNumber)}${l.hasCollateral === false ? ` <span class="badge" style="background:var(--warn-soft);color:var(--warn);" title="No collateral">⚠ No collateral</span>` : ""}</td>
      <td>${escapeHtml(l.customerName)}</td>
      <td>${l.pledgedByMode === "other" ? escapeHtml(l.pledgedByName) : "Self"}</td>
      <td>${fmtDate(l.date)}</td>
      <td>${l.itemsIdentityNote ? escapeHtml(l.itemsIdentityNote) : `<span style="color:var(--warn);">not set</span>`}</td>
      <td class="mono">${l.summary.totalPayableToday > 0 ? `<span style="color:var(--danger);">${fmtMoney(l.summary.totalPayableToday)}</span>` : `<span style="color:var(--good);">Paid</span>`}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>` : `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${escapeHtml(l.loanNumber)}${l.hasCollateral === false ? ` <span class="badge" style="background:var(--warn-soft);color:var(--warn);" title="No collateral">⚠ No collateral</span>` : ""}</td>
      <td>${escapeHtml(l.customerName)}</td>
      <td>${l.pledgedByMode === "other" ? escapeHtml(l.pledgedByName) + ` <span class="hint" style="display:inline;">(in ${escapeHtml(l.customerName)}'s a/c)</span>` : "Self"}</td>
      <td>${fmtDate(l.date)}</td>
      <td>${l.itemsIdentityNote ? escapeHtml(l.itemsIdentityNote) : `<span style="color:var(--ink-soft);">—</span>`}</td>
      <td class="mono">${fmtMoney(l.summary.principalOutstanding)}</td>
      <td class="mono">${fmtMoney(l.summary.interestOutstanding)}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>`).join("");
}
