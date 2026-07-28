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
  allLoans = [];
  for (const doc of snap.docs) {
    const loan = { id: doc.id, ...doc.data() };
    const [disbSnap, paySnap] = await Promise.all([
      db.collection("loans").doc(loan.id).collection("disbursements").get(),
      db.collection("loans").doc(loan.id).collection("payments").get(),
    ]);
    const summary = calcLoanSummary(disbSnap.docs.map((d) => d.data()), paySnap.docs.map((d) => d.data()));
    allLoans.push({ ...loan, summary });
  }
  render();
}

function render() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  let rows = allLoans.filter((l) => currentStatus === "all" || l.status === currentStatus);
  if (q) rows = rows.filter((l) => [l.loanNumber, l.customerName].some((v) => (v || "").toLowerCase().includes(q)));
  rows.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));

  const body = document.getElementById("loanBody");
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="color:var(--ink-soft);padding:20px 0;">No loans found.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((l) => `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${escapeHtml(l.loanNumber)}</td>
      <td>${escapeHtml(l.customerName)}</td>
      <td>${fmtDate(l.date)}</td>
      <td class="mono">${fmtMoney(l.summary.principalOutstanding)}</td>
      <td class="mono">${fmtMoney(l.summary.interestOutstanding)}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>`).join("");
}
