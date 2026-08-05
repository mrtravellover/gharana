let resetStep = null; // 'first' | 'second'
let countdownInterval = null;

requireAuth(async (user) => {
  renderShell({ active: "profile", title: "Profile" });
  document.getElementById("profileEmail").textContent = user.email;
  setupLangSelect();
  if (typeof renderThemeToggle === "function") renderThemeToggle("themeToggleProfile");
  await loadMyProfile(user.uid);
  await loadShopDetails();
  await loadLastBackupLabel();
});

// ---------- Shop details (shared, used by the Receipt Generator) ----------
async function loadShopDetails() {
  try {
    const doc = await db.collection("settings").doc("shop").get();
    const data = doc.exists ? doc.data() : {};
    document.getElementById("shopName").value = data.name || "";
    document.getElementById("shopTagline").value = data.tagline || "";
    document.getElementById("shopAddress").value = data.address || "";
    document.getElementById("shopPhone").value = data.phone || "";
    if (data.logoUrl) {
      document.getElementById("shopLogoPreview").innerHTML = `<img src="${data.logoUrl}" style="width:100%;height:100%;object-fit:contain;">`;
    }
  } catch (err) {
    console.error("Couldn't load shop details:", err);
  }
}

// Resizes an uploaded logo to a reasonable max size while keeping it as
// PNG (preserves transparency) — unlike camera.js's photo compression,
// which converts to JPEG. That's fine for a photo, but would bake a white
// background into a logo that's meant to have a transparent one.
function resizeLogoImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = () => reject(new Error("Couldn't read the file"));
    img.onload = () => {
      const MAX_DIM = 400;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { blob ? resolve(blob) : reject(new Error("Couldn't process the image")); }, "image/png");
    };
    img.onerror = () => reject(new Error("Couldn't load the image"));
    reader.readAsDataURL(file);
  });
}

async function handleShopLogoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.getElementById("shopLogoPreview");
  preview.innerHTML = `<span style="color:var(--ink-soft);font-size:11px;">Uploading…</span>`;

  try {
    const resized = await resizeLogoImage(file);
    const ref = storage.ref("shop-logo/logo.png"); // fixed path — re-uploading replaces the old one automatically
    await ref.put(resized);
    const url = await ref.getDownloadURL();
    await db.collection("settings").doc("shop").set({ logoUrl: url }, { merge: true });
    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;">`;
    toast("Logo updated");
  } catch (err) {
    console.error("Logo upload failed:", err);
    toast("Couldn't upload the logo — please try again");
    preview.innerHTML = `<span style="color:var(--ink-soft);font-size:11px;">No logo</span>`;
  }
}

async function saveShopDetails() {
  const name = document.getElementById("shopName").value.trim();
  const address = document.getElementById("shopAddress").value.trim();
  if (!name || !address) { toast("Shop name and address are required — they appear on every receipt"); return; }

  const btn = document.getElementById("saveShopDetailsBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await db.collection("settings").doc("shop").set({
      name,
      tagline: document.getElementById("shopTagline").value.trim(),
      address,
      phone: document.getElementById("shopPhone").value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (auth.currentUser && auth.currentUser.email) || "unknown",
    }, { merge: true });
    toast("Shop details saved");
  } catch (err) {
    console.error("Couldn't save shop details:", err);
    toast("Couldn't save shop details — please try again");
  }
  btn.disabled = false; btn.textContent = "Save shop details";
}

async function loadMyProfile(uid) {
  try {
    const doc = await db.collection("userProfiles").doc(uid).get();
    const data = doc.exists ? doc.data() : {};
    document.getElementById("profileNameInput").value = data.displayName || "";
    document.getElementById("profileBusinessType").value = data.businessType || "gold";
    document.getElementById("profilePhoneInput").value = data.phone || "";
  } catch (err) {
    console.error("Couldn't load profile:", err);
  }
}

async function saveMyProfile() {
  const btn = document.getElementById("saveProfileBtn");
  const name = document.getElementById("profileNameInput").value.trim();
  const businessType = document.getElementById("profileBusinessType").value;
  const phone = document.getElementById("profilePhoneInput").value.trim();

  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await db.collection("userProfiles").doc(auth.currentUser.uid).set({
      displayName: name,
      businessType,
      phone,
      email: auth.currentUser.email,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    toast("Profile saved");
  } catch (err) {
    console.error("Couldn't save profile:", err);
    toast("Couldn't save profile — please try again");
  }
  btn.disabled = false; btn.textContent = "Save profile";
}

function setupLangSelect() {
  const select = document.getElementById("langSelect");
  select.innerHTML = Object.entries(SUPPORTED_LANGS).map(([code, label]) => `<option value="${code}">${label}</option>`).join("");
  select.value = getLang();
  select.addEventListener("change", () => setLang(select.value));
}

function startReset() {
  resetStep = "first";
  document.getElementById("authModalTitle").textContent = "Step 1 of 2: Confirm your login";
  document.getElementById("authEmail").value = "";
  document.getElementById("authPassword").value = "";
  document.getElementById("authError").style.display = "none";
  openModal("authModal");
}

function cancelReset() {
  resetStep = null;
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  closeModal("authModal");
  closeModal("countdownModal");
}

async function handleAuthSubmit() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const btn = document.getElementById("authConfirmBtn");
  const errEl = document.getElementById("authError");
  errEl.style.display = "none";

  if (!email || !password) { errEl.textContent = "Enter both email and password."; errEl.style.display = "block"; return; }

  btn.disabled = true; btn.textContent = "Checking…";

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    errEl.textContent = "Wrong email or password.";
    errEl.style.display = "block";
    btn.disabled = false; btn.textContent = "Confirm";
    return;
  }

  btn.disabled = false; btn.textContent = "Confirm";
  closeModal("authModal");

  if (resetStep === "first") {
    openCountdown();
  } else if (resetStep === "second") {
    resetStep = null;
    await performReset();
  }
}

function openCountdown() {
  let n = 10;
  document.getElementById("countdownNumber").textContent = n;
  const btn = document.getElementById("countdownConfirmBtn");
  btn.disabled = true; btn.textContent = "Wait…";
  openModal("countdownModal");

  countdownInterval = setInterval(() => {
    n--;
    document.getElementById("countdownNumber").textContent = n > 0 ? n : "0";
    if (n <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      btn.disabled = false;
      btn.textContent = "I understand, proceed";
    }
  }, 1000);
}

function proceedToSecondAuth() {
  closeModal("countdownModal");
  resetStep = "second";
  document.getElementById("authModalTitle").textContent = "Step 2 of 2: Confirm your login again";
  document.getElementById("authEmail").value = "";
  document.getElementById("authPassword").value = "";
  document.getElementById("authError").style.display = "none";
  openModal("authModal");
}

// ---------- The actual reset ----------
async function deleteAllDocsInRef(collRef) {
  const snap = await collRef.get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

async function deleteStorageFolder(prefix) {
  try {
    const res = await storage.ref(prefix).listAll();
    await Promise.all(res.items.map((item) => item.delete().catch(() => {})));
  } catch (err) {
    console.error(`Failed to clear storage folder ${prefix}:`, err);
  }
}

async function performReset() {
  toast("Resetting the app — this may take a moment…");

  try {
    const loanSnap = await db.collection("loans").get();
    for (const loanDoc of loanSnap.docs) {
      await deleteAllDocsInRef(loanDoc.ref.collection("ornaments"));
      await deleteAllDocsInRef(loanDoc.ref.collection("disbursements"));
      await deleteAllDocsInRef(loanDoc.ref.collection("payments"));
      await deleteAllDocsInRef(loanDoc.ref.collection("galleryPhotos"));
    }
    await deleteAllDocsInRef(db.collection("loans"));

    const custSnap = await db.collection("customers").get();
    for (const custDoc of custSnap.docs) {
      const depositSnap = await custDoc.ref.collection("deposits").get();
      for (const depDoc of depositSnap.docs) {
        await deleteAllDocsInRef(depDoc.ref.collection("withdrawals"));
      }
      await deleteAllDocsInRef(custDoc.ref.collection("deposits"));
    }
    await deleteAllDocsInRef(db.collection("customers"));
    await deleteAllDocsInRef(db.collection("activityLog"));
    await deleteAllDocsInRef(db.collection("loanDrafts"));

    await deleteStorageFolder("customer-photos");
    await deleteStorageFolder("loan-photos");
    await deleteStorageFolder("disbursement-photos");
    await deleteStorageFolder("return-photos");
    await deleteStorageFolder("loan-gallery");

    toast("Reset complete — the app is now empty. Your login is unchanged.");
    setTimeout(() => (location.href = "dashboard.html"), 1800);
  } catch (err) {
    console.error("Reset failed:", err);
    toast("Something went wrong during reset — check your connection and try again.");
  }
}

// ============================================================
// Manual Backup & Restore
//
// IMPORTANT LIMITATIONS — read before relying on this:
//   - This backs up FIRESTORE DATA ONLY (customer/loan records, amounts,
//     dates, activity log). It does NOT back up STORAGE FILES — the actual
//     photo images (customer photos, jewellery gallery photos, etc). A
//     restore brings back all your records including photo URLs, but if
//     the underlying image files were also deleted (e.g. by a Reset), the
//     photos themselves won't come back — just broken image links. Your
//     financial/loan records are what's protected here.
//   - Restore only works when the app is completely empty (no customers
//     or loans), by deliberate design, to prevent an old backup silently
//     overwriting live data. If you need to restore over an account that
//     has data, reset the panel first.
//   - Personal account settings (display name, theme, language) are NOT
//     included — those are tied to your login, not the shop's data.
// ============================================================

// ---------- Firestore Timestamp <-> plain-JSON conversion ----------
// JSON.stringify can't handle Firestore Timestamp objects directly, so
// every Timestamp gets converted to a plain {__ts, seconds, nanoseconds}
// marker on backup, and converted back to a real Timestamp on restore.
function serializeForBackup(value) {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === "function" && typeof value.seconds === "number") {
    return { __ts: true, seconds: value.seconds, nanoseconds: value.nanoseconds || 0 };
  }
  if (Array.isArray(value)) return value.map(serializeForBackup);
  if (typeof value === "object") {
    const out = {};
    for (const k in value) out[k] = serializeForBackup(value[k]);
    return out;
  }
  return value;
}

function deserializeFromBackup(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "object" && value.__ts === true) {
    return new firebase.firestore.Timestamp(value.seconds, value.nanoseconds || 0);
  }
  if (Array.isArray(value)) return value.map(deserializeFromBackup);
  if (typeof value === "object") {
    const out = {};
    for (const k in value) out[k] = deserializeFromBackup(value[k]);
    return out;
  }
  return value;
}

async function loadLastBackupLabel() {
  const label = document.getElementById("lastBackupLabel");
  try {
    const doc = await db.collection("settings").doc("backup").get();
    if (doc.exists && doc.data().lastBackupAt) {
      const d = doc.data();
      label.textContent = `Last backup: ${fmtDate(d.lastBackupAt)} by ${(d.lastBackupBy || "").split("@")[0]}`;
    } else {
      label.textContent = "Last backup: never taken — consider downloading one now";
    }
  } catch (err) {
    label.textContent = "Last backup: couldn't check";
  }
}

// ---------- Download backup ----------
async function downloadBackup() {
  const btn = document.getElementById("downloadBackupBtn");
  btn.disabled = true;
  const setProgress = (msg) => { btn.textContent = msg; };
  setProgress("Fetching customers…");

  try {
    const custSnap = await db.collection("customers").get();
    const customers = [];
    for (const custDoc of custSnap.docs) {
      const c = { id: custDoc.id, ...custDoc.data() };
      const depositSnap = await custDoc.ref.collection("deposits").get();
      c.deposits = [];
      for (const depDoc of depositSnap.docs) {
        const d = { id: depDoc.id, ...depDoc.data() };
        const wSnap = await depDoc.ref.collection("withdrawals").get();
        d.withdrawals = wSnap.docs.map((w) => ({ id: w.id, ...w.data() }));
        c.deposits.push(d);
      }
      customers.push(c);
    }

    const loanSnap = await db.collection("loans").get();
    const loans = [];
    let i = 0;
    for (const loanDoc of loanSnap.docs) {
      i++;
      setProgress(`Fetching loans… (${i}/${loanSnap.docs.length})`);
      const l = { id: loanDoc.id, ...loanDoc.data() };
      const [ornSnap, disbSnap, paySnap, galSnap] = await Promise.all([
        loanDoc.ref.collection("ornaments").get(),
        loanDoc.ref.collection("disbursements").get(),
        loanDoc.ref.collection("payments").get(),
        loanDoc.ref.collection("galleryPhotos").get(),
      ]);
      l.ornaments = ornSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      l.disbursements = disbSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      l.payments = paySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      l.galleryPhotos = galSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loans.push(l);
    }

    setProgress("Fetching activity log…");
    const activitySnap = await db.collection("activityLog").get();
    const activityLog = activitySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    setProgress("Fetching drafts…");
    const draftSnap = await db.collection("loanDrafts").get();
    const loanDrafts = draftSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    setProgress("Fetching shop settings…");
    const shopDoc = await db.collection("settings").doc("shop").get();
    const shopSettings = shopDoc.exists ? shopDoc.data() : null;

    setProgress("Preparing file…");
    const backup = {
      _gharanaBackup: true,
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: (auth.currentUser && auth.currentUser.email) || "unknown",
      counts: { customers: customers.length, loans: loans.length },
      data: serializeForBackup({ customers, loans, activityLog, loanDrafts, shopSettings }),
    };

    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gharana-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    await db.collection("settings").doc("backup").set({
      lastBackupAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastBackupBy: (auth.currentUser && auth.currentUser.email) || "unknown",
    }, { merge: true });

    toast("Backup downloaded — keep this file somewhere safe (not just on this device)");
    await loadLastBackupLabel();
  } catch (err) {
    console.error("Backup failed:", err);
    toast("Backup failed — check your connection and try again");
  }
  btn.disabled = false;
  btn.textContent = "⬇ Download backup";
}

// ---------- Restore ----------
let pendingRestoreData = null;
let restoreConfirmStep = null;
let restoreCountdownInterval = null;

async function handleRestoreFileSelected(event) {
  const file = event.target.files[0];
  event.target.value = ""; // reset so re-selecting the same file still fires change
  if (!file) return;

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    toast("That doesn't look like a valid backup file — couldn't read it.");
    return;
  }
  if (!parsed || parsed._gharanaBackup !== true || !parsed.data) {
    toast("That doesn't look like a Gharana backup file.");
    return;
  }

  // Safety restriction: only allow restore onto a completely empty account.
  const [custCheck, loanCheck] = await Promise.all([
    db.collection("customers").limit(1).get(),
    db.collection("loans").limit(1).get(),
  ]);
  if (!custCheck.empty || !loanCheck.empty) {
    toast("Restore is blocked — this account already has data. Reset the panel first if you really want to replace it, then restore.");
    return;
  }

  pendingRestoreData = parsed;
  const counts = parsed.counts || { customers: (parsed.data.customers || []).length, loans: (parsed.data.loans || []).length };
  document.getElementById("restorePreviewBody").innerHTML = `
    <div class="stat"><div class="label">Backup created</div><div class="value" style="font-size:15px;">${new Date(parsed.createdAt).toLocaleString("en-IN")}</div></div>
    <div class="stat" style="margin-top:8px;"><div class="label">Created by</div><div class="value" style="font-size:15px;">${escapeHtml(parsed.createdBy || "unknown")}</div></div>
    <div class="grid grid-2" style="margin-top:8px;">
      <div class="stat"><div class="label">Customers</div><div class="value" style="font-size:20px;">${counts.customers}</div></div>
      <div class="stat"><div class="label">Loans</div><div class="value" style="font-size:20px;">${counts.loans}</div></div>
    </div>
  `;
  openModal("restorePreviewModal");
}

function cancelRestoreConfirm() {
  restoreConfirmStep = null;
  pendingRestoreData = null;
  if (restoreCountdownInterval) { clearInterval(restoreCountdownInterval); restoreCountdownInterval = null; }
  closeModal("restorePreviewModal");
  closeModal("restoreAuthModal");
  closeModal("restoreCountdownModal");
}

function startRestoreConfirm() {
  closeModal("restorePreviewModal");
  restoreConfirmStep = "first";
  document.getElementById("restoreAuthModalTitle").textContent = "Step 1 of 2: Confirm your login";
  document.getElementById("restoreAuthEmail").value = "";
  document.getElementById("restoreAuthPassword").value = "";
  document.getElementById("restoreAuthError").style.display = "none";
  openModal("restoreAuthModal");
}

async function handleRestoreAuthSubmit() {
  const email = document.getElementById("restoreAuthEmail").value.trim();
  const password = document.getElementById("restoreAuthPassword").value;
  const btn = document.getElementById("restoreAuthConfirmBtn");
  const errEl = document.getElementById("restoreAuthError");
  errEl.style.display = "none";

  if (!email || !password) { errEl.textContent = "Enter both email and password."; errEl.style.display = "block"; return; }

  btn.disabled = true; btn.textContent = "Checking…";
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    errEl.textContent = "Wrong email or password.";
    errEl.style.display = "block";
    btn.disabled = false; btn.textContent = "Confirm";
    return;
  }
  btn.disabled = false; btn.textContent = "Confirm";
  closeModal("restoreAuthModal");

  if (restoreConfirmStep === "first") {
    openRestoreCountdown();
  } else if (restoreConfirmStep === "second") {
    restoreConfirmStep = null;
    await performRestore();
  }
}

function openRestoreCountdown() {
  let n = 10;
  document.getElementById("restoreCountdownNumber").textContent = n;
  const btn = document.getElementById("restoreCountdownConfirmBtn");
  btn.disabled = true; btn.textContent = "Wait…";
  openModal("restoreCountdownModal");

  restoreCountdownInterval = setInterval(() => {
    n--;
    document.getElementById("restoreCountdownNumber").textContent = n > 0 ? n : "0";
    if (n <= 0) {
      clearInterval(restoreCountdownInterval);
      restoreCountdownInterval = null;
      btn.disabled = false;
      btn.textContent = "I understand, restore";
    }
  }, 1000);
}

function proceedToRestoreSecondAuth() {
  closeModal("restoreCountdownModal");
  restoreConfirmStep = "second";
  document.getElementById("restoreAuthModalTitle").textContent = "Step 2 of 2: Confirm your login again";
  document.getElementById("restoreAuthEmail").value = "";
  document.getElementById("restoreAuthPassword").value = "";
  document.getElementById("restoreAuthError").style.display = "none";
  openModal("restoreAuthModal");
}

// Writes in chunks of 400 (Firestore's batch limit is 500 — 400 leaves
// headroom) — same pattern already used by Reset's delete logic.
async function writeInChunks(items, writeFn) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    items.slice(i, i + 400).forEach((item) => writeFn(batch, item));
    await batch.commit();
  }
}

async function performRestore() {
  const backup = pendingRestoreData;
  pendingRestoreData = null;
  if (!backup) return;

  toast("Restoring backup — this may take a moment, please don't close this page…");
  try {
    const data = deserializeFromBackup(backup.data);

    // Customers, sequentially (not parallel) — each one also writes nested
    // deposits/withdrawals, and going one at a time is far easier to reason
    // about correctly for a data-integrity-critical operation than trying
    // to parallelize hundreds of multi-step writes at once.
    for (const c of data.customers || []) {
      const { id, deposits, ...custFields } = c;
      await db.collection("customers").doc(id).set(custFields);
      for (const dep of deposits || []) {
        const { id: depId, withdrawals, ...depFields } = dep;
        await db.collection("customers").doc(id).collection("deposits").doc(depId).set(depFields);
        await writeInChunks(withdrawals || [], (batch, w) => {
          const { id: wId, ...f } = w;
          batch.set(db.collection("customers").doc(id).collection("deposits").doc(depId).collection("withdrawals").doc(wId), f);
        });
      }
    }

    for (const l of data.loans || []) {
      const { id, ornaments, disbursements, payments, galleryPhotos, ...loanFields } = l;
      await db.collection("loans").doc(id).set(loanFields);
      await writeInChunks(ornaments || [], (batch, o) => { const { id: oId, ...f } = o; batch.set(db.collection("loans").doc(id).collection("ornaments").doc(oId), f); });
      await writeInChunks(disbursements || [], (batch, d) => { const { id: dId, ...f } = d; batch.set(db.collection("loans").doc(id).collection("disbursements").doc(dId), f); });
      await writeInChunks(payments || [], (batch, p) => { const { id: pId, ...f } = p; batch.set(db.collection("loans").doc(id).collection("payments").doc(pId), f); });
      await writeInChunks(galleryPhotos || [], (batch, g) => { const { id: gId, ...f } = g; batch.set(db.collection("loans").doc(id).collection("galleryPhotos").doc(gId), f); });
    }

    await writeInChunks(data.activityLog || [], (batch, a) => { const { id, ...f } = a; batch.set(db.collection("activityLog").doc(id), f); });
    await writeInChunks(data.loanDrafts || [], (batch, d) => { const { id, ...f } = d; batch.set(db.collection("loanDrafts").doc(id), f); });

    if (data.shopSettings) {
      await db.collection("settings").doc("shop").set(data.shopSettings, { merge: true });
    }

    toast("Restore complete — reloading…");
    setTimeout(() => (location.href = "dashboard.html"), 1800);
  } catch (err) {
    console.error("Restore failed:", err);
    toast("Restore ran into a problem partway through — some data may already be written. Check the Dashboard, and check your connection before trying again.");
  }
}
