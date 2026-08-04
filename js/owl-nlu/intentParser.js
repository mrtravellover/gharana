// ============================================================
// intentParser.js — decides what the bot should DO with a message:
// calculate now, ask for one missing piece, do an account lookup,
// or say it couldn't understand. Combines entityExtractor's output
// with ConversationMemory (so partial info from earlier turns
// still counts), and produces a confidence score that drives which
// of those three behaviors happens.
//
// Confidence tiers (per spec):
//   > 90   -> calculate immediately
//   60-90  -> ask exactly one clarifying question
//   < 60   -> "I couldn't fully understand..."
//
// Exposes window.OwlNLU.intentParser
// ============================================================

(function () {
  window.OwlNLU = window.OwlNLU || {};
  const NLU = window.OwlNLU;

  const FIELD_QUESTIONS = {
    principal: "What is the loan amount?",
    rate: "What is the interest rate?",
    fromDate: "What is the starting date?",
  };
  const FIELD_LABELS = { principal: "the loan amount", rate: "the interest rate", fromDate: "the starting date" };

  // process(text, memory) -> { action, confidence, entities, memorySnapshot, question, accountQuery }
  function process(rawText, memory) {
    const trimmed = rawText.trim();
    let fastPathHandled = false;

    // Fast path: if the bot specifically asked for one field last turn and
    // this message is just a simple bare value, use it directly for that
    // field. This is what makes multi-turn context actually work — e.g.
    // principal is already known, bot asked for the rate, user replies
    // "2.5" — without this, the general extractor (which has to guess when
    // a message is ambiguous on its own) would wrongly treat a lone number
    // as a brand-new principal and clobber the one already collected.
    if (memory.awaitingField) {
      const awaited = memory.awaitingField;
      if (awaited === "rate" && /^\d+(\.\d+)?%?$/.test(trimmed)) {
        memory.pending.rate = parseFloat(trimmed);
        memory.awaitingField = null;
        fastPathHandled = true;
      } else if (awaited === "principal" && /^\d+(\.\d+)?$/.test(trimmed)) {
        memory.pending.principal = parseFloat(trimmed);
        memory.awaitingField = null;
        fastPathHandled = true;
      } else if (awaited === "fromDate") {
        const { dates } = NLU.dateParser.extractDates(rawText);
        if (dates.length) {
          memory.pending.fromDate = dates[0];
          memory.awaitingField = null;
          fastPathHandled = true;
        }
      }
    }

    let entities;
    if (fastPathHandled) {
      entities = { principal: null, rate: null, fromDate: null, toDate: null, isCalcCommand: true, isAccountCommand: false, nameCandidate: "", mobile: null, receiptNumber: null };
    } else {
      entities = NLU.entityExtractor.extract(rawText);

      // An account-lookup style message always resets any pending calculation —
      // it's a clearly different topic, so old partial numbers shouldn't leak in.
      if (entities.isAccountCommand || entities.receiptNumber || entities.mobile) {
        memory.reset();
        return {
          action: "account_lookup",
          confidence: 95,
          entities,
          accountQuery: { name: entities.nameCandidate, receiptNumber: entities.receiptNumber, mobile: entities.mobile },
        };
      }
      memory.merge(entities);
    }

    const missing = memory.getMissingRequiredFields();
    if (missing.length === 0) {
      return { action: "calculate", confidence: 97, entities, memorySnapshot: memory.snapshot() };
    }

    const foundSomethingUseful = fastPathHandled ||
      entities.principal != null || entities.rate != null || entities.fromDate != null || entities.toDate != null ||
      entities.isCalcCommand || entities.nameCandidate.length > 1;

    if (!foundSomethingUseful) {
      return { action: "unclear", confidence: 20, entities };
    }

    // Ask for exactly the next missing field — never more than one at a time.
    const nextField = missing[0];
    memory.awaitingField = nextField;
    return {
      action: "ask",
      confidence: 75,
      entities,
      question: FIELD_QUESTIONS[nextField],
      missingLabel: FIELD_LABELS[nextField],
      memorySnapshot: memory.snapshot(),
    };
  }

  NLU.intentParser = { process };
})();
