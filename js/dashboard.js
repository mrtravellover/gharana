requireAuth(async () => {
  renderShell({ active: "dashboard", title: "Dashboard" });
  await loadDashboard();
});

async function loadDashboard() {
  const [loansSnap, releasedSnap] = await Promise.all([
    db.collection("loans").where("status", "==", "active").get(),
    db.collection("loans").where("status", "==", "released").get(),
  ]);
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

  renderReadyToRelease(releasedSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

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

function renderReadyToRelease(loans) {
  const card = document.getElementById("readyToReleaseCard");
  const list = document.getElementById("readyToReleaseList");
  const countEl = document.getElementById("readyToReleaseCount");

  if (loans.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";
  countEl.textContent = `(${loans.length})`;

  loans.sort((a, b) => toJsDate(a.releasedAt) - toJsDate(b.releasedAt));
  list.innerHTML = loans.map((l) => `
    <div class="disb-card" style="cursor:pointer;" onclick="location.href='loan-detail.html?id=${l.id}'">
      <div class="row"><strong>${escapeHtml(l.loanNumber)} — ${escapeHtml(l.customerName)}</strong><span class="badge badge-released">ready</span></div>
      ${l.remarks ? `<div class="row"><span class="k">Locker note</span><span>${escapeHtml(l.remarks)}</span></div>` : `<div class="row"><span class="k" style="color:var(--warn);">No locker note saved</span></div>`}
      ${l.itemNames && l.itemNames.length ? `<div class="row"><span class="k">Items</span><span style="text-transform:capitalize;">${l.itemNames.join(", ")}</span></div>` : ""}
    </div>
  `).join("");
}
