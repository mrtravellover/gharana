requireAuth(async () => {
  renderShell({ active: "loan-create", title: "New Loan" });
  document.getElementById("loanDate").valueAsDate = new Date();
  document.getElementById("disbDate").valueAsDate = new Date();
  await populateCustomers();
  addOrnamentRow();
  document.getElementById("loanForm").addEventListener("submit", saveLoan);
  setupPledgedByField();
});

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

async function populateCustomers() {
  const snap = await db.collection("customers").orderBy("name").get();
  const select = document.getElementById("customerSelect");
  snap.docs.forEach((d) => {
    const c = d.data();
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${c.name} — ${c.mobile}`;
    select.appendChild(opt);
  });
  const preselect = new URLSearchParams(location.search).get("customerId");
  if (preselect) select.value = preselect;
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
      identityRemark: r.querySelector(".orn-identity").value.trim(),
      released: false,
      notes: "",
    };
  });
}

async function saveLoan(e) {
  e.preventDefault();
  const ornaments = collectOrnaments();
  if (ornaments.length === 0) { toast("Add at least one ornament"); return; }

  const btn = document.getElementById("saveLoanBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const customerId = document.getElementById("customerSelect").value;
  const customerName = document.getElementById("customerSelect").selectedOptions[0].textContent.split(" — ")[0];
  const disbAmount = parseFloat(document.getElementById("disbAmount").value);

  const pledgedByMode = document.querySelector('input[name="pledgedByMode"]:checked').value;
  const pledgedByName = document.getElementById("pledgedByName").value.trim();
  const pledgedByMobile = document.getElementById("pledgedByMobile").value.trim();
  const pledgedByAadhaar = document.getElementById("pledgedByAadhaar").value.trim();
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
    pledgedByAadhaar: pledgedByMode === "other" ? pledgedByAadhaar : "",
    pledgedByAddress: pledgedByMode === "other" ? pledgedByAddress : "",
    pledgedByLabel,
    date: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("loanDate").value)),
    remarks: document.getElementById("loanRemarks").value.trim(),
    status: "active",
    totalPrincipal: disbAmount,
    itemCount: ornaments.reduce((s, o) => s + o.qty, 0),
    itemNames: [...new Set(ornaments.map((o) => o.itemName.toLowerCase()))],
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

  const loanPhotoFile = document.getElementById("loanPhoto").files[0];
  if (loanPhotoFile) {
    const url = await uploadPhoto(loanPhotoFile, `loan-photos/${loanRef.id}-${Date.now()}.jpg`);
    await loanRef.update({ loanPhotoUrl: url });
  }

  const disbPhotoFile = document.getElementById("disbPhoto").files[0];
  if (disbPhotoFile) {
    const url = await uploadPhoto(disbPhotoFile, `disbursement-photos/${disbRef.id}-${Date.now()}.jpg`);
    await disbRef.update({ photoUrl: url });
  }

  toast("Loan created");
  location.href = `loan-detail.html?id=${loanRef.id}`;
}
