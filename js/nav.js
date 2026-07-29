// ============================================================
// SHARED APP SHELL — sidebar + mobile bottom nav + topbar
// Call renderShell({ active: 'dashboard', title: 'Dashboard' }) from each page.
// ============================================================

const NAV_ITEMS = [
  { key: "dashboard", href: "dashboard.html", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { key: "customers", href: "customers.html", label: "Customers", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
  { key: "loans", href: "loans.html", label: "Loans", icon: "M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" },
  { key: "loan-create", href: "loan-create.html", label: "New Loan", icon: "M12 5v14M5 12h14" },
  { key: "reports", href: "reports.html", label: "Reports", icon: "M3 3v18h18M8 17V9m5 8V5m5 12v-6" },
];

function renderShell({ active, title }) {
  const user = auth.currentUser;
  const shellHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">Gharana Ledger</div>
        <div class="sub">Shah Jewellers · Gold &amp; Silver Loans</div>
      </div>
      <nav>
        ${NAV_ITEMS.map(i => navLink(i, active)).join("")}
      </nav>
      <div class="user">
        Signed in as<br><strong style="color:#EFE9DC">${user ? user.email : ""}</strong>
        <div><button class="btn btn-ghost btn-sm" onclick="logout()" style="padding-left:0;color:#B8AF9E">Sign out</button></div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <h1>${title}</h1>
        <div id="topbarActions"></div>
      </div>
      <div class="content" id="pageContent"></div>
    </div>
  </div>
  <nav class="mobile-nav">
    ${NAV_ITEMS.map(i => mobileLink(i, active)).join("")}
  </nav>`;

  document.body.insertAdjacentHTML("afterbegin", shellHTML);
  document.body.classList.remove("loading");

  // move any pre-existing body content (written by the page) into #pageContent
  const content = document.getElementById("pageContent");
  const staged = document.getElementById("stagedContent");
  if (staged) {
    content.innerHTML = staged.innerHTML;
    staged.remove();
  }
}

function navLink(item, active) {
  return `<a href="${item.href}" class="${item.key === active ? "active" : ""}">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"/></svg>
    ${item.label}
  </a>`;
}
function mobileLink(item, active) {
  return `<a href="${item.href}" class="${item.key === active ? "active" : ""}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"/></svg>
    ${item.label}
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
