// ============================================================
// search.js — shared "Universal Smart Search" utility.
// Pure client-side (same pattern as everywhere else in this app —
// no per-keystroke Firestore queries). Typo-tolerant, real-time,
// highlights matches. Used by the Loans and Customers pages.
// ============================================================

// Small pure-JS Levenshtein distance for typo tolerance on short words —
// same technique already used by the Owl Assistant's parser.
function searchLevenshtein(a, b) {
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

// Does `text` contain `query` — exact substring match first (fast path,
// covers the vast majority of real searches), falling back to word-level
// typo tolerance (e.g. "ravi paetl" still finds "Ravi Patel").
function smartTextMatch(text, query) {
  const t = String(text || "").toLowerCase();
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  if (t.includes(q)) return true;
  if (q.length <= 2) return false; // too short to safely fuzzy-match (avoids false positives)

  const words = t.split(/\s+/);
  const maxDist = q.length <= 5 ? 1 : 2;
  return words.some((w) => w.length > 2 && searchLevenshtein(w, q) <= maxDist);
}

// Checks whether ANY of the given field values on a record match the query.
function smartMatchAny(fieldValues, query) {
  const q = String(query || "").trim();
  if (!q) return true;
  return fieldValues.some((v) => smartTextMatch(v, q));
}

// Wraps the (exact substring) match in <mark> for highlighting. Falls back
// to plain escaped text if there's no exact substring match (e.g. the hit
// was typo-tolerant, not literal) — never shows an incorrect highlight.
function highlightText(text, query) {
  const escaped = escapeHtml(text || "");
  const q = String(query || "").trim();
  if (!q) return escaped;
  const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return escaped.replace(new RegExp(`(${escapedQuery})`, "ig"), "<mark>$1</mark>");
  } catch (e) {
    return escaped;
  }
}
