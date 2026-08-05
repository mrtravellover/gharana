// ============================================================
// AUTH — simple email/password login for family staff accounts.
// Create accounts for you & your father in Firebase Console →
// Authentication → Users → Add user (or use the Settings screen later).
// ============================================================

function inPagesDir() { return location.pathname.includes("/pages/"); }
function loginPath() { return inPagesDir() ? "../index.html" : "index.html"; }
function dashboardPath() { return inPagesDir() ? "dashboard.html" : "pages/dashboard.html"; }

function requireAuth(onReady) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      if (!location.pathname.endsWith("index.html") && location.pathname !== "/") {
        location.href = loginPath();
      }
    } else {
      onReady(user);
    }
  });
}

function logout() {
  auth.signOut().then(() => (location.href = loginPath()));
}

// Login page logic (only runs if #loginForm exists on the page)
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  auth.onAuthStateChanged((user) => {
    if (user) location.href = dashboardPath();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPass").value;
    const errEl = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");
    errEl.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Signing in…";

    auth.signInWithEmailAndPassword(email, pass)
      .then(() => (location.href = dashboardPath()))
      .catch((err) => {
        errEl.textContent = err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found"
          ? "Wrong email or password."
          : err.message;
        errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Sign in";
      });
  });

  // Defensive fallback: some mobile keyboards/browsers don't reliably
  // trigger native form-submit-on-Enter in every situation, so this
  // manually requests the same submit if Enter is pressed directly on
  // either field, redundant with (but not conflicting with) the above.
  ["loginEmail", "loginPass"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
  });
});
