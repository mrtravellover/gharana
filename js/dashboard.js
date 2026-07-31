requireAuth(async () => {
  renderShell({ active: "dashboard", title: "Dashboard" });
  renderGreeting();
  await loadDashboard();
});

function renderGreeting() {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const email = (auth.currentUser && auth.currentUser.email) || "";
  const namePart = email.split("@")[0].replace(/[._]/g, " ");
  const name = namePart ? namePart.replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  document.getElementById("greetingText").textContent = `${timeGreeting}${name ? ", " + name : ""} 👋`;
  document.getElementById("dashDate").textContent = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", weekday: "long" });
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? { dir: "up", label: "New" } : { dir: "flat", label: "No change" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { dir: "flat", label: "No change" };
  return { dir: pct > 0 ? "up" : "down", label: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}%` };
}

function renderTrend(elId, trend, caption) {
  const el = document.getElementById(elId);
  el.className = `trend-pill ${trend.dir}`;
  el.innerHTML = `${trend.label}<span class="cap">${caption}</span>`;
}

function formatRelativeTime(date) {
  const d = toJsDate(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return fmtDate(date);
}

async function loadDashboard() {
  const [loansSnap, releasedSnap] = await Promise.all([
    db.collection("loans").where("status", "==", "active").get(),
    db.collection("loans").where("status", "==", "released").get(),
  ]);

  const now = new Date();
  const thisMonthKey = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = monthKey(lastMonthDate);
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();

  let totalPrincipal = 0, totalInterest = 0;
  let collectedToday = 0, collectedYesterday = 0;
  let disbursedThisMonth = 0, disbursedLastMonth = 0;
  let interestThisMonth = 0, interestLastMonth = 0;
  let newLoansThisMonth = 0, newLoansLastMonth = 0;
  const monthlyCollections = {}; // monthKey -> total money in
  const activityEvents = []; // recent payments across all loans

  for (const doc of loansSnap.docs) {
    const loan = { id: doc.id, ...doc.data() };
    if (monthKey(loan.date) === thisMonthKey) newLoansThisMonth++;
    if (monthKey(loan.date) === lastMonthKey) newLoansLastMonth++;

    const [disbSnap, paySnap] = await Promise.all([
      db.collection("loans").doc(loan.id).collection("disbursements").get(),
      db.collection("loans").doc(loan.id).collection("payments").get(),
    ]);
    const disbursements = disbSnap.docs.map((d) => d.data());
    const payments = paySnap.docs.map((d) => d.data());
    const summary = calcLoanSummary(disbursements, payments);

    totalPrincipal += summary.principalOutstanding;
    totalInterest += summary.interestOutstanding;

    disbursements.forEach((d) => {
      const k = monthKey(d.date);
      if (k === thisMonthKey) disbursedThisMonth += Number(d.amount) || 0;
      if (k === lastMonthKey) disbursedLastMonth += Number(d.amount) || 0;
    });

    summary.paymentBreakdown.forEach((p) => {
      const amt = Number(p.amount) || 0;
      const k = monthKey(p.date);
      monthlyCollections[k] = (monthlyCollections[k] || 0) + amt;
      if (k === thisMonthKey) interestThisMonth += Number(p.interestPortion) || 0;
      if (k === lastMonthKey) interestLastMonth += Number(p.interestPortion) || 0;

      const day = toJsDate(p.date).toDateString();
      if (day === todayStr) collectedToday += amt;
      if (day === yesterdayStr) collectedYesterday += amt;

      activityEvents.push({ date: p.date, customerName: loan.customerName, amount: amt, interestPortion: p.interestPortion, principalPortion: p.principalPortion });
    });
  }

  document.getElementById("statActiveLoans").textContent = loansSnap.size;
  document.getElementById("statPrincipal").textContent = fmtMoney(totalPrincipal);
  document.getElementById("statInterest").textContent = fmtMoney(totalInterest);
  document.getElementById("statCollectedToday").textContent = fmtMoney(collectedToday);

  renderTrend("trendActiveLoans", pctChange(newLoansThisMonth, newLoansLastMonth), "new this month");
  renderTrend("trendPrincipal", pctChange(disbursedThisMonth, disbursedLastMonth), "disbursed this month");
  renderTrend("trendInterest", pctChange(interestThisMonth, interestLastMonth), "collected this month");
  renderTrend("trendCollectedToday", pctChange(collectedToday, collectedYesterday), "vs yesterday");

  renderChart(monthlyCollections);
  renderRecentActivity(activityEvents);

  renderReadyToRelease(await Promise.all(releasedSnap.docs.map(async (d) => {
    const loan = { id: d.id, ...d.data() };
    const [ornSnap, disbSnap, paySnap] = await Promise.all([
      db.collection("loans").doc(loan.id).collection("ornaments").get(),
      db.collection("loans").doc(loan.id).collection("disbursements").get(),
      db.collection("loans").doc(loan.id).collection("payments").get(),
    ]);
    loan.ornaments = ornSnap.docs.map((o) => o.data());
    loan.summary = calcLoanSummary(disbSnap.docs.map((x) => x.data()), paySnap.docs.map((x) => x.data()));
    return loan;
  })));
}

function renderChart(monthlyCollections) {
  const now = new Date();
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const values = keys.map((k) => monthlyCollections[k] || 0);
  const labels = keys.map((k) => monthLabel(k).split(" ")[0]); // "Jan" etc.

  const w = 700, h = 220, padL = 46, padR = 10, padT = 30, padB = 26;
  const maxVal = Math.max(1, ...values);
  const niceMax = Math.ceil(maxVal / 20000) * 20000 || 20000;
  const stepX = (w - padL - padR) / (values.length - 1 || 1);

  const points = values.map((v, i) => {
    const x = padL + i * stepX;
    const y = padT + (1 - v / niceMax) * (h - padT - padB);
    return { x, y, v };
  });

  const linePath = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${h - padB} L${points[0].x},${h - padB} Z`;

  const peakIdx = values.indexOf(Math.max(...values));
  const peak = points[peakIdx];

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + f * (h - padT - padB);
    const val = Math.round(niceMax * (1 - f));
    return `
      <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
      <text x="${padL - 8}" y="${y + 4}" font-size="10" fill="var(--ink-soft)" text-anchor="end">${val >= 1000 ? Math.round(val / 1000) + "K" : val}</text>
    `;
  }).join("");

  const xLabels = points.map((p, i) => `<text x="${p.x}" y="${h - 6}" font-size="10.5" fill="var(--ink-soft)" text-anchor="middle">${labels[i]}</text>`).join("");
  const dots = points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--paper)" stroke="var(--primary)" stroke-width="2"/>`).join("");

  document.getElementById("chartWrap").innerHTML = `
    <div style="position:relative;width:100%;overflow-x:auto;">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;min-width:480px;height:auto;">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--secondary)" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="var(--secondary)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${gridLines}
        <path d="${areaPath}" fill="url(#chartFill)"/>
        <path d="${linePath}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
        ${xLabels}
      </svg>
      ${peak.v > 0 ? `<div class="chart-tooltip" style="left:${(peak.x / w) * 100}%;top:${(peak.y / h) * 100}%;">${fmtMoney(peak.v)}</div>` : ""}
    </div>
  `;
}

function renderRecentActivity(events) {
  events.sort((a, b) => toJsDate(b.date) - toJsDate(a.date));
  const top = events.slice(0, 6);
  const el = document.getElementById("recentActivityList");

  if (top.length === 0) {
    el.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;padding:10px 0;">No payments recorded yet.</p>`;
    return;
  }

  el.innerHTML = top.map((e) => {
    const isMostlyInterest = e.interestPortion >= e.principalPortion;
    const iconBg = isMostlyInterest ? "var(--gold)" : "var(--good)";
    const icon = isMostlyInterest
      ? `<path d="M19 5L5 19M7.5 7.5h.01M16.5 16.5h.01"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>`
      : `<path d="M12 5v14M19 12l-7 7-7-7"/>`;
    return `
      <div class="activity-row">
        <div class="icon-circle" style="background:${iconBg};">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
        </div>
        <div class="info">
          <div class="name">${escapeHtml(e.customerName)}</div>
          <div class="sub">${isMostlyInterest ? "Interest Payment" : "Loan Payment"}</div>
        </div>
        <div class="amt">
          <div class="num" style="color:var(--good);">${fmtMoney(e.amount)}</div>
          <div class="time">${formatRelativeTime(e.date)}</div>
        </div>
      </div>`;
  }).join("");
}

function renderReadyToRelease(loans) {
  const card = document.getElementById("readyToReleaseCard");
  const list = document.getElementById("readyToReleaseList");
  const countEl = document.getElementById("readyToReleaseCount");

  if (loans.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";
  countEl.textContent = `(${loans.length})`;

  loans.sort((a, b) => toJsDate(a.releasedAt) - toJsDate(b.releasedAt));
  list.innerHTML = loans.map((l) => {
    const pending = (l.ornaments || []).filter((o) => !o.released);
    const due = l.summary ? l.summary.totalPayableToday : 0;
    return `
    <div class="disb-card" style="cursor:pointer;" onclick="location.href='loan-detail.html?id=${l.id}'">
      <div class="row"><strong>${escapeHtml(l.loanNumber)} — ${escapeHtml(l.customerName)}</strong><span class="badge badge-released">ready</span></div>
      <div class="row"><span class="k">Locker note</span><span>${l.itemsIdentityNote ? escapeHtml(l.itemsIdentityNote) : `<span style="color:var(--warn);">not set</span>`}</span></div>
      ${pending.length ? `<div class="row"><span class="k">Items</span><span>${pending.map((o) => escapeHtml(o.itemName)).join(", ")}</span></div>` : ""}
      ${due > 0 ? `<div class="row"><span class="k" style="color:var(--danger);">Payment due</span><strong class="mono" style="color:var(--danger);">${fmtMoney(due)}</strong></div>` : `<div class="row"><span class="k" style="color:var(--good);">Fully paid</span></div>`}
    </div>`;
  }).join("");
}
