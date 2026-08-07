let custLoans = [];
let custDeposits = [];
let emailToName = {};

const custId = new URLSearchParams(location.search).get("id");

async function loadEmailToNameMap() {
  try {
    const snap = await db.collection("userProfiles").get();
    snap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.email && d.displayName) emailToName[d.email] = d.displayName;
    });
  } catch (err) {
    console.error("Couldn't load display names:", err);
  }
}

requireAuth(async () => {
  renderShell({ active: "customers", title: "Customer Profile" });
  if (!custId) { toast("No customer selected"); location.href = "customers.html"; return; }
  document.getElementById("newLoanLink").href = `loan-create.html?customerId=${custId}`;
  document.getElementById("loanSearchInput").addEventListener("input", (e) => renderLoans(e.target.value));
  wirePhotoCapture("custPhotoBtn", null, uploadCustomerPhoto);
  document.getElementById("depositDate").valueAsDate = new Date();
  setupWithdrawModeCards();
  document.getElementById("timelineSearchInput").addEventListener("input", (e) => renderTimeline(e.target.value));
  setupTimelineInfiniteScroll();
  await loadEmailToNameMap();
  await loadProfile();
  await loadDeposits();
  await loadMoreTimeline();
  await loadVillageDatalistForProfile();
});

// Lightweight fetch (no subcollections) just for village autocomplete when
// editing this customer's details — this page normally only loads the one
// customer being viewed, so this is the one extra read needed to offer
// consistent village-name suggestions here too.
async function loadVillageDatalistForProfile() {
  try {
    const snap = await db.collection("customers").get();
    populateVillageDatalist("villageDatalist", snap.docs.map((d) => d.data()));
  } catch (err) {
    console.error("Couldn't load village suggestions:", err);
  }
}

function setupWithdrawModeCards() {
  const cards = document.querySelectorAll("#withdrawModeCards .radio-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      card.querySelector('input[type="radio"]').checked = true;
      cards.forEach((c) => c.classList.toggle("selected", c === card));
    });
  });
}

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
      <div class="grid grid-2" style="gap:10px;margin-top:12px;">
        <div><div class="stat"><div class="label">Village</div><div class="value" style="font-size:15px;font-family:var(--font-body);font-weight:500;">${escapeHtml(c.village || "—")}</div></div></div>
        <div><div class="stat"><div class="label">Address</div><div class="value" style="font-size:15px;font-family:var(--font-body);font-weight:500;">${escapeHtml(c.address || "—")}</div></div></div>
      </div>
    </div>
    <div id="profileDetailsEdit" style="display:none;">
      <div class="field"><label>Full name</label><input type="text" id="editCustName" value="${escapeHtml(c.name || "")}"></div>
      <div class="grid grid-2">
        <div class="field"><label>Mobile number</label><input type="tel" id="editCustMobile" value="${escapeHtml(c.mobile || "")}"></div>
        <div class="field"><label>Aadhaar number</label><input type="text" id="editCustAadhaar" maxlength="12" value="${escapeHtml(c.aadhaar || "")}"></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label>Village</label><input type="text" id="editCustVillage" list="villageDatalist" value="${escapeHtml(c.village || "")}" placeholder="e.g. Jhabua"></div>
        <div class="field"><label>Address</label><input type="text" id="editCustAddress" value="${escapeHtml(c.address || "")}"></div>
      </div>
      <datalist id="villageDatalist"></datalist>
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
  const village = document.getElementById("editCustVillage").value.trim();
  const address = document.getElementById("editCustAddress").value.trim();
  if (!name || !mobile || !address) { toast("Name, mobile, and address are required"); return; }

  const nameChanged = name !== (currentCustomerData.name || "");
  const changes = [];
  if (nameChanged) changes.push(`name → ${name}`);
  if (mobile !== (currentCustomerData.mobile || "")) changes.push("mobile updated");
  if (village !== (currentCustomerData.village || "")) changes.push("village updated");
  if (address !== (currentCustomerData.address || "")) changes.push("address updated");
  await db.collection("customers").doc(custId).update({ name, mobile, aadhaar, village, address });
  await logActivity({ customerId: custId, eventType: "customer_updated", action: "Customer updated", detail: changes.join(", ") || "details updated" });

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
    body.innerHTML = `<tr><td colspan="7" style="color:var(--ink-soft);padding:20px 0;">${q ? "No matching loans." : "No loans yet for this customer."}</td></tr>`;
    return;
  }
  body.innerHTML = loans.map((l) => `
    <tr class="clickable" onclick="location.href='loan-detail.html?id=${l.id}'">
      <td class="mono">${escapeHtml(l.loanNumber)}</td>
      <td style="text-transform:capitalize;">${(l.itemNames || []).join(", ") || "—"}</td>
      <td>${l.pledgedByMode === "other"
        ? `<span class="badge" style="background:var(--gold-soft);color:var(--gold-deep);">${escapeHtml(l.pledgedByName || "Someone else")}</span>`
        : `<span class="badge badge-active">Self</span>`}</td>
      <td>${l.itemsIdentityNote ? escapeHtml(l.itemsIdentityNote) : `<span style="color:var(--ink-soft);">—</span>`}</td>
      <td>${fmtDate(l.date)}</td>
      <td class="mono">${fmtMoney(l.totalPrincipal || 0)}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
    </tr>`).join("");
}

// ---------- Surplus funds held (customer deposits) ----------
// Separate from loans entirely — this is money the shop owes BACK to the
// customer, not the other way around. A deposit can be withdrawn from
// PARTIALLY, more than once (e.g. deposit ₹2,00,000, withdraw ₹1,00,000,
// later withdraw another ₹5,000 — ₹95,000 stays held). Each withdrawal is
// either given instantly, or marked "pending" if it needs to be brought
// from home/the bank first — a pending withdrawal does NOT reduce the
// remaining balance until it's actually marked as given.
//
// Interest (when a deposit is interest-bearing) is calculated simply: the
// current remaining balance × the deposit's rate, from the deposit date to
// today — not recalculated period-by-period as the balance changes, by
// deliberate choice for simplicity.
async function loadDeposits() {
  const snap = await db.collection("customers").doc(custId).collection("deposits").get();
  custDeposits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  custDeposits.sort((a, b) => toJsDate(b.depositedDate) - toJsDate(a.depositedDate));

  await Promise.all(custDeposits.map(async (d) => {
    const wSnap = await db.collection("customers").doc(custId).collection("deposits").doc(d.id).collection("withdrawals").get();
    d.withdrawals = wSnap.docs.map((w) => ({ id: w.id, ...w.data() }));
    d.withdrawals.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));
  }));

  renderDeposits();
}

function depositRemaining(d) {
  const given = (d.withdrawals || []).filter((w) => w.status === "completed").reduce((s, w) => s + (Number(w.amount) || 0), 0);
  return round2(d.amount - given);
}

function renderDeposits() {
  const list = document.getElementById("depositsList");
  if (!custDeposits.length) {
    list.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;">No surplus funds on record for this customer.</p>`;
    return;
  }

  list.innerHTML = custDeposits.map((d) => {
    const remaining = depositRemaining(d);
    const fullyWithdrawn = remaining <= 0;
    const interest = d.interestBearing && d.interestRate > 0 && remaining > 0 ? periodInterest(remaining, d.interestRate, d.depositedDate, new Date(), "simple") : 0;
    const payable = round2(remaining + interest);

    const withdrawalRows = (d.withdrawals || []).map((w) => `
      <div class="row">
        <span class="k">${fmtDate(w.date)} — ${fmtMoney(w.amount)}</span>
        <span>${w.status === "pending"
          ? `<span class="badge" style="background:var(--warn-soft);color:var(--warn);">pending — bring it</span> <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;" onclick="completeWithdrawal('${d.id}','${w.id}')">Mark given</button>`
          : `<span class="badge badge-closed">given</span>`}</span>
      </div>`).join("");

    return `
    <div class="disb-card">
      <div class="row"><strong class="mono">${fmtMoney(d.amount)} deposited</strong>${fullyWithdrawn ? `<span class="badge badge-closed">fully withdrawn</span>` : `<span class="badge badge-active">active</span>`}</div>
      <div class="row"><span class="k">Deposited</span><span>${fmtDate(d.depositedDate)}</span></div>
      <div class="row"><span class="k">Remaining balance</span><strong class="mono">${fmtMoney(remaining)}</strong></div>
      ${d.interestBearing ? `<div class="row"><span class="k">Interest</span><span>${d.interestRate}%/mo — ${fmtMoney(interest)} so far, on the remaining balance</span></div>` : ""}
      <div class="row"><span class="k" style="color:var(--good);">Payable if withdrawn today</span><strong class="mono" style="color:var(--good);">${fmtMoney(payable)}</strong></div>
      ${d.notes ? `<div class="row"><span class="k">Notes</span><span>${escapeHtml(d.notes)}</span></div>` : ""}
      ${withdrawalRows ? `<div class="divider-dashed" style="margin:8px 0;"></div>${withdrawalRows}` : ""}
      ${!fullyWithdrawn ? `<div style="margin-top:8px;"><button type="button" class="btn btn-secondary btn-sm" onclick="openWithdrawModal('${d.id}', ${remaining})">− Record withdrawal</button></div>` : ""}
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
    notes: document.getElementById("depositNotes").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await logActivity({ customerId: custId, eventType: "deposit_added", action: "Surplus deposit added", detail: `${fmtMoney(amount)} from ${currentCustomerData ? currentCustomerData.name : "customer"}` });

  closeModal("depositModal");
  toast("Deposit recorded");
  btn.disabled = false; btn.textContent = "Save deposit";
  await loadDeposits();
}

// ---------- Withdrawals against a deposit (partial or full, instant or pending) ----------
let withdrawDepositId = null;
let withdrawDepositRemaining = 0;

function openWithdrawModal(depositId, remaining) {
  withdrawDepositId = depositId;
  withdrawDepositRemaining = remaining;
  document.getElementById("withdrawRemainingHint").textContent = `Remaining balance available: ${fmtMoney(remaining)}`;
  document.getElementById("withdrawAmount").value = "";
  document.getElementById("withdrawAmount").max = remaining;
  document.getElementById("withdrawDate").valueAsDate = new Date();
  document.getElementById("withdrawNotes").value = "";
  const cards = document.querySelectorAll("#withdrawModeCards .radio-card");
  cards.forEach((c) => {
    const radio = c.querySelector('input[type="radio"]');
    radio.checked = c.dataset.mode === "instant";
    c.classList.toggle("selected", c.dataset.mode === "instant");
  });
  openModal("withdrawModal");
}

async function saveWithdrawal() {
  const amount = parseFloat(document.getElementById("withdrawAmount").value);
  const dateStr = document.getElementById("withdrawDate").value;
  if (!amount || amount <= 0 || !dateStr) { toast("Enter a valid amount and date"); return; }
  if (amount > withdrawDepositRemaining + 0.01) { toast(`Only ${fmtMoney(withdrawDepositRemaining)} remains in this deposit`); return; }

  const mode = document.querySelector('input[name="withdrawMode"]:checked').value; // "instant" | "pending"
  const btn = document.getElementById("saveWithdrawBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const data = {
    amount,
    date: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
    status: mode === "instant" ? "completed" : "pending",
    notes: document.getElementById("withdrawNotes").value.trim(),
    customerId: custId,
    customerName: currentCustomerData ? currentCustomerData.name : "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (mode === "instant") data.completedDate = firebase.firestore.FieldValue.serverTimestamp();

  await db.collection("customers").doc(custId).collection("deposits").doc(withdrawDepositId).collection("withdrawals").add(data);
  await logActivity({ customerId: custId, eventType: "withdrawal_recorded", action: "Deposit withdrawal recorded", detail: `${fmtMoney(amount)} — ${mode === "instant" ? "given now" : "marked pending"}` });

  closeModal("withdrawModal");
  toast(mode === "instant" ? "Withdrawal recorded" : "Marked pending — will show on the Dashboard until given");
  btn.disabled = false; btn.textContent = "Save";
  await loadDeposits();
}

async function completeWithdrawal(depositId, withdrawalId) {
  if (!confirm("Mark this withdrawal as given? This reduces the deposit's remaining balance.")) return;
  await db.collection("customers").doc(custId).collection("deposits").doc(depositId).collection("withdrawals").doc(withdrawalId).update({
    status: "completed",
    completedDate: firebase.firestore.FieldValue.serverTimestamp(),
  });
  toast("Marked as given");
  await loadDeposits();
}

// ---------- Customer Timeline ----------
// Every significant action anywhere in the app writes to the shared
// activityLog collection (see logActivity() in nav.js), tagged with this
// customer's id. This queries that same collection — no separate data
// store, no duplicate writes beyond the one each action already made.
//
// Paginated properly (a real limit()+startAfter() query, 20 at a time),
// not "fetch everything then paginate in the browser" — infinite scroll
// only ever fetches the next real page when you actually scroll to it.
// Search is client-side over whatever's been loaded so far, consistent
// with how search works everywhere else in this app.
let timelineEvents = [];
let timelineLastDoc = null;
let timelineHasMore = true;
let timelineLoading = false;
let timelineSearchQuery = "";

async function loadMoreTimeline() {
  if (timelineLoading || !timelineHasMore) return;
  timelineLoading = true;
  document.getElementById("timelineLoadingRow").style.display = "flex";
  let loadError = false;

  try {
    let q = db.collection("activityLog").where("customerId", "==", custId).orderBy("at", "desc").limit(20);
    if (timelineLastDoc) q = q.startAfter(timelineLastDoc);
    const snap = await q.get();

    if (snap.empty || snap.docs.length < 20) timelineHasMore = false;
    if (!snap.empty) {
      timelineLastDoc = snap.docs[snap.docs.length - 1];
      timelineEvents.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
  } catch (err) {
    console.error("Timeline load failed:", err);
    if (timelineEvents.length === 0) {
      loadError = true;
      const isIndexError = err.code === "failed-precondition" || /index/i.test(err.message || "");
      document.getElementById("timelineContainer").innerHTML = isIndexError
        ? `<p style="color:var(--danger);font-size:13.5px;">Timeline needs a one-time Firestore index that hasn't been created yet. Open the browser console (F12) for a direct link to create it — it takes about a minute, and only needs doing once.</p>
           <p style="color:var(--ink-soft);font-size:11.5px;margin-top:4px;font-family:monospace;">${escapeHtml(err.message || "")}</p>`
        : `<p style="color:var(--ink-soft);font-size:13.5px;">Couldn't load the timeline — check your connection and try reloading the page.</p>`;
    }
  }

  timelineLoading = false;
  document.getElementById("timelineLoadingRow").style.display = "none";
  // Skip the normal render on a genuine load error — it would otherwise
  // immediately overwrite the error message above with a misleading "no
  // history recorded" message, since an empty timelineEvents array looks
  // identical whether there's really no history or the query just failed.
  // This was happening on every single failure since Timeline was built.
  if (!loadError) renderTimeline(timelineSearchQuery);
}

function setupTimelineInfiniteScroll() {
  const sentinel = document.getElementById("timelineSentinel");
  if (!sentinel || !window.IntersectionObserver) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMoreTimeline();
  }, { rootMargin: "200px" });
  observer.observe(sentinel);
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text || "");
  const escaped = escapeHtml(text || "");
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(`(${escapedQuery})`, "ig"), "<mark>$1</mark>");
}

function renderTimeline(query) {
  timelineSearchQuery = query || "";
  const container = document.getElementById("timelineContainer");
  const q = timelineSearchQuery.trim().toLowerCase();

  const filtered = q
    ? timelineEvents.filter((e) => `${e.action || ""} ${e.detail || ""}`.toLowerCase().includes(q))
    : timelineEvents;

  if (!filtered.length) {
    container.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;padding:8px 0;">${
      timelineEvents.length === 0 ? "No history recorded for this customer yet." : "No timeline entries match your search."
    }</p>`;
    return;
  }

  container.innerHTML = `<div class="timeline">${filtered.map((e) => {
    const cfg = TIMELINE_EVENT_CONFIG[e.eventType] || TIMELINE_EVENT_CONFIG.other;
    return `
      <div class="timeline-item">
        <div class="timeline-icon" style="background:${cfg.color};">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${cfg.icon}"/></svg>
        </div>
        <div class="timeline-content">
          <div class="timeline-title">${highlightMatch(e.action, q)}</div>
          <div class="timeline-meta">${fmtDate(e.at)}${e.at && e.at.toDate ? " · " + e.at.toDate().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""} · by ${escapeHtml(emailToName[e.byEmail] || (e.byEmail || "").split("@")[0] || "Someone")}</div>
          ${e.detail ? `<div class="timeline-desc">${highlightMatch(e.detail, q)}</div>` : ""}
        </div>
      </div>`;
  }).join("")}</div>`;
}


