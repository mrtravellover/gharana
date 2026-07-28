requireAuth(async () => {
  renderShell({ active: "dashboard", title: "Dashboard" });
  await loadDashboard();
});

async function loadDashboard() {
  const loansSnap = await db.collection("loans").where("status", "==", "active").get();
  let totalPrincipal = 0, totalInterest = 0;
  const todayStr = new Date().toDateString();
  let collectedToday = 0;

  const rows = [];

  for (const doc of loansSnap.docs) {
    const loan = { id: doc.id, ...doc.data() };
    const [disbSnap, paySnap] = await Promise.all([
      db.collection("loans").doc(loan.id).collection("disbursements").get(),
      db.collection("loans").doc(loan.id).collection("payments").get(),
    ]);
    const disbursements = disbSnap.docs.map((d) => d.data());
    const payments = paySnap.docs.map((d) => d.data());
    const summary = calcLoanSummary(disbursements, payments);

    totalPrincipal += summary.principalOutstanding;
    totalInterest += summary.interestOutstanding;

    payments.forEach((p) => {
      if (p.date && toJsDate(p.date).toDateString() === todayStr) collectedToday += Number(p.amount || 0);
    });

    rows.push({ ...loan, principal: summary.totalPrincipal });
  }

  rows.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));

  document.querySelectorAll("#statCards .value")[0].textContent = loansSnap.size;
  document.querySelectorAll("#statCards .value")[1].textContent = fmtMoney(totalPrincipal);
  document.querySelectorAll("#statCards .value")[2].textContent = fmtMoney(totalInterest);
  document.querySelectorAll("#statCards .value")[3].textContent = fmtMoney(collectedToday);

  const body = document.getElementById("recentLoansBody");
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="color:var(--ink-soft);padding:20px 0;">No active loans yet. <a href="loan-create.html">Create your first loan →</a></td></tr>`;
    return;
  }
  body.innerHTML = rows.slice(0, 8).map((r) => `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${r.id}'">
      <td class="mono">${escapeHtml(r.loanNumber)}</td>
      <td>${escapeHtml(r.customerName)}</td>
      <td>${fmtDate(r.date)}</td>
      <td class="mono">${fmtMoney(r.principal)}</td>
      <td><span class="badge badge-${r.status}">${r.status}</span></td>
    </tr>`).join("");
}
