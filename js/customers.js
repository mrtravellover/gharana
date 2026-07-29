let allCustomers = [];
let capturedCustPhoto = null;

requireAuth(async () => {
  renderShell({ active: "customers", title: "Customers" });
  await loadCustomers();
  document.getElementById("searchInput").addEventListener("input", (e) => renderCustomers(e.target.value));
  document.getElementById("customerForm").addEventListener("submit", saveCustomer);
  wirePhotoCapture("custPhotoBtn", "custPhotoPreview", (file) => { capturedCustPhoto = file; });

  if (new URLSearchParams(location.search).get("new") === "1") openCustomerModal();
});

async function loadCustomers() {
  const snap = await db.collection("customers").orderBy("name").get();
  allCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // loan counts (lightweight — fine at family-business scale)
  const loanSnap = await db.collection("loans").get();
  const counts = {};
  loanSnap.docs.forEach((d) => {
    const cid = d.data().customerId;
    counts[cid] = (counts[cid] || 0) + 1;
  });
  allCustomers.forEach((c) => (c.loanCount = counts[c.id] || 0));

  renderCustomers("");
}

function renderCustomers(query) {
  const q = query.trim().toLowerCase();
  const filtered = !q ? allCustomers : allCustomers.filter((c) =>
    [c.name, c.mobile, c.aadhaar, c.address].some((v) => (v || "").toLowerCase().includes(q))
  );

  const body = document.getElementById("customerBody");
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="color:var(--ink-soft);padding:20px 0;">No customers found.</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map((c) => `
    <tr class="clickable" onclick="location.href='customer-profile.html?id=${c.id}'">
      <td><span class="status-dot status-dot-${c.accountStatus || "active"}"></span><strong>${escapeHtml(c.name)}</strong></td>
      <td class="mono">${escapeHtml(c.mobile)}</td>
      <td>${escapeHtml(c.address)}</td>
      <td>${c.loanCount}</td>
    </tr>`).join("");
}

function openCustomerModal() { document.getElementById("customerModal").style.display = "flex"; }
function closeCustomerModal() {
  document.getElementById("customerModal").style.display = "none";
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
    aadhaar: document.getElementById("custAadhaar").value.trim(),
    address: document.getElementById("custAddress").value.trim(),
    notes: document.getElementById("custNotes").value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("customers").add(data);

  if (capturedCustPhoto) {
    const url = await uploadPhoto(capturedCustPhoto, `customer-photos/${ref.id}-${Date.now()}.jpg`);
    await ref.update({ photoUrl: url });
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
