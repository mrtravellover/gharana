let resetStep = null; // 'first' | 'second'
let countdownInterval = null;

requireAuth(async (user) => {
  renderShell({ active: "profile", title: "Profile" });
  document.getElementById("profileEmail").textContent = user.email;
  setupLangSelect();
  if (typeof renderThemeToggle === "function") renderThemeToggle("themeToggleProfile");
  await loadMyProfile(user.uid);
  await loadShopDetails();
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
    }
    await deleteAllDocsInRef(db.collection("loans"));
    await deleteAllDocsInRef(db.collection("customers"));
    await deleteAllDocsInRef(db.collection("activityLog"));
    await deleteAllDocsInRef(db.collection("loanDrafts"));

    await deleteStorageFolder("customer-photos");
    await deleteStorageFolder("loan-photos");
    await deleteStorageFolder("disbursement-photos");
    await deleteStorageFolder("return-photos");

    toast("Reset complete — the app is now empty. Your login is unchanged.");
    setTimeout(() => (location.href = "dashboard.html"), 1800);
  } catch (err) {
    console.error("Reset failed:", err);
    toast("Something went wrong during reset — check your connection and try again.");
  }
}
