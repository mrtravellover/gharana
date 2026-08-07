// ============================================================
// GHARANA OWL ASSISTANT — floating chat widget for account
// lookups and quick interest what-ifs.
//
// STRICTLY ADDITIVE, same spirit as login-owl.js:
//  - Injects its own <style> and DOM, doesn't touch any existing
//    page markup, nav.js, or auth.js.
//  - Only reads from Firestore (customers, loans + their
//    disbursements/payments subcollections) — never writes.
//  - Reuses calcLoanSummary() from interest.js UNCHANGED for
//    account lookups, so those numbers always match the real
//    loan pages. The quick what-if calculator below also reuses
//    interest.js's own periodInterest() (the 365/366-day method,
//    with the 1-month-minimum floor) so a quick "10000 2%
//    12-08-2024" check always matches what a real disbursement
//    would show on the actual loan page.
//    interest.js MUST be loaded on the page before this file.
//
// USAGE: add one line near the end of <body>, after firebase-config.js,
// auth.js, and interest.js are already included:
//   <script src="../js/owl-assistant.js"></script>
// (or "js/owl-assistant.js" for pages outside /pages/)
// ============================================================

(function () {
  "use strict";

  if (typeof auth === "undefined" || typeof db === "undefined") {
    console.warn("owl-assistant.js: firebase-config.js must be loaded first — assistant disabled on this page.");
    return;
  }
  if (typeof calcLoanSummary !== "function" || typeof periodInterest !== "function" || typeof yearFraction !== "function") {
    console.warn("owl-assistant.js: interest.js must be loaded first — assistant disabled on this page.");
    return;
  }
  if (!window.OwlNLU || !window.OwlNLU.intentParser || !window.OwlNLU.ConversationMemory) {
    console.warn("owl-assistant.js: js/owl-nlu/*.js modules must be loaded first — assistant disabled on this page.");
    return;
  }

  const LOTTIE_OWL_SRC = "https://lottie.host/c7668bc7-1b61-4958-a268-68939d2ba27a/dhuKIcqJ81.lottie";
  const DOTLOTTIE_CDN = "https://unpkg.com/@lottiefiles/dotlottie-wc@0.9.4/dist/dotlottie-wc.js";

  const STYLE = `
    .owl-w-btn{position:fixed;right:24px;bottom:24px;display:none;align-items:center;gap:10px;background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;padding:8px 20px 8px 8px;border:none;border-radius:30px;cursor:pointer;box-shadow:0 10px 28px rgba(11,42,91,.35);z-index:2000;font-size:14px;font-weight:700;font-family:inherit;touch-action:manipulation;}
    .owl-w-btn.visible{display:inline-flex;}
    body.modal-open .owl-w-btn,body.modal-open .owl-w-phone{display:none !important;}
    @media (max-width:860px){ .owl-w-btn{ bottom:96px;right:18px; } } /* clears the floating mobile nav pill */
    .owl-w-launcher-owl{width:34px;height:34px;border-radius:50%;background:#fff;flex-shrink:0;position:relative;overflow:hidden;}
    .owl-w-launcher-owl .owl-w-launcher-lottie{width:100%;height:100%;display:block;}
    .owl-w-launcher-owl .owl-w-launcher-fallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:18px;}
    /* Desktop/laptop: just the bare owl, no pill/circle/label — the FAB's old spot */
    @media (min-width:861px){
      .owl-w-btn{background:none;box-shadow:none;padding:0;border-radius:0;width:64px;height:64px;justify-content:center;}
      .owl-w-btn .owl-w-launcher-owl{width:64px;height:64px;background:none;border-radius:0;filter:drop-shadow(0 6px 14px rgba(11,42,91,.35));}
      .owl-w-btn .owl-w-launcher-label{display:none;}
    }
    .owl-w-phone{
      position:fixed;right:24px;bottom:24px;width:380px;max-width:calc(100vw - 36px);
      max-height:min(600px, calc(100vh - 100px));
      background:var(--paper);border-radius:20px;box-shadow:0 20px 60px rgba(11,42,91,.3);
      display:flex;flex-direction:column;border:1px solid var(--line);
      font-family:inherit;z-index:2000;overflow:hidden;
    }
    @media (max-width:860px){ .owl-w-phone{ bottom:96px;right:18px; } }
    @media (max-width:480px){ .owl-w-phone{ right:10px; width:calc(100vw - 20px); } }
    .owl-w-phone.owl-w-hidden{display:none;}
    .owl-w-topbar{background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;cursor:pointer;touch-action:manipulation;}
    .owl-w-avatar-wrap{height:88px;min-width:88px;flex-shrink:0;position:relative;display:flex;align-items:center;justify-content:center;}
    .owl-w-avatar{width:auto;height:86px;max-width:140px;object-fit:contain;display:block;flex-shrink:0;}
    .owl-w-fallback{display:none;}
    .owl-w-topbar h1{font-size:15px;margin:0;font-weight:700;color:#fff;font-family:var(--font-body, inherit);}
    .owl-w-topbar p{font-size:11.5px;margin:2px 0 0;opacity:.85;color:#fff;font-family:var(--font-body, inherit);}
    .owl-w-status-dot{width:7px;height:7px;border-radius:50%;background:#10B981;display:inline-block;margin-right:5px;box-shadow:0 0 0 3px rgba(16,185,129,.25);}
    .owl-w-collapse-btn{background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;font-size:13px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;touch-action:manipulation;}
    .owl-w-chat{padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--bg);overflow-y:auto;flex:1;min-height:0;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;}
    html.owl-w-locked,body.owl-w-locked{overflow:hidden;overscroll-behavior:none;height:100%;}
    .owl-w-msg{max-width:82%;padding:11px 14px;border-radius:14px;font-size:13.5px;line-height:1.5;flex-shrink:0;}
    .owl-w-msg.bot{background:var(--paper);border:1px solid var(--line);align-self:flex-start;border-bottom-left-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.04);color:var(--ink);}
    .owl-w-msg.user{background:linear-gradient(135deg,var(--secondary),var(--primary));color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
    .owl-w-msg.bot.card{padding:0;overflow:hidden;max-width:92%;}
    .owl-w-card-head{background:var(--primary);color:#fff;padding:11px 14px;}
    .owl-w-card-head .t{font-weight:700;font-size:14px;display:block;line-height:1.3;}
    .owl-w-card-head .s{font-weight:500;font-size:11.5px;opacity:.75;display:block;margin-top:2px;line-height:1.3;}
    .owl-w-card-body{padding:12px 14px;}
    .owl-w-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 8px;padding:5px 0;font-size:13px;border-bottom:1px dashed var(--line);}
    .owl-w-row:last-child{border-bottom:none;}
    .owl-w-row .l{color:var(--ink-soft);flex:1 1 auto;min-width:80px;}
    .owl-w-row .v{font-weight:700;color:var(--ink);text-align:right;white-space:nowrap;flex-shrink:0;margin-left:auto;}
    .owl-w-link{color:var(--secondary);text-decoration:underline;cursor:pointer;font-weight:700;}
    .owl-w-link:hover{color:var(--primary);}
    .owl-w-card-head .owl-w-link{color:#fff;}
    .owl-w-hint{font-size:11.5px;color:var(--ink-soft);margin-top:2px;}
    .owl-w-v-gold{color:var(--gold-deep);}
    .owl-w-v-emerald{color:var(--good);}
    .owl-w-loan-item{background:var(--paper-soft);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-top:8px;}
    .owl-w-loan-item .owl-w-row{border:none;padding:2px 0;}
    .owl-w-chips{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px 0;flex-shrink:0;}
    .owl-w-chip{background:var(--paper);border:1px solid var(--line);color:var(--secondary);font-size:12px;padding:6px 11px;border-radius:20px;cursor:pointer;touch-action:manipulation;}
    .owl-w-footer{background:var(--paper);flex-shrink:0;}
    .owl-w-inputbar{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line);background:var(--paper);}
    .owl-w-inputbar input{flex:1;border:1px solid var(--line);border-radius:22px;padding:10px 15px;font-size:13.5px;outline:none;font-family:inherit;touch-action:manipulation;background:var(--bg);color:var(--ink);}
    .owl-w-inputbar input:focus{border-color:var(--secondary);}
    .owl-w-inputbar button{width:38px;height:38px;border-radius:50%;border:none;background:var(--gold);color:#fff;font-size:15px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;touch-action:manipulation;}
  `;

  function injectStyle() {
    const el = document.createElement("style");
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function injectMarkup() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="owl-w-phone owl-w-hidden" id="owlWPhone">
        <div class="owl-w-topbar" id="owlWTopbar">
          <div class="owl-w-avatar-wrap">
            <dotlottie-wc class="owl-w-avatar" id="owlWLottie" src="${LOTTIE_OWL_SRC}" autoplay loop></dotlottie-wc>
            <svg class="owl-w-avatar owl-w-fallback" id="owlWFallback" viewBox="0 0 100 100" style="display:none;">
              <ellipse cx="50" cy="58" rx="34" ry="30" fill="#D4A017"/>
              <ellipse cx="30" cy="30" rx="14" ry="14" fill="#D4A017"/>
              <ellipse cx="70" cy="30" rx="14" ry="14" fill="#D4A017"/>
              <circle cx="35" cy="52" r="14" fill="#fff"/><circle cx="65" cy="52" r="14" fill="#fff"/>
              <circle cx="35" cy="52" r="6" fill="#0B2A5B"/><circle cx="65" cy="52" r="6" fill="#0B2A5B"/>
              <path d="M46 62 L54 62 L50 70 Z" fill="#a8790f"/>
            </svg>
          </div>
          <div style="flex:1;">
            <h1>Gharana Assistant</h1>
            <p><span class="owl-w-status-dot"></span>Online — knows your accounts</p>
          </div>
          <button class="owl-w-collapse-btn" id="owlWCollapseBtn" title="Collapse chat" type="button">▾</button>
        </div>
        <div class="owl-w-chat" id="owlWChat"></div>
        <div class="owl-w-chips" id="owlWChips">
          <div class="owl-w-chip" data-preset="check account of ">Check a customer</div>
          <div class="owl-w-chip" data-preset="10000 2% 12-08-2024">10000 2% 12-08-2024</div>
          <div class="owl-w-chip" data-preset="10000 2% 12-08-2024 CA">...CA (compound annually)</div>
        </div>
        <div class="owl-w-footer">
          <form class="owl-w-inputbar" id="owlWForm">
            <input id="owlWInput" type="text" placeholder="Customer name, or amount+rate+date..." enterkeyhint="send">
            <button id="owlWSendBtn" type="submit">➤</button>
          </form>
        </div>
      </div>
      <button class="owl-w-btn visible" id="owlWLauncher" type="button">
        <span class="owl-w-launcher-owl">
          <dotlottie-wc class="owl-w-launcher-lottie" id="owlWLauncherLottie" src="${LOTTIE_OWL_SRC}" autoplay loop></dotlottie-wc>
          <span class="owl-w-launcher-fallback" id="owlWLauncherFallback">🦉</span>
        </span>
        <span class="owl-w-launcher-label">Gharana Assistant</span>
      </button>
    `;
    document.body.appendChild(wrap);
  }

  /* ============================================================
     PARSING is now handled by the modular NLU pipeline in js/owl-nlu/:
     numberParser -> dateParser -> entityExtractor -> intentParser ->
     responseGenerator (+ interestCalculator, which wraps this page's
     own interest.js). See botReply() below for how they're wired together.
     ============================================================ */
  const conversationMemory = new window.OwlNLU.ConversationMemory();

  /* ============================================================
     CHAT UI + FIRESTORE-BACKED HANDLERS
     ============================================================ */
  let chatEl, phoneEl, launcherEl, owlEl, owlFallbackEl;
  let owlReady = false, owlMarkers = [];
  const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function addBotText(html) {
    const div = document.createElement("div");
    div.className = "owl-w-msg bot";
    div.innerHTML = html;
    chatEl.appendChild(div);
    scrollChatToBottom();
  }
  function addUserText(text) {
    const div = document.createElement("div");
    div.className = "owl-w-msg user";
    div.textContent = text;
    chatEl.appendChild(div);
    scrollChatToBottom();
  }
  function addCard(html) {
    const div = document.createElement("div");
    div.className = "owl-w-msg bot card";
    div.innerHTML = html;
    chatEl.appendChild(div);
    scrollChatToBottom();
  }
  function scrollChatToBottom() {
    // Scrolls the chat panel itself, not the whole page — it's a fixed overlay now.
    requestAnimationFrame(() => { chatEl.scrollTop = chatEl.scrollHeight; });
  }
  function setOwlState(state) {
    if (!owlReady || reducedMotion || !owlEl || !("marker" in owlEl)) return;
    const candidates = { thinking: ["loading", "thinking", "think"], happy: ["success", "happy"], idle: ["idle"], "": ["idle"] }[state] || ["idle"];
    try {
      const match = candidates.find((n) => owlMarkers.includes(n));
      if (match) { owlEl.marker = match; if (typeof owlEl.play === "function") owlEl.play(); }
      if (state === "happy") setTimeout(() => setOwlState("idle"), 900);
    } catch (e) { /* non-fatal */ }
  }

  // ---- Account lookup: real Firestore reads, real calcLoanSummary() from interest.js ----
  // Renders one loan's summary card directly — used when a receipt/loan
  // number was matched exactly, so there's no need to go via a customer.
  async function renderSingleLoanCard(loan, asOfDate) {
    const useDate = asOfDate || new Date();
    const isFuture = useDate.getTime() > Date.now() + 60000;
    try {
      const loanRef = db.collection("loans").doc(loan.id);
      const [dSnap, pSnap] = await Promise.all([loanRef.collection("disbursements").get(), loanRef.collection("payments").get()]);
      const disbursements = dSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const payments = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const summary = calcLoanSummary(disbursements, payments, useDate);

      addCard(`
        <div class="owl-w-card-head"><span class="t"><a class="owl-w-link" href="loan-detail.html?id=${loan.id}">${escapeHtml(loan.loanNumber)}</a></span><span class="s">${isFuture ? `As of ${fmtDate(useDate)} · ` : ""}${escapeHtml(loan.customerName || "")} · ${escapeHtml(loan.status)}</span></div>
        <div class="owl-w-card-body">
          <div class="owl-w-row"><span class="l">Principal outstanding</span><span class="v">${fmtMoney(summary.principalOutstanding)}</span></div>
          <div class="owl-w-row"><span class="l">${isFuture ? `Interest as of ${fmtDate(useDate)}` : "Interest due today"}</span><span class="v owl-w-v-gold">${fmtInterestDue(summary.interestOutstanding)}</span></div>
          <div class="owl-w-row" style="margin-top:6px;"><span class="l">${isFuture ? "Total payable then" : "Total payable today"}</span><span class="v owl-w-v-emerald">${fmtMoney(summary.totalPayableToday)}</span></div>
        </div>
      `);
      setOwlState("happy");
    } catch (err) {
      console.error("owl-assistant single-loan lookup failed:", err);
      addBotText("Sorry, I couldn't reach that loan's records just now — please try again.");
      setOwlState("");
    }
  }

  // Searches for a name among loans' "pledged by someone else" field —
  // covers the common case where the account is registered under one
  // person (e.g. Kavish Shah) but the actual pledged items/loan belong to
  // a family member (e.g. Vaishali), so a direct customer-name search alone
  // wouldn't find her.
  async function handlePledgedByFallback(name) {
    try {
      const lower = name.toLowerCase();
      const allLoansSnap = await db.collection("loans").get();
      const pledgedMatches = allLoansSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((l) => l.status !== "closed" && l.pledgedByMode === "other" && (l.pledgedByName || "").toLowerCase().includes(lower));

      if (!pledgedMatches.length) {
        addBotText(`I couldn't find a customer matching "<b>${escapeHtml(name)}</b>" — checked both registered account holders and "pledged by" names on loans. Try a full or partial name.`);
        setOwlState("");
        return;
      }

      const summaries = await Promise.all(
        pledgedMatches.map(async (l) => {
          const loanRef = db.collection("loans").doc(l.id);
          const [dSnap, pSnap] = await Promise.all([loanRef.collection("disbursements").get(), loanRef.collection("payments").get()]);
          const disbursements = dSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const payments = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return { loan: l, summary: calcLoanSummary(disbursements, payments) };
        })
      );

      let totalPrincipal = 0, totalInterest = 0;
      const rowsHtml = summaries
        .map(({ loan, summary }) => {
          totalPrincipal += summary.principalOutstanding;
          totalInterest += summary.interestOutstanding;
          return `<div class="owl-w-loan-item">
            <div class="owl-w-row"><span class="l"><a class="owl-w-link" href="loan-detail.html?id=${loan.id}">${escapeHtml(loan.loanNumber || "Loan")}</a></span><span class="v">${escapeHtml(loan.status)}</span></div>
            <div class="owl-w-row"><span class="l">Registered under</span><span class="v">${loan.customerId ? `<a class="owl-w-link" href="customer-profile.html?id=${loan.customerId}">${escapeHtml(loan.customerName || "—")}</a>` : escapeHtml(loan.customerName || "—")}</span></div>
            <div class="owl-w-row"><span class="l">Principal outstanding</span><span class="v">${fmtMoney(summary.principalOutstanding)}</span></div>
            <div class="owl-w-row"><span class="l">Interest due today</span><span class="v owl-w-v-gold">${fmtInterestDue(summary.interestOutstanding)}</span></div>
          </div>`;
        })
        .join("");

      addCard(`
        <div class="owl-w-card-head"><span class="t">${escapeHtml(pledgedMatches[0].pledgedByName)}</span><span class="s">Pledged under someone else's account — ${pledgedMatches.length} loan${pledgedMatches.length > 1 ? "s" : ""}</span></div>
        <div class="owl-w-card-body">
          ${rowsHtml}
          <div class="owl-w-row" style="margin-top:6px;"><span class="l">Total payable today</span><span class="v owl-w-v-emerald">${fmtMoney(round2(totalPrincipal + totalInterest))}</span></div>
        </div>
      `);
      setOwlState("happy");
    } catch (err) {
      console.error("owl-assistant pledged-by lookup failed:", err);
      addBotText("Sorry, I couldn't reach the loan records just now — please try again.");
      setOwlState("");
    }
  }

  async function handleAccountQuery(rawName, receiptNumber, projectionDate) {
    setOwlState("thinking");
    const asOfDate = projectionDate || new Date();
    const isFutureProjection = projectionDate && projectionDate.getTime() > Date.now() + 60000; // more than a minute ahead — treat as a real future projection, not just "now"

    // If a receipt/loan number was detected, try that first — a more precise
    // match than a name when the customer gives their exact loan number.
    if (receiptNumber) {
      try {
        const byNumber = await db.collection("loans").where("loanNumber", "==", receiptNumber).limit(1).get();
        if (!byNumber.empty) {
          const loanDoc = byNumber.docs[0];
          await renderSingleLoanCard({ id: loanDoc.id, ...loanDoc.data() }, asOfDate);
          return;
        }
      } catch (err) {
        console.error("owl-assistant receipt lookup failed:", err);
      }
      // Falls through to name search below if no exact match was found.
    }

    const name = (rawName || "").trim();
    if (!name) {
      addBotText(receiptNumber ? `I couldn't find a loan numbered "<b>${escapeHtml(receiptNumber)}</b>".` : "Which customer would you like me to check?");
      setOwlState("");
      return;
    }
    try {
      const custSnap = await db.collection("customers").get();
      const customers = custSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const lower = name.toLowerCase();
      const match =
        customers.find((c) => (c.name || "").toLowerCase().includes(lower)) ||
        customers.find((c) => lower.includes((c.name || "").split(" ")[0].toLowerCase()));

      if (!match) {
        await handlePledgedByFallback(name);
        return;
      }

      const [loanSnap, depositSnap] = await Promise.all([
        db.collection("loans").where("customerId", "==", match.id).get(),
        db.collection("customers").doc(match.id).collection("deposits").get(),
      ]);
      const loanDocs = loanSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => l.status !== "closed");

      // Surplus funds — fetch each deposit's withdrawals to work out what's
      // actually still remaining, same logic as the customer profile page.
      // (A future projection date doesn't change which withdrawals have
      // already happened — only the interest-so-far calculation below uses it.)
      const deposits = await Promise.all(
        depositSnap.docs.map(async (d) => {
          const dep = { id: d.id, ...d.data() };
          const wSnap = await db.collection("customers").doc(match.id).collection("deposits").doc(dep.id).collection("withdrawals").get();
          const given = wSnap.docs.map((w) => w.data()).filter((w) => w.status === "completed").reduce((s, w) => s + (Number(w.amount) || 0), 0);
          dep.remaining = round2(dep.amount - given);
          return dep;
        })
      );
      const activeDeposits = deposits.filter((d) => d.remaining > 0);

      if (!loanDocs.length && !activeDeposits.length) {
        addBotText(`<b>${escapeHtml(match.name)}</b> has no open loans or surplus funds on record.`);
        setOwlState("");
        return;
      }

      const loanSummaries = await Promise.all(
        loanDocs.map(async (l) => {
          const loanRef = db.collection("loans").doc(l.id);
          const [dSnap, pSnap] = await Promise.all([loanRef.collection("disbursements").get(), loanRef.collection("payments").get()]);
          const disbursements = dSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const payments = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return { loan: l, summary: calcLoanSummary(disbursements, payments, asOfDate) };
        })
      );

      let totalPrincipal = 0, totalInterest = 0;
      const interestLabel = isFutureProjection ? `Interest as of ${fmtDate(asOfDate)}` : "Interest due today";
      const loanRowsHtml = loanSummaries
        .map(({ loan, summary }, i) => {
          totalPrincipal += summary.principalOutstanding;
          totalInterest += summary.interestOutstanding;
          return `<div class="owl-w-loan-item">
            <div class="owl-w-row"><span class="l"><a class="owl-w-link" href="loan-detail.html?id=${loan.id}">${escapeHtml(loan.loanNumber || "Loan " + (i + 1))}</a></span><span class="v">${escapeHtml(loan.status)}</span></div>
            <div class="owl-w-row"><span class="l">Principal outstanding</span><span class="v">${fmtMoney(summary.principalOutstanding)}</span></div>
            <div class="owl-w-row"><span class="l">${interestLabel}</span><span class="v owl-w-v-gold">${fmtInterestDue(summary.interestOutstanding)}</span></div>
          </div>`;
        })
        .join("");

      let totalSurplusPayable = 0;
      const depositRowsHtml = activeDeposits
        .map((d) => {
          const interest = d.interestBearing && d.interestRate > 0 ? periodInterest(d.remaining, d.interestRate, d.depositedDate, asOfDate, "simple") : 0;
          const payable = round2(d.remaining + interest);
          totalSurplusPayable += payable;
          return `<div class="owl-w-loan-item">
            <div class="owl-w-row"><span class="l">Deposited ${fmtDate(d.depositedDate)}</span><span class="v">${fmtMoney(d.amount)}</span></div>
            <div class="owl-w-row"><span class="l">Remaining balance</span><span class="v owl-w-v-emerald" style="font-size:15px;">${fmtMoney(d.remaining)}</span></div>
            ${d.interestBearing ? `<div class="owl-w-row"><span class="l">Interest</span><span class="v owl-w-v-gold">${fmtMoney(interest)}</span></div>` : ""}
          </div>`;
        })
        .join("");

      addCard(`
        <div class="owl-w-card-head"><span class="t"><a class="owl-w-link" href="customer-profile.html?id=${match.id}">${escapeHtml(match.name)}</a></span><span class="s">${isFutureProjection ? `As of ${fmtDate(asOfDate)} · ` : ""}${loanDocs.length} open loan${loanDocs.length === 1 ? "" : "s"}${activeDeposits.length ? ` · ${activeDeposits.length} surplus deposit${activeDeposits.length === 1 ? "" : "s"}` : ""}</span></div>
        <div class="owl-w-card-body">
          <div class="owl-w-row"><span class="l">Mobile</span><span class="v">${escapeHtml(match.mobile || "—")}</span></div>
          <div class="owl-w-row"><span class="l">Village</span><span class="v">${escapeHtml(match.address || "—")}</span></div>
          ${loanRowsHtml}
          ${loanDocs.length ? `
          <div class="owl-w-row" style="margin-top:6px;"><span class="l">Total principal</span><span class="v">${fmtMoney(totalPrincipal)}</span></div>
          <div class="owl-w-row"><span class="l">${isFutureProjection ? `Total payable as of ${fmtDate(asOfDate)}` : "Total payable today"}</span><span class="v owl-w-v-emerald">${fmtMoney(round2(totalPrincipal + totalInterest))}</span></div>` : ""}
          ${activeDeposits.length ? `
          <div class="owl-w-row" style="margin-top:6px;"><span class="l">💰 Surplus funds held</span><span class="v"></span></div>
          ${depositRowsHtml}
          <div class="owl-w-row"><span class="l">Payable to customer ${isFutureProjection ? `as of ${fmtDate(asOfDate)}` : "if withdrawn today"}</span><span class="v owl-w-v-emerald">${fmtMoney(round2(totalSurplusPayable))}</span></div>` : ""}
        </div>
        ${isFutureProjection ? `<div class="owl-w-hint" style="padding:0 14px 12px;">Projected forward using today's real principal — future payments obviously aren't known yet, so this assumes none happen before ${fmtDate(asOfDate)}.</div>` : ""}
      `);
      setOwlState("happy");
    } catch (err) {
      console.error("owl-assistant account lookup failed:", err);
      addBotText("Sorry, I couldn't reach the customer records just now — please try again.");
      setOwlState("");
    }
  }

  // ---- Quick what-if calc: reuses interest.js's REAL engine (365/366-day
  // method, 1-month minimum floor) so this always matches what a real
  // disbursement would show on the actual loan page — no separate/different
  // math. ----
  // Renders the "I understood..." confirmation card + the calculated result,
  // using responseGenerator.js (which itself uses interestCalculator.js, a
  // thin wrapper around this page's own interest.js — never separate math).
  function renderCalculationResult(memorySnapshot) {
    const { confirmationHtml, resultHtml } = window.OwlNLU.responseGenerator.renderCalculation(memorySnapshot);
    addCard(confirmationHtml);
    addCard(resultHtml);
    conversationMemory.reset(); // calculation is complete — start fresh for the next question
    setOwlState("happy");
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtMoney(n) { return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
  function fmtDate(d) {
    const dt = d && d.toDate ? d.toDate() : new Date(d);
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function botReply(text) {
    setOwlState("thinking");
    setTimeout(() => {
      const result = window.OwlNLU.intentParser.process(text, conversationMemory);
      if (result.action === "account_lookup") {
        handleAccountQuery(result.accountQuery.name, result.accountQuery.receiptNumber, result.accountQuery.projectionDate);
      } else if (result.action === "calculate") {
        renderCalculationResult(result.memorySnapshot);
      } else if (result.action === "ask") {
        // Confidence 60-90: exactly one clarifying question for the single missing field.
        addBotText(window.OwlNLU.responseGenerator.renderClarification(result.question));
        setOwlState("");
      } else {
        // Confidence < 60: nothing usable was recognized.
        addBotText(window.OwlNLU.responseGenerator.renderUnclear());
        setOwlState("");
      }
    }, 300);
  }

  function sendMessage() {
    const input = document.getElementById("owlWInput");
    const text = input.value.trim();
    if (!text) return;
    addUserText(text);
    input.value = "";
    botReply(text);
  }

  function toggleCollapse() {
    const willHide = !phoneEl.classList.contains("owl-w-hidden");
    phoneEl.classList.toggle("owl-w-hidden", willHide);
    launcherEl.classList.toggle("visible", willHide);
    // While the chat is open (willHide === false), lock the page behind it so
    // scroll/touch gestures never chain through to the dashboard underneath.
    // Locking both <html> and <body> — some Android browsers/WebViews treat
    // <html> as the actual scrolling element rather than <body>.
    document.documentElement.classList.toggle("owl-w-locked", !willHide);
    document.body.classList.toggle("owl-w-locked", !willHide);
  }

  // ---- Real owl (Lottie), same defensive loading as login-owl.js ----
  function loadDotLottieScript() {
    return new Promise((resolve, reject) => {
      if (window.customElements && customElements.get("dotlottie-wc")) return resolve();
      const script = document.createElement("script");
      script.type = "module";
      script.src = DOTLOTTIE_CDN;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("dotlottie-wc failed to load"));
      document.head.appendChild(script);
    });
  }
  function readMarkerNames(el) {
    try {
      const manifest = (typeof el.getManifest === "function" && el.getManifest()) || el.manifest;
      if (manifest && Array.isArray(manifest.markers)) return manifest.markers.map((m) => (m && m.name ? m.name : m)).filter(Boolean);
    } catch (e) { /* fine — no marker introspection available */ }
    return [];
  }

  function initOwlAssistant() {
    if (document.getElementById("owlWPhone")) return; // already initialized
    injectStyle();
    injectMarkup();

    chatEl = document.getElementById("owlWChat");
    phoneEl = document.getElementById("owlWPhone");
    launcherEl = document.getElementById("owlWLauncher");
    owlEl = document.getElementById("owlWLottie");
    owlFallbackEl = document.getElementById("owlWFallback");

    document.getElementById("owlWForm").addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });
    document.getElementById("owlWCollapseBtn").addEventListener("click", (e) => { e.stopPropagation(); toggleCollapse(); });
    document.getElementById("owlWTopbar").addEventListener("click", (e) => {
      if (e.target.closest("h1,p") || e.target.id === "owlWTopbar") toggleCollapse();
    });
    document.getElementById("owlWLauncher").addEventListener("click", toggleCollapse);
    document.getElementById("owlWChips").querySelectorAll(".owl-w-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const preset = chip.dataset.preset;
        document.getElementById("owlWInput").value = preset;
        document.getElementById("owlWInput").focus();
      });
    });

    // Robust scroll containment: overscroll-behavior:contain (set in the CSS
    // above) already handles this on modern Chromium, but some older Android
    // WebView builds support it inconsistently. This is the manual fallback —
    // it only ever calls preventDefault() at the exact top/bottom edge of the
    // chat, so momentum/inertial scrolling inside the chat is never touched.
    let touchStartY = null;
    chatEl.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
    chatEl.addEventListener("touchmove", (e) => {
      if (touchStartY == null) return;
      const atTop = chatEl.scrollTop <= 0;
      const atBottom = chatEl.scrollHeight - chatEl.scrollTop <= chatEl.clientHeight + 1;
      const deltaY = e.touches[0].clientY - touchStartY;
      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) e.preventDefault();
    }, { passive: false });
    chatEl.addEventListener("wheel", (e) => {
      const atTop = chatEl.scrollTop <= 0;
      const atBottom = chatEl.scrollHeight - chatEl.scrollTop <= chatEl.clientHeight + 1;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) e.preventDefault();
    }, { passive: false });

    loadDotLottieScript()
      .then(() => {
        owlEl.addEventListener("load", () => {
          owlReady = true;
          owlMarkers = readMarkerNames(owlEl);
          if (reducedMotion) { try { owlEl.loop = false; owlEl.autoplay = false; if (typeof owlEl.pause === "function") owlEl.pause(); } catch (e) {} }
        }, { once: true });
        owlEl.addEventListener("error", () => { owlEl.style.display = "none"; owlFallbackEl.style.display = "block"; }, { once: true });

        // The launcher's own Lottie instance is purely decorative (no marker/state
        // control needed) — just fall back to the emoji if it fails to load.
        const launcherLottie = document.getElementById("owlWLauncherLottie");
        const launcherFallback = document.getElementById("owlWLauncherFallback");
        if (launcherLottie && launcherFallback) {
          launcherLottie.addEventListener("error", () => { launcherLottie.style.display = "none"; launcherFallback.style.display = "flex"; }, { once: true });
          if (reducedMotion) { try { launcherLottie.loop = false; launcherLottie.autoplay = false; } catch (e) {} }
        }
      })
      .catch(() => {
        owlEl.style.display = "none";
        owlFallbackEl.style.display = "block";
        const launcherLottie = document.getElementById("owlWLauncherLottie");
        const launcherFallback = document.getElementById("owlWLauncherFallback");
        if (launcherLottie) launcherLottie.style.display = "none";
        if (launcherFallback) launcherFallback.style.display = "flex";
      });

    addBotText('Hoo-hoo! 🦉 Ask me to <b>check a customer\'s account</b> — try adding <b>"till 31"</b> or <b>"till end of month"</b> to see what they\'ll owe on a future date, not just today. Or tell me the numbers for a quick calc in any order — <b>"10000 2.5 24-07-2025"</b>, with an optional second date for a specific range. Add <b>"CA"</b> for compounding annually. Hindi/Gujarati/Hinglish work too — try <b>"50000 ka byaaj"</b>.');
  }

  // Only show the assistant once someone is actually logged in — mirrors requireAuth()'s pattern.
  auth.onAuthStateChanged((user) => { if (user) initOwlAssistant(); });
})();
