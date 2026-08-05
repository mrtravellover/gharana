// ============================================================
// receipt.js — Professional Receipt Generator.
//
// Five receipt types: Loan, Interest, Renewal, Payment, Gold Return.
// Reuses the exact same print mechanism already in this app
// (#printReceiptArea + window.print()) rather than adding a PDF
// library — every browser's print dialog already has a "Save as PDF"
// option, so this gets PDF download and physical printing from one
// mechanism, with zero new dependencies for that part.
//
// The one genuinely new dependency is a small QR code library
// (qrcodejs, from cdnjs — same CDN already used for fonts) since
// there's no way to generate a QR code with plain browser APIs.
// The QR encodes a short text summary of the receipt (shop, receipt
// number, amount, date) for quick reference — there's no hosted
// verification page to link to, since this app has no public/logged-
// out pages.
//
// SHOP_INFO is loaded from Firestore (edited on the Profile page's "Shop
// details" section) — see loadShopInfo() below. Not hardcoded, so this
// works correctly for whichever shop the app is actually deployed for.
// ============================================================

// Loaded dynamically from Firestore (settings/shop, edited on the Profile
// page) rather than hardcoded — a fixed shop name/address in the source
// code would be wrong the moment this app is used for any shop other than
// the one it was originally built for. The fallback below is deliberately
// generic, not another business's real details, so an unconfigured
// deployment doesn't quietly show the wrong shop's name on a receipt.
let SHOP_INFO = {
  name: "Your Shop Name",
  tagline: "",
  address: "Set your shop details in Profile → Shop Details",
  phone: "",
  logoUrl: "",
};

async function loadShopInfo() {
  try {
    const doc = await db.collection("settings").doc("shop").get();
    if (doc.exists) {
      const d = doc.data();
      SHOP_INFO = {
        name: d.name || SHOP_INFO.name,
        tagline: d.tagline || "",
        address: d.address || SHOP_INFO.address,
        phone: d.phone || "",
        logoUrl: d.logoUrl || "",
      };
    }
  } catch (err) {
    console.error("Couldn't load shop details for receipts — using placeholder:", err);
  }
}

const RECEIPT_TYPES = {
  loan: { label: "Loan Receipt", prefix: "LN" },
  interest: { label: "Interest Receipt", prefix: "INT" },
  renewal: { label: "Renewal Receipt", prefix: "REN" },
  payment: { label: "Payment Receipt", prefix: "PAY" },
  gold_return: { label: "Gold Return Receipt", prefix: "GR" },
};

function generateReceiptNumber(type) {
  const prefix = RECEIPT_TYPES[type].prefix;
  const stamp = Date.now().toString().slice(-8);
  return `${prefix}-${stamp}`;
}

function receiptTermsHTML() {
  return `
    <div class="receipt-terms">
      <strong>Terms &amp; Conditions:</strong> This receipt is issued as a record of the transaction described above and does not itself constitute the loan agreement.
      Interest continues to accrue on any outstanding principal until fully repaid. Pledged items remain in the shop's custody until the loan is fully settled and the item is formally released.
      Please retain this receipt for your records and present it when making further payments or collecting pledged items.
    </div>`;
}

function receiptFooterHTML() {
  return `<div class="receipt-footer">${escapeHtml(SHOP_INFO.name)} · ${escapeHtml(SHOP_INFO.address)}${SHOP_INFO.phone ? " · " + escapeHtml(SHOP_INFO.phone) : ""}</div>`;
}

function receiptHeaderHTML() {
  const logoSrc = SHOP_INFO.logoUrl || "../assets/icon-logo-navy.png";
  return `
    <div class="receipt-header">
      <img src="${logoSrc}" width="52" height="52" alt="${escapeHtml(SHOP_INFO.name)}">
      <div class="shop-info">
        <strong>${escapeHtml(SHOP_INFO.name)}</strong>
        ${escapeHtml(SHOP_INFO.tagline)}<br>
        ${escapeHtml(SHOP_INFO.address)}${SHOP_INFO.phone ? "<br>" + escapeHtml(SHOP_INFO.phone) : ""}
      </div>
    </div>`;
}

function receiptTitleRowHTML(type, receiptNumber, date) {
  return `
    <div class="receipt-title-row">
      <div>
        <span class="receipt-type-badge">${escapeHtml(RECEIPT_TYPES[type].label)}</span>
        <h1>${escapeHtml(RECEIPT_TYPES[type].label)}</h1>
      </div>
      <div class="receipt-meta">
        Receipt #: <strong>${escapeHtml(receiptNumber)}</strong><br>
        Date: <strong>${fmtDate(date)}</strong><br>
        Printed: ${new Date().toLocaleString("en-IN")}
      </div>
    </div>`;
}

function receiptSignRowHTML(signatureDataUrl) {
  return `
    <div class="sign-row">
      <div class="${signatureDataUrl ? "has-signature" : ""}">
        ${signatureDataUrl
          ? `<img src="${signatureDataUrl}" class="sign-image" width="180" height="50" alt="Customer signature"><div class="sign-image-caption">Customer signature (captured digitally)</div>`
          : "Customer signature"}
      </div>
      <div>Authorized signature</div>
    </div>`;
}

// A small canvas-based QR code, rendered client-side via the qrcodejs
// library (loaded from cdnjs), encoding a link to the public verification
// page (verify.html) rather than plain text — scanning it lets a customer
// confirm the receipt is genuine without needing to be signed into the app.
function receiptQrHTML(id) {
  return `<div class="receipt-qr" id="${id}"></div>`;
}

function renderReceiptQr(containerId, text) {
  const el = document.getElementById(containerId);
  if (!el || typeof QRCode === "undefined") return;
  el.innerHTML = "";
  new QRCode(el, { text, width: 80, height: 80, correctLevel: QRCode.CorrectLevel.M });
}

// The one number shown on the public verification page — deliberately just
// one figure per type, matching the "bare minimum" scope: shop name,
// amount, date, nothing about the customer or loan.
function getReceiptHeadlineAmount(type, ctx) {
  if (type === "loan") return ctx.summary.totalPayableToday;
  if (type === "payment") return ctx.payment.amount;
  if (type === "interest") return ctx.payment.interestPortion;
  if (type === "renewal") return ctx.disbursement.amount;
  return 0; // gold_return has no meaningful monetary figure — an item was returned, not money exchanged
}

// ---------- Building each receipt type's body ----------
function buildLoanReceiptBody(ctx) {
  const { loan, ornaments, disbursements, payments, summary } = ctx;
  const totalPaid = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return `
    <p>Customer: <strong>${escapeHtml(loan.customerName)}</strong>${loan.pledgedByMode === "other" ? ` (item belongs to ${escapeHtml(loan.pledgedByLabel)})` : ""}</p>
    <p>Loan #: <strong>${escapeHtml(loan.loanNumber)}</strong> &nbsp; Loan date: ${fmtDate(loan.date)} &nbsp; Status: ${loan.status}</p>
    <table>
      <thead><tr><th>Item</th><th>Metal</th><th>Weight (g)</th><th>Qty</th><th>Category</th></tr></thead>
      <tbody>${ornaments.map((o) => `<tr><td>${escapeHtml(o.itemName)}</td><td>${o.metalType}</td><td>${o.weight}</td><td>${o.qty}</td><td>${o.category || "—"}</td></tr>`).join("")}</tbody>
    </table>
    <table>
      <thead><tr><th>Disbursed on</th><th>Amount</th><th>Rate/mo</th></tr></thead>
      <tbody>${disbursements.map((d) => `<tr><td>${fmtDate(d.date)}</td><td>${fmtMoney(d.amount)}</td><td>${d.rate}%</td></tr>`).join("")}</tbody>
    </table>
    <p class="receipt-total">Amount already paid: ${fmtMoney(totalPaid)}</p>
    <p class="receipt-total">Principal outstanding: ${fmtMoney(summary.principalOutstanding)}</p>
    <p class="receipt-total">Interest due: ${fmtMoney(summary.interestOutstanding)}</p>
    <p class="receipt-total">Total payable: ${fmtMoney(summary.totalPayableToday)}</p>`;
}

function buildPaymentReceiptBody(ctx) {
  const { loan, payment } = ctx;
  return `
    <p>Customer: <strong>${escapeHtml(loan.customerName)}</strong></p>
    <p>Loan #: <strong>${escapeHtml(loan.loanNumber)}</strong></p>
    <table>
      <thead><tr><th>Date</th><th>Amount paid</th><th>→ Interest</th><th>→ Principal</th></tr></thead>
      <tbody><tr><td>${fmtDate(payment.date)}</td><td>${fmtMoney(payment.amount)}</td><td>${fmtMoney(payment.interestPortion)}</td><td>${fmtMoney(payment.principalPortion)}</td></tr></tbody>
    </table>
    <p class="receipt-total">Amount received: ${fmtMoney(payment.amount)}</p>
    ${payment.remarks ? `<p style="font-size:12.5px;color:#555;">Note: ${escapeHtml(payment.remarks)}</p>` : ""}`;
}

function buildInterestReceiptBody(ctx) {
  const { loan, payment } = ctx;
  return `
    <p>Customer: <strong>${escapeHtml(loan.customerName)}</strong></p>
    <p>Loan #: <strong>${escapeHtml(loan.loanNumber)}</strong></p>
    <table>
      <thead><tr><th>Date</th><th>Interest collected</th></tr></thead>
      <tbody><tr><td>${fmtDate(payment.date)}</td><td>${fmtMoney(payment.interestPortion)}</td></tr></tbody>
    </table>
    <p class="receipt-total">Interest received: ${fmtMoney(payment.interestPortion)}</p>`;
}

function buildRenewalReceiptBody(ctx) {
  const { loan, disbursement } = ctx;
  return `
    <p>Customer: <strong>${escapeHtml(loan.customerName)}</strong></p>
    <p>Loan #: <strong>${escapeHtml(loan.loanNumber)}</strong> — mortgage renewed (re-lent)</p>
    <table>
      <thead><tr><th>Date</th><th>Amount given</th><th>Rate/mo</th></tr></thead>
      <tbody><tr><td>${fmtDate(disbursement.date)}</td><td>${fmtMoney(disbursement.amount)}</td><td>${disbursement.rate}%</td></tr></tbody>
    </table>
    <p class="receipt-total">Renewal amount: ${fmtMoney(disbursement.amount)}</p>
    ${disbursement.reason ? `<p style="font-size:12.5px;color:#555;">Reason: ${escapeHtml(disbursement.reason)}</p>` : ""}`;
}

function buildGoldReturnReceiptBody(ctx) {
  const { loan, ornament } = ctx;
  return `
    <p>Customer: <strong>${escapeHtml(loan.customerName)}</strong></p>
    <p>Loan #: <strong>${escapeHtml(loan.loanNumber)}</strong></p>
    <table>
      <thead><tr><th>Item</th><th>Metal</th><th>Weight (g)</th><th>Qty</th></tr></thead>
      <tbody><tr><td>${escapeHtml(ornament.itemName)}</td><td>${ornament.metalType}</td><td>${ornament.weight}</td><td>${ornament.qty}</td></tr></tbody>
    </table>
    <p class="receipt-total">Item returned to customer</p>
    <p style="font-size:12.5px;color:#555;">Please verify the item(s) above before leaving the shop.</p>`;
}

// ---------- Main entry point ----------
// type: one of RECEIPT_TYPES keys. ctx: the data needed for that type
// (loan always required; payment/disbursement/ornament as relevant).
async function generateReceipt(type, ctx, signatureDataUrl) {
  const receiptNumber = generateReceiptNumber(type);
  const date = ctx.payment ? ctx.payment.date : ctx.disbursement ? ctx.disbursement.date : ctx.ornament ? new Date() : ctx.loan.date;
  const qrId = "receiptQr_" + Date.now();

  const bodyBuilders = {
    loan: buildLoanReceiptBody, payment: buildPaymentReceiptBody, interest: buildInterestReceiptBody,
    renewal: buildRenewalReceiptBody, gold_return: buildGoldReturnReceiptBody,
  };

  const area = document.getElementById("printReceiptArea");
  area.innerHTML = `
    ${receiptHeaderHTML()}
    ${receiptTitleRowHTML(type, receiptNumber, date)}
    ${bodyBuilders[type](ctx)}
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;">
      ${receiptQrHTML(qrId)}
    </div>
    ${receiptSignRowHTML(signatureDataUrl)}
    ${receiptTermsHTML()}
    ${receiptFooterHTML()}
  `;

  // Save a genuinely minimal public record BEFORE rendering the QR, so the
  // QR always points at something that actually exists to verify. Only the
  // fields explicitly approved for public exposure — no loanId, customerId,
  // or createdBy — since anyone who can `get` this document sees every
  // field in it, not just what a page's UI chooses to display. Internal
  // traceability back to the loan already exists via the activity log
  // entry logged below, so nothing is lost by keeping this document minimal.
  try {
    await db.collection("receipts").doc(receiptNumber).set({
      receiptNumber,
      type,
      typeLabel: RECEIPT_TYPES[type].label,
      amount: round2(getReceiptHeadlineAmount(type, ctx)),
      date: date && date.toDate ? date : firebase.firestore.Timestamp.fromDate(new Date(date)),
      shopName: SHOP_INFO.name,
      shopLogoUrl: SHOP_INFO.logoUrl || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("Couldn't save receipt record — QR verification won't work for this one:", err);
  }

  const verifyUrl = `${window.location.origin}/verify.html?r=${encodeURIComponent(receiptNumber)}`;
  renderReceiptQr(qrId, verifyUrl);

  if (typeof logActivity === "function") {
    logActivity({ customerId: ctx.loan.customerId, loanId: ctx.loan.id, eventType: "receipt_generated", action: `${RECEIPT_TYPES[type].label} generated`, detail: receiptNumber });
  }

  return receiptNumber;
}

function printCurrentReceipt() {
  window.print();
}

// WhatsApp share of a text summary — not the actual PDF/printed file,
// since there's no reliable way to attach a generated file to a WhatsApp
// message from a plain web page. Print/Save-as-PDF handles the file itself;
// this is for quickly notifying the customer.
function shareReceiptWhatsApp(type, ctx, receiptNumber) {
  const loan = ctx.loan;
  let amountLine = "";
  if (ctx.payment) amountLine = `Amount: ${fmtMoney(ctx.payment.amount)}`;
  else if (ctx.disbursement) amountLine = `Amount: ${fmtMoney(ctx.disbursement.amount)}`;
  else if (ctx.summary) amountLine = `Total payable: ${fmtMoney(ctx.summary.totalPayableToday)}`;

  const message = `${SHOP_INFO.name}\n${RECEIPT_TYPES[type].label}\nReceipt #: ${receiptNumber}\nLoan #: ${loan.loanNumber}\nCustomer: ${loan.customerName}\n${amountLine}\nDate: ${fmtDate(new Date())}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
}
