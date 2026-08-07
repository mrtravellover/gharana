let allCustomers = [];
let capturedCustPhoto = null;

requireAuth(async () => {
  renderShell({ active: "customers", title: "Customers" });
  await loadCustomers();
  document.getElementById("searchInput").addEventListener("input", (e) => {
    document.getElementById("searchClearBtn").style.display = e.target.value ? "flex" : "none";
    renderCustomers(e.target.value);
  });
  document.getElementById("searchClearBtn").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    document.getElementById("searchClearBtn").style.display = "none";
    renderCustomers("");
  });
  document.getElementById("customerForm").addEventListener("submit", saveCustomer);
  wirePhotoCapture("custPhotoBtn", "custPhotoPreview", (file) => { capturedCustPhoto = file; });

  if (new URLSearchParams(location.search).get("new") === "1") openCustomerModal();
});

async function loadCustomers() {
  const snap = await db.collection("customers").orderBy("name").get();
  allCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  await decryptAadhaarBatch(allCustomers); // decrypt once here so search/render below never has to think about it

  // Loan counts — uses Firestore's count() aggregation instead of fetching
  // every loan document. Each count query is billed as a single read no
  // matter how many loans match, so this costs one read per customer
  // rather than one read per loan ever created — a real difference once a
  // customer has several loans in their history. Falls back to showing "—"
  // for a customer if the count query fails for some reason, rather than
  // breaking the whole page.
  await Promise.all(allCustomers.map(async (c) => {
    try {
      const countSnap = await db.collection("loans").where("customerId", "==", c.id).count().get();
      c.loanCount = countSnap.data().count;
    } catch (err) {
      console.error(`Couldn't get loan count for customer ${c.id}:`, err);
      c.loanCount = "—";
    }
  }));

  populateVillageDatalist("villageDatalist", allCustomers);
  renderCustomers("");
}

function renderCustomers(query) {
  const q = query.trim();
  const filtered = !q ? allCustomers : allCustomers.filter((c) =>
    smartMatchAny([c.name, c.mobile, c.aadhaar, c.village, c.address, c.notes], q)
  );

  document.getElementById("searchResultCount").textContent = `${filtered.length} customer${filtered.length === 1 ? "" : "s"} found`;

  const body = document.getElementById("customerBody");
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="color:var(--ink-soft);padding:20px 0;">No customers found${q ? " — try a different search" : ""}.</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map((c) => `
    <tr class="clickable" onclick="location.href='customer-profile.html?id=${c.id}'">
      <td><span class="status-dot status-dot-${c.accountStatus || "active"}"></span><strong>${highlightText(c.name, q)}</strong></td>
      <td class="mono">${highlightText(c.mobile, q)}</td>
      <td>${highlightText(c.village || c.address, q)}</td>
      <td>${c.loanCount}</td>
    </tr>`).join("");
}

function openCustomerModal() {
  document.getElementById("customerModal").style.display = "flex";
  document.body.classList.add("modal-open");
}
function closeCustomerModal() {
  document.getElementById("customerModal").style.display = "none";
  document.body.classList.remove("modal-open");
  document.getElementById("customerForm").reset();
  document.getElementById("custPhotoPreview").innerHTML = "";
  capturedCustPhoto = null;
}

async function saveCustomer(e) {
  e.preventDefault();
  const btn = document.getElementById("saveCustBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const data = {
    name: document.getElementById("custName").value.trim(),
    mobile: document.getElementById("custMobile").value.trim(),
    aadhaar: await encryptAadhaar(document.getElementById("custAadhaar").value),
    village: document.getElementById("custVillage").value.trim(),
    address: document.getElementById("custAddress").value.trim(),
    notes: document.getElementById("custNotes").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("customers").add(data);
  await logActivity({ customerId: ref.id, eventType: "customer_created", action: "Customer created", detail: data.name });

  if (capturedCustPhoto) {
    btn.textContent = "Uploading photo…";
    try {
      const url = await uploadPhoto(capturedCustPhoto, `customer-photos/${ref.id}-${Date.now()}.jpg`);
      await ref.update({ photoUrl: url });
    } catch (err) {
      console.error("Photo upload failed:", err);
      toast("Customer saved, but the photo failed to upload. You can add it from their profile.");
    }
  }

  closeCustomerModal();
  toast("Customer added");

  const goToLoan = confirm("Customer saved. Create a new loan for them now?");
  if (goToLoan) {
    location.href = `loan-create.html?customerId=${ref.id}`;
  } else {
    await loadCustomers();
  }
  btn.disabled = false; btn.textContent = "Save customer";
}

// ============================================================
// CSV Import
//
// Validates every row before importing anything — required fields
// (matching the same requirements as the normal Add Customer form:
// name, mobile, village, address) and duplicate mobile numbers against
// customers already in the app are both caught and reported, not
// silently imported as broken/duplicate records. Shows a full preview
// with exact reasons for anything that'll be skipped, and only commits
// after an explicit confirmation — never imports blind.
// ============================================================

let csvValidRows = [];
let csvSkippedRows = [];

function downloadCsvTemplate() {
  const headers = ["Name", "Mobile", "Village", "Address", "Aadhaar (optional)", "Notes (optional)"];
  const example = ["Ramesh Kumar", "9876543210", "Jhabua", "Near bus stand", "", "Regular customer"];
  const csv = [headers, example].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "customer-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function openCsvImportModal() {
  document.getElementById("csvFileInput").value = "";
  document.getElementById("csvPreviewArea").style.display = "none";
  csvValidRows = [];
  csvSkippedRows = [];
  openModal("csvImportModal");
}

function handleCsvFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => validateCsvRows(results.data),
    error: (err) => {
      console.error("CSV parse failed:", err);
      toast("Couldn't read that CSV file — check it's a valid CSV export.");
    },
  });
}

// Normalizes header names loosely (case/spacing-insensitive, and accepts
// the "(optional)" suffix from the template) so a real-world CSV someone
// hand-edits in Excel still matches even if capitalization drifts.
function findCsvField(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase().replace(/\s*\(optional\)\s*/, "") === name.toLowerCase());
    if (key !== undefined) return (row[key] || "").trim();
  }
  return "";
}

function validateCsvRows(rows) {
  csvValidRows = [];
  csvSkippedRows = [];

  const existingMobiles = new Set(allCustomers.map((c) => (c.mobile || "").replace(/\D/g, "")));
  const seenInThisFile = new Set();

  rows.forEach((row, i) => {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row itself
    const name = findCsvField(row, "name");
    const mobile = findCsvField(row, "mobile").replace(/\D/g, "");
    const village = findCsvField(row, "village");
    const address = findCsvField(row, "address");
    const aadhaar = findCsvField(row, "aadhaar");
    const notes = findCsvField(row, "notes");

    if (!name || !mobile || !village || !address) {
      const missing = [!name && "name", !mobile && "mobile", !village && "village", !address && "address"].filter(Boolean).join(", ");
      csvSkippedRows.push(`Row ${rowNum}: missing ${missing}`);
      return;
    }
    if (existingMobiles.has(mobile)) {
      csvSkippedRows.push(`Row ${rowNum} (${name}): mobile ${mobile} already belongs to an existing customer`);
      return;
    }
    if (seenInThisFile.has(mobile)) {
      csvSkippedRows.push(`Row ${rowNum} (${name}): duplicate mobile ${mobile} appears more than once in this file`);
      return;
    }
    seenInThisFile.add(mobile);
    csvValidRows.push({ name, mobile, village, address, aadhaar, notes });
  });

  document.getElementById("csvPreviewSummary").innerHTML = `
    <strong>${csvValidRows.length}</strong> row(s) ready to import.
    ${csvSkippedRows.length ? `<br><strong style="color:var(--danger);">${csvSkippedRows.length}</strong> row(s) will be skipped — see below.` : ""}
  `;
  document.getElementById("csvSkippedList").innerHTML = csvSkippedRows.map((s) => `<div>${escapeHtml(s)}</div>`).join("");
  document.getElementById("confirmCsvImportBtn").disabled = csvValidRows.length === 0;
  document.getElementById("csvPreviewArea").style.display = "block";
}

async function confirmCsvImport() {
  const rows = csvValidRows;
  if (!rows.length) return;
  closeModal("csvImportModal");
  openModal("csvImportProgressModal");
  const progressText = document.getElementById("csvImportProgressText");

  let imported = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    progressText.textContent = `Importing ${i + 1} of ${rows.length}: ${r.name}…`;
    try {
      const data = {
        name: r.name,
        mobile: r.mobile,
        aadhaar: await encryptAadhaar(r.aadhaar),
        village: r.village,
        address: r.address,
        notes: r.notes,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      const ref = await db.collection("customers").add(data);
      await logActivity({ customerId: ref.id, eventType: "customer_created", action: "Customer created (CSV import)", detail: data.name });
      imported++;
    } catch (err) {
      console.error(`Couldn't import row for ${r.name}:`, err);
      failed++;
    }
  }

  closeModal("csvImportProgressModal");
  toast(`Import complete — ${imported} customer(s) added${failed ? `, ${failed} failed (see console)` : ""}`);
  await loadCustomers();
}
