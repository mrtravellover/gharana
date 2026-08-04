let custLoans = [];

const custId = new URLSearchParams(location.search).get("id");

requireAuth(async () => {
  renderShell({ active: "customers", title: "Customer Profile" });
  if (!custId) { toast("No customer selected"); location.href = "customers.html"; return; }
  document.getElementById("newLoanLink").href = `loan-create.html?customerId=${custId}`;
  document.getElementById("loanSearchInput").addEventListener("input", (e) => renderLoans(e.target.value));
  wirePhotoCapture("custPhotoBtn", null, uploadCustomerPhoto);
  await loadProfile();
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
