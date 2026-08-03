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
    .owl-w-btn{position:fixed;right:24px;bottom:24px;display:none;align-items:center;gap:10px;background:linear-gradient(135deg,#0B2A5B,#184A8C);color:#fff;padding:8px 20px 8px 8px;border:none;border-radius:30px;cursor:pointer;box-shadow:0 10px 28px rgba(11,42,91,.35);z-index:2000;font-size:14px;font-weight:700;font-family:inherit;touch-action:manipulation;}
    .owl-w-btn.visible{display:inline-flex;}
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
      background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(11,42,91,.3);
      display:flex;flex-direction:column;border:1px solid #E4E9F0;
      font-family:inherit;z-index:2000;overflow:hidden;
    }
    @media (max-width:860px){ .owl-w-phone{ bottom:96px;right:18px; } }
    @media (max-width:480px){ .owl-w-phone{ right:10px; width:calc(100vw - 20px); } }
    .owl-w-phone.owl-w-hidden{display:none;}
    .owl-w-topbar{background:linear-gradient(135deg,#0B2A5B,#184A8C);color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;cursor:pointer;touch-action:manipulation;}
    .owl-w-avatar-wrap{width:88px;height:88px;flex-shrink:0;position:relative;}
    .owl-w-avatar{width:100%;height:100%;}
    .owl-w-fallback{position:absolute;top:0;left:0;}
    .owl-w-topbar h1{font-size:15px;margin:0;font-weight:700;color:#fff;font-family:var(--font-body, inherit);}
    .owl-w-topbar p{font-size:11.5px;margin:2px 0 0;opacity:.85;color:#fff;font-family:var(--font-body, inherit);}
    .owl-w-status-dot{width:7px;height:7px;border-radius:50%;background:#10B981;display:inline-block;margin-right:5px;box-shadow:0 0 0 3px rgba(16,185,129,.25);}
    .owl-w-collapse-btn{background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;font-size:13px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;touch-action:manipulation;}
    .owl-w-chat{padding:16px;display:flex;flex-direction:column;gap:12px;background:#F8FAFC;overflow-y:auto;flex:1;min-height:0;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;}
    html.owl-w-locked,body.owl-w-locked{overflow:hidden;overscroll-behavior:none;height:100%;}
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
          <div class="owl-w-chip" data-preset="10000 2% 12-08-2024 CA">...CA (compound annually)</div>
        </div>
        <div class="owl-w-footer">
          <div class="owl-w-inputbar">
            <input id="owlWInput" type="text" placeholder="Customer name, or amount+rate+date...">
            <button id="owlWSendBtn" type="button">➤</button>
          </div>
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
     PARSER
     ============================================================ */
  function isValidDMY(d, mo, y) {
    return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 1970 && y <= 2099;
  }
  function normalizeYear(yy) {
    // 2-digit year window: 00-79 -> 2000s, 80-99 -> 1900s (standard convention)
    return yy <= 79 ? 2000 + yy : 1900 + yy;
  }
  function buildDate(d, mo, y) {
    const dt = new Date(y, mo - 1, d);
    // Rejects overflow dates the JS Date constructor would otherwise silently roll over (e.g. 31 Feb -> 3 Mar)
    if (dt.getDate() !== d || dt.getMonth() !== mo - 1 || dt.getFullYear() !== y) return null;
    return dt;
  }

  // Finds every date in the message, in any common format:
  // dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy, dd-mm-yy, dd/mm/yy, dd.mm.yy,
  // and no-separator ddmmyyyy / ddmmyy. Each candidate is validated against
  // real day (1-31) and month (1-12) ranges, so a plain number — like the
  // principal amount — is never mistaken for a date. Returns the matched
  // dates plus the message with those exact substrings removed, so the
  // principal-amount extraction downstream never sees the date digits.
  function extractDates(text) {
    const found = [];
    const consider = (m, dRaw, moRaw, yRaw) => {
      const d = parseInt(dRaw, 10), mo = parseInt(moRaw, 10);
      const y = yRaw.length <= 2 ? normalizeYear(parseInt(yRaw, 10)) : parseInt(yRaw, 10);
      if (!isValidDMY(d, mo, y)) return;
      const dt = buildDate(d, mo, y);
      if (dt) found.push({ start: m.index, end: m.index + m[0].length, date: dt });
    };

    // Separated: dd [-/.] mm [-/.] (yyyy or yy)
    const sepRe = /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})\b/g;
    let m;
    while ((m = sepRe.exec(text))) consider(m, m[1], m[2], m[3]);

    // No separator, exactly 8 digits: ddmmyyyy
    const bare8Re = /\b(\d{2})(\d{2})(\d{4})\b/g;
    while ((m = bare8Re.exec(text))) consider(m, m[1], m[2], m[3]);

    // No separator, exactly 6 digits: ddmmyy
    const bare6Re = /\b(\d{2})(\d{2})(\d{2})\b/g;
    while ((m = bare6Re.exec(text))) consider(m, m[1], m[2], m[3]);

    found.sort((a, b) => a.start - b.start);
    const deduped = [];
    for (const f of found) {
      if (deduped.some((d2) => f.start < d2.end && f.end > d2.start)) continue; // skip overlapping matches
      deduped.push(f);
    }

    let strippedText = text;
    for (let i = deduped.length - 1; i >= 0; i--) {
      const f = deduped[i];
      strippedText = strippedText.slice(0, f.start) + " " + strippedText.slice(f.end);
    }

    return { dates: deduped.map((f) => f.date), strippedText };
  }

  function detectInterestType(lower) {
    // Only two options via chat now: simple, or compounding annually.
    // Triggers on the "CA" shortcut, or the word compound/compounding on its own.
    const hasCAShortcut = /\bca\b/.test(lower);
    const wantsCompound = /\bcompound(ing)?\b/.test(lower);
    return (hasCAShortcut || wantsCompound) ? "compound_annual" : "simple";
  }

  function parseQuery(text) {
    const lower = text.toLowerCase();
    const rateMatch = text.match(/(\d+(\.\d+)?)\s*%/);
    let rate = rateMatch ? parseFloat(rateMatch[1]) : null;
    const interestType = detectInterestType(lower);
    const { dates: dateMatches, strippedText: afterDates } = extractDates(text);
    let stripped = afterDates.replace(/(\d+(\.\d+)?)\s*%/g, "");
    const numMatches = [...stripped.matchAll(/\d[\d,]*(\.\d+)?/g)].map((m) => parseFloat(m[0].replace(/,/g, "")));

    let principal = null;
    if (rate !== null) {
      // Rate already found via an explicit "%" — whatever's left is the principal.
      principal = numMatches.length ? Math.max(...numMatches) : null;
    } else if (numMatches.length >= 2) {
      // No "%" sign at all — a monthly interest rate is always under 50, so use
      // that to tell rate and principal apart instead of guessing wrong.
      const small = numMatches.filter((n) => n < 50);
      const large = numMatches.filter((n) => n >= 50);
      if (small.length && large.length) {
        rate = Math.max(...small);
        principal = Math.max(...large);
      } else {
        principal = Math.max(...numMatches);
      }
    } else {
      principal = numMatches.length ? Math.max(...numMatches) : null;
    }

    const isAccountQuery = /account|loan|customer|check/i.test(lower) && !principal && !rate;
    if (isAccountQuery || (!principal && !rate && !dateMatches.length)) {
      const stopwords = ["check", "account", "of", "the", "loan", "customer", "show", "me", "please", "status"];
      const nameWords = text.split(/\s+/).filter((w) => !stopwords.includes(w.toLowerCase()));
      return { type: "account", name: nameWords.join(" ").trim() };
    }
    if (principal || rate || dateMatches.length) {
      return { type: "calc", principal, rate, fromDate: dateMatches[0] || null, toDate: dateMatches[1] || new Date(), interestType };
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
    const interestType = q.interestType || "simple";
    const interest = periodInterest(q.principal, q.rate, q.fromDate, toDate, interestType);
    const floorValue = round2(q.principal * (q.rate / 100));
    const minimumApplied = days > 0 && interest <= floorValue + 0.01;
    const typeLabel = interestType === "compound_annual" ? "Compounding (annually)" : "Simple";

    addCard(`
      <div class="owl-w-card-body">
        <div class="owl-w-row"><span class="l">Principal</span><span class="v">${fmtMoney(q.principal)}</span></div>
        <div class="owl-w-row"><span class="l">Monthly rate</span><span class="v">${q.rate}%</span></div>
        <div class="owl-w-row"><span class="l">Method</span><span class="v">${typeLabel}</span></div>
        <div class="owl-w-row"><span class="l">From</span><span class="v">${fmtDate(q.fromDate)}</span></div>
        <div class="owl-w-row"><span class="l">To</span><span class="v">${fmtDate(toDate)}</span></div>
        <div class="owl-w-row"><span class="l">Duration</span><span class="v">${formatDuration(days)}</span></div>
        <div class="owl-w-row"><span class="l">Interest</span><span class="v owl-w-v-gold">${fmtMoney(interest)}</span></div>
        <div class="owl-w-row" style="margin-top:6px;"><span class="l">Total payable</span><span class="v owl-w-v-emerald">${fmtMoney(round2(q.principal + interest))}</span></div>
      </div>
      <div class="owl-w-hint" style="padding:0 14px 12px;">${minimumApplied ? "1-month minimum applied." : "Exact — 365/366-day method."}${interestType === "simple" ? ' Add "CA" to your message for compounding annually.' : ""}</div>
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

    addBotText('Hoo-hoo! 🦉 Ask me to <b>check a customer\'s account</b>, or give me a quick calc like <b>"10000 2% 12-08-2024"</b> — add <b>"CA"</b> to the message for compounding annually instead of simple.');
  }

  // Only show the assistant once someone is actually logged in — mirrors requireAuth()'s pattern.
  auth.onAuthStateChanged((user) => { if (user) initOwlAssistant(); });
})();
