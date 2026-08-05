// ============================================================
// verify.js — public receipt verification, no login required.
//
// Deliberately self-contained rather than reusing nav.js/interest.js —
// those assume the authenticated app shell (sidebar, requireAuth, etc.)
// which doesn't exist on this page. Only a couple of tiny formatting
// helpers are actually needed here.
// ============================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

async function runVerification() {
  const card = document.getElementById("verifyCard");
  const receiptNumber = new URLSearchParams(location.search).get("r");

  if (!receiptNumber) {
    renderNotFound(card, "No receipt number was given.");
    return;
  }

  try {
    const doc = await db.collection("receipts").doc(receiptNumber).get();
    if (!doc.exists) {
      renderNotFound(card, "This receipt number could not be found.");
      return;
    }
    renderVerified(card, doc.data());
  } catch (err) {
    console.error("Verification lookup failed:", err);
    renderNotFound(card, "Couldn't check this receipt right now — please try again in a moment.");
  }
}

function renderVerified(card, r) {
  card.innerHTML = `
    ${r.shopLogoUrl ? `<img src="${r.shopLogoUrl}" class="verify-logo" alt="">` : ""}
    <div class="verify-shopname">${escapeHtml(r.shopName || "")}</div>
    <div class="verify-status-icon ok">✓</div>
    <div class="verify-status-title ok">Genuine Receipt</div>
    <div class="verify-status-sub">This receipt was issued by ${escapeHtml(r.shopName || "the shop")} and matches our records.</div>
    <div class="verify-details">
      <div class="verify-row"><span class="l">Receipt type</span><span class="v">${escapeHtml(r.typeLabel || "")}</span></div>
      <div class="verify-row"><span class="l">Receipt #</span><span class="v">${escapeHtml(r.receiptNumber || "")}</span></div>
      <div class="verify-row"><span class="l">Date</span><span class="v">${fmtDate(r.date)}</span></div>
      ${r.amount > 0 ? `<div class="verify-row"><span class="l">Amount</span><span class="v">${fmtMoney(r.amount)}</span></div>` : ""}
    </div>
    <div class="verify-footer">Verified via Gharana — Mortgage Management</div>
  `;
}

function renderNotFound(card, message) {
  card.innerHTML = `
    <div class="verify-status-icon bad">⚠</div>
    <div class="verify-status-title bad">Could Not Verify</div>
    <div class="verify-status-sub">${escapeHtml(message)}</div>
    <div class="verify-footer">If you believe this is an error, please contact the shop directly.</div>
  `;
}

runVerification();
