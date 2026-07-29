const loanId = new URLSearchParams(location.search).get("id");
let loanRef, loanData, ornaments = [], disbursements = [], payments = [];
let capturedDisbPhoto = null;
let capturedReturnPhoto = null;

requireAuth(async () => {
  renderShell({ active: "loans", title: "Loan Detail" });
  if (!loanId) { toast("No loan selected"); location.href = "loans.html"; return; }
  loanRef = db.collection("loans").doc(loanId);
  document.getElementById("disbForm").addEventListener("submit", saveDisbursement);
  document.getElementById("payForm").addEventListener("submit", savePayment);
  document.getElementById("mDisbDate").valueAsDate = new Date();
  document.getElementById("mPayDate").valueAsDate = new Date();
  wirePhotoCapture("mDisbPhotoBtn", "mDisbPhotoPreview", (file) => { capturedDisbPhoto = file; });
  wirePhotoCapture("returnPhotoBtn", "returnPhotoPreview", (file) => { capturedReturnPhoto = file; });
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
        ${loanData.pledgedByMode === "other" ? `
          <div style="background:var(--gold-soft);border-radius:8px;padding:10px 14px;margin-top:8px;">
            <p style="color:var(--gold-deep);font-weight:600;font-size:13.5px;margin-bottom:4px;">Ornament belongs to: ${escapeHtml(loanData.pledgedByLabel)}</p>
            <div style="font-size:13px;color:var(--ink-soft);display:flex;gap:16px;flex-wrap:wrap;">
              ${loanData.pledgedByMobile ? `<span>📱 ${escapeHtml(loanData.pledgedByMobile)}</span>` : ""}
              ${loanData.pledgedByAadhaar ? `<span>🪪 ${escapeHtml(loanData.pledgedByAadhaar)}</span>` : ""}
              ${loanData.pledgedByAddress ? `<span>📍 ${escapeHtml(loanData.pledgedByAddress)}</span>` : ""}
            </div>
          </div>` : ""}
      </div>
      <span class="badge badge-${loanData.status}" style="font-size:13px;padding:5px 12px;">${loanData.status}</span>
    </div>
    ${loanData.loanPhotoUrl ? `<div class="divider-dashed"></div><img src="${loanData.loanPhotoUrl}" style="max-width:160px;border-radius:8px;border:1px solid var(--line);">` : ""}
    ${loanData.remarks ? `<div class="divider-dashed"></div><p style="color:var(--ink-soft);font-size:13.5px;">${escapeHtml(loanData.remarks)}</p>` : ""}
  `;
}

function renderOrnaments() {
  document.getElementById("lockerNoteInline").textContent = loanData.itemsIdentityNote || "not set — click to add";
  document.getElementById("ornamentBody").innerHTML = ornaments.map((o) => `
    <tr>
      <td>${escapeHtml(o.itemName)}</td>
      <td><span class="badge badge-${o.metalType.toLowerCase()}">${o.metalType}</span></td>
      <td class="mono">${o.weight}</td>
      <td class="mono">${o.qty}</td>
      <td>${o.category || "—"}${o.purity ? ` (${o.purity})` : ""}</td>
      <td>${o.released
        ? `<span class="badge badge-closed">Released ${fmtDate(o.releasedAt)}</span>`
        : (loanData.status !== "closed" ? `<button class="btn btn-secondary btn-sm" onclick="openItemReleaseModal('${o.id}', '${escapeHtml(o.itemName).replace(/'/g, "\\'")}')">Release item</button>` : "Pledged")}
      </td>
    </tr>`).join("") || `<tr><td colspan="6" style="color:var(--ink-soft);">No items recorded.</td></tr>`;
}

function renderDisbursements() {
  const el = document.getElementById("disbList");
  el.innerHTML = disbursements.map((d) => `
    <div class="disb-card">
      <div class="row"><span class="k">${fmtDate(d.date)}</span><strong class="mono">${fmtMoney(d.amount)}</strong></div>
      <div class="row"><span class="k">Rate</span><span>${d.rate}% / month${d.interestType === "compound" ? " (compounding)" : ""}</span></div>
      ${d.reason ? `<div class="row"><span class="k">Reason</span><span>${escapeHtml(d.reason)}</span></div>` : ""}
      ${d.collectedBy ? `<div class="row"><span class="k">Collected by</span><span>${escapeHtml(d.collectedBy)}</span></div>` : ""}
      ${d.photoUrl ? `<img src="${d.photoUrl}" style="max-width:100px;border-radius:6px;margin-top:6px;display:block;">` : ""}
      <button class="btn btn-ghost btn-sm" style="padding-left:0;margin-top:4px;" onclick="openRateModal('${d.id}')">Change rate →</button>
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
  document.getElementById("sumInterestAccrued").textContent = fmtMoney(summary.interestOutstanding);
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
        ${balance > 0 ? `Balance still outstanding: <strong>${fmtMoney(balance)}</strong>.` : "Balance is fully cleared."}
      </p>
      <button class="btn btn-primary" onclick="openReleaseConfirmModal()">Mark ready to release</button>
    `;
  } else if (loanData.status === "released") {
    card.innerHTML = `
      <h2>Return the jewellery</h2>
      <div class="divider-dashed"></div>
      <p style="color:var(--ink-soft);font-size:13.5px;">Waiting for physical return.
        ${balance > 0 ? `<strong style="color:var(--danger);">Payment still due: ${fmtMoney(balance)}.</strong>` : "Fully paid."}
        Capture a photo of the customer with the jewellery to close this loan permanently.
      </p>
      <p style="color:var(--ink-soft);font-size:13.5px;">Customer needs money again on this same mortgage before pickup? Just use "+ Add disbursement" above — it'll move this loan back to active automatically.</p>
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

function openDisbModal() { openModal("disbModal"); }
function openPayModal() { openModal("payModal"); }

async function saveDisbursement(e) {
  e.preventDefault();
  const rate = parseFloat(document.getElementById("mDisbRate").value);
  const date = firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("mDisbDate").value));
  const disbRef = await loanRef.collection("disbursements").add({
    amount: parseFloat(document.getElementById("mDisbAmount").value),
    rate,
    interestType: document.getElementById("mDisbInterestType").value,
    rateHistory: [{ date, rate }],
    date,
    reason: document.getElementById("mDisbReason").value.trim(),
    collectedBy: document.getElementById("mDisbCollector").value.trim(),
    notes: document.getElementById("mDisbNotes").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  const photoFile = capturedDisbPhoto;
  if (photoFile) {
    const url = await uploadPhoto(photoFile, `disbursement-photos/${disbRef.id}-${Date.now()}.jpg`);
    await disbRef.update({ photoUrl: url });
  }

  // If this mortgage was sitting in "ready to release" and the customer needs money again
  // before pickup, giving a new disbursement brings it back to active automatically.
  if (loanData.status === "released") {
    await loanRef.update({ status: "active", reactivatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast("Disbursement added — mortgage moved back to active");
  } else {
    toast("Disbursement added");
  }

  closeModal("disbModal");
  document.getElementById("disbForm").reset();
  document.getElementById("mDisbPhotoPreview").innerHTML = "";
  capturedDisbPhoto = null;
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

function openReleaseConfirmModal() {
  const summary = window._loanSummary;
  document.getElementById("releasePrincipal").textContent = fmtMoney(summary.principalOutstanding);
  document.getElementById("releaseInterest").textContent = fmtMoney(summary.interestOutstanding);
  document.getElementById("releaseTotal").textContent = fmtMoney(summary.totalPayableToday);
  document.getElementById("releaseDurationBody").innerHTML = summary.perDisbursement.map((d) => `
    <tr>
      <td>${fmtDate(d.effectiveDate)}</td>
      <td class="mono">${d.days}</td>
      <td>${d.months} month${d.months === 1 ? "" : "s"}</td>
      <td class="mono">${fmtMoney(d.interest)}</td>
    </tr>`).join("");
  document.getElementById("releaseDueWarning").style.display = summary.totalPayableToday > 0 ? "block" : "none";
  openModal("releaseConfirmModal");
}

function goRecordPaymentFirst() {
  closeModal("releaseConfirmModal");
  openPayModal();
}

async function confirmMoveToRelease() {
  await loanRef.update({ status: "released", releasedAt: firebase.firestore.FieldValue.serverTimestamp() });
  closeModal("releaseConfirmModal");
  toast("Loan moved to release queue");
  await loadAll();
}

async function confirmReturn() {
  const btn = document.getElementById("confirmReturnBtn");
  btn.disabled = true; btn.textContent = capturedReturnPhoto ? "Uploading…" : "Closing…";

  const updateData = {
    status: "closed",
    closedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (capturedReturnPhoto) {
    const storageRef = storage.ref(`return-photos/${loanId}-${Date.now()}.jpg`);
    await storageRef.put(capturedReturnPhoto);
    updateData.returnPhotoUrl = await storageRef.getDownloadURL();
  }

  await loanRef.update(updateData);

  closeModal("returnModal");
  toast("Loan closed — jewellery returned");
  btn.disabled = false; btn.textContent = "Confirm & close";
  capturedReturnPhoto = null;
  document.getElementById("returnPhotoPreview").innerHTML = "";
  await loadAll();
}

// ---------- Locker note for the whole package (which bag/pack it's in) ----------
function openIdentityModal() {
  document.getElementById("identityInput").value = loanData.itemsIdentityNote || "";
  openModal("identityModal");
}

async function saveIdentityRemark() {
  const note = document.getElementById("identityInput").value.trim();
  await loanRef.update({ itemsIdentityNote: note });
  closeModal("identityModal");
  toast("Note saved");
  await loadAll();
}

// ---------- Change interest rate mid-loan ----------
function openRateModal(disbId) {
  const d = disbursements.find((x) => x.id === disbId);
  if (!d) return;
  document.getElementById("rateModalDisbIndex").value = disbId;
  document.getElementById("newRateInput").value = d.rate;
  document.getElementById("newRateInterestType").value = d.interestType || "simple";
  document.getElementById("newRateDate").valueAsDate = new Date();
  openModal("rateModal");
}

async function saveRateChange() {
  const disbId = document.getElementById("rateModalDisbIndex").value;
  const newRate = parseFloat(document.getElementById("newRateInput").value);
  const newType = document.getElementById("newRateInterestType").value;
  const effDateStr = document.getElementById("newRateDate").value;
  if (!effDateStr || isNaN(newRate)) { toast("Enter a valid rate and date"); return; }

  const btn = document.getElementById("saveRateBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const d = disbursements.find((x) => x.id === disbId);
  const effDate = firebase.firestore.Timestamp.fromDate(new Date(effDateStr));
  const history = (d.rateHistory && d.rateHistory.length ? d.rateHistory : [{ date: d.date, rate: d.rate }]).slice();
  history.push({ date: effDate, rate: newRate });

  await loanRef.collection("disbursements").doc(disbId).update({
    rate: newRate,
    interestType: newType,
    rateHistory: history,
  });

  closeModal("rateModal");
  toast("Rate updated");
  btn.disabled = false; btn.textContent = "Update rate";
  await loadAll();
}

// ---------- Release a single ornament while the loan stays active ----------
function openItemReleaseModal(ornId, itemName) {
  document.getElementById("itemReleaseOrnId").value = ornId;
  document.getElementById("itemReleaseName").textContent = `Item: ${itemName}`;
  document.getElementById("itemReleaseAmount").value = "";
  document.getElementById("itemReleaseDate").valueAsDate = new Date();
  document.getElementById("itemReleaseReceiver").value = "";
  openModal("itemReleaseModal");
}

async function saveItemRelease() {
  const ornId = document.getElementById("itemReleaseOrnId").value;
  const amount = parseFloat(document.getElementById("itemReleaseAmount").value);
  if (!amount || amount <= 0) { toast("Enter the amount received"); return; }

  const orn = ornaments.find((o) => o.id === ornId);
  const btn = document.getElementById("saveItemReleaseBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const date = firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("itemReleaseDate").value));
  const receivedBy = document.getElementById("itemReleaseReceiver").value.trim();

  // Record it as a normal payment — the waterfall (interest first, then principal) applies automatically.
  await loanRef.collection("payments").add({
    type: "item-release",
    amount,
    date,
    receivedBy,
    remarks: `Released item: ${orn ? orn.itemName : ""}`,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await loanRef.collection("ornaments").doc(ornId).update({
    released: true,
    releasedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  closeModal("itemReleaseModal");
  toast("Item released — payment recorded");
  btn.disabled = false; btn.textContent = "Release item";
  await loadAll();
}
