const loanId = new URLSearchParams(location.search).get("id");
let loanRef, loanData, ornaments = [], disbursements = [], payments = [];

requireAuth(async () => {
  renderShell({ active: "loans", title: "Loan Detail" });
  if (!loanId) { toast("No loan selected"); location.href = "loans.html"; return; }
  loanRef = db.collection("loans").doc(loanId);
  document.getElementById("disbForm").addEventListener("submit", saveDisbursement);
  document.getElementById("payForm").addEventListener("submit", savePayment);
  document.getElementById("mDisbDate").valueAsDate = new Date();
  document.getElementById("mPayDate").valueAsDate = new Date();
  await loadAll();
});

async function loadAll() {
  const doc = await loanRef.get();
  if (!doc.exists) { toast("Loan not found"); location.href = "loans.html"; return; }
  loanData = doc.data();

  const [ornSnap, disbSnap, paySnap] = await Promise.all([
    loanRef.collection("ornaments").get(),
    loanRef.collection("disbursements").get(),
    loanRef.collection("payments").get(),
  ]);
  ornaments = ornSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  disbursements = disbSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  payments = paySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  document.getElementById("topCustomerLink").href = `customer-profile.html?id=${loanData.customerId}`;
  renderHeader();
  renderOrnaments();
  renderDisbursements();
  renderInterest();
  renderPayments();
  renderStatusActions();
}

function renderHeader() {
  document.getElementById("loanHeader").innerHTML = `
    <div class="section-head">
      <div>
        <h2 class="mono">${escapeHtml(loanData.loanNumber)}</h2>
        <p><a href="customer-profile.html?id=${loanData.customerId}">${escapeHtml(loanData.customerName)}</a> · Loan date ${fmtDate(loanData.date)}</p>
      </div>
      <span class="badge badge-${loanData.status}" style="font-size:13px;padding:5px 12px;">${loanData.status}</span>
    </div>
    ${loanData.remarks ? `<div class="divider-dashed"></div><p style="color:var(--ink-soft);font-size:13.5px;">${escapeHtml(loanData.remarks)}</p>` : ""}
  `;
}

function renderOrnaments() {
  document.getElementById("ornamentBody").innerHTML = ornaments.map((o) => `
    <tr>
      <td>${escapeHtml(o.itemName)}</td>
      <td><span class="badge badge-${o.metalType.toLowerCase()}">${o.metalType}</span></td>
      <td class="mono">${o.weight}</td>
      <td class="mono">${o.qty}</td>
      <td>${o.category || "—"}${o.purity ? ` (${o.purity})` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="5" style="color:var(--ink-soft);">No items recorded.</td></tr>`;
}

function renderDisbursements() {
  const el = document.getElementById("disbList");
  el.innerHTML = disbursements.map((d) => `
    <div class="disb-card">
      <div class="row"><span class="k">${fmtDate(d.date)}</span><strong class="mono">${fmtMoney(d.amount)}</strong></div>
      <div class="row"><span class="k">Rate</span><span>${d.rate}% / month</span></div>
      ${d.reason ? `<div class="row"><span class="k">Reason</span><span>${escapeHtml(d.reason)}</span></div>` : ""}
      ${d.collectedBy ? `<div class="row"><span class="k">Collected by</span><span>${escapeHtml(d.collectedBy)}</span></div>` : ""}
    </div>`).join("") || `<p style="color:var(--ink-soft);">No disbursements yet.</p>`;
}

function renderInterest() {
  const summary = calcLoanSummary(disbursements, payments);
  document.getElementById("interestBody").innerHTML = summary.perDisbursement.map((d) => `
    <tr>
      <td>${fmtDate(d.originalDate)}${d.settled ? ` <span class="badge badge-closed">settled</span>` : ""}</td>
      <td>${d.rate}%</td>
      <td class="mono">${fmtMoney(d.principal)} <span style="color:var(--ink-soft);font-size:12px;">of ${fmtMoney(d.originalAmount)}</span></td>
      <td>${fmtDate(d.effectiveDate)}${d.dateChanged ? ` <span class="hint" style="display:inline;">(after payment)</span>` : ""}</td>
      <td class="mono">${d.days}</td>
      <td>${d.months} month${d.months === 1 ? "" : "s"}${d.days > 0 && d.days < 30 ? ` <span class="hint" style="display:inline;">(min.)</span>` : ""}</td>
      <td class="mono">${fmtMoney(d.interest)}</td>
    </tr>`).join("") || `<tr><td colspan="7" style="color:var(--ink-soft);">No disbursements yet.</td></tr>`;

  document.getElementById("sumPrincipal").textContent = fmtMoney(summary.principalOutstanding);
  document.getElementById("sumInterestAccrued").textContent = fmtMoney(summary.totalInterestAccrued);
  document.getElementById("sumInterestPaid").textContent = fmtMoney(summary.interestPaid);
  document.getElementById("sumPayable").textContent = fmtMoney(summary.totalPayableToday);

  window._loanSummary = summary;
}

function renderPayments() {
  document.getElementById("payBody").innerHTML = payments.map((p) => `
    <tr>
      <td>${fmtDate(p.date)}</td>
      <td style="text-transform:capitalize;">${p.type}</td>
      <td class="mono">${fmtMoney(p.amount)}</td>
      <td>${escapeHtml(p.receivedBy || "—")}</td>
      <td>${escapeHtml(p.remarks || "—")}</td>
    </tr>`).join("") || `<tr><td colspan="5" style="color:var(--ink-soft);">No payments recorded yet.</td></tr>`;
}

function renderStatusActions() {
  const card = document.getElementById("statusActionsCard");
  const balance = window._loanSummary.totalPayableToday;

  if (loanData.status === "active") {
    card.innerHTML = `
      <h2>Release workflow</h2>
      <div class="divider-dashed"></div>
      <p style="color:var(--ink-soft);font-size:13.5px;">
        ${balance > 0 ? `Balance still outstanding: <strong>${fmtMoney(balance)}</strong>. Settle payments before releasing, or mark ready to release if you're settling separately.` : "Balance is fully cleared. This loan is ready to move to release."}
      </p>
      <button class="btn btn-primary" onclick="markReadyToRelease()">Mark ready to release</button>
    `;
  } else if (loanData.status === "released") {
    card.innerHTML = `
      <h2>Return the jewellery</h2>
      <div class="divider-dashed"></div>
      <p style="color:var(--ink-soft);font-size:13.5px;">Financially cleared — waiting for physical return. Capture a photo of the customer with the jewellery to close this loan permanently.</p>
      <button class="btn btn-primary" onclick="openModal('returnModal')">Capture return photo &amp; close</button>
    `;
  } else {
    card.innerHTML = `
      <h2>Closed</h2>
      <div class="divider-dashed"></div>
      <p style="color:var(--ink-soft);font-size:13.5px;">Closed on ${fmtDate(loanData.closedAt)}. Jewellery returned and confirmed.</p>
      ${loanData.returnPhotoUrl ? `<img src="${loanData.returnPhotoUrl}" style="max-width:220px;border-radius:8px;border:1px solid var(--line);">` : ""}
    `;
  }
}

function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }
function openDisbModal() { openModal("disbModal"); }
function openPayModal() { openModal("payModal"); }

async function saveDisbursement(e) {
  e.preventDefault();
  await loanRef.collection("disbursements").add({
    amount: parseFloat(document.getElementById("mDisbAmount").value),
    rate: parseFloat(document.getElementById("mDisbRate").value),
    date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("mDisbDate").value)),
    reason: document.getElementById("mDisbReason").value.trim(),
    collectedBy: document.getElementById("mDisbCollector").value.trim(),
    notes: document.getElementById("mDisbNotes").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  closeModal("disbModal");
  document.getElementById("disbForm").reset();
  toast("Disbursement added");
  await loadAll();
}

async function savePayment(e) {
  e.preventDefault();
  await loanRef.collection("payments").add({
    type: document.getElementById("mPayType").value,
    amount: parseFloat(document.getElementById("mPayAmount").value),
    date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("mPayDate").value)),
    receivedBy: document.getElementById("mPayReceiver").value.trim(),
    remarks: document.getElementById("mPayRemarks").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  closeModal("payModal");
  document.getElementById("payForm").reset();
  toast("Payment recorded");
  await loadAll();
}

async function markReadyToRelease() {
  if (!confirm("Mark this loan as financially cleared and ready for release?")) return;
  await loanRef.update({ status: "released", releasedAt: firebase.firestore.FieldValue.serverTimestamp() });
  toast("Loan moved to release queue");
  await loadAll();
}

async function confirmReturn() {
  const fileInput = document.getElementById("returnPhoto");
  if (!fileInput.files[0]) { toast("Please select a photo"); return; }
  const btn = document.getElementById("confirmReturnBtn");
  btn.disabled = true; btn.textContent = "Uploading…";

  const file = fileInput.files[0];
  const storageRef = storage.ref(`return-photos/${loanId}-${Date.now()}.jpg`);
  await storageRef.put(file);
  const url = await storageRef.getDownloadURL();

  await loanRef.update({
    status: "closed",
    returnPhotoUrl: url,
    closedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  closeModal("returnModal");
  toast("Loan closed — jewellery returned");
  btn.disabled = false; btn.textContent = "Confirm & close";
  await loadAll();
}
