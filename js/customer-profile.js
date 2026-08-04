let custLoans = [];
let custDeposits = [];

const custId = new URLSearchParams(location.search).get("id");

requireAuth(async () => {
  renderShell({ active: "customers", title: "Customer Profile" });
  if (!custId) { toast("No customer selected"); location.href = "customers.html"; return; }
  document.getElementById("newLoanLink").href = `loan-create.html?customerId=${custId}`;
  document.getElementById("loanSearchInput").addEventListener("input", (e) => renderLoans(e.target.value));
  wirePhotoCapture("custPhotoBtn", null, uploadCustomerPhoto);
  document.getElementById("depositDate").valueAsDate = new Date();
  await loadProfile();
  await loadDeposits();
});

let currentCustomerData = null;

async function loadProfile() {
  const doc = await db.collection("customers").doc(custId).get();
  if (!doc.exists) { toast("Customer not found"); location.href = "customers.html"; return; }
  const c = doc.data();
  c.aadhaar = await decryptAadhaar(c.aadhaar);
  currentCustomerData = c;

  document.getElementById("profileCard").innerHTML = `
    <div class="section-head">
      <h2>${escapeHtml(c.name)}</h2>
      <button class="btn btn-ghost btn-sm" onclick="toggleDetailsEdit()" id="detailsEditToggle">Edit</button>
    </div>
    <div class="divider-dashed"></div>
    <div id="profileDetailsView">
      <div class="grid grid-2" style="gap:10px;">
        <div><div class="stat"><div class="label">Mobile</div><div class="value mono" style="font-size:16px;">${escapeHtml(c.mobile || "—")}</div></div></div>
        <div><div class="stat"><div class="label">Aadhaar</div><div class="value mono" style="font-size:16px;">${escapeHtml(c.aadhaar || "—")}</div></div></div>
      </div>
      <div class="field" style="margin-top:12px;"><div class="stat"><div class="label">Address / village</div><div class="value" style="font-size:15px;font-family:var(--font-body);font-weight:500;">${escapeHtml(c.address || "—")}</div></div></div>
    </div>
    <div id="profileDetailsEdit" style="display:none;">
      <div class="field"><label>Full name</label><input type="text" id="editCustName" value="${escapeHtml(c.name || "")}"></div>
      <div class="grid grid-2">
        <div class="field"><label>Mobile number</label><input type="tel" id="editCustMobile" value="${escapeHtml(c.mobile || "")}"></div>
        <div class="field"><label>Aadhaar number</label><input type="text" id="editCustAadhaar" maxlength="12" value="${escapeHtml(c.aadhaar || "")}"></div>
      </div>
      <div class="field"><label>Address / village</label><input type="text" id="editCustAddress" value="${escapeHtml(c.address || "")}"></div>
      <button class="btn btn-primary btn-sm" onclick="saveDetails()">Save changes</button>
    </div>
  `;

  document.getElementById("profilePhotoWrap").innerHTML = c.photoUrl
    ? `<img src="${c.photoUrl}" style="width:100%;max-width:220px;border-radius:8px;border:1px solid var(--line);">`
    : `<p style="color:var(--ink-soft);font-size:13.5px;">No photo yet — tap "📷 Retake" above to add one.</p>`;

  document.getElementById("profileNotes").textContent = c.notes || "No notes recorded.";
  document.getElementById("profileNotesInput").value = c.notes || "";

  renderAccountStatus(c);

  const loanSnap = await db.collection("loans").where("customerId", "==", custId).get();
  custLoans = loanSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  custLoans.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));
  renderLoans("");
}

function renderAccountStatus(c) {
  const status = c.accountStatus || "active";
  const labels = { active: "Active", hold: "On hold", closed: "Closed" };
  const history = (c.statusHistory || []).slice().reverse();

  let actions = "";
  if (status === "active") {
    actions = `
      <button class="btn btn-secondary btn-sm" onclick="openStatusModal('hold')">Put on hold</button>
      <button class="btn btn-danger btn-sm" onclick="openStatusModal('closed')">Close account</button>`;
  } else if (status === "hold") {
    actions = `
      <button class="btn btn-primary btn-sm" onclick="openStatusModal('active')">Reactivate</button>
      <button class="btn btn-danger btn-sm" onclick="openStatusModal('closed')">Close account</button>`;
  } else {
    actions = `<button class="btn btn-primary btn-sm" onclick="openStatusModal('active')">Reactivate</button>`;
  }

  document.getElementById("accountStatusWrap").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span class="status-dot status-dot-${status}"></span>
      <strong>${labels[status]}</strong>
    </div>
    ${c.statusRemark ? `<p style="color:var(--ink-soft);font-size:13.5px;margin-bottom:10px;">Latest remark: ${escapeHtml(c.statusRemark)}</p>` : ""}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">${actions}</div>
    ${history.length ? `
      <div class="divider-dashed"></div>
      <p style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:6px;">History</p>
      ${history.map((h) => `
        <div class="row" style="font-size:13px;margin-bottom:4px;"><span class="k">${fmtDate(h.date)} — ${labels[h.status] || h.status}</span><span>${escapeHtml(h.remark || "")}</span></div>
      `).join("")}
    ` : ""}
  `;
}

function openStatusModal(targetStatus) {
  const titles = { active: "Reactivate account", hold: "Put account on hold", closed: "Close account" };
  document.getElementById("statusChangeTitle").textContent = titles[targetStatus];
  document.getElementById("statusChangeTarget").value = targetStatus;
  document.getElementById("statusChangeRemark").value = "";
  openModal("statusChangeModal");
}

async function confirmStatusChange() {
  const targetStatus = document.getElementById("statusChangeTarget").value;
  const remark = document.getElementById("statusChangeRemark").value.trim();
  if (!remark) { toast("A remark is required"); return; }

  const btn = document.getElementById("statusChangeConfirmBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  await db.collection("customers").doc(custId).update({
    accountStatus: targetStatus,
    statusRemark: remark,
    statusHistory: firebase.firestore.FieldValue.arrayUnion({
      status: targetStatus,
      remark,
      date: firebase.firestore.Timestamp.now(),
    }),
  });

  closeModal("statusChangeModal");
  toast("Account status updated");
  btn.disabled = false; btn.textContent = "Confirm";
  await loadProfile();
}

function toggleDetailsEdit() {
  const editBox = document.getElementById("profileDetailsEdit");
  const viewBox = document.getElementById("profileDetailsView");
  const isOpen = editBox.style.display !== "none";
  editBox.style.display = isOpen ? "none" : "block";
  viewBox.style.display = isOpen ? "block" : "none";
  document.getElementById("detailsEditToggle").textContent = isOpen ? "Edit" : "Cancel";
}

async function saveDetails() {
  const name = document.getElementById("editCustName").value.trim();
  const mobile = document.getElementById("editCustMobile").value.trim();
  const aadhaar = await encryptAadhaar(document.getElementById("editCustAadhaar").value);
  const address = document.getElementById("editCustAddress").value.trim();
  if (!name || !mobile || !address) { toast("Name, mobile, and address are required"); return; }

  const nameChanged = name !== (currentCustomerData.name || "");
  await db.collection("customers").doc(custId).update({ name, mobile, aadhaar, address });

  if (nameChanged) {
    const loanSnap = await db.collection("loans").where("customerId", "==", custId).get();
    const batch = db.batch();
    loanSnap.docs.forEach((d) => batch.update(d.ref, { customerName: name }));
    if (!loanSnap.empty) await batch.commit();
  }

  toast("Customer details updated");
  await loadProfile();
}

function toggleNotesEdit() {
  const editBox = document.getElementById("profileNotesEdit");
  const isOpen = editBox.style.display !== "none";
  editBox.style.display = isOpen ? "none" : "block";
  document.getElementById("notesEditToggle").textContent = isOpen ? "Edit" : "Cancel";
}

async function saveNotes() {
  const notes = document.getElementById("profileNotesInput").value.trim();
  await db.collection("customers").doc(custId).update({ notes });
  document.getElementById("profileNotes").textContent = notes || "No notes recorded.";
  toggleNotesEdit();
  toast("Note saved");
}

async function uploadCustomerPhoto(file) {
  if (!file) return;
  toast("Uploading photo…");
  try {
    const url = await uploadPhoto(file, `customer-photos/${custId}-${Date.now()}.jpg`);
    await db.collection("customers").doc(custId).update({ photoUrl: url });
    document.getElementById("profilePhotoWrap").innerHTML = `<img src="${url}" style="width:100%;max-width:220px;border-radius:8px;border:1px solid var(--line);">`;
    toast("Photo updated");
  } catch (err) {
    console.error("Photo upload failed:", err);
    toast("Photo upload failed — check your connection and try again.");
  }
}

function renderLoans(query) {
  const q = (query || "").trim().toLowerCase();
  const loans = !q ? custLoans : custLoans.filter((l) =>
    (l.loanNumber || "").toLowerCase().includes(q) || (l.itemNames || []).some((n) => n.includes(q))
  );

  const body = document.getElementById("loanBody");
  if (loans.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="color:var(--ink-soft);padding:20px 0;">${q ? "No matching loans." : "No loans yet for this customer."}</td></tr>`;
    return;
  }
  body.innerHTML = loans.map((l) => `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${escapeHtml(l.loanNumber)}</td>
      <td style="text-transform:capitalize;">${(l.itemNames || []).join(", ") || "—"}</td>
      <td>${l.itemsIdentityNote ? escapeHtml(l.itemsIdentityNote) : `<span style="color:var(--ink-soft);">—</span>`}</td>
      <td>${fmtDate(l.date)}</td>
      <td class="mono">${fmtMoney(l.totalPrincipal || 0)}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>`).join("");
}

// ---------- Surplus funds held (customer deposits) ----------
// Separate from loans entirely — this is money the shop owes BACK to the
// customer, not the other way around. Interest is optional per deposit
// (some customers are paid interest on what they leave with you, some
// aren't) and — when it applies — reuses the exact same interest.js engine
// (365/366-day method) as everything else in the app, just calculating
// what's owed TO the customer instead of what's owed BY them.
async function loadDeposits() {
  const snap = await db.collection("customers").doc(custId).collection("deposits").get();
  custDeposits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  custDeposits.sort((a, b) => toJsDate(b.depositedDate) - toJsDate(a.depositedDate));
  renderDeposits();
}

function renderDeposits() {
  const list = document.getElementById("depositsList");
  if (!custDeposits.length) {
    list.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;">No surplus funds on record for this customer.</p>`;
    return;
  }

  list.innerHTML = custDeposits.map((d) => {
    const endDate = d.status === "returned" ? d.returnedDate : new Date();
    const interest = d.interestBearing && d.interestRate > 0 ? periodInterest(d.amount, d.interestRate, d.depositedDate, endDate, "simple") : 0;
    const payable = round2(d.amount + interest);
    const statusBadge = d.status === "requested"
      ? `<span class="badge" style="background:var(--warn-soft);color:var(--warn);">requested — bring it</span>`
      : d.status === "returned"
      ? `<span class="badge badge-closed">returned</span>`
      : `<span class="badge badge-active">held</span>`;

    return `
    <div class="disb-card">
      <div class="row"><strong class="mono">${fmtMoney(d.amount)}</strong>${statusBadge}</div>
      <div class="row"><span class="k">Deposited</span><span>${fmtDate(d.depositedDate)}</span></div>
      ${d.interestBearing ? `<div class="row"><span class="k">Interest</span><span>${d.interestRate}%/mo${d.status !== "returned" ? ` — accrued so far: ${fmtMoney(interest)}` : ""}</span></div>` : ""}
      ${d.status === "returned" ? `<div class="row"><span class="k">Returned</span><span>${fmtDate(d.returnedDate)}</span></div>` : ""}
      <div class="row"><span class="k" style="color:${d.status === "returned" ? "var(--ink-soft)" : "var(--good)"};">${d.status === "returned" ? "Paid out" : "Payable today"}</span><strong class="mono" style="color:${d.status === "returned" ? "var(--ink-soft)" : "var(--good)"};">${fmtMoney(payable)}</strong></div>
      ${d.notes ? `<div class="row"><span class="k">Notes</span><span>${escapeHtml(d.notes)}</span></div>` : ""}
      ${d.status !== "returned" ? `
        <div style="display:flex;gap:8px;margin-top:8px;">
          ${d.status === "held" ? `<button type="button" class="btn btn-secondary btn-sm" onclick="markDepositRequested('${d.id}')">Customer requested it back</button>` : ""}
          <button type="button" class="btn btn-primary btn-sm" onclick="markDepositReturned('${d.id}')">Mark as returned</button>
        </div>` : ""}
    </div>`;
  }).join("");
}

function openDepositModal() {
  document.getElementById("depositAmount").value = "";
  document.getElementById("depositDate").valueAsDate = new Date();
  document.getElementById("depositInterestBearing").checked = false;
  document.getElementById("depositRateField").style.display = "none";
  document.getElementById("depositRate").value = "";
  document.getElementById("depositNotes").value = "";
  openModal("depositModal");
}

async function saveDeposit() {
  const amount = parseFloat(document.getElementById("depositAmount").value);
  const dateStr = document.getElementById("depositDate").value;
  if (!amount || amount <= 0 || !dateStr) { toast("Enter a valid amount and date"); return; }

  const interestBearing = document.getElementById("depositInterestBearing").checked;
  const rate = parseFloat(document.getElementById("depositRate").value) || 0;
  if (interestBearing && rate <= 0) { toast("Enter the interest rate, or uncheck \"paying interest\""); return; }

  const btn = document.getElementById("saveDepositBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  await db.collection("customers").doc(custId).collection("deposits").add({
    amount,
    depositedDate: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
    interestBearing,
    interestRate: interestBearing ? rate : 0,
    status: "held",
    notes: document.getElementById("depositNotes").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await logActivity("customer-" + custId, "Surplus deposit added", `${fmtMoney(amount)} from ${currentCustomerData ? currentCustomerData.name : "customer"}`);

  closeModal("depositModal");
  toast("Deposit recorded");
  btn.disabled = false; btn.textContent = "Save deposit";
  await loadDeposits();
}

async function markDepositRequested(depositId) {
  await db.collection("customers").doc(custId).collection("deposits").doc(depositId).update({
    status: "requested",
    requestedDate: firebase.firestore.FieldValue.serverTimestamp(),
    customerId: custId,
    customerName: currentCustomerData ? currentCustomerData.name : "",
  });
  toast("Marked — this will now show on the Dashboard so it's not forgotten");
  await loadDeposits();
}

async function markDepositReturned(depositId) {
  if (!confirm("Mark this deposit as returned? This locks in the final payable amount.")) return;
  await db.collection("customers").doc(custId).collection("deposits").doc(depositId).update({
    status: "returned",
    returnedDate: firebase.firestore.FieldValue.serverTimestamp(),
  });
  toast("Marked as returned");
  await loadDeposits();
}
