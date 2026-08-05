// ============================================================
// theme.js — Light / Dark / System theme management, shared across
// every page. The actual FOUC-prevention (applying the theme before
// first paint) happens via a tiny inline script duplicated in each
// page's <head> — this file handles everything else: the toggle UI,
// keeping "System" live if the OS theme changes while the app is
// open, and persisting the choice.
// ============================================================

const THEME_KEY = "gl_theme"; // "light" | "dark" | "system"

function getThemePreference() {
  return localStorage.getItem(THEME_KEY) || "system";
}

function resolveTheme(pref) {
  if (pref === "system") {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function applyTheme(pref) {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref));
}

function setThemePreference(pref) {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
  updateThemeToggleUI();
}

// Keeps "System" mode live — if the OS theme changes while the app is
// open (e.g. auto night mode kicking in), follow it without a reload.
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePreference() === "system") applyTheme("system");
  });
}

// ---------- Toggle UI (injected into the sidebar, appears on every authenticated page) ----------
function renderThemeToggle(containerId) {
  const container = document.getElementById(containerId || "themeToggle");
  if (!container) return;
  const pref = getThemePreference();
  container.innerHTML = `
    <div class="theme-toggle-group" role="radiogroup" aria-label="Theme">
      <button type="button" class="theme-toggle-btn" data-pref="light" title="Light" aria-label="Light theme">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
      </button>
      <button type="button" class="theme-toggle-btn" data-pref="dark" title="Dark" aria-label="Dark theme">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>
      </button>
      <button type="button" class="theme-toggle-btn" data-pref="system" title="System" aria-label="Match system">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      </button>
    </div>
  `;
  container.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.pref === pref);
    btn.addEventListener("click", () => setThemePreference(btn.dataset.pref));
  });
}

function updateThemeToggleUI() {
  const pref = getThemePreference();
  document.querySelectorAll(".theme-toggle-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.pref === pref));
}
