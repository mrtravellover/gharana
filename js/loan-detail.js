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
  if (typeof initGallery === "function") await initGallery();
  if (typeof loadShopInfo === "function") await loadShopInfo();
});

async function loadAll() {
  const doc = await loanRef.get();
  if (!doc.exists) { toast("Loan not found"); location.href = "loans.html"; return; }
  loanData = doc.data();
  if (loanData.pledgedByAadhaar) loanData.pledgedByAadhaar = await decryptAadhaar(loanData.pledgedByAadhaar);

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
    const snap = await db.collection("activityLog").where("loanId", "==", loanId).limit(60).get();
    if (snap.empty) { el.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;">No activity recorded yet.</p>`; return; }
    const entries = snap.docs.map((doc) => doc.data());
    entries.sort((a, b) => toJsDate(b.at) - toJsDate(a.at)); // sort here instead of in the query, so no composite index is needed
    el.innerHTML = entries.slice(0, 30).map((a) => `
      <div class="row" style="font-size:13px;margin-bottom:6px;"><span class="k">${fmtDate(a.at)} — ${escapeHtml(a.byEmail)}</span><span>${escapeHtml(a.action)}${a.detail ? `: ${escapeHtml(a.detail)}` : ""}</span></div>
    `).join("");
  } catch (err) {
    console.error("Activity log query failed:", err);
    el.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;">Couldn't load activity right now.</p>`;
  }
}

function renderHeader() {
  document.getElementById("loanHeader").innerHTML = `
    <div class="section-head">
      <div>
        <h2 class="mono">${escapeHtml(loanData.loanNumber)}</h2>
        <p><a href="customer-profile.html?id=${loanData.customerId}">${escapeHtml(loanData.customerName)}</a> · Loan date ${fmtDate(loanData.date)}</p>
        ${loanData.hasCollateral === false ? `<div style="background:var(--warn-soft);color:var(--warn);border-radius:8px;padding:10px 14px;margin-top:8px;font-weight:600;font-size:13.5px;">⚠ No collateral — this loan has no ornaments backing it.</div>` : ""}
        ${loanData.pledgedByMode === "other" ? `
          <div style="background:var(--gold-soft);border-radius:8px;padding:10px 14px;margin-top:8px;">
            <p style="color:var(--gold-deep);font-weight:600;font-size:13.5px;margin-bottom:4px;">Ornament belongs to: ${escapeHtml(loanData.pledgedByLabel)}</p>
            <div style="font-size:13px;color:var(--ink-soft);display:flex;gap:16px;flex-wrap:wrap;">
              ${loanData.pledgedByMobile ? `<span>📱 ${escapeHtml(loanData.pledgedByMobile)}</span>` : ""}
              ${loanData.pledgedByAadhaar ? `<span>🪪 ${escapeHtml(loanData.pledgedByAadhaar)}</span>` : ""}
              ${loanData.pledgedByVillage ? `<span>📍 ${escapeHtml(loanData.pledgedByVillage)}</span>` : ""}
              ${loanData.pledgedByAddress ? `<span>🏠 ${escapeHtml(loanData.pledgedByAddress)}</span>` : ""}
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
      <td>${o.released ? `<span class="badge badge-closed">Released ${fmtDate(o.releasedAt)}</span>` : "Pledged"}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="openEditOrnamentModal('${o.id}')">✏️ Edit</button>
          ${!o.released && loanData.status !== "closed" ? `<button class="btn btn-secondary btn-sm" onclick="openItemReleaseModal('${o.id}', '${escapeHtml(o.itemName).replace(/'/g, "\\'")}')">Release</button>` : ""}
        </div>
      </td>
    </tr>`).join("") || `<tr><td colspan="7" style="color:var(--ink-soft);">No items recorded.</td></tr>`;
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
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn btn-ghost btn-sm" style="padding-left:0;" onclick="openEditDisbModal('${d.id}')">✏️ Edit amount/date</button>
        <button class="btn btn-ghost btn-sm" onclick="openRateModal('${d.id}')">Change rate →</button>
      </div>
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
      <td>${formatDuration(d.days)}</td>
      <td class="mono">${fmtMoney(d.interest)}</td>
    </tr>`).join("") || `<tr><td colspan="6" style="color:var(--ink-soft);">No disbursements yet.</td></tr>`;

  document.getElementById("sumPrincipal").textContent = fmtMoney(summary.principalOutstanding);
  document.getElementById("sumInterestAccrued").innerHTML = fmtInterestDue(summary.interestOutstanding);
  document.getElementById("creditProjectionNote").textContent = summary.advanceCreditRemaining > 0
    ? `${fmtMoney(summary.advanceCreditRemaining)} advance credit — covers interest until about ${summary.creditExhaustionDate ? fmtDate(summary.creditExhaustionDate) : "an unusually far-off date"}`
    : "";
  document.getElementById("sumInterestPaid").textContent = fmtMoney(summary.interestPaid);
  document.getElementById("sumPayable").textContent = fmtMoney(summary.totalPayableToday);

  window._loanSummary = summary;
}

function renderPayments() {
  const breakdown = (window._loanSummary && window._loanSummary.paymentBreakdown) || [];
  document.getElementById("payBody").innerHTML = payments.map((p) => {
    const bd = breakdown.find((b) => b.isAdvanceInterest && Math.abs(toJsDate(b.date) - toJsDate(p.date)) < 1000 && b.amount === Number(p.amount));
    const splitNote = bd ? `<div class="hint" style="margin-top:2px;">${fmtMoney(bd.settledPortion)} settled interest, ${fmtMoney(bd.creditPortion)} became credit</div>` : "";
    const targetDisb = p.targetDisbursementId ? disbursements.find((d) => d.id === p.targetDisbursementId) : null;
    const targetNote = p.targetDisbursementId
      ? `<div class="hint" style="margin-top:2px;">→ ${targetDisb ? fmtDate(targetDisb.date) + " disbursement only" : "a since-removed disbursement"}</div>`
      : "";
    return `
    <tr>
      <td>${fmtDate(p.date)}</td>
      <td style="text-transform:capitalize;">${p.type === "advance_interest" ? "Advance interest" : p.type}${splitNote}${targetNote}</td>
      <td class="mono">${fmtMoney(p.amount)}</td>
      <td>${escapeHtml(p.receivedBy || "—")}</td>
      <td>${escapeHtml(p.remarks || "—")}</td>
      <td><button type="button" class="btn btn-ghost btn-sm" onclick="openEditPayModal('${p.id}')" title="Edit this payment">✏️</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" style="color:var(--ink-soft);">No payments recorded yet.</td></tr>`;
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
function openPayModal() {
  document.getElementById("mPayType").value = "interest";
  updatePayTypeHint();
  populatePayTargetSelector();
  renderRateQuickEditRows("payRateRows", "payModal");
  openModal("payModal");
}

function populatePayTargetSelector() {
  const field = document.getElementById("payTargetField");
  const select = document.getElementById("mPayTarget");
  const openDisbursements = disbursements.filter((d) => {
    const s = window._loanSummary && window._loanSummary.perDisbursement.find((p) => p.id === d.id);
    return !s || !s.settled; // only offer disbursements that still have something outstanding
  });

  if (openDisbursements.length <= 1) {
    field.style.display = "none";
    select.value = "";
    return;
  }
  field.style.display = "block";
  select.innerHTML = `<option value="">All disbursements (oldest first, as usual)</option>` +
    openDisbursements.map((d) => `<option value="${d.id}">${fmtDate(d.date)} — ${fmtMoney(d.amount)} @ ${d.rate}%</option>`).join("");
}

function updatePayTypeHint() {
  const type = document.getElementById("mPayType").value;
  const hint = document.getElementById("payTypeHint");
  hint.textContent = type === "advance_interest"
    ? "Prepays future interest — doesn't touch principal or settle today's interest like a normal payment would. \"Interest due\" will show as a credit until real accrued interest catches up to this amount, then it returns to normal automatically. If the loan is paid off before that happens, the unused amount effectively reduces what's owed. If the customer wants to prepay more later, one combined payment goes further than several small ones on different days."
    : "Just a label for your records — every payment automatically clears interest due first, then reduces principal.";
}

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
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "disbursement", action: "Disbursement added", detail: `${fmtMoney(disbAmount)} at ${rate}%` });

  // If this mortgage was sitting in "ready to release" and the customer needs money again
  // before pickup, giving a new disbursement brings it back to active automatically.
  if (loanData.status === "released") {
    await loanRef.update({ status: "active", reactivatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await logActivity({ customerId: loanData.customerId, loanId, eventType: "renewal", action: "Mortgage reactivated", detail: "New disbursement given while ready-to-release" });
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
  const targetDisbursementId = document.getElementById("mPayTarget").value || null;
  await loanRef.collection("payments").add({
    type,
    amount,
    date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("mPayDate").value)),
    receivedBy: document.getElementById("mPayReceiver").value.trim(),
    remarks: document.getElementById("mPayRemarks").value.trim(),
    targetDisbursementId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  const targetNote = targetDisbursementId ? " (targeted to one disbursement)" : "";
  await logActivity({ customerId: loanData.customerId, loanId, eventType: type === "interest" || type === "advance_interest" ? "interest_collected" : "partial_payment", action: "Payment recorded", detail: `${fmtMoney(amount)} (${type === "advance_interest" ? "advance interest" : type})${targetNote}` });
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
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "ready_to_release", action: "Moved to ready-to-release" });
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
  document.getElementById("returnCloseDate").valueAsDate = new Date();
  document.getElementById("returnCloseRemark").value = "";
  openModal("returnModal");
}

async function confirmReturn() {
  const summary = window._loanSummary;
  const balance = summary.totalPayableToday;
  const btn = document.getElementById("confirmReturnBtn");
  const closeDate = firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("returnCloseDate").value));
  const returnRemark = document.getElementById("returnCloseRemark").value.trim();

  if (balance > 0) {
    const receiver = document.getElementById("returnCloseReceiver").value.trim();
    btn.disabled = true; btn.textContent = "Recording payment…";
    await loanRef.collection("payments").add({
      type: "full",
      amount: balance,
      date: closeDate,
      receivedBy: receiver,
      remarks: "Final settlement at closing",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  btn.disabled = true; btn.textContent = capturedReturnPhoto ? "Uploading…" : "Closing…";

  const updateData = {
    status: "closed",
    closedAt: closeDate,
    returnRemark,
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
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "loan_closed", action: "Loan closed", detail: balance > 0 ? `Final settlement ${fmtMoney(balance)} collected` : "Fully paid" });

  closeModal("returnModal");
  toast("Loan closed — jewellery returned");
  btn.disabled = false; btn.textContent = "Confirm & close";
  capturedReturnPhoto = null;
  document.getElementById("returnPhotoPreview").innerHTML = "";
  await loadAll();
}

// ---------- Generate Receipt (multiple types) ----------
function openReceiptPicker() {
  document.getElementById("receiptTypeSelect").value = "loan";
  document.getElementById("captureSignatureCheckbox").checked = false;
  updateReceiptContextField();
  openModal("receiptPickerModal");
}

function updateReceiptContextField() {
  const type = document.getElementById("receiptTypeSelect").value;
  const field = document.getElementById("receiptContextField");
  const label = document.getElementById("receiptContextLabel");
  const select = document.getElementById("receiptContextSelect");
  const hint = document.getElementById("receiptContextHint");
  hint.textContent = "";
  select.innerHTML = "";

  if (type === "loan") {
    field.style.display = "none";
    return;
  }
  field.style.display = "block";

  if (type === "payment" || type === "interest") {
    label.textContent = type === "interest" ? "Select payment (its interest portion will be used)" : "Select payment";
    const all = (window._loanSummary && window._loanSummary.paymentBreakdown) || [];
    const filtered = type === "interest" ? all.filter((p) => p.interestPortion > 0 || p.isAdvanceInterest) : all;
    if (!filtered.length) { hint.textContent = type === "interest" ? "No interest or advance-interest payments recorded yet." : "No payments recorded on this loan yet."; return; }
    select.innerHTML = filtered.map((p, i) => `<option value="${i}">${fmtDate(p.date)} — ${fmtMoney(p.amount)}${p.isAdvanceInterest ? " (advance interest)" : ""}</option>`).join("");
  } else if (type === "renewal") {
    label.textContent = "Select renewal disbursement";
    if (disbursements.length <= 1) { hint.textContent = "This loan only has its original disbursement — nothing to show as a renewal yet."; return; }
    select.innerHTML = disbursements.slice(1).map((d, i) => `<option value="${i + 1}">${fmtDate(d.date)} — ${fmtMoney(d.amount)}</option>`).join("");
  } else if (type === "gold_return") {
    label.textContent = "Select released item";
    const released = ornaments.filter((o) => o.released);
    if (!released.length) { hint.textContent = "No items have been released on this loan yet."; return; }
    select.innerHTML = released.map((o, i) => `<option value="${i}">${escapeHtml(o.itemName)} (${o.weight}g)</option>`).join("");
  }
}

// Resolves to a signature data URL if the customer draws one, or null if
// the checkbox wasn't ticked (or they skip it in the pad) — either way,
// the receipt still generates correctly, just with the printed line
// instead of an embedded image.
function captureSignatureIfRequested() {
  return new Promise((resolve) => {
    if (!document.getElementById("captureSignatureCheckbox").checked) { resolve(null); return; }
    openSignaturePad((dataUrl) => resolve(dataUrl));
  });
}

async function handleGenerateReceipt(action) {
  const type = document.getElementById("receiptTypeSelect").value;
  const ctx = { loan: { ...loanData, id: loanId } };

  if (type === "loan") {
    ctx.ornaments = ornaments;
    ctx.disbursements = disbursements;
    ctx.payments = payments;
    ctx.summary = window._loanSummary;
  } else if (type === "payment" || type === "interest") {
    const idx = parseInt(document.getElementById("receiptContextSelect").value, 10);
    const all = (window._loanSummary && window._loanSummary.paymentBreakdown) || [];
    const filtered = type === "interest" ? all.filter((p) => p.interestPortion > 0 || p.isAdvanceInterest) : all;
    if (isNaN(idx) || !filtered[idx]) { toast("Select a payment first"); return; }
    ctx.payment = filtered[idx];
    ctx.summary = window._loanSummary;
  } else if (type === "renewal") {
    const idx = parseInt(document.getElementById("receiptContextSelect").value, 10);
    if (isNaN(idx) || !disbursements[idx]) { toast("Select a disbursement first"); return; }
    ctx.disbursement = disbursements[idx];
  } else if (type === "gold_return") {
    const idx = parseInt(document.getElementById("receiptContextSelect").value, 10);
    const released = ornaments.filter((o) => o.released);
    if (isNaN(idx) || !released[idx]) { toast("Select an item first"); return; }
    ctx.ornament = released[idx];
  }

  closeModal("receiptPickerModal"); // close before the signature pad, so the two modals never stack on screen
  const signatureDataUrl = await captureSignatureIfRequested();

  toast("Generating receipt…");
  const receiptNumber = await generateReceipt(type, ctx, signatureDataUrl);

  if (action === "print") {
    waitForReceiptImagesThenPrint();
  } else {
    shareReceiptWhatsApp(type, ctx, receiptNumber);
  }
}

// Waits for the receipt's logo image to actually finish loading before
// opening the print dialog — printing while a large image is still
// decoding is what caused broken pagination (blank first page, logo alone
// on the second page) before this fix. Falls back to a short delay if the
// image somehow never fires a load/error event.
function waitForReceiptImagesThenPrint() {
  const images = [...document.querySelectorAll("#printReceiptArea img")];
  const pending = images.filter((img) => !img.complete);
  if (!pending.length) { printCurrentReceipt(); return; }

  let remaining = pending.length;
  const done = () => { remaining--; if (remaining <= 0) printCurrentReceipt(); };
  pending.forEach((img) => {
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
  setTimeout(() => { if (remaining > 0) printCurrentReceipt(); }, 1200); // safety net in case an image never fires either event
}

// ---------- WhatsApp reminder ----------
async function sendWhatsAppReminder() {
  const summary = window._loanSummary;
  const custDoc = await db.collection("customers").doc(loanData.customerId).get();
  const mobile = custDoc.exists ? (custDoc.data().mobile || "").replace(/\D/g, "") : "";
  if (!mobile) { toast("No mobile number on file for this customer"); return; }

  const message = `Namaste ${loanData.customerName}, this is a reminder regarding loan ${loanData.loanNumber}. ` +
    `Principal outstanding: ${fmtMoney(summary.principalOutstanding)}, Interest due: ${fmtMoney(summary.interestOutstanding)}, Total payable: ${fmtMoney(summary.totalPayableToday)}. Please visit at your convenience.`;

  const phone = mobile.length === 10 ? `91${mobile}` : mobile; // assume India if no country code
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
}

// ---------- Edit ornament details (weight, identity, etc. can change while kept) ----------
function openEditOrnamentModal(ornId) {
  const o = ornaments.find((x) => x.id === ornId);
  if (!o) return;
  document.getElementById("editOrnId").value = ornId;
  document.getElementById("editOrnName").value = o.itemName;
  document.getElementById("editOrnMetal").value = o.metalType;
  document.getElementById("editOrnWeight").value = o.weight;
  document.getElementById("editOrnQty").value = o.qty;
  document.getElementById("editOrnPurity").value = o.purity || "";
  document.getElementById("editOrnReason").value = "";
  syncEditOrnPurityField();
  document.getElementById("editOrnMetal").onchange = syncEditOrnPurityField;
  openModal("editOrnamentModal");
}

function syncEditOrnPurityField() {
  document.getElementById("editOrnPurityField").style.display = document.getElementById("editOrnMetal").value === "Silver" ? "" : "none";
}

async function saveOrnamentEdit() {
  const ornId = document.getElementById("editOrnId").value;
  const orn = ornaments.find((o) => o.id === ornId);
  const metal = document.getElementById("editOrnMetal").value;
  const purity = document.getElementById("editOrnPurity").value;

  const updated = {
    itemName: document.getElementById("editOrnName").value.trim(),
    metalType: metal,
    weight: parseFloat(document.getElementById("editOrnWeight").value) || 0,
    qty: parseFloat(document.getElementById("editOrnQty").value) || 1,
    purity: metal === "Silver" ? purity : "",
    category: metal === "Silver" ? silverCategory(purity) : "",
  };

  if (!updated.itemName || updated.weight <= 0) { toast("Enter a valid item name and weight"); return; }

  const btn = document.getElementById("saveOrnEditBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  await loanRef.collection("ornaments").doc(ornId).update(updated);

  const changes = [];
  if (orn.itemName !== updated.itemName) changes.push(`name ${orn.itemName} → ${updated.itemName}`);
  if (orn.weight != updated.weight) changes.push(`weight ${orn.weight}g → ${updated.weight}g`);
  if (orn.metalType !== updated.metalType) changes.push(`metal ${orn.metalType} → ${updated.metalType}`);
  if ((orn.purity || "") != (updated.purity || "")) changes.push(`purity ${orn.purity || "—"} → ${updated.purity || "—"}`);
  const reason = document.getElementById("editOrnReason").value.trim();
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "loan_edited", action: "Item edited", detail: `${changes.join(", ") || "no field changes"}${reason ? ` — ${reason}` : ""}` });

  closeModal("editOrnamentModal");
  toast("Item updated");
  btn.disabled = false; btn.textContent = "Save changes";
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

function renderRateQuickEditRows(containerId, closeThisModalFirst) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const typeLabels = { simple: "Simple", compound: "Compounding (monthly)", compound_annual: "Compounding (annually)" };
  container.innerHTML = disbursements.map((d) => `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:13.5px;padding:8px 0;border-bottom:1px dashed var(--line);">
      <span style="color:var(--ink-soft);min-width:0;overflow-wrap:break-word;">${fmtDate(d.date)} — ${fmtMoney(d.amount)}</span>
      <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${d.rate}% · ${typeLabels[d.interestType] || "Simple"}
        <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="closeModal('${closeThisModalFirst}'); openRateModal('${d.id}');">Change →</button>
      </span>
    </div>
  `).join("") || `<p style="color:var(--ink-soft);font-size:13px;">No disbursements yet.</p>`;
}

// ---------- Edit disbursement amount/date (correcting a data-entry mistake) ----------
function openEditDisbModal(disbId) {
  const d = disbursements.find((x) => x.id === disbId);
  if (!d) return;
  document.getElementById("editDisbId").value = disbId;
  document.getElementById("editDisbAmount").value = d.amount;
  document.getElementById("editDisbDate").valueAsDate = toJsDate(d.date);
  document.getElementById("editDisbReason").value = d.reason || "";
  document.getElementById("editDisbCollector").value = d.collectedBy || "";
  document.getElementById("editDisbNote").value = "";
  openModal("editDisbModal");
}

async function saveDisbursementEdit() {
  const disbId = document.getElementById("editDisbId").value;
  const d = disbursements.find((x) => x.id === disbId);
  const newAmount = parseFloat(document.getElementById("editDisbAmount").value);
  const newDateStr = document.getElementById("editDisbDate").value;
  if (!newAmount || newAmount <= 0 || !newDateStr) { toast("Enter a valid amount and date"); return; }

  const btn = document.getElementById("saveDisbEditBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const newDate = firebase.firestore.Timestamp.fromDate(new Date(newDateStr));
  const dateChanged = toJsDate(d.date).toDateString() !== new Date(newDateStr).toDateString();

  const updated = {
    amount: newAmount,
    date: newDate,
    reason: document.getElementById("editDisbReason").value.trim(),
    collectedBy: document.getElementById("editDisbCollector").value.trim(),
  };

  // If the date changed, keep the rate history's origin entry in sync —
  // that's what the interest engine treats as this disbursement's start date.
  if (dateChanged) {
    const history = (d.rateHistory && d.rateHistory.length ? d.rateHistory.slice() : [{ date: d.date, rate: d.rate }]);
    history[0] = { date: newDate, rate: history[0].rate };
    updated.rateHistory = history;
  }

  await loanRef.collection("disbursements").doc(disbId).update(updated);

  const changes = [];
  if (d.amount !== newAmount) changes.push(`amount ${fmtMoney(d.amount)} → ${fmtMoney(newAmount)}`);
  if (dateChanged) changes.push(`date ${fmtDate(d.date)} → ${fmtDate(newDate)}`);
  const note = document.getElementById("editDisbNote").value.trim();
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "loan_edited", action: "Disbursement edited", detail: `${changes.join(", ") || "no amount/date change"}${note ? ` — ${note}` : ""}` });

  closeModal("editDisbModal");
  toast("Disbursement updated");
  btn.disabled = false; btn.textContent = "Save changes";
  await loadAll();
}

// ---------- Edit / delete a payment (correcting a data-entry mistake) ----------
function openEditPayModal(payId) {
  const p = payments.find((x) => x.id === payId);
  if (!p) return;
  document.getElementById("editPayId").value = payId;
  document.getElementById("editPayType").value = p.type || "interest";
  document.getElementById("editPayAmount").value = p.amount;
  document.getElementById("editPayDate").valueAsDate = toJsDate(p.date);
  document.getElementById("editPayReceiver").value = p.receivedBy || "";
  document.getElementById("editPayRemarks").value = p.remarks || "";
  document.getElementById("editPayNote").value = "";

  const targetField = document.getElementById("editPayTargetField");
  const targetSelect = document.getElementById("editPayTarget");
  if (disbursements.length > 1) {
    targetField.style.display = "block";
    targetSelect.innerHTML = `<option value="">All disbursements (oldest first, as usual)</option>` +
      disbursements.map((d) => `<option value="${d.id}">${fmtDate(d.date)} — ${fmtMoney(d.amount)} @ ${d.rate}%</option>`).join("");
    targetSelect.value = p.targetDisbursementId || "";
  } else {
    targetField.style.display = "none";
  }
  openModal("editPayModal");
}

async function savePaymentEdit() {
  const payId = document.getElementById("editPayId").value;
  const p = payments.find((x) => x.id === payId);
  const newAmount = parseFloat(document.getElementById("editPayAmount").value);
  const newDateStr = document.getElementById("editPayDate").value;
  if (!newAmount || newAmount <= 0 || !newDateStr) { toast("Enter a valid amount and date"); return; }

  const btn = document.getElementById("savePayEditBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const newType = document.getElementById("editPayType").value;
  const newDate = firebase.firestore.Timestamp.fromDate(new Date(newDateStr));
  const newTarget = document.getElementById("editPayTarget").value || null;

  const updated = {
    type: newType,
    amount: newAmount,
    date: newDate,
    receivedBy: document.getElementById("editPayReceiver").value.trim(),
    remarks: document.getElementById("editPayRemarks").value.trim(),
    targetDisbursementId: newTarget,
  };

  await loanRef.collection("payments").doc(payId).update(updated);

  const changes = [];
  if (p.amount !== newAmount) changes.push(`amount ${fmtMoney(p.amount)} → ${fmtMoney(newAmount)}`);
  if (toJsDate(p.date).toDateString() !== new Date(newDateStr).toDateString()) changes.push(`date ${fmtDate(p.date)} → ${fmtDate(newDate)}`);
  if (p.type !== newType) changes.push(`type ${p.type} → ${newType}`);
  if ((p.targetDisbursementId || null) !== newTarget) changes.push("target disbursement changed");
  const note = document.getElementById("editPayNote").value.trim();
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "loan_edited", action: "Payment edited", detail: `${changes.join(", ") || "no change"}${note ? ` — ${note}` : ""}` });

  closeModal("editPayModal");
  toast("Payment updated");
  btn.disabled = false; btn.textContent = "Save changes";
  await loadAll();
}

async function deletePaymentFromEdit() {
  const payId = document.getElementById("editPayId").value;
  const p = payments.find((x) => x.id === payId);
  if (!p) return;
  if (!confirm(`Delete this ${fmtMoney(p.amount)} payment from ${fmtDate(p.date)}? This can't be undone.`)) return;

  const btn = document.getElementById("deletePayBtn");
  btn.disabled = true; btn.textContent = "Deleting…";

  await loanRef.collection("payments").doc(payId).delete();
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "loan_edited", action: "Payment deleted", detail: `${fmtMoney(p.amount)} (${p.type}) dated ${fmtDate(p.date)} removed — was entered by mistake` });

  closeModal("editPayModal");
  toast("Payment deleted");
  btn.disabled = false; btn.textContent = "Delete";
  await loadAll();
}


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
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "rate_changed", action: "Interest rate changed", detail: `${d.rate}% → ${newRate}% from ${fmtDate(effDate)}` });

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
  document.getElementById("itemReleaseRemark").value = "";
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
  const releaseRemark = document.getElementById("itemReleaseRemark").value.trim();

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
    releasedAt: date, // the date actually selected in the form, not "whenever this button happened to be clicked" — matters for backdated entries
    releaseRemark,
  });
  await logActivity({ customerId: loanData.customerId, loanId, eventType: "gold_removed", action: "Item released", detail: `${orn ? orn.itemName : ""} — ${fmtMoney(amount)} collected` });

  closeModal("itemReleaseModal");
  toast("Item released — payment recorded");
  btn.disabled = false; btn.textContent = "Release item";
  await loadAll();
}
