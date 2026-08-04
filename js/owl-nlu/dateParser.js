// ============================================================
// dateParser.js — pure-JS flexible date recognition.
// Handles numeric formats (dd-mm-yyyy, dd/mm/yy, ddmmyyyy, ...),
// month-name formats ("24 Jul 2025", "July 24"), and relative terms
// ("today", "aaj", "आज", "આજે", "yesterday", "kal") across
// English / Hindi / Gujarati / Hinglish.
//
// Exposes window.OwlNLU.dateParser
// ============================================================

(function () {
  window.OwlNLU = window.OwlNLU || {};
  const NLU = window.OwlNLU;

  const MONTH_NAMES = [
    ["jan", "january"], ["feb", "february"], ["mar", "march"], ["apr", "april"],
    ["may"], ["jun", "june"], ["jul", "july"], ["aug", "august"],
    ["sep", "sept", "september"], ["oct", "october"], ["nov", "november"], ["dec", "december"],
  ];

  function monthIndexFromWord(word) {
    const w = word.toLowerCase().replace(/\.$/, "");
    for (let i = 0; i < MONTH_NAMES.length; i++) {
      if (MONTH_NAMES[i].includes(w)) return i; // 0-11
    }
    return -1;
  }

  function isValidDMY(d, mo, y) {
    return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 1970 && y <= 2099;
  }
  function normalizeYear(yy) {
    return yy <= 79 ? 2000 + yy : 1900 + yy; // standard 2-digit year window
  }
  function buildDate(d, moIndex, y) {
    const dt = new Date(y, moIndex, d);
    if (dt.getDate() !== d || dt.getMonth() !== moIndex || dt.getFullYear() !== y) return null; // rejects overflow like 31 Feb
    return dt;
  }

  const TODAY_WORDS = ["today", "tod", "todya", "tody", "aaj", "aj", "आज", "આજે", "આજ"];
  const YESTERDAY_WORDS = ["yesterday", "kal", "गई", "गयी", "काल", "કાલે", "ગઈકાલે"];

  // Finds every date in the message: numeric (any separator or none),
  // month-name ("24 Jul 2025", "July 24", "24 July"), and relative
  // ("today"/"aaj"/"आज"/"આજે", "yesterday"/"kal"). Each numeric candidate is
  // validated by real day/month ranges so a plain number (e.g. the loan
  // principal) is never mistaken for a date. Returns the matched dates (in
  // the order they appeared) and the text with those exact substrings
  // removed, so downstream number extraction never sees the date digits.
  function extractDates(text) {
    const found = [];
    const numberParser = NLU.numberParser;

    const consider = (m, dRaw, moRaw, yRaw) => {
      const d = parseInt(dRaw, 10), mo = parseInt(moRaw, 10);
      const y = String(yRaw).length <= 2 ? normalizeYear(parseInt(yRaw, 10)) : parseInt(yRaw, 10);
      if (!isValidDMY(d, mo, y)) return;
      const dt = buildDate(d, mo - 1, y);
      if (dt) found.push({ start: m.index, end: m.index + m[0].length, date: dt });
    };

    // --- Numeric, separated: dd [-/.] mm [-/.] (yyyy or yy) ---
    let m;
    const sepRe = /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})\b/g;
    while ((m = sepRe.exec(text))) consider(m, m[1], m[2], m[3]);

    // --- Numeric, no separator: ddmmyyyy (8 digits) then ddmmyy (6 digits) ---
    const bare8Re = /\b(\d{2})(\d{2})(\d{4})\b/g;
    while ((m = bare8Re.exec(text))) consider(m, m[1], m[2], m[3]);
    const bare6Re = /\b(\d{2})(\d{2})(\d{2})\b/g;
    while ((m = bare6Re.exec(text))) consider(m, m[1], m[2], m[3]);

    // --- "24 Jul 2025" / "24 July" (day, month name, optional year) ---
    const dayMonRe = /\b(\d{1,2})(st|nd|rd|th)?\s+([a-zA-Z]{3,9})\.?\s*(\d{4})?\b/g;
    while ((m = dayMonRe.exec(text))) {
      const moIdx = monthIndexFromWord(m[3]);
      if (moIdx < 0) continue;
      const d = parseInt(m[1], 10);
      const y = m[4] ? parseInt(m[4], 10) : new Date().getFullYear();
      if (!isValidDMY(d, moIdx + 1, y)) continue;
      const dt = buildDate(d, moIdx, y);
      if (dt) found.push({ start: m.index, end: m.index + m[0].length, date: dt });
    }

    // --- "July 24 2025" / "July 24" (month name, day, optional year) ---
    const monDayRe = /\b([a-zA-Z]{3,9})\.?\s+(\d{1,2})(st|nd|rd|th)?(\s+(\d{4}))?\b/g;
    while ((m = monDayRe.exec(text))) {
      const moIdx = monthIndexFromWord(m[1]);
      if (moIdx < 0) continue;
      const d = parseInt(m[2], 10);
      const y = m[5] ? parseInt(m[5], 10) : new Date().getFullYear();
      if (!isValidDMY(d, moIdx + 1, y)) continue;
      const dt = buildDate(d, moIdx, y);
      if (dt) found.push({ start: m.index, end: m.index + m[0].length, date: dt });
    }

    // --- Relative terms: today/aaj/आज/આજે, yesterday/kal ---
    const wordRe = /[a-zA-Z\u0900-\u097F\u0A80-\u0AFF]+/g;
    while ((m = wordRe.exec(text))) {
      const w = m[0].toLowerCase();
      if (TODAY_WORDS.includes(w) || numberParser.fuzzyMatches(w, TODAY_WORDS)) {
        found.push({ start: m.index, end: m.index + m[0].length, date: new Date() });
      } else if (YESTERDAY_WORDS.includes(w) || numberParser.fuzzyMatches(w, YESTERDAY_WORDS)) {
        found.push({ start: m.index, end: m.index + m[0].length, date: new Date(Date.now() - 86400000) });
      }
    }

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

  const MONTH_END_PHRASES = ["end of month", "end of the month", "month end", "month-end", "eom", "mahina na ant", "mahine ke ant"];

  function isMonthEndPhrase(text) {
    const lower = text.toLowerCase();
    return MONTH_END_PHRASES.some((p) => lower.includes(p));
  }

  function endOfCurrentMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0); // day 0 of next month = last day of this month
  }

  // "till 31" / "until 25" — a bare day-of-month with no month/year given,
  // meaning "this coming Nth of the month". Only used as a fallback when no
  // full explicit date was already found elsewhere in the message.
  function extractTillDayOfMonth(text) {
    const m = text.match(/\b(?:till|until|upto|up-to|tak)\s+(\d{1,2})\b(?!\s*[-\/.]\s*\d)/i);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    if (day < 1 || day > 31) return null;
    const now = new Date();
    let target = new Date(now.getFullYear(), now.getMonth(), day);
    if (target.getMonth() !== now.getMonth()) target = endOfCurrentMonth(); // e.g. "till 31" in a 30-day month -> clamp to month end
    return target;
  }

  NLU.dateParser = { extractDates, isValidDMY, normalizeYear, buildDate, monthIndexFromWord, isMonthEndPhrase, endOfCurrentMonth, extractTillDayOfMonth };
})();
