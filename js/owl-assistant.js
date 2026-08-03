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

  const LOTTIE_OWL_SRC = "https://lottie.host/c7668bc7-1b61-4958-a268-68939d2ba27a/dhuKIcqJ81.lottie";
  const DOTLOTTIE_CDN = "https://unpkg.com/@lottiefiles/dotlottie-wc@0.9.4/dist/dotlottie-wc.js";

  const STYLE = `
    .owl-w-btn{position:fixed;left:18px;bottom:18px;display:none;align-items:center;gap:10px;background:linear-gradient(135deg,#0B2A5B,#184A8C);color:#fff;padding:8px 20px 8px 8px;border:none;border-radius:30px;cursor:pointer;box-shadow:0 10px 28px rgba(11,42,91,.35);z-index:2000;font-size:14px;font-weight:700;font-family:inherit;touch-action:manipulation;}
    .owl-w-btn.visible{display:inline-flex;}
    @media (max-width:860px){ .owl-w-btn{ bottom:96px; } } /* clears the floating mobile nav pill + FAB */
    .owl-w-launcher-owl{width:34px;height:34px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
    .owl-w-phone{
      position:fixed;left:18px;bottom:18px;width:380px;max-width:calc(100vw - 36px);
      max-height:min(600px, calc(100vh - 100px));
      background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(11,42,91,.3);
      display:flex;flex-direction:column;border:1px solid #E4E9F0;
      font-family:inherit;z-index:2000;overflow:hidden;
    }
    @media (max-width:860px){ .owl-w-phone{ bottom:96px; } }
    @media (max-width:480px){ .owl-w-phone{ left:10px; width:calc(100vw - 20px); } }
    .owl-w-phone.owl-w-hidden{display:none;}
    .owl-w-topbar{background:linear-gradient(135deg,#0B2A5B,#184A8C);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;cursor:pointer;touch-action:manipulation;}
    .owl-w-avatar-wrap{width:38px;height:38px;flex-shrink:0;position:relative;}
    .owl-w-avatar{width:100%;height:100%;}
    .owl-w-fallback{position:absolute;top:0;left:0;}
    .owl-w-topbar h1{font-size:15px;margin:0;font-weight:700;}
    .owl-w-topbar p{font-size:11.5px;margin:2px 0 0;opacity:.8;}
    .owl-w-status-dot{width:7px;height:7px;border-radius:50%;background:#10B981;display:inline-block;margin-right:5px;box-shadow:0 0 0 3px rgba(16,185,129,.25);}
    .owl-w-collapse-btn{background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;font-size:13px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;touch-action:manipulation;}
    .owl-w-chat{padding:16px;display:flex;flex-direction:column;gap:12px;background:#F8FAFC;overflow-y:auto;flex:1;min-height:0;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;}
    body.owl-w-locked{overflow:hidden;overscroll-behavior:none;}
    .owl-w-msg{max-width:82%;padding:11px 14px;border-radius:14px;font-size:13.5px;line-height:1.5;flex-shrink:0;}
    .owl-w-msg.bot{background:#fff;border:1px solid #E4E9F0;align-self:flex-start;border-bottom-left-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
    .owl-w-msg.user{background:linear-gradient(135deg,#184A8C,#0B2A5B);color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
    .owl-w-msg.bot.card{padding:0;overflow:hidden;max-width:92%;}
    .owl-w-card-head{background:#0B2A5B;color:#fff;padding:11px 14px;}
    .owl-w-card-head .t{font-weight:700;font-size:14px;display:block;line-height:1.3;}
    .owl-w-card-head .s{font-weight:500;font-size:11.5px;opacity:.75;display:block;margin-top:2px;line-height:1.3;}
    .owl-w-card-body{padding:12px 14px;}
    .owl-w-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px dashed #E4E9F0;}
    .owl-w-row:last-child{border-bottom:none;}
    .owl-w-row .l{color:#6b7686;flex-shrink:0;}
    .owl-w-row .v{font-weight:700;color:#1a2333;text-align:right;}
    .owl-w-hint{font-size:11.5px;color:#94a3b8;margin-top:2px;}
    .owl-w-v-gold{color:#a8790f;}
    .owl-w-v-emerald{color:#10B981;}
    .owl-w-loan-item{background:#F8FAFC;border:1px solid #E4E9F0;border-radius:10px;padding:8px 10px;margin-top:8px;}
    .owl-w-loan-item .owl-w-row{border:none;padding:2px 0;}
    .owl-w-chips{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px 0;flex-shrink:0;}
    .owl-w-chip{background:#fff;border:1px solid #E4E9F0;color:#184A8C;font-size:12px;padding:6px 11px;border-radius:20px;cursor:pointer;touch-action:manipulation;}
    .owl-w-footer{background:#fff;flex-shrink:0;}
    .owl-w-inputbar{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #E4E9F0;background:#fff;}
    .owl-w-inputbar input{flex:1;border:1px solid #E4E9F0;border-radius:22px;padding:10px 15px;font-size:13.5px;outline:none;font-family:inherit;touch-action:manipulation;}
    .owl-w-inputbar input:focus{border-color:#184A8C;}
    .owl-w-inputbar button{width:38px;height:38px;border-radius:50%;border:none;background:#D4A017;color:#fff;font-size:15px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;touch-action:manipulation;}
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
            <dotlottie-wc class="owl-w-avatar" id="owlWLottie" src="${LOTTIE_OWL_SRC}" autoplay loop style="width:100%;height:100%;display:block;"></dotlottie-wc>
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
        </div>
        <div class="owl-w-footer">
          <div class="owl-w-inputbar">
            <input id="owlWInput" type="text" placeholder="Customer name, or amount+rate+date...">
            <button id="owlWSendBtn" type="button">➤</button>
          </div>
        </div>
      </div>
      <button class="owl-w-btn visible" id="owlWLauncher" type="button">
        <span class="owl-w-launcher-owl">🦉</span> Gharana Assistant
      </button>
    `;
    document.body.appendChild(wrap);
  }

  /* ============================================================
     PARSER
     ============================================================ */
  function parseDate(str) {
    const m = str.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (!m) return null;
    let [, dd, mm, yy] = m;
    yy = yy.length === 2 ? "20" + yy : yy;
    const dt = new Date(`${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
    return isNaN(dt) ? null : dt;
  }
  function parseQuery(text) {
    const lower = text.toLowerCase();
    const dateMatches = [...text.matchAll(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g)].map((m) => parseDate(m[1]));
    const rateMatch = text.match(/(\d+(\.\d+)?)\s*%/);
    const rate = rateMatch ? parseFloat(rateMatch[1]) : null;
    let stripped = text.replace(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g, "").replace(/(\d+(\.\d+)?)\s*%/g, "");
    const numMatches = [...stripped.matchAll(/\d[\d,]*(\.\d+)?/g)].map((m) => parseFloat(m[0].replace(/,/g, "")));
    const principal = numMatches.length ? Math.max(...numMatches) : null;
    const isAccountQuery = /account|loan|customer|check/i.test(lower) && !principal && !rate;
    if (isAccountQuery || (!principal && !rate && !dateMatches.length)) {
      const stopwords = ["check", "account", "of", "the", "loan", "customer", "show", "me", "please", "status"];
      const nameWords = text.split(/\s+/).filter((w) => !stopwords.includes(w.toLowerCase()));
      return { type: "account", name: nameWords.join(" ").trim() };
    }
    if (principal || rate || dateMatches.length) {
      return { type: "calc", principal, rate, fromDate: dateMatches[0] || null, toDate: dateMatches[1] || new Date() };
    }
    return { type: "unknown" };
  }

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
  async function handleAccountQuery(rawName) {
    const name = rawName.trim();
    if (!name) { addBotText("Which customer would you like me to check?"); setOwlState(""); return; }
    setOwlState("thinking");
    try {
      const custSnap = await db.collection("customers").get();
      const customers = custSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const lower = name.toLowerCase();
      const match =
        customers.find((c) => (c.name || "").toLowerCase().includes(lower)) ||
        customers.find((c) => lower.includes((c.name || "").split(" ")[0].toLowerCase()));

      if (!match) {
        addBotText(`I couldn't find a customer matching "<b>${escapeHtml(name)}</b>". Try a full or partial name.`);
        setOwlState("");
        return;
      }

      const loanSnap = await db.collection("loans").where("customerId", "==", match.id).get();
      const loanDocs = loanSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => l.status !== "closed");

      if (!loanDocs.length) {
        addBotText(`<b>${escapeHtml(match.name)}</b> has no open loans.`);
        setOwlState("");
        return;
      }

      const loanSummaries = await Promise.all(
        loanDocs.map(async (l) => {
          const loanRef = db.collection("loans").doc(l.id);
          const [dSnap, pSnap] = await Promise.all([loanRef.collection("disbursements").get(), loanRef.collection("payments").get()]);
          const disbursements = dSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const payments = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return { loan: l, summary: calcLoanSummary(disbursements, payments) };
        })
      );

      let totalPrincipal = 0, totalInterest = 0;
      const loanRowsHtml = loanSummaries
        .map(({ loan, summary }, i) => {
          totalPrincipal += summary.principalOutstanding;
          totalInterest += summary.interestOutstanding;
          return `<div class="owl-w-loan-item">
            <div class="owl-w-row"><span class="l">${escapeHtml(loan.loanNumber || "Loan " + (i + 1))}</span><span class="v">${escapeHtml(loan.status)}</span></div>
            <div class="owl-w-row"><span class="l">Principal outstanding</span><span class="v">${fmtMoney(summary.principalOutstanding)}</span></div>
            <div class="owl-w-row"><span class="l">Interest due today</span><span class="v owl-w-v-gold">${fmtMoney(summary.interestOutstanding)}</span></div>
          </div>`;
        })
        .join("");

      addCard(`
        <div class="owl-w-card-head"><span class="t">${escapeHtml(match.name)}</span><span class="s">${loanDocs.length} open loan${loanDocs.length > 1 ? "s" : ""}</span></div>
        <div class="owl-w-card-body">
          <div class="owl-w-row"><span class="l">Mobile</span><span class="v">${escapeHtml(match.mobile || "—")}</span></div>
          <div class="owl-w-row"><span class="l">Village</span><span class="v">${escapeHtml(match.address || "—")}</span></div>
          ${loanRowsHtml}
          <div class="owl-w-row" style="margin-top:6px;"><span class="l">Total principal</span><span class="v">${fmtMoney(totalPrincipal)}</span></div>
          <div class="owl-w-row"><span class="l">Total payable today</span><span class="v owl-w-v-emerald">${fmtMoney(round2(totalPrincipal + totalInterest))}</span></div>
        </div>
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
  function handleCalcQuery(q) {
    if (!q.principal || !q.rate || !q.fromDate) {
      const missing = [];
      if (!q.principal) missing.push("amount");
      if (!q.rate) missing.push("interest rate (e.g. 2%)");
      if (!q.fromDate) missing.push("start date (e.g. 12-08-2024)");
      addBotText(`I need a bit more — please also tell me the <b>${missing.join(", ")}</b>.<br><span style="color:#6b7686;font-size:12.5px;">Example: "10000 2% 12-08-2024"</span>`);
      setOwlState("");
      return;
    }
    const toDate = q.toDate || new Date();
    const days = daysBetween(q.fromDate, toDate);
    const interest = periodInterest(q.principal, q.rate, q.fromDate, toDate, "simple");
    const floorValue = round2(q.principal * (q.rate / 100));
    const minimumApplied = days > 0 && interest <= floorValue + 0.01;

    addCard(`
      <div class="owl-w-card-body">
        <div class="owl-w-row"><span class="l">Principal</span><span class="v">${fmtMoney(q.principal)}</span></div>
        <div class="owl-w-row"><span class="l">Monthly rate</span><span class="v">${q.rate}%</span></div>
        <div class="owl-w-row"><span class="l">From</span><span class="v">${fmtDate(q.fromDate)}</span></div>
        <div class="owl-w-row"><span class="l">To</span><span class="v">${fmtDate(toDate)}</span></div>
        <div class="owl-w-row"><span class="l">Duration</span><span class="v">${formatDuration(days)}</span></div>
        <div class="owl-w-row"><span class="l">Interest</span><span class="v owl-w-v-gold">${fmtMoney(interest)}</span></div>
        <div class="owl-w-row" style="margin-top:6px;"><span class="l">Total payable</span><span class="v owl-w-v-emerald">${fmtMoney(round2(q.principal + interest))}</span></div>
      </div>
      <div class="owl-w-hint" style="padding:0 14px 12px;">${minimumApplied ? "1-month minimum applied." : "Exact — 365/366-day method."}</div>
    `);
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
      const q = parseQuery(text);
      if (q.type === "account") handleAccountQuery(q.name);
      else if (q.type === "calc") handleCalcQuery(q);
      else { addBotText('I\'m not sure what you mean — try a customer name, or something like <b>10000 2% 12-08-2024</b>.'); setOwlState(""); }
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

    document.getElementById("owlWSendBtn").addEventListener("click", sendMessage);
    document.getElementById("owlWInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
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

    loadDotLottieScript()
      .then(() => {
        owlEl.addEventListener("load", () => {
          owlReady = true;
          owlMarkers = readMarkerNames(owlEl);
          if (reducedMotion) { try { owlEl.loop = false; owlEl.autoplay = false; if (typeof owlEl.pause === "function") owlEl.pause(); } catch (e) {} }
        }, { once: true });
        owlEl.addEventListener("error", () => { owlEl.style.display = "none"; owlFallbackEl.style.display = "block"; }, { once: true });
      })
      .catch(() => { owlEl.style.display = "none"; owlFallbackEl.style.display = "block"; });

    addBotText('Hoo-hoo! 🦉 Ask me to <b>check a customer\'s account</b>, or give me a quick calc like <b>"10000 2% 12-08-2024"</b>.');
  }

  // Only show the assistant once someone is actually logged in — mirrors requireAuth()'s pattern.
  auth.onAuthStateChanged((user) => { if (user) initOwlAssistant(); });
})();
