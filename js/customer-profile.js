let custLoans = [];

const custId = new URLSearchParams(location.search).get("id");

requireAuth(async () => {
  renderShell({ active: "customers", title: "Customer Profile" });
  if (!custId) { toast("No customer selected"); location.href = "customers.html"; return; }
  document.getElementById("newLoanLink").href = `loan-create.html?customerId=${custId}`;
  document.getElementById("loanSearchInput").addEventListener("input", (e) => renderLoans(e.target.value));
  await loadProfile();
});

async function loadProfile() {
  const doc = await db.collection("customers").doc(custId).get();
  if (!doc.exists) { toast("Customer not found"); location.href = "customers.html"; return; }
  const c = doc.data();

  document.getElementById("profileCard").innerHTML = `
    <h2>${escapeHtml(c.name)}</h2>
    <div class="divider-dashed"></div>
    <div class="grid grid-2" style="gap:10px;">
      <div><div class="stat"><div class="label">Mobile</div><div class="value mono" style="font-size:16px;">${escapeHtml(c.mobile || "—")}</div></div></div>
      <div><div class="stat"><div class="label">Aadhaar</div><div class="value mono" style="font-size:16px;">${escapeHtml(c.aadhaar || "—")}</div></div></div>
    </div>
    <div class="field" style="margin-top:12px;"><div class="stat"><div class="label">Address / village</div><div class="value" style="font-size:15px;font-family:var(--font-body);font-weight:500;">${escapeHtml(c.address || "—")}</div></div></div>
  `;
  document.getElementById("profileNotes").textContent = c.notes || "No notes recorded.";

  const loanSnap = await db.collection("loans").where("customerId", "==", custId).get();
  custLoans = loanSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  custLoans.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));
  renderLoans("");
}

function renderLoans(query) {
  const q = (query || "").trim().toLowerCase();
  const loans = !q ? custLoans : custLoans.filter((l) =>
    (l.loanNumber || "").toLowerCase().includes(q) || (l.itemNames || []).some((n) => n.includes(q))
  );

  const body = document.getElementById("loanBody");
  if (loans.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="color:var(--ink-soft);padding:20px 0;">${q ? "No matching loans." : "No loans yet for this customer."}</td></tr>`;
    return;
  }
  body.innerHTML = loans.map((l) => `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${escapeHtml(l.loanNumber)}</td>
      <td style="text-transform:capitalize;">${(l.itemNames || []).join(", ") || "—"}</td>
      <td>${fmtDate(l.date)}</td>
      <td class="mono">${fmtMoney(l.totalPrincipal || 0)}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>`).join("");
}
