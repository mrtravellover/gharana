// ============================================================
// crypto.js — client-side encryption for Aadhaar numbers only.
//
// WHY JUST AADHAAR: unlike names, amounts, or dates, Aadhaar numbers
// are never searched by partial match against Firestore itself, sorted,
// or used in any query — they're only ever displayed back to a signed-in
// user. That makes them the one field in this app that can be encrypted
// without breaking any feature.
//
// HOW: AES-256-GCM via the browser's built-in Web Crypto API — no
// external library, works in every modern browser. Encrypted values are
// stored in Firestore as "enc:<base64 iv+ciphertext>". Old, already-saved
// plain Aadhaar numbers (anything not starting with "enc:") are left
// exactly as they are and simply passed through unchanged — this is what
// makes the change backward-compatible with every existing customer/loan
// already in the database.
//
// HONEST LIMITS — this protects against:
//   - Someone browsing the raw Firestore database directly (Firebase
//     console access, a misconfigured export, a leaked backup)
//   - A future security-rules mistake that exposes more than intended
// It does NOT protect against someone who has this app's own source code,
// since the decryption key lives in it (same as the Firebase config
// itself already does) — there's no backend server to hide it behind.
// That's a real, disclosed tradeoff of a static site with no server.
// ============================================================

const AADHAAR_ENC_KEY_B64 = "9M/sWloO1QPTg2d+8FLCCb4ZdG05KLQ0L+CWYEYpoJY=";
let _aadhaarCryptoKeyPromise = null;

function getAadhaarKey() {
  if (!_aadhaarCryptoKeyPromise) {
    const raw = Uint8Array.from(atob(AADHAAR_ENC_KEY_B64), (c) => c.charCodeAt(0));
    _aadhaarCryptoKeyPromise = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  return _aadhaarCryptoKeyPromise;
}

/** Encrypts an Aadhaar number for storage. Empty input -> empty output. */
async function encryptAadhaar(plainText) {
  const text = (plainText || "").trim();
  if (!text) return "";
  try {
    const key = await getAadhaarKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuf), iv.length);
    return "enc:" + btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error("Aadhaar encryption failed — saving as plain text so data isn't lost:", err);
    return text; // never block saving a loan/customer over a crypto hiccup
  }
}

/** Decrypts a stored Aadhaar value. Passes through old plain-text values unchanged. */
async function decryptAadhaar(storedValue) {
  const v = (storedValue || "").trim();
  if (!v) return "";
  if (!v.startsWith("enc:")) return v; // legacy plain-text value from before this feature existed
  try {
    const key = await getAadhaarKey();
    const combined = Uint8Array.from(atob(v.slice(4)), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipherBuf = combined.slice(12);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
    return new TextDecoder().decode(plainBuf);
  } catch (err) {
    console.error("Aadhaar decryption failed:", err);
    return "⚠ (couldn't decrypt)";
  }
}

/** Decrypts the .aadhaar field on every object in an array, in place, in parallel. */
async function decryptAadhaarBatch(items, field = "aadhaar") {
  await Promise.all(items.map(async (item) => { item[field] = await decryptAadhaar(item[field]); }));
  return items;
}
