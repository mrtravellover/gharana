// ============================================================
// entityExtractor.js — pulls every entity type out of a free-text
// message: principal, rate, dates, customer name, mobile number,
// receipt number, gold/silver weight, duration (months/days/years),
// and recognized command words — in English, Hindi, Gujarati, and
// Hinglish, with typo tolerance. Order-independent: works whatever
// order the words/numbers appear in.
//
// Exposes window.OwlNLU.entityExtractor
// ============================================================

(function () {
  window.OwlNLU = window.OwlNLU || {};
  const NLU = window.OwlNLU;

  // Multilingual/typo-tolerant command keyword groups.
  const CALC_WORDS = ["interest", "intrest", "interst", "int", "calc", "calculate", "calclate", "byaaj", "byaj", "vyaj", "vyaaj", "व्याज", "byaaj", "વ્યાજ"];
  const ACCOUNT_WORDS = ["account", "customer", "check", "status", "loan"];
  const COMPOUND_WORDS = ["compound", "compounding", "ca"];

  function stripKnownExtras(text, numberParser) {
    // Removes % rate, mobile number, receipt number, weight+metal phrases, and
    // duration phrases ("150 days", "3 months") from the text so what's left
    // is cleanly available for principal/name extraction. Without stripping
    // the duration phrase too, its number (e.g. "150") would leak through and
    // get mistaken for the principal amount.
    let out = text;
    out = out.replace(/(\d+(\.\d+)?)\s*%/g, " ");
    out = out.replace(/\b([6-9]\d{9})\b/g, " ");
    out = out.replace(/\b([A-Za-z]{1,6}-\d{2,6}-\d{1,6})\b/g, " ");
    out = out.replace(/#\s*(\d{1,8})\b/g, " ");
    out = out.replace(/\b(?:receipt|loan\s*no\.?|receipt\s*no\.?)\s*[:#]?\s*(\d{1,8})\b/gi, " ");
    out = out.replace(/(\d+(\.\d+)?)\s*(gram|grams|gm|gms|g)\b/gi, " ");
    out = numberParser.stripDurationPhrases(out);
    return out;
  }

  const TILL_WORDS = ["till", "until", "upto", "up-to", "up", "tak", "सुधी", "सुध", "સુધી"];
  const FROM_WORDS = ["from", "since", "se", "थी", "થી"];

  // Turns a duration (months/days/years, whichever was found) into a
  // fromDate/toDate pair anchored on today, e.g. "interest for 150 days"
  // -> fromDate = 150 days ago, toDate = today.
  function durationToDateRange(duration) {
    const now = new Date();
    if (duration.days != null) return { fromDate: new Date(now.getTime() - duration.days * 86400000), toDate: now };
    if (duration.months != null) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - Math.floor(duration.months));
      return { fromDate: d, toDate: now };
    }
    if (duration.years != null) {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - Math.floor(duration.years));
      return { fromDate: d, toDate: now };
    }
    return null;
  }

  // Main entry point: extracts everything this module knows how to find.
  function extract(rawText) {
    const numberParser = NLU.numberParser;
    const dateParser = NLU.dateParser;
    const lower = rawText.toLowerCase();

    const mobile = numberParser.extractMobileNumber(rawText);
    const receipt = numberParser.extractReceiptNumber(rawText);
    const weights = numberParser.extractWeights(rawText);
    const explicitPercent = numberParser.extractPercent(rawText);
    const duration = numberParser.extractDuration(rawText);

    const { dates, strippedText: afterDates } = dateParser.extractDates(rawText);

    let afterExtras = stripKnownExtras(afterDates, numberParser);
    const numbers = numberParser.extractAllNumbers(afterExtras).map((n) => n.value);

    // Rate vs principal: an explicit "%" always wins. Otherwise use the rule
    // that a monthly interest rate is always under 50, so it can be told
    // apart from the (much larger) principal without needing "%" at all.
    let rate = explicitPercent;
    let principal = null;
    if (rate !== null) {
      principal = numbers.length ? Math.max(...numbers) : null;
    } else if (numbers.length >= 2) {
      const small = numbers.filter((n) => n < 50);
      const large = numbers.filter((n) => n >= 50);
      if (small.length && large.length) {
        rate = Math.max(...small);
        principal = Math.max(...large);
      } else {
        principal = Math.max(...numbers);
      }
    } else if (numbers.length === 1) {
      principal = numbers[0];
    }

    // If no explicit dates were found but a duration ("3 months", "150 days")
    // was, derive a fromDate/toDate pair from it.
    let fromDate = dates[0] || null;
    let toDate = dates[1] || null;
    if (dates.length === 1) {
      // A single date is ambiguous on its own — "till today" means today is
      // the END, "from 1 Jan" means it's the START. Use whichever direction
      // word is present to tell them apart instead of always assuming "from".
      const hasTill = numberParser.containsKeyword(lower, TILL_WORDS);
      const hasFrom = numberParser.containsKeyword(lower, FROM_WORDS);
      if (hasTill && !hasFrom) { fromDate = null; toDate = dates[0]; }
    }
    if (!fromDate && (duration.months != null || duration.days != null || duration.years != null)) {
      const range = durationToDateRange(duration);
      fromDate = range.fromDate;
      toDate = range.toDate;
    }

    const interestType = numberParser.containsKeyword(lower, COMPOUND_WORDS) ? "compound_annual" : null;

    const isCalcCommand = numberParser.containsKeyword(lower, CALC_WORDS);
    const isAccountCommand = numberParser.containsKeyword(lower, ACCOUNT_WORDS) && principal == null && rate == null && !dates.length;

    // Whatever's left over (after stripping numbers/dates/keywords) is our
    // best guess at a customer name, for account-lookup style messages.
    const stopwords = CALC_WORDS.concat(ACCOUNT_WORDS, COMPOUND_WORDS, ["of", "the", "show", "me", "please", "for", "till", "from", "par", "se", "ka", "ki", "ke", "nu", "no", "તું", "નું"]);
    const nameCandidate = afterExtras
      .split(/\s+/)
      .filter((w) => w && !stopwords.includes(w.toLowerCase()) && !/^\d+$/.test(w))
      .join(" ")
      .trim();

    return {
      principal,
      rate,
      fromDate,
      toDate,
      interestType,
      mobile: mobile ? mobile.value : null,
      receiptNumber: receipt ? receipt.value : null,
      goldWeight: weights.gold || null,
      silverWeight: weights.silver || null,
      duration,
      isCalcCommand,
      isAccountCommand,
      nameCandidate,
    };
  }

  NLU.entityExtractor = { extract };
})();
