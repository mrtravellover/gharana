// ============================================================
// SHARED APP SHELL — sidebar + mobile bottom nav + topbar
// Call renderShell({ active: 'dashboard', title: 'Dashboard' }) from each page.
// ============================================================

const NAV_ITEMS = [
  { key: "dashboard", href: "dashboard.html", i18nKey: "nav_dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { key: "customers", href: "customers.html", i18nKey: "nav_customers", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
  { key: "loans", href: "loans.html", i18nKey: "nav_loans", icon: "M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" },
  { key: "loan-create", href: "loan-create.html", i18nKey: "nav_new_loan", icon: "M12 5v14M5 12h14" },
  { key: "reports", href: "reports.html", i18nKey: "nav_reports", icon: "M3 3v18h18M8 17V9m5 8V5m5 12v-6" },
];

function hideSplash(onComplete) {
  const splash = document.getElementById("splash");
  if (!splash) { if (typeof onComplete === "function") onComplete(); return; }
  if (window.__splashRevealTimer) clearTimeout(window.__splashRevealTimer);

  if (!splash.classList.contains("splash--visible")) {
    // Never actually shown (work finished before the reveal delay) — remove instantly, no wait at all.
    splash.style.display = "none";
    if (typeof onComplete === "function") onComplete();
    return;
  }

  // It was shown, so fade it out immediately — no artificial minimum hold.
  splash.classList.add("splash--exit");
  setTimeout(() => {
    splash.style.display = "none";
    if (typeof onComplete === "function") onComplete();
  }, 300);
}

function renderShell({ active, title }) {
  if (document.querySelector(".app-shell")) return; // already rendered — avoid duplicating on a later auth-state change
  const user = auth.currentUser;
  const shellHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <img src="../assets/logo-white.png" alt="Gharana — Mortgage Management" style="width:100%;max-width:150px;display:block;">
      </div>
      <nav>
        ${NAV_ITEMS.map(i => navLink(i, active)).join("")}
      </nav>
      <div class="user">
        ${t("signed_in_as")}<br><strong style="color:#E8EEF7">${user ? user.email : ""}</strong>
        <div style="display:flex;gap:10px;margin-top:4px;">
          <a href="profile.html" class="btn btn-ghost btn-sm" style="padding-left:0;color:#8FA5C4;${active === "profile" ? "color:#F2D98A;" : ""}">${t("nav_profile")}</a>
          <button class="btn btn-ghost btn-sm" onclick="logout()" style="padding-left:0;color:#8FA5C4">${t("sign_out")}</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <h1>${title}</h1>
        <div id="topbarActions"></div>
        <a href="profile.html" class="topbar-profile-btn" title="Profile" aria-label="Profile">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
        </a>
      </div>
      <div class="content" id="pageContent"></div>
    </div>
  </div>
  <nav class="mobile-nav">
    ${NAV_ITEMS.map(i => mobileLink(i, active)).join("")}
  </nav>`;

  document.body.insertAdjacentHTML("afterbegin", shellHTML);
  hideSplash();

  // move any pre-existing body content (written by the page) into #pageContent
  const content = document.getElementById("pageContent");
  const staged = document.getElementById("stagedContent");
  if (staged) {
    content.innerHTML = staged.innerHTML;
    staged.remove();
  }

  wrapTablesForScroll(content);
}

// Wraps every <table> in a horizontally-scrollable container, so wide
// tables (interest breakdowns, loan lists, etc.) scroll cleanly on a phone
// instead of squeezing columns unreadably or breaking row alignment.
function wrapTablesForScroll(root) {
  root.querySelectorAll("table").forEach((table) => {
    if (table.parentElement.classList.contains("table-scroll")) return;
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    table.parentElement.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}

function navLink(item, active) {
  return `<a href="${item.href}" class="${item.key === active ? "active" : ""}">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"/></svg>
    ${t(item.i18nKey)}
  </a>`;
}
function mobileLink(item, active) {
  return `<a href="${item.href}" class="${item.key === active ? "active" : ""}">
    <span class="nav-icon-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"/></svg>
    </span>
    ${t(item.i18nKey)}
  </a>`;
}

function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }

async function uploadPhoto(file, path) {
  const ref = storage.ref(path);
  const uploadTask = ref.put(file);
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timed out — check your connection and Storage rules")), 30000));
  await Promise.race([uploadTask, timeout]);
  return await ref.getDownloadURL();
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtMoney(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function monthKey(d) {
  const dt = d.toDate ? d.toDate() : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
function yearKey(d) {
  const dt = d.toDate ? d.toDate() : new Date(d);
  return String(dt.getFullYear());
}
function dayKey(d) {
  const dt = d.toDate ? d.toDate() : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function dayLabel(key) {
  return new Date(key).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function quarterKey(d) {
  const dt = d.toDate ? d.toDate() : new Date(d);
  const q = Math.floor(dt.getMonth() / 3) + 1;
  return `${dt.getFullYear()}-Q${q}`;
}
function quarterLabel(key) {
  const [y, q] = key.split("-Q");
  return `Q${q} ${y}`;
}
function halfKey(d) {
  const dt = d.toDate ? d.toDate() : new Date(d);
  const h = dt.getMonth() < 6 ? 1 : 2;
  return `${dt.getFullYear()}-H${h}`;
}
function halfLabel(key) {
  const [y, h] = key.split("-H");
  return `H${h} ${y}`;
}

// Log a business action against a loan, for the Activity/audit trail.
async function logActivity(loanId, action, detail) {
  try {
    await db.collection("activityLog").add({
      loanId,
      action,
      detail: detail || "",
      byEmail: (auth.currentUser && auth.currentUser.email) || "unknown",
      at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("Activity log failed (non-blocking):", err);
  }
}
