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
  const q = query.trim();
  const filtered = !q ? allCustomers : allCustomers.filter((c) =>
    smartMatchAny([c.name, c.mobile, c.aadhaar, c.address, c.notes], q)
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
      <td>${highlightText(c.address, q)}</td>
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
