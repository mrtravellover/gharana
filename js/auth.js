// ============================================================
// AUTH — simple email/password login for family staff accounts.
// Create accounts for you & your father in Firebase Console →
// Authentication → Users → Add user (or use the Settings screen later).
// ============================================================

function requireAuth(onReady) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      if (!location.pathname.endsWith("index.html") && location.pathname !== "/") {
        location.href = "index.html";
      }
    } else {
      onReady(user);
    }
  });
}

function logout() {
  auth.signOut().then(() => (location.href = "index.html"));
}

// Login page logic (only runs if #loginForm exists on the page)
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  auth.onAuthStateChanged((user) => {
    if (user) location.href = "dashboard.html";
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
      .then(() => (location.href = "dashboard.html"))
      .catch((err) => {
        errEl.textContent = err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found"
          ? "Wrong email or password."
          : err.message;
        errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Sign in";
      });
  });
});
