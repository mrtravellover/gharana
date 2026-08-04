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
  const ACCOUNT_WORDS = ["account", "customer", "check", "status", "loan", "hisab", "hisaab"];
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
    out = out.replace(/\b(?:till|until|upto|up-to|tak)\s+\d{1,2}\b(?!\s*[-\/.]\s*\d)/gi, " "); // bare "till 31" day-of-month (not a full date)
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
    const hasAccountKeyword = numberParser.containsKeyword(lower, ACCOUNT_WORDS);

    // A message only looks like a genuine calculator input if it has BOTH a
    // principal AND a rate — that's the real signal it's a what-if calc, not
    // an account lookup that happens to also mention a date (e.g. "Kavish's
    // account till 31-08-2025" has a date but no principal/rate at all).
    const looksLikeCalcInput = principal != null && rate != null;
    const hasNoNumericOrDateContent =
      !looksLikeCalcInput && principal == null && rate == null &&
      duration.months == null && duration.days == null && duration.years == null;

    // A message with NO numbers, NO calc-related words, and (if a date is
    // present at all) that date only ever being used as a projection target
    // — just plain text like "Ravi Patel" or "Kavish till 31-08-2025" — has
    // nothing else it could plausibly mean besides "look this person up."
    const trimmedRaw = rawText.trim();
    const textWithoutTillDate = trimmedRaw.replace(/\b(?:till|until|upto|up-to|tak)\b.*$/i, "").trim();
    const nameCheckText = textWithoutTillDate.length > 0 ? textWithoutTillDate : trimmedRaw;
    const looksLikeBareName =
      hasNoNumericOrDateContent && !isCalcCommand &&
      nameCheckText.length > 1 &&
      /^[a-zA-Z\u0900-\u097F\u0A80-\u0AFF\s.'-]+$/.test(nameCheckText) &&
      nameCheckText.split(/\s+/).length <= 5;

    const isAccountCommand = (hasAccountKeyword && hasNoNumericOrDateContent) || looksLikeBareName;

    // If this turned out to be an account query, work out whether a
    // projection date ("till 31-08-2025", "till end of month", "till 31")
    // was given — used to show the customer's balance as of a FUTURE date
    // instead of just today.
    let projectionDate = null;
    if (isAccountCommand) {
      if (dates.length && numberParser.containsKeyword(lower, TILL_WORDS)) {
        projectionDate = dates[dates.length - 1];
      } else if (dateParser.isMonthEndPhrase(rawText)) {
        projectionDate = dateParser.endOfCurrentMonth();
      } else {
        projectionDate = dateParser.extractTillDayOfMonth(rawText);
      }
    }

    // Whatever's left over (after stripping numbers/dates/keywords) is our
    // best guess at a customer name, for account-lookup style messages.
    const stopwords = CALC_WORDS.concat(ACCOUNT_WORDS, COMPOUND_WORDS, ["of", "the", "show", "me", "please", "for", "till", "until", "upto", "up-to", "tak", "end", "month", "eom", "current", "this", "from", "par", "se", "ka", "ki", "ke", "nu", "no", "તું", "નું"]);
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
      projectionDate,
    };
  }

  NLU.entityExtractor = { extract };
})();
