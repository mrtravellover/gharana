// ============================================================
// gallery.js — Jewellery Gallery for a loan's pledged items.
// Self-contained: reads the loan id straight from the URL (same
// pattern as loan-detail.js) rather than depending on load order
// with that file, even though they run on the same page.
//
// Reuses camera.js's existing capture/compression flow unchanged —
// same moderate compression (1280px max, JPEG quality 0.75) as
// every other photo in this app, per your preference to keep it
// "normally compressed," not full-resolution.
// ============================================================

const GALLERY_CATEGORIES = [
  { key: "front", label: "Front", icon: "💍" },
  { key: "back", label: "Back", icon: "🔄" },
  { key: "hallmark", label: "Hallmark", icon: "🏷️" },
  { key: "weight_slip", label: "Weight Slip", icon: "⚖️" },
  { key: "close_up", label: "Close-up", icon: "🔍" },
  { key: "customer_holding", label: "Customer Holding", icon: "🤲" },
  { key: "additional", label: "Additional", icon: "📎" },
];

const galleryLoanId = new URLSearchParams(location.search).get("id");
let galleryPhotos = [];
let galleryActiveCategory = "all";
let lightboxIndex = 0;
let lightboxScale = 1;
let lightboxPanX = 0, lightboxPanY = 0;

async function initGallery() {
  if (!galleryLoanId || !document.getElementById("galleryGrid")) return;
  await loadGalleryPhotos();
}

async function loadGalleryPhotos() {
  try {
    const snap = await db.collection("loans").doc(galleryLoanId).collection("galleryPhotos").orderBy("order").get();
    galleryPhotos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Gallery load failed:", err);
    galleryPhotos = [];
  }
  renderGalleryTabs();
  renderGalleryGrid();
}

function categoryLabel(key) {
  const c = GALLERY_CATEGORIES.find((x) => x.key === key);
  return c ? c.label : key;
}

function renderGalleryTabs() {
  const tabsEl = document.getElementById("galleryCatTabs");
  const countFor = (key) => galleryPhotos.filter((p) => p.category === key).length;

  const allTab = `<button class="gallery-cat-tab ${galleryActiveCategory === "all" ? "active" : ""}" onclick="setGalleryCategory('all')">All <span class="count">${galleryPhotos.length}</span></button>`;
  const catTabs = GALLERY_CATEGORIES.map((c) => `
    <button class="gallery-cat-tab ${galleryActiveCategory === c.key ? "active" : ""}" onclick="setGalleryCategory('${c.key}')">
      ${c.icon} ${c.label} <span class="count">${countFor(c.key)}</span>
    </button>`).join("");

  tabsEl.innerHTML = allTab + catTabs;
}

function setGalleryCategory(key) {
  galleryActiveCategory = key;
  renderGalleryTabs();
  renderGalleryGrid();
}

function galleryFilteredPhotos() {
  return galleryActiveCategory === "all" ? galleryPhotos : galleryPhotos.filter((p) => p.category === galleryActiveCategory);
}

function renderGalleryGrid() {
  const grid = document.getElementById("galleryGrid");
  const photos = galleryFilteredPhotos();
  // When "All" is selected there's no single obvious category for a new
  // photo, so the add-tile defaults to "Additional" — switch to a specific
  // category tab to add directly into that one.
  const addCategory = galleryActiveCategory === "all" ? "additional" : galleryActiveCategory;

  const addTileHtml = `
    <div class="gallery-add-tile" onclick="startGalleryUpload('${addCategory}')" title="Add photo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      Add photo
    </div>`;

  if (photos.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:24px 0;">
      <p style="margin-bottom:12px;">No photos yet${galleryActiveCategory !== "all" ? ` in ${categoryLabel(galleryActiveCategory)}` : ""}.</p>
    </div>` + addTileHtml;
    return;
  }

  grid.innerHTML = photos.map((p, i) => `
    <div class="gallery-tile" draggable="true" data-photo-id="${p.id}" data-index="${i}"
         onclick="openLightbox(${i})" ondragstart="galleryDragStart(event)" ondragover="galleryDragOver(event)"
         ondrop="galleryDrop(event)" ondragend="galleryDragEnd(event)">
      <img src="${p.url}" loading="lazy" alt="${categoryLabel(p.category)}">
      <div class="cat-label">${categoryLabel(p.category)}</div>
      <div class="tile-actions">
        <button type="button" class="tile-action-btn" title="Replace" onclick="event.stopPropagation();startGalleryReplace('${p.id}')">🔄</button>
        <button type="button" class="tile-action-btn" title="Delete" onclick="event.stopPropagation();deleteGalleryPhoto('${p.id}')">🗑</button>
      </div>
    </div>`).join("") + addTileHtml;
}

// ---------- Upload (new photo) ----------
function startGalleryUpload(category) {
  openCameraCapture((file) => uploadGalleryPhoto(file, category));
}

async function uploadGalleryPhoto(file, category) {
  const grid = document.getElementById("galleryGrid");
  const tempId = "uploading-" + Date.now();
  grid.insertAdjacentHTML("afterbegin", `
    <div class="gallery-tile" id="${tempId}">
      <div class="gallery-upload-progress">
        <span>Uploading…</span>
        <div class="bar-track"><div class="bar-fill" id="${tempId}-bar" style="width:0%;"></div></div>
      </div>
    </div>`);

  try {
    const path = `loan-gallery/${galleryLoanId}/${category}-${Date.now()}.jpg`;
    const ref = storage.ref(path);
    const uploadTask = ref.put(file);

    await new Promise((resolve, reject) => {
      uploadTask.on("state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          const bar = document.getElementById(`${tempId}-bar`);
          if (bar) bar.style.width = pct + "%";
        },
        reject,
        resolve
      );
    });
    const url = await ref.getDownloadURL();

    const maxOrder = galleryPhotos.reduce((m, p) => Math.max(m, p.order || 0), 0);
    await db.collection("loans").doc(galleryLoanId).collection("galleryPhotos").add({
      category, url, storagePath: path, order: maxOrder + 1, sizeBytes: file.size,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy: (auth.currentUser && auth.currentUser.email) || "unknown",
    });

    if (typeof logActivity === "function") {
      logActivity({ customerId: loanData ? loanData.customerId : null, loanId: galleryLoanId, eventType: "gold_added", action: "Gallery photo added", detail: categoryLabel(category) });
    }

    toast("Photo added");
  } catch (err) {
    console.error("Gallery upload failed:", err);
    toast("Photo upload failed — check your connection and try again.");
  }
  await loadGalleryPhotos();
}

// ---------- Replace ----------
function startGalleryReplace(photoId) {
  openCameraCapture((file) => replaceGalleryPhoto(photoId, file));
}

async function replaceGalleryPhoto(photoId, file) {
  const old = galleryPhotos.find((p) => p.id === photoId);
  if (!old) return;
  try {
    const path = `loan-gallery/${galleryLoanId}/${old.category}-${Date.now()}.jpg`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();

    await db.collection("loans").doc(galleryLoanId).collection("galleryPhotos").doc(photoId).update({ url, storagePath: path });

    // Best-effort cleanup of the old file — the loan record is already
    // updated regardless of whether this succeeds.
    if (old.storagePath) storage.ref(old.storagePath).delete().catch(() => {});

    toast("Photo replaced");
  } catch (err) {
    console.error("Gallery replace failed:", err);
    toast("Couldn't replace the photo — check your connection and try again.");
  }
  await loadGalleryPhotos();
}

// ---------- Delete ----------
async function deleteGalleryPhoto(photoId) {
  if (!confirm("Delete this photo? This can't be undone.")) return;
  const photo = galleryPhotos.find((p) => p.id === photoId);
  try {
    await db.collection("loans").doc(galleryLoanId).collection("galleryPhotos").doc(photoId).delete();
    if (photo && photo.storagePath) storage.ref(photo.storagePath).delete().catch(() => {});
    toast("Photo deleted");
  } catch (err) {
    console.error("Gallery delete failed:", err);
    toast("Couldn't delete the photo — please try again.");
  }
  await loadGalleryPhotos();
}

// ---------- Drag to reorder ----------
let galleryDragSourceId = null;

function galleryDragStart(e) {
  galleryDragSourceId = e.currentTarget.dataset.photoId;
  e.currentTarget.classList.add("dragging");
}
function galleryDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
}
function galleryDragEnd(e) {
  document.querySelectorAll(".gallery-tile").forEach((t) => t.classList.remove("dragging", "drag-over"));
}
async function galleryDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const targetId = e.currentTarget.dataset.photoId;
  if (!galleryDragSourceId || galleryDragSourceId === targetId) return;

  const photos = galleryFilteredPhotos();
  const fromIdx = photos.findIndex((p) => p.id === galleryDragSourceId);
  const toIdx = photos.findIndex((p) => p.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;

  const reordered = [...photos];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);

  const batch = db.batch();
  reordered.forEach((p, i) => {
    batch.update(db.collection("loans").doc(galleryLoanId).collection("galleryPhotos").doc(p.id), { order: i });
  });
  await batch.commit();
  await loadGalleryPhotos();
}

// ---------- Fullscreen lightbox: carousel + zoom + download + delete ----------
function ensureLightbox() {
  if (document.getElementById("galleryLightbox")) return;
  const html = `
  <div class="gallery-lightbox" id="galleryLightbox" style="display:none;">
    <div class="gallery-lightbox-top">
      <span class="gallery-lightbox-counter" id="lightboxCounter"></span>
      <div class="gallery-lightbox-actions">
        <button type="button" class="gallery-lightbox-btn" title="Download" onclick="downloadLightboxPhoto()">⬇</button>
        <button type="button" class="gallery-lightbox-btn" title="Delete" onclick="deleteLightboxPhoto()">🗑</button>
        <button type="button" class="gallery-lightbox-btn" title="Close" onclick="closeLightbox()">✕</button>
      </div>
    </div>
    <button type="button" class="gallery-lightbox-nav prev" onclick="lightboxNav(-1)" aria-label="Previous">‹</button>
    <div class="gallery-lightbox-img-wrap" id="lightboxImgWrap">
      <img id="lightboxImg" src="" alt="">
    </div>
    <button type="button" class="gallery-lightbox-nav next" onclick="lightboxNav(1)" aria-label="Next">›</button>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);

  const wrap = document.getElementById("lightboxImgWrap");
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeLightbox(); });
  document.getElementById("lightboxImg").addEventListener("dblclick", toggleLightboxZoom);
  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    lightboxScale = Math.min(4, Math.max(1, lightboxScale + (e.deltaY < 0 ? 0.25 : -0.25)));
    applyLightboxTransform();
  }, { passive: false });

  setupLightboxTouch(wrap);
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("galleryLightbox").style.display !== "flex") return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") lightboxNav(-1);
    if (e.key === "ArrowRight") lightboxNav(1);
  });
}

function openLightbox(index) {
  ensureLightbox();
  lightboxIndex = index;
  lightboxScale = 1; lightboxPanX = 0; lightboxPanY = 0;
  document.getElementById("galleryLightbox").style.display = "flex";
  document.body.classList.add("modal-open");
  renderLightboxImage();
}

function closeLightbox() {
  const el = document.getElementById("galleryLightbox");
  if (el) el.style.display = "none";
  document.body.classList.remove("modal-open");
}

function lightboxNav(dir) {
  const photos = galleryFilteredPhotos();
  lightboxIndex = (lightboxIndex + dir + photos.length) % photos.length;
  lightboxScale = 1; lightboxPanX = 0; lightboxPanY = 0;
  renderLightboxImage();
}

function renderLightboxImage() {
  const photos = galleryFilteredPhotos();
  const p = photos[lightboxIndex];
  if (!p) { closeLightbox(); return; }
  document.getElementById("lightboxImg").src = p.url;
  document.getElementById("lightboxCounter").textContent = `${categoryLabel(p.category)} — ${lightboxIndex + 1} / ${photos.length}`;
  applyLightboxTransform();
}

function applyLightboxTransform() {
  const img = document.getElementById("lightboxImg");
  if (img) img.style.transform = `scale(${lightboxScale}) translate(${lightboxPanX}px, ${lightboxPanY}px)`;
}

function toggleLightboxZoom() {
  lightboxScale = lightboxScale > 1 ? 1 : 2;
  lightboxPanX = 0; lightboxPanY = 0;
  applyLightboxTransform();
}

// Pinch-to-zoom (two-finger) + drag-to-pan when zoomed, pure touch events,
// no library — same "no external dependency" pattern as the rest of this app.
function setupLightboxTouch(wrap) {
  let startDist = 0, startScale = 1;
  let panStartX = 0, panStartY = 0, dragging = false;

  wrap.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      startDist = touchDistance(e.touches);
      startScale = lightboxScale;
    } else if (e.touches.length === 1 && lightboxScale > 1) {
      dragging = true;
      panStartX = e.touches[0].clientX - lightboxPanX;
      panStartY = e.touches[0].clientY - lightboxPanY;
    }
  }, { passive: true });

  wrap.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      const dist = touchDistance(e.touches);
      lightboxScale = Math.min(4, Math.max(1, startScale * (dist / startDist)));
      applyLightboxTransform();
    } else if (dragging && e.touches.length === 1) {
      lightboxPanX = e.touches[0].clientX - panStartX;
      lightboxPanY = e.touches[0].clientY - panStartY;
      applyLightboxTransform();
    }
  }, { passive: true });

  wrap.addEventListener("touchend", (e) => {
    dragging = false;
    if (lightboxScale <= 1.02) { lightboxScale = 1; lightboxPanX = 0; lightboxPanY = 0; applyLightboxTransform(); }
  });
}

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function downloadLightboxPhoto() {
  const photos = galleryFilteredPhotos();
  const p = photos[lightboxIndex];
  if (!p) return;
  const a = document.createElement("a");
  a.href = p.url;
  a.download = `${galleryLoanId}-${p.category}.jpg`;
  a.target = "_blank"; // Firebase Storage URLs are cross-origin — this ensures it opens/saves rather than failing silently
  a.click();
}

async function deleteLightboxPhoto() {
  const photos = galleryFilteredPhotos();
  const p = photos[lightboxIndex];
  if (!p) return;
  if (!confirm("Delete this photo? This can't be undone.")) return;
  await deleteGalleryPhoto(p.id);
  closeLightbox();
}
