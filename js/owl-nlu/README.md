# Gharana Owl Assistant — NLU pipeline

Pure rule-based, offline, zero-API natural language understanding for the
chat widget. No AI, no external calls — everything here is plain ES6
JavaScript running entirely in the browser.

## How a message flows through the pipeline

```
user types a message
        │
        ▼
intentParser.process(text, conversationMemory)
        │
        ├─► entityExtractor.extract(text)
        │       ├─► numberParser   (amounts, %, mobile, receipt no., weights, durations)
        │       └─► dateParser     (dd-mm-yyyy, ddmmyy, "24 July", "today"/"aaj", ...)
        │
        ├─► conversationMemory.merge(entities)   (remembers partial info across turns)
        │
        └─► decides one of four actions:
              • "calculate"      — confidence > 90, all required fields present
              • "ask"            — confidence 60-90, ask for exactly ONE missing field
              • "account_lookup" — a customer/receipt/mobile-number style query
              • "unclear"        — confidence < 60, nothing usable recognized
                    │
                    ▼
        responseGenerator renders the actual chat HTML
                    │
                    ▼
        interestCalculator.calculate(...)  — thin wrapper around the app's
        REAL js/interest.js engine. This module never reimplements the
        interest math itself, so the chatbot's numbers can never drift
        from what the actual loan pages show.
```

## Files

| File | Responsibility |
|---|---|
| `numberParser.js` | Numbers, %, mobile numbers, receipt/loan numbers, gold/silver weights, durations (months/days/years), typo-tolerant keyword matching (small pure-JS Levenshtein distance) |
| `dateParser.js` | Every date format: numeric (any separator or none), month-name ("24 Jul 2025"), relative ("today"/"aaj"/"आज"/"આજે", "yesterday"/"kal") |
| `entityExtractor.js` | Combines the two parsers above into one full entity bag per message, order-independent — handles the rate-vs-principal disambiguation (a monthly rate is always under 50) and "till X" vs "from X" direction words |
| `conversationMemory.js` | Remembers a partially-filled calculation across chat turns — so "10000" → "2.5" → "24 July" completes the same calculation instead of starting over each time |
| `intentParser.js` | Decides what to actually do with a message (calculate / ask / account lookup / unclear) and computes the confidence score that drives that decision |
| `interestCalculator.js` | Thin wrapper around `js/interest.js` — no duplicate math |
| `responseGenerator.js` | Builds the chat HTML (confirmation card + result, or a single clarifying question, or the "couldn't understand" message) |

## Load order (already wired into every page that uses the assistant)

```html
<script src="../js/interest.js"></script>          <!-- must load first -->
<script src="../js/owl-nlu/numberParser.js"></script>
<script src="../js/owl-nlu/dateParser.js"></script>
<script src="../js/owl-nlu/entityExtractor.js"></script>
<script src="../js/owl-nlu/conversationMemory.js"></script>
<script src="../js/owl-nlu/intentParser.js"></script>
<script src="../js/owl-nlu/interestCalculator.js"></script>
<script src="../js/owl-nlu/responseGenerator.js"></script>
<script src="../js/owl-assistant.js"></script>       <!-- uses all of the above -->
```

## Known, honest limitations

- **Typo tolerance** uses a small Levenshtein-distance check plus explicit
  alias lists for the typos named in the spec (intrest, byaj, todya, etc.) —
  not a full statistical spell-checker. Unlisted typos more than 1-2
  characters off may not be caught.
- **A 6-digit amount that also happens to look like a valid date** (e.g.
  "310825") could be misread as a date instead of a principal, since bare
  numeric dates are supported. Using a separator (31-08-25) avoids this.
- **A loan amount under ₹50** would be ambiguous against the rate-detection
  rule (rate is always assumed < 50). Not a realistic case for this
  business, so it wasn't specially handled.
