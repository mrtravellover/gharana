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
  await renderActivityLog();
}

async function renderActivityLog() {
  const el = document.getElementById("activityLog");
  try {
    const snap = await db.collection("activityLog").where("loanId", "==", loanId).orderBy("at", "desc").limit(30).get();
    if (snap.empty) { el.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;">No activity recorded yet.</p>`; return; }
    el.innerHTML = snap.docs.map((doc) => {
      const a = doc.data();
      return `<div class="row" style="font-size:13px;margin-bottom:6px;"><span class="k">${fmtDate(a.at)} — ${escapeHtml(a.byEmail)}</span><span>${escapeHtml(a.action)}${a.detail ? `: ${escapeHtml(a.detail)}` : ""}</span></div>`;
    }).join("");
  } catch (err) {
    console.error("Activity log query failed:", err);
    if (err.code === "failed-precondition" || (err.message || "").includes("index")) {
      el.innerHTML = `<p style="color:var(--warn);font-size:13px;">Firestore needs a one-time index for Activity to show up — open the browser console (F12) and click the link in the error message to create it (takes ~1 min), then reload.</p>`;
    } else {
      el.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;">Couldn't load activity right now.</p>`;
    }
  }
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
      <div class="row"><span class="k">Rate</span><span>${d.rate}% / month${d.interestType === "compound" ? " (compounding monthly)" : d.interestType === "compound_annual" ? " (compounding annually)" : ""}</span></div>
      ${d.reason ? `<div class="row"><span class="k">Reason</span><span>${escapeHtml(d.reason)}</span></div>` : ""}
      ${d.collectedBy ? `<div class="row"><span class="k">Collected by</span><span>${escapeHtml(d.collectedBy)}</span></div>` : ""}
      ${d.photoUrl ? `<img src="${d.photoUrl}" style="max-width:100px;border-radius:6px;margin-top:6px;display:block;">` : ""}
      <button class="btn btn-ghost btn-sm" style="padding-left:0;margin-top:4px;" onclick="openRateModal('${d.id}')">Change rate →</button>
    </div>`).join("") || `<p style="color:var(--ink-soft);">No disbursements yet.</p>`;
}

function chargedAsLabel(d) {
  if (d.roundMode === "exact") {
    return `${formatDuration(d.days)} <span class="hint" style="display:inline;">(exact, no minimum)</span>`;
  }
  const wholeMonths = Math.ceil(d.days / 30);
  const isRounded = d.days > 0 && d.days < 30 * wholeMonths;
  return `${d.months} month${d.months === 1 ? "" : "s"}${isRounded ? ` <span class="hint" style="display:inline;">(min. rule)</span>` : ""}`;
}

function renderInterest() {
  const summary = calcLoanSummary(disbursements, payments);
  document.getElementById("interestBody").innerHTML = summary.perDisbursement.map((d) => `
    <tr>
      <td>${fmtDate(d.originalDate)}${d.settled ? ` <span class="badge badge-closed">settled</span>` : ""}</td>
      <td>${d.rate}%</td>
      <td class="mono">${fmtMoney(d.principal)} <span style="color:var(--ink-soft);font-size:12px;">of ${fmtMoney(d.originalAmount)}</span></td>
      <td>${fmtDate(d.effectiveDate)}${d.dateChanged ? ` <span class="hint" style="display:inline;">(after payment)</span>` : ""}</td>
      <td>${formatDuration(d.days)}</td>
      <td>${chargedAsLabel(d)}</td>
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
      <button class="btn btn-primary" onclick="openReturnModal()">Capture return photo &amp; close</button>
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
function openPayModal() { renderRateQuickEditRows("payRateRows", "payModal"); openModal("payModal"); }

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
    try {
      const url = await uploadPhoto(photoFile, `disbursement-photos/${disbRef.id}-${Date.now()}.jpg`);
      await disbRef.update({ photoUrl: url });
    } catch (err) {
      console.error("Disbursement photo upload failed:", err);
      toast("Disbursement saved, but the photo failed to upload.");
    }
  }

  const disbAmount = parseFloat(document.getElementById("mDisbAmount").value);
  await logActivity(loanId, "Disbursement added", `${fmtMoney(disbAmount)} at ${rate}%`);

  // If this mortgage was sitting in "ready to release" and the customer needs money again
  // before pickup, giving a new disbursement brings it back to active automatically.
  if (loanData.status === "released") {
    await loanRef.update({ status: "active", reactivatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await logActivity(loanId, "Mortgage reactivated", "New disbursement given while ready-to-release");
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
  const amount = parseFloat(document.getElementById("mPayAmount").value);
  const type = document.getElementById("mPayType").value;
  await loanRef.collection("payments").add({
    type,
    amount,
    date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("mPayDate").value)),
    receivedBy: document.getElementById("mPayReceiver").value.trim(),
    remarks: document.getElementById("mPayRemarks").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await logActivity(loanId, "Payment recorded", `${fmtMoney(amount)} (${type})`);
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
      <td>${formatDuration(d.days)}</td>
      <td>${chargedAsLabel(d)}</td>
      <td class="mono">${fmtMoney(d.interest)}</td>
    </tr>`).join("");
  document.getElementById("releaseDueWarning").style.display = summary.totalPayableToday > 0 ? "block" : "none";
  renderRateQuickEditRows("releaseRateRows", "releaseConfirmModal");
  openModal("releaseConfirmModal");
}

function goRecordPaymentFirst() {
  closeModal("releaseConfirmModal");
  openPayModal();
}

async function confirmMoveToRelease() {
  await loanRef.update({ status: "released", releasedAt: firebase.firestore.FieldValue.serverTimestamp() });
  await logActivity(loanId, "Moved to ready-to-release");
  closeModal("releaseConfirmModal");
  toast("Loan moved to release queue");
  await loadAll();
}

function openReturnModal() {
  const summary = window._loanSummary;
  const balance = summary.totalPayableToday;
  const wrap = document.getElementById("returnBalanceWrap");

  if (balance > 0) {
    wrap.innerHTML = `
      <div style="background:var(--warn-soft);border-radius:8px;padding:12px 14px;margin-bottom:12px;">
        <p style="color:var(--warn);font-weight:600;font-size:14px;margin-bottom:8px;">Balance due: ${fmtMoney(balance)} — this must be collected before the loan can close.</p>
        <div class="grid grid-2">
          <div class="field" style="margin-bottom:0;"><label>Amount to collect now</label><input type="number" id="returnCloseAmount" value="${balance}" readonly class="mono"></div>
          <div class="field" style="margin-bottom:0;"><label>Received by</label><input type="text" id="returnCloseReceiver" placeholder="e.g. Kavish"></div>
        </div>
      </div>`;
  } else {
    wrap.innerHTML = `<div style="background:var(--good-soft);border-radius:8px;padding:10px 14px;margin-bottom:12px;color:var(--good);font-weight:600;font-size:14px;">Fully paid — nothing due.</div>`;
  }
  openModal("returnModal");
}

async function confirmReturn() {
  const summary = window._loanSummary;
  const balance = summary.totalPayableToday;
  const btn = document.getElementById("confirmReturnBtn");

  if (balance > 0) {
    const receiver = document.getElementById("returnCloseReceiver").value.trim();
    btn.disabled = true; btn.textContent = "Recording payment…";
    await loanRef.collection("payments").add({
      type: "full",
      amount: balance,
      date: firebase.firestore.Timestamp.now(),
      receivedBy: receiver,
      remarks: "Final settlement at closing",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  btn.disabled = true; btn.textContent = capturedReturnPhoto ? "Uploading…" : "Closing…";

  const updateData = {
    status: "closed",
    closedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (capturedReturnPhoto) {
    try {
      const storageRef = storage.ref(`return-photos/${loanId}-${Date.now()}.jpg`);
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000));
      await Promise.race([storageRef.put(capturedReturnPhoto), timeout]);
      updateData.returnPhotoUrl = await storageRef.getDownloadURL();
    } catch (err) {
      console.error("Return photo upload failed:", err);
      toast("Photo failed to upload — closing without it.");
    }
  }

  await loanRef.update(updateData);
  await logActivity(loanId, "Loan closed", balance > 0 ? `Final settlement ${fmtMoney(balance)} collected` : "Fully paid");

  closeModal("returnModal");
  toast("Loan closed — jewellery returned");
  btn.disabled = false; btn.textContent = "Confirm & close";
  capturedReturnPhoto = null;
  document.getElementById("returnPhotoPreview").innerHTML = "";
  await loadAll();
}

// ---------- Print receipt ----------
function printReceipt() {
  const summary = window._loanSummary;
  const area = document.getElementById("printReceiptArea");
  area.innerHTML = `
    <h1>Gharana Ledger — Loan Receipt</h1>
    <p>Loan #: <strong>${escapeHtml(loanData.loanNumber)}</strong> &nbsp; Date: ${fmtDate(loanData.date)} &nbsp; Status: ${loanData.status}</p>
    <p>Customer: <strong>${escapeHtml(loanData.customerName)}</strong>${loanData.pledgedByMode === "other" ? ` (item belongs to ${escapeHtml(loanData.pledgedByLabel)})` : ""}</p>
    <table>
      <thead><tr><th>Item</th><th>Metal</th><th>Weight (g)</th><th>Qty</th><th>Category</th></tr></thead>
      <tbody>
        ${ornaments.map((o) => `<tr><td>${escapeHtml(o.itemName)}</td><td>${o.metalType}</td><td>${o.weight}</td><td>${o.qty}</td><td>${o.category || "—"}</td></tr>`).join("")}
      </tbody>
    </table>
    <table>
      <thead><tr><th>Disbursed on</th><th>Amount</th><th>Rate/mo</th></tr></thead>
      <tbody>
        ${disbursements.map((d) => `<tr><td>${fmtDate(d.date)}</td><td>${fmtMoney(d.amount)}</td><td>${d.rate}%</td></tr>`).join("")}
      </tbody>
    </table>
    <p class="receipt-total">Principal outstanding: ${fmtMoney(summary.principalOutstanding)}</p>
    <p class="receipt-total">Interest due: ${fmtMoney(summary.interestOutstanding)}</p>
    <p class="receipt-total">Total payable: ${fmtMoney(summary.totalPayableToday)}</p>
    <p style="font-size:12px;margin-top:6px;">Printed: ${new Date().toLocaleString("en-IN")}</p>
    <div class="sign-row">
      <div>Customer signature</div>
      <div>Shah Jewellers</div>
    </div>
  `;
  window.print();
}

// ---------- WhatsApp reminder ----------
async function sendWhatsAppReminder() {
  const summary = window._loanSummary;
  const custDoc = await db.collection("customers").doc(loanData.customerId).get();
  const mobile = custDoc.exists ? (custDoc.data().mobile || "").replace(/\D/g, "") : "";
  if (!mobile) { toast("No mobile number on file for this customer"); return; }

  const message = `Namaste ${loanData.customerName}, this is a reminder from Shah Jewellers regarding loan ${loanData.loanNumber}. ` +
    `Principal outstanding: ${fmtMoney(summary.principalOutstanding)}, Interest due: ${fmtMoney(summary.interestOutstanding)}, Total payable: ${fmtMoney(summary.totalPayableToday)}. Please visit at your convenience.`;

  const phone = mobile.length === 10 ? `91${mobile}` : mobile; // assume India if no country code
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
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

function renderRateQuickEditRows(containerId, closeThisModalFirst) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const typeLabels = { simple: "Simple", compound: "Compounding (monthly)", compound_annual: "Compounding (annually)" };
  container.innerHTML = disbursements.map((d) => `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:13.5px;padding:8px 0;border-bottom:1px dashed var(--line);">
      <span style="color:var(--ink-soft);">${fmtDate(d.date)} — ${fmtMoney(d.amount)}</span>
      <span style="display:flex;align-items:center;gap:8px;">
        ${d.rate}% · ${typeLabels[d.interestType] || "Simple"}
        <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="closeModal('${closeThisModalFirst}'); openRateModal('${d.id}');">Change →</button>
      </span>
    </div>
  `).join("") || `<p style="color:var(--ink-soft);font-size:13px;">No disbursements yet.</p>`;
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
  await logActivity(loanId, "Interest rate changed", `${d.rate}% → ${newRate}% from ${fmtDate(effDate)}`);

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
  await logActivity(loanId, "Item released", `${orn ? orn.itemName : ""} — ${fmtMoney(amount)} collected`);

  closeModal("itemReleaseModal");
  toast("Item released — payment recorded");
  btn.disabled = false; btn.textContent = "Release item";
  await loadAll();
}
