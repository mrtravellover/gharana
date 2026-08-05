// ============================================================
// numberParser.js — pure-JS number/quantity extraction.
// No AI, no external calls. Part of the Gharana Owl Assistant's
// rule-based NLU pipeline (see js/owl-nlu/README in comments below
// each file for how the pieces fit together).
//
// Exposes window.OwlNLU.numberParser
// ============================================================

(function () {
  window.OwlNLU = window.OwlNLU || {};

  // Small pure-JS Levenshtein distance — used for typo tolerance on short
  // keywords (e.g. "intrest", "byaj"). No library, just a tight double loop
  // over short strings, so it's effectively instant.
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
        prev = tmp;
      }
    }
    return dp[n];
  }

  // Does `word` match any of the given keyword aliases, allowing a small
  // amount of typo tolerance (distance 1 for short words, 2 for longer ones)?
  function fuzzyMatches(word, aliases) {
    const w = word.toLowerCase();
    for (const alias of aliases) {
      if (w === alias) return true;
      if (w.length <= 2) continue; // too short for safe fuzzy matching (e.g. "to" shouldn't match "tod")
      const maxDist = alias.length <= 4 ? 1 : 2;
      if (levenshtein(w, alias) <= maxDist) return true;
    }
    return false;
  }

  // Does the text contain any word matching these aliases (typo-tolerant)?
  function containsKeyword(text, aliases) {
    const words = text.toLowerCase().split(/[^a-z0-9\u0900-\u097F\u0A80-\u0AFF]+/).filter(Boolean);
    return words.some((w) => fuzzyMatches(w, aliases));
  }

  // Extract an explicit "%" rate, e.g. "2.5%" or "2 %"
  function extractPercent(text) {
    const m = text.match(/(\d+(\.\d+)?)\s*%/);
    return m ? parseFloat(m[1]) : null;
  }

  // Extract every plain number in the text (after other entities like dates,
  // %, mobile numbers, weights have already been stripped out by the caller).
  function extractAllNumbers(text) {
    return [...text.matchAll(/\d[\d,]*(\.\d+)?/g)].map((m) => ({
      value: parseFloat(m[0].replace(/,/g, "")),
      start: m.index,
      end: m.index + m[0].length,
    }));
  }

  // A 10-digit Indian mobile number, starting 6-9, not part of a longer digit run.
  function extractMobileNumber(text) {
    const m = text.match(/\b([6-9]\d{9})\b/);
    return m ? { value: m[1], start: m.index, end: m.index + m[0].length } : null;
  }

  // Receipt/loan number references — "SJ-2026-014", "receipt 45", "loan no 12", "#123"
  function extractReceiptNumber(text) {
    let m = text.match(/\b([A-Za-z]{1,6}-\d{2,6}-\d{1,6})\b/); // e.g. SJ-2026-014
    if (m) return { value: m[1], start: m.index, end: m.index + m[0].length };
    m = text.match(/#\s*(\d{1,8})\b/);
    if (m) return { value: m[1], start: m.index, end: m.index + m[0].length };
    m = text.match(/\b(?:receipt|loan\s*no\.?|receipt\s*no\.?)\s*[:#]?\s*(\d{1,8})\b/i);
    if (m) return { value: m[1], start: m.index, end: m.index + m[0].length };
    return null;
  }

  const GRAM_WORDS = ["gram", "grams", "gm", "gms", "g"];
  const GOLD_WORDS = ["gold", "sona", "sonu", "sone", "सोना", "સોનું", "સોના"];
  const SILVER_WORDS = ["silver", "chandi", "chandi", "चांदी", "ચાંદી"];

  // Finds a weight (in grams) tagged with a metal — "50 grams gold", "gold 50g",
  // "50g sona" etc. Returns { gold: n } or { silver: n } or {} if none found.
  function extractWeights(text) {
    const result = {};
    const lower = text.toLowerCase();
    // number immediately followed (within a few chars) by a gram-word
    const weightMatches = [...text.matchAll(/(\d+(\.\d+)?)\s*(gram|grams|gm|gms|g)\b/gi)];
    for (const wm of weightMatches) {
      const value = parseFloat(wm[1]);
      // look at a small window around the match for a metal keyword
      const windowStart = Math.max(0, wm.index - 20);
      const windowEnd = Math.min(text.length, wm.index + wm[0].length + 20);
      const windowText = lower.slice(windowStart, windowEnd);
      if (GOLD_WORDS.some((w) => windowText.includes(w))) result.gold = (result.gold || 0) + value;
      else if (SILVER_WORDS.some((w) => windowText.includes(w))) result.silver = (result.silver || 0) + value;
    }
    return result;
  }

  const MONTH_WORDS = { en: ["month", "months", "mahina", "mahine", "mahino"], hi: ["महीना", "महीने"], gu: ["મહિનો", "મહિના"] };
  const DAY_WORDS = { en: ["day", "days", "din"], hi: ["दिन"], gu: ["દિવસ"] };
  const YEAR_WORDS = { en: ["year", "years", "saal", "sal", "varsh"], hi: ["साल", "वर्ष"], gu: ["વર્ષ", "સાલ"] };

  function wordListMatches(w, groups) {
    return Object.values(groups).some((list) => list.some((a) => w === a.toLowerCase()));
  }

  function isDurationWord(word) {
    const w = word.toLowerCase();
    return wordListMatches(w, MONTH_WORDS) || fuzzyMatches(w, MONTH_WORDS.en) ||
      wordListMatches(w, DAY_WORDS) || fuzzyMatches(w, DAY_WORDS.en) ||
      wordListMatches(w, YEAR_WORDS) || fuzzyMatches(w, YEAR_WORDS.en);
  }

  // Finds "3 months", "150 days", "2 years" style durations (any language/typo).
  function extractDuration(text) {
    const out = { months: null, days: null, years: null };
    const tokens = [...text.matchAll(/(\d+(\.\d+)?)\s*([a-zA-Z\u0900-\u097F\u0A80-\u0AFF]+)/g)];
    for (const t of tokens) {
      const value = parseFloat(t[1]);
      const word = t[3].toLowerCase();
      if (wordListMatches(word, MONTH_WORDS) || fuzzyMatches(word, MONTH_WORDS.en)) out.months = value;
      else if (wordListMatches(word, DAY_WORDS) || fuzzyMatches(word, DAY_WORDS.en)) out.days = value;
      else if (wordListMatches(word, YEAR_WORDS) || fuzzyMatches(word, YEAR_WORDS.en)) out.years = value;
    }
    return out;
  }

  // Removes exactly the number+word pairs recognized as a duration (e.g.
  // "150 days", "3 month") from the text, so that number never leaks into
  // generic number extraction and gets mistaken for the principal amount.
  function stripDurationPhrases(text) {
    return text.replace(/(\d+(\.\d+)?)\s*([a-zA-Z\u0900-\u097F\u0A80-\u0AFF]+)/g, (whole, num, dec, word) => {
      return isDurationWord(word) ? " " : whole;
    });
  }

  window.OwlNLU.numberParser = {
    levenshtein,
    fuzzyMatches,
    containsKeyword,
    extractPercent,
    extractAllNumbers,
    extractMobileNumber,
    extractReceiptNumber,
    extractWeights,
    extractDuration,
    stripDurationPhrases,
  };
})();
