// ============================================================
// conversationMemory.js — remembers an unfinished calculation
// across chat turns (e.g. user sends "10000", bot asks for the
// rate, user sends "2.5", bot asks for the date...). Pure in-memory
// state for the current chat session — resets on page reload, and
// resets itself the moment a clearly different intent (like an
// account lookup) comes in.
//
// Exposes window.OwlNLU.ConversationMemory (a small class)
// ============================================================

(function () {
  window.OwlNLU = window.OwlNLU || {};

  class ConversationMemory {
    constructor() {
      this.reset();
    }

    reset() {
      this.pending = { principal: null, rate: null, fromDate: null, toDate: null, interestType: "simple" };
      this.awaitingField = null; // which field the bot last asked for, if any
    }

    // Merges newly-extracted entities into whatever's already pending,
    // without overwriting a field that was already filled in an earlier turn
    // (unless the new message explicitly re-supplies that same kind of value).
    merge(entities) {
      if (entities.principal != null) this.pending.principal = entities.principal;
      if (entities.rate != null) this.pending.rate = entities.rate;
      if (entities.fromDate != null) this.pending.fromDate = entities.fromDate;
      if (entities.toDate != null) this.pending.toDate = entities.toDate;
      if (entities.interestType) this.pending.interestType = entities.interestType;
    }

    getMissingRequiredFields() {
      const missing = [];
      if (this.pending.principal == null) missing.push("principal");
      if (this.pending.rate == null) missing.push("rate");
      if (this.pending.fromDate == null) missing.push("fromDate");
      return missing;
    }

    isReadyToCalculate() {
      return this.getMissingRequiredFields().length === 0;
    }

    snapshot() {
      return { ...this.pending, toDate: this.pending.toDate || new Date() };
    }
  }

  window.OwlNLU.ConversationMemory = ConversationMemory;
})();
