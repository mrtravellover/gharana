// ============================================================
// LOGIN OWL — decorative Lottie animation, login page only.
//
// This module is strictly additive and observational:
//  - It does NOT call auth.signInWithEmailAndPassword itself.
//  - It does NOT modify auth.js, firebase-config.js, or any redirect/
//    error-handling logic already owned by auth.js.
//  - It only ever reads existing DOM elements (#loginEmail, #loginPass,
//    #loginForm, #loginBtn, #loginError) via addEventListener, and
//    listens to Firebase's own onAuthStateChanged event — the same
//    pattern already used elsewhere in this app (nav.js, index.html's
//    splash-hide script) — to know when sign-in has succeeded.
//
// If the animation fails to load, or this specific Lottie file doesn't
// expose named markers for a given interaction, everything here no-ops
// gracefully. The login page works exactly as before either way.
// ============================================================

(function () {
  "use strict";

  const OWL_SRC = "https://lottie.host/c7668bc7-1b61-4958-a268-68939d2ba27a/dhuKIcqJ81.lottie";
  const DOTLOTTIE_CDN = "https://unpkg.com/@lottiefiles/dotlottie-wc@0.9.4/dist/dotlottie-wc.js";

  const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let owl = null;
  let card = null;
  let markerNames = []; // marker/state names this specific animation exposes, if any
  let ready = false;
  let pointerX = null;

  function init() {
    const container = document.getElementById("loginOwlContainer");
    owl = document.getElementById("loginOwl");
    card = document.querySelector(".login-card");
    const emailEl = document.getElementById("loginEmail");
    const passEl = document.getElementById("loginPass");
    const form = document.getElementById("loginForm");
    const errEl = document.getElementById("loginError");

    // Nothing to enhance — bail out silently. Login page still works fully.
    if (!container || !owl) return;

    loadDotLottieScript()
      .then(() => {
        // dotlottie-wc fires its own "load" once the animation data is fetched/parsed.
        owl.addEventListener("load", onOwlReady, { once: true });
        owl.addEventListener("error", onOwlError, { once: true });
      })
      .catch(onOwlError);

    // ---------- 2 & 3. Email focus + typing (eye tracking only if this animation supports it) ----------
    if (emailEl) {
      emailEl.addEventListener("focus", () => playMarkerIfAvailable(["look", "focus", "attentive"]));
      emailEl.addEventListener("input", () => trackEyesIfSupported(emailEl));
      emailEl.addEventListener("blur", () => playMarkerIfAvailable(["idle"]));
    }

    // ---------- 4 & 5. Password focus (cover eyes) / blur (back to idle) ----------
    if (passEl) {
      passEl.addEventListener("focus", () => playMarkerIfAvailable(["coverEyes", "cover_eyes", "hide"]));
      passEl.addEventListener("blur", () => playMarkerIfAvailable(["idle"]));
    }

    // ---------- 6. Submit — purely observational, does not touch the real sign-in call ----------
    // auth.js's own submit listener (registered separately) still owns disabling the
    // button, calling Firebase, and redirecting/showing errors. This just keeps the
    // owl animating so the UI never looks frozen while that's in flight.
    if (form) {
      form.addEventListener("submit", () => {
        playMarkerIfAvailable(["loading", "thinking"]); // no matching marker → keeps idle loop going
      });
    }

    // ---------- 7. Success — Firebase's own auth-state event, not a DOM hook into auth.js ----------
    if (typeof auth !== "undefined" && auth && typeof auth.onAuthStateChanged === "function") {
      auth.onAuthStateChanged((user) => {
        if (user) playMarkerIfAvailable(["success", "happy"]);
      });
    }

    // ---------- 8. Failure — observe the existing #loginError element auth.js already updates ----------
    if (errEl) {
      const observer = new MutationObserver(() => {
        const visible = errEl.style.display !== "none" && errEl.textContent.trim() !== "";
        if (visible) {
          playMarkerIfAvailable(["error", "sad"]);
          shakeLoginCard(); // shakes the CARD only — never the owl
        }
      });
      observer.observe(errEl, { attributes: true, attributeFilter: ["style"], childList: true, characterData: true, subtree: true });
    }
  }

  function onOwlReady() {
    ready = true;
    markerNames = readMarkerNames(owl);

    if (reducedMotion) {
      // Respect prefers-reduced-motion: keep the owl visible (not hidden),
      // just don't loop or autoplay-animate it.
      try {
        owl.loop = false;
        owl.autoplay = false;
        if (typeof owl.pause === "function") owl.pause();
      } catch (e) {
        /* non-fatal — worst case it keeps looping */
      }
    }
  }

  function onOwlError() {
    // Never let a failed animation load break the login page — just hide the slot.
    const container = document.getElementById("loginOwlContainer");
    if (container) container.style.display = "none";
  }

  // Injects the official dotlottie-wc custom element definition, lazily —
  // only once the login page is actually interactive, not blocking first paint.
  function loadDotLottieScript() {
    return new Promise((resolve, reject) => {
      if (window.customElements && customElements.get("dotlottie-wc")) return resolve();
      const script = document.createElement("script");
      script.type = "module";
      script.src = DOTLOTTIE_CDN;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("dotlottie-wc failed to load"));
      document.head.appendChild(script);
    });
  }

  // Reads whatever marker/state names this specific .lottie file exposes, if any.
  // dotlottie-wc's manifest API shape can vary by version, so this stays defensive
  // and simply returns an empty list (→ every interaction below no-ops) if it can't
  // find one, rather than guessing or faking marker-based playback.
  function readMarkerNames(el) {
    try {
      const manifest = (typeof el.getManifest === "function" && el.getManifest()) || el.manifest;
      if (manifest && Array.isArray(manifest.markers)) {
        return manifest.markers.map((m) => (m && m.name ? m.name : m)).filter(Boolean);
      }
    } catch (e) {
      /* this build/version doesn't expose marker introspection — that's fine */
    }
    return [];
  }

  // Plays a named marker/state if this animation actually has one matching any of
  // the candidate names; otherwise just keeps the idle loop running. Never fakes
  // a state the animation doesn't have.
  function playMarkerIfAvailable(candidateNames) {
    if (!ready || !owl || reducedMotion) return;
    try {
      const match = candidateNames.find((name) => markerNames.includes(name));
      if (match && "marker" in owl) {
        owl.marker = match;
      }
      if (typeof owl.play === "function") owl.play();
    } catch (e) {
      /* never let animation control errors affect the login page */
    }
  }

  // Mouse-position-based eye tracking — ONLY engages if this specific animation
  // exposes left/right look markers. If it doesn't, this intentionally does
  // nothing (no CSS-transform fallback, per requirements).
  function trackEyesIfSupported(inputEl) {
    if (!ready || !owl || reducedMotion) return;
    const hasLeft = ["lookLeft", "look_left", "eyesLeft"].some((n) => markerNames.includes(n));
    const hasRight = ["lookRight", "look_right", "eyesRight"].some((n) => markerNames.includes(n));
    if (!hasLeft || !hasRight) return; // unsupported by this animation — do nothing

    try {
      const rect = inputEl.getBoundingClientRect();
      const x = pointerX == null ? rect.left + rect.width / 2 : pointerX;
      const relativeX = (x - rect.left) / rect.width; // 0 = left edge, 1 = right edge
      if ("marker" in owl) {
        owl.marker = relativeX < 0.4 ? "lookLeft" : relativeX > 0.6 ? "lookRight" : "idle";
        if (typeof owl.play === "function") owl.play();
      }
    } catch (e) {
      /* non-fatal */
    }
  }

  window.addEventListener("mousemove", (e) => { pointerX = e.clientX; }, { passive: true });

  function shakeLoginCard() {
    if (!card) return;
    card.classList.remove("login-card--shake");
    void card.offsetWidth; // forces reflow so the animation restarts if triggered twice in a row
    card.classList.add("login-card--shake");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
