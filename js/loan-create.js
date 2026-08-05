let capturedLoanPhoto = null;
let capturedDisbPhoto = null;
let currentDraftId = null;

requireAuth(async () => {
  renderShell({ active: "loan-create", title: "New Loan" });
  document.getElementById("loanDate").valueAsDate = new Date();
  document.getElementById("disbDate").valueAsDate = new Date();

  // If entering an old/backdated loan, changing the loan date also moves the
  // disbursement date to match — so it doesn't have to be changed twice.
  // Stops auto-following the moment the person edits the disbursement date themselves.
  let disbDateTouched = false;
  document.getElementById("disbDate").addEventListener("input", () => { disbDateTouched = true; });
  document.getElementById("loanDate").addEventListener("change", () => {
    if (!disbDateTouched) document.getElementById("disbDate").value = document.getElementById("loanDate").value;
  });
  await populateCustomers();
  addOrnamentRow();
  document.getElementById("loanForm").addEventListener("submit", saveLoan);
  setupPledgedByField();
  setupStepToggles();
  setupRadioCards();
  setupCharCounters();
  wirePhotoCapture("loanPhotoBtn", "loanPhotoPreview", (file) => { capturedLoanPhoto = file; });
  wirePhotoCapture("disbPhotoBtn", "disbPhotoPreview", (file) => { capturedDisbPhoto = file; });
  await loadDrafts();
});

// ---------- Collapsible step sections ----------
function setupStepToggles() {
  document.querySelectorAll(".step-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      if (e.target.closest("button")) return; // don't collapse when clicking a button inside the header (e.g. "+ Add Item")
      document.getElementById(header.dataset.toggle).classList.toggle("collapsed");
    });
  });
}

// ---------- "Ornament belongs to" radio-card visual selection ----------
function setupRadioCards() {
  const cards = document.querySelectorAll("#pledgedByCards .radio-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const radio = card.querySelector('input[type="radio"]');
      radio.checked = true;
      cards.forEach((c) => c.classList.toggle("selected", c === card));
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

// ---------- Live character counters for the maxlength-limited fields ----------
function setupCharCounters() {
  [["loanRemarks", "loanRemarksCount"], ["itemsIdentityNote", "itemsIdentityNoteCount"], ["disbNotes", "disbNotesCount"]].forEach(([fieldId, countId]) => {
    const field = document.getElementById(fieldId);
    const count = document.getElementById(countId);
    if (!field || !count) return;
    field.addEventListener("input", () => { count.textContent = field.value.length; });
  });
}

function setupPledgedByField() {
  const nameInput = document.getElementById("pledgedByName");
  const extraFields = document.getElementById("pledgedByExtra");
  const addressField = document.getElementById("pledgedByAddressField");
  const hint = document.getElementById("pledgedByHint");
  const radios = document.querySelectorAll('input[name="pledgedByMode"]');
  const custSelect = document.getElementById("customerSelect");

  function update() {
    const mode = document.querySelector('input[name="pledgedByMode"]:checked').value;
    const isOther = mode === "other";
    nameInput.style.display = isOther ? "" : "none";
    extraFields.style.display = isOther ? "" : "none";
    addressField.style.display = isOther ? "" : "none";
    const custName = (custSelect.selectedOptions[0]?.textContent || "").split(" — ")[0] || "the account holder";
    if (mode === "self") {
      hint.textContent = `Will be recorded under: ${custName}`;
    } else {
      const who = nameInput.value.trim() || "[name]";
      hint.textContent = `Will be recorded as: ${who} In ${custName}'s Account`;
    }
  }
  radios.forEach((r) => r.addEventListener("change", update));
  nameInput.addEventListener("input", update);
  custSelect.addEventListener("change", update);
  update();
}

let allCustomersForPicker = [];

async function populateCustomers() {
  const snap = await db.collection("customers").orderBy("name").get();
  const select = document.getElementById("customerSelect");
  allCustomersForPicker = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  allCustomersForPicker.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} — ${c.mobile}`;
    select.appendChild(opt);
  });
  populateVillageDatalist("villageDatalist", allCustomersForPicker);
  setupCustomerPicker();

  const preselect = new URLSearchParams(location.search).get("customerId");
  if (preselect) selectCustomer(preselect);
}

// ---------- Searchable customer picker ----------
// Replaces what used to be a plain <select> — fine for a handful of
// customers, but becomes a long, hard-to-scroll list past a few dozen.
// This is a text input + live-filtered suggestions (name and village both
// searchable, typo-tolerant via the same smartMatchAny used elsewhere in
// the app), while the original <select> stays in the DOM (just hidden) so
// every existing bit of code that reads its .value or .selectedOptions
// keeps working completely unchanged.
let customerHighlightIndex = -1;

function setupCustomerPicker() {
  const input = document.getElementById("customerSearchInput");
  const box = document.getElementById("customerSuggestions");

  input.addEventListener("input", () => {
    document.getElementById("customerSelect").value = ""; // typing invalidates any previous selection until they pick again
    customerHighlightIndex = -1;
    renderCustomerSuggestions(input.value.trim());
  });
  input.addEventListener("focus", () => renderCustomerSuggestions(input.value.trim()));
  input.addEventListener("keydown", (e) => {
    const items = [...box.querySelectorAll(".customer-suggestion-item")];
    if (!items.length || box.style.display === "none") return;
    if (e.key === "ArrowDown") { e.preventDefault(); customerHighlightIndex = Math.min(customerHighlightIndex + 1, items.length - 1); updateCustomerHighlight(items); }
    else if (e.key === "ArrowUp") { e.preventDefault(); customerHighlightIndex = Math.max(customerHighlightIndex - 1, 0); updateCustomerHighlight(items); }
    else if (e.key === "Enter") { e.preventDefault(); if (customerHighlightIndex >= 0) items[customerHighlightIndex].click(); }
    else if (e.key === "Escape") { box.style.display = "none"; }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".customer-picker-wrap")) box.style.display = "none";
  });
}

function updateCustomerHighlight(items) {
  items.forEach((el, i) => el.classList.toggle("highlighted", i === customerHighlightIndex));
  if (customerHighlightIndex >= 0) items[customerHighlightIndex].scrollIntoView({ block: "nearest" });
}

function renderCustomerSuggestions(query) {
  const box = document.getElementById("customerSuggestions");
  const matches = query
    ? allCustomersForPicker.filter((c) => smartMatchAny([c.name, c.village, c.address, c.mobile], query)).slice(0, 30)
    : allCustomersForPicker.slice(0, 30);

  if (!matches.length) {
    box.innerHTML = `<div class="customer-suggestion-empty">No customers found${query ? " — try a different search" : ""}.</div>`;
    box.style.display = "block";
    return;
  }

  box.innerHTML = matches.map((c) => `
    <div class="customer-suggestion-item" data-id="${c.id}">
      <div class="name">${highlightText(c.name, query)}</div>
      <div class="meta">${highlightText(c.village || c.address || "no village recorded", query)} · ${escapeHtml(c.mobile || "")}</div>
    </div>`).join("");
  box.querySelectorAll(".customer-suggestion-item").forEach((el) => {
    el.addEventListener("click", () => selectCustomer(el.dataset.id));
  });
  box.style.display = "block";
}

function selectCustomer(customerId) {
  const select = document.getElementById("customerSelect");
  select.value = customerId;
  const opt = select.selectedOptions[0];
  document.getElementById("customerSearchInput").value = opt ? opt.textContent.split(" — ")[0] : "";
  document.getElementById("customerSuggestions").style.display = "none";
  select.dispatchEvent(new Event("change", { bubbles: true })); // keeps the "Will be recorded under..." hint and anything else listening for this in sync
}

function addOrnamentRow() {
  const tpl = document.getElementById("ornamentRowTemplate");
  const clone = tpl.content.cloneNode(true);
  const row = clone.querySelector("[data-row]");

  const metalSelect = row.querySelector(".orn-metal");
  const purityField = row.querySelector(".orn-purity-field");
  const categoryField = row.querySelector(".orn-category-field");
  const purityInput = row.querySelector(".orn-purity");
  const categoryInput = row.querySelector(".orn-category");
  const weightInput = row.querySelector(".orn-weight");

  function syncSilverFields() {
    const isSilver = metalSelect.value === "Silver";
    purityField.style.display = isSilver ? "" : "none";
    categoryField.style.display = isSilver ? "" : "none";
    if (isSilver) updateCategory();
  }
  function updateCategory() {
    categoryInput.value = silverCategory(purityInput.value);
  }

  metalSelect.addEventListener("change", syncSilverFields);
  purityInput.addEventListener("input", updateCategory);
  weightInput.addEventListener("input", updateOrnamentTotals);
  metalSelect.addEventListener("change", updateOrnamentTotals);
  row.querySelector(".orn-qty").addEventListener("input", updateOrnamentTotals);

  syncSilverFields();
  document.getElementById("ornamentRows").appendChild(row);
  updateOrnamentTotals();
}

function updateOrnamentTotals() {
  const rows = document.querySelectorAll("#ornamentRows [data-row]");
  let goldWt = 0, silverWt = 0, count = 0;
  rows.forEach((r) => {
    const metal = r.querySelector(".orn-metal").value;
    const wt = parseFloat(r.querySelector(".orn-weight").value) || 0;
    const qty = parseFloat(r.querySelector(".orn-qty").value) || 0;
    count += qty;
    if (metal === "Gold") goldWt += wt * qty; else silverWt += wt * qty;
  });
  const parts = [];
  if (count) parts.push(`${count} item(s)`);
  if (goldWt) parts.push(`${goldWt.toFixed(2)}g gold`);
  if (silverWt) parts.push(`${silverWt.toFixed(2)}g silver`);
  document.getElementById("ornamentTotals").textContent = parts.length ? "Total: " + parts.join(" · ") : "";
  document.getElementById("noCollateralWarning").style.display = rows.length === 0 ? "block" : "none";
}

function collectOrnaments() {
  return [...document.querySelectorAll("#ornamentRows [data-row]")].map((r) => {
    const metal = r.querySelector(".orn-metal").value;
    return {
      itemName: r.querySelector(".orn-name").value.trim(),
      metalType: metal,
      weight: parseFloat(r.querySelector(".orn-weight").value) || 0,
      qty: parseFloat(r.querySelector(".orn-qty").value) || 1,
      purity: metal === "Silver" ? (r.querySelector(".orn-purity").value || "") : "",
      category: metal === "Silver" ? r.querySelector(".orn-category").value : "",
      released: false,
      notes: "",
    };
  });
}

async function saveLoan(e) {
  e.preventDefault();
  const ornaments = collectOrnaments();
  // No minimum ornament requirement anymore — a loan can be given with no
  // collateral at all (hasCollateral below is what everywhere else uses to
  // flag/highlight this).

  const customerId = document.getElementById("customerSelect").value;
  if (!customerId) {
    toast("Select a customer from the suggestions first — typing a name alone isn't enough, pick them from the list.");
    document.getElementById("customerSearchInput").focus();
    return;
  }

  const btn = document.getElementById("saveLoanBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const customerName = document.getElementById("customerSelect").selectedOptions[0].textContent.split(" — ")[0];
  const disbAmount = parseFloat(document.getElementById("disbAmount").value);

  const pledgedByMode = document.querySelector('input[name="pledgedByMode"]:checked').value;
  const pledgedByName = document.getElementById("pledgedByName").value.trim();
  const pledgedByMobile = document.getElementById("pledgedByMobile").value.trim();
  const pledgedByAadhaar = pledgedByMode === "other" ? await encryptAadhaar(document.getElementById("pledgedByAadhaar").value) : "";
  const pledgedByVillage = document.getElementById("pledgedByVillage").value.trim();
  const pledgedByAddress = document.getElementById("pledgedByAddress").value.trim();
  const pledgedByLabel = pledgedByMode === "self"
    ? customerName
    : `${pledgedByName || "Unnamed"} In ${customerName}'s Account`;

  const loanRef = await db.collection("loans").add({
    loanNumber: document.getElementById("loanNumber").value.trim(),
    customerId,
    customerName,
    pledgedByMode,
    pledgedByName: pledgedByMode === "other" ? pledgedByName : "",
    pledgedByMobile: pledgedByMode === "other" ? pledgedByMobile : "",
    pledgedByAadhaar,
    pledgedByVillage: pledgedByMode === "other" ? pledgedByVillage : "",
    pledgedByAddress: pledgedByMode === "other" ? pledgedByAddress : "",
    pledgedByLabel,
    date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("loanDate").value)),
    remarks: document.getElementById("loanRemarks").value.trim(),
    status: "active",
    totalPrincipal: disbAmount,
    itemCount: ornaments.reduce((s, o) => s + o.qty, 0),
    itemNames: [...new Set(ornaments.map((o) => o.itemName.toLowerCase()))],
    itemsIdentityNote: document.getElementById("itemsIdentityNote").value.trim(),
    hasCollateral: ornaments.length > 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  const batch = db.batch();
  ornaments.forEach((o) => {
    const ref = loanRef.collection("ornaments").doc();
    batch.set(ref, o);
  });
  await batch.commit();

  const disbRef = await loanRef.collection("disbursements").add({
    amount: disbAmount,
    rate: parseFloat(document.getElementById("disbRate").value),
    interestType: document.getElementById("disbInterestType").value,
    rateHistory: [{ date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("disbDate").value)), rate: parseFloat(document.getElementById("disbRate").value) }],
    date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("disbDate").value)),
    reason: document.getElementById("disbReason").value.trim(),
    collectedBy: document.getElementById("disbCollector").value.trim(),
    notes: document.getElementById("disbNotes").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  const loanPhotoFile = capturedLoanPhoto;
  if (loanPhotoFile) {
    try {
      const url = await uploadPhoto(loanPhotoFile, `loan-photos/${loanRef.id}-${Date.now()}.jpg`);
      await loanRef.update({ loanPhotoUrl: url });
    } catch (err) {
      console.error("Loan photo upload failed:", err);
      toast("Loan saved, but the photo failed to upload.");
    }
  }

  const disbPhotoFile = capturedDisbPhoto;
  if (disbPhotoFile) {
    try {
      const url = await uploadPhoto(disbPhotoFile, `disbursement-photos/${disbRef.id}-${Date.now()}.jpg`);
      await disbRef.update({ photoUrl: url });
    } catch (err) {
      console.error("Disbursement photo upload failed:", err);
      toast("Loan saved, but the disbursement photo failed to upload.");
    }
  }

  await logActivity({ customerId, loanId: loanRef.id, eventType: "loan_created", action: "Loan created", detail: `${fmtMoney(disbAmount)} to ${customerName}` });

  // If this loan was created from a saved draft, the draft is no longer needed.
  if (currentDraftId) {
    await db.collection("loanDrafts").doc(currentDraftId).delete().catch(() => {});
  }

  toast("Loan created");
  location.href = `loan-detail.html?id=${loanRef.id}`;
}

// ---------- Save as draft ----------
// Note: photos aren't saved in a draft (files can't be stored directly in
// Firestore) — re-take them when you come back to finish the loan.
async function collectDraftData() {
  const custSelect = document.getElementById("customerSelect");
  return {
    customerId: custSelect.value,
    customerLabel: custSelect.value ? custSelect.selectedOptions[0].textContent : "",
    loanNumber: document.getElementById("loanNumber").value.trim(),
    loanDate: document.getElementById("loanDate").value,
    pledgedByMode: document.querySelector('input[name="pledgedByMode"]:checked').value,
    pledgedByName: document.getElementById("pledgedByName").value.trim(),
    pledgedByMobile: document.getElementById("pledgedByMobile").value.trim(),
    pledgedByAadhaar: await encryptAadhaar(document.getElementById("pledgedByAadhaar").value),
    pledgedByVillage: document.getElementById("pledgedByVillage").value.trim(),
    pledgedByAddress: document.getElementById("pledgedByAddress").value.trim(),
    loanRemarks: document.getElementById("loanRemarks").value.trim(),
    itemsIdentityNote: document.getElementById("itemsIdentityNote").value.trim(),
    ornaments: collectOrnaments(),
    disbAmount: document.getElementById("disbAmount").value,
    disbRate: document.getElementById("disbRate").value,
    disbInterestType: document.getElementById("disbInterestType").value,
    disbDate: document.getElementById("disbDate").value,
    disbReason: document.getElementById("disbReason").value.trim(),
    disbCollector: document.getElementById("disbCollector").value.trim(),
    disbNotes: document.getElementById("disbNotes").value.trim(),
    savedAt: firebase.firestore.FieldValue.serverTimestamp(),
    savedByEmail: (auth.currentUser && auth.currentUser.email) || "",
  };
}

async function saveDraft() {
  const btn = document.getElementById("saveDraftBtn");
  btn.disabled = true; btn.textContent = "Saving draft…";

  const data = await collectDraftData();
  if (currentDraftId) {
    await db.collection("loanDrafts").doc(currentDraftId).set(data);
  } else {
    const ref = await db.collection("loanDrafts").add(data);
    currentDraftId = ref.id;
  }

  btn.disabled = false; btn.textContent = "💾 Save as draft";
  toast("Draft saved — you'll find it at the top of this page next time");
  await loadDrafts();
}

async function loadDrafts() {
  const snap = await db.collection("loanDrafts").get();
  const card = document.getElementById("draftsCard");
  const list = document.getElementById("draftsList");

  if (snap.empty) { card.style.display = "none"; return; }
  card.style.display = "";

  const drafts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  drafts.sort((a, b) => toJsDate(b.savedAt) - toJsDate(a.savedAt));

  list.innerHTML = drafts.map((d) => `
    <div class="disb-card">
      <div class="row"><strong>${escapeHtml(d.customerLabel || "No customer selected")}</strong><span class="hint" style="display:inline;">${fmtDate(d.savedAt)}</span></div>
      ${d.loanNumber ? `<div class="row"><span class="k">Loan #</span><span>${escapeHtml(d.loanNumber)}</span></div>` : ""}
      ${d.ornaments && d.ornaments.length ? `<div class="row"><span class="k">Items</span><span>${d.ornaments.map((o) => escapeHtml(o.itemName || "(unnamed)")).join(", ")}</span></div>` : ""}
      ${d.disbAmount ? `<div class="row"><span class="k">Amount</span><span>${fmtMoney(d.disbAmount)}</span></div>` : ""}
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" class="btn btn-primary btn-sm" onclick="continueDraft('${d.id}')">Continue</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="deleteDraft('${d.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

async function continueDraft(draftId) {
  const doc = await db.collection("loanDrafts").doc(draftId).get();
  if (!doc.exists) { toast("Draft not found"); return; }
  const d = doc.data();
  currentDraftId = draftId;

  if (d.customerId) selectCustomer(d.customerId);
  document.getElementById("loanNumber").value = d.loanNumber || "";
  if (d.loanDate) document.getElementById("loanDate").value = d.loanDate;
  document.getElementById("loanRemarks").value = d.loanRemarks || "";
  document.getElementById("itemsIdentityNote").value = d.itemsIdentityNote || "";

  const mode = d.pledgedByMode || "self";
  document.querySelector(`input[name="pledgedByMode"][value="${mode}"]`).checked = true;
  document.querySelectorAll("#pledgedByCards .radio-card").forEach((c) => c.classList.toggle("selected", c.dataset.mode === mode));
  document.getElementById("pledgedByName").value = d.pledgedByName || "";
  document.getElementById("pledgedByMobile").value = d.pledgedByMobile || "";
  document.getElementById("pledgedByAadhaar").value = await decryptAadhaar(d.pledgedByAadhaar);
  document.getElementById("pledgedByVillage").value = d.pledgedByVillage || "";
  document.getElementById("pledgedByAddress").value = d.pledgedByAddress || "";
  setupPledgedByField(); // re-run to sync visibility + hint text with the restored mode

  document.getElementById("disbAmount").value = d.disbAmount || "";
  document.getElementById("disbRate").value = d.disbRate || "";
  document.getElementById("disbInterestType").value = d.disbInterestType || "simple";
  if (d.disbDate) document.getElementById("disbDate").value = d.disbDate;
  document.getElementById("disbReason").value = d.disbReason || "";
  document.getElementById("disbCollector").value = d.disbCollector || "";
  document.getElementById("disbNotes").value = d.disbNotes || "";

  document.getElementById("ornamentRows").innerHTML = "";
  if (d.ornaments && d.ornaments.length) {
    d.ornaments.forEach((o) => {
      addOrnamentRow();
      const row = document.querySelectorAll("#ornamentRows [data-row]");
      const r = row[row.length - 1];
      r.querySelector(".orn-name").value = o.itemName || "";
      r.querySelector(".orn-metal").value = o.metalType || "Gold";
      r.querySelector(".orn-metal").dispatchEvent(new Event("change"));
      r.querySelector(".orn-weight").value = o.weight || "";
      r.querySelector(".orn-qty").value = o.qty || 1;
      r.querySelector(".orn-purity").value = o.purity || "";
      r.querySelector(".orn-purity").dispatchEvent(new Event("input"));
    });
  }
  updateOrnamentTotals();

  ["loanRemarksCount", "itemsIdentityNoteCount", "disbNotesCount"].forEach((id) => {
    const fieldId = id.replace("Count", "");
    document.getElementById(id).textContent = document.getElementById(fieldId).value.length;
  });

  toast("Draft loaded — continue filling it in");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteDraft(draftId) {
  if (!confirm("Delete this draft? This can't be undone.")) return;
  await db.collection("loanDrafts").doc(draftId).delete();
  if (currentDraftId === draftId) currentDraftId = null;
  toast("Draft deleted");
  await loadDrafts();
}
