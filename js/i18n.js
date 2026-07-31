// ============================================================
// LANGUAGE / TRANSLATIONS
// Covers navigation and shared UI chrome (sidebar, mobile nav,
// login screen, common buttons) — the parts of the app visible
// on every screen. Page-specific content (loan forms, reports,
// etc.) stays in English for now; ask if you want that translated
// too, since it's a much bigger job (hundreds more strings).
// ============================================================

const SUPPORTED_LANGS = { en: "English", hi: "हिंदी (Hindi)", gu: "ગુજરાતી (Gujarati)", mr: "मराठी (Marathi)" };

const TRANSLATIONS = {
  en: {
    nav_dashboard: "Dashboard", nav_customers: "Customers", nav_loans: "Loans",
    nav_new_loan: "New Loan", nav_reports: "Reports", nav_profile: "Profile",
    signed_in_as: "Signed in as", sign_out: "Sign out",
    loading: "Loading Gharana…",
    login_title: "Gharana", login_tag: "Mortgage Management",
    login_email: "Email", login_password: "Password", login_btn: "Sign in",
    btn_save: "Save", btn_cancel: "Cancel", btn_add: "Add", btn_edit: "Edit",
    btn_delete: "Delete", btn_close: "Close",
  },
  hi: {
    nav_dashboard: "डैशबोर्ड", nav_customers: "ग्राहक", nav_loans: "गिरवी",
    nav_new_loan: "नई गिरवी", nav_reports: "रिपोर्ट", nav_profile: "प्रोफ़ाइल",
    signed_in_as: "लॉगिन:", sign_out: "साइन आउट",
    loading: "घराना लोड हो रहा है…",
    login_title: "घराना", login_tag: "मॉर्टगेज मैनेजमेंट",
    login_email: "ईमेल", login_password: "पासवर्ड", login_btn: "साइन इन करें",
    btn_save: "सेव करें", btn_cancel: "रद्द करें", btn_add: "जोड़ें", btn_edit: "बदलें",
    btn_delete: "हटाएं", btn_close: "बंद करें",
  },
  gu: {
    nav_dashboard: "ડેશબોર્ડ", nav_customers: "ગ્રાહકો", nav_loans: "ગીરવે",
    nav_new_loan: "નવી ગીરવે", nav_reports: "રિપોર્ટ", nav_profile: "પ્રોફાઇલ",
    signed_in_as: "લોગિન:", sign_out: "સાઇન આઉટ",
    loading: "ઘરાના લોડ થઈ રહ્યું છે…",
    login_title: "ઘરાના", login_tag: "મોર્ટગેજ મેનેજમેન્ટ",
    login_email: "ઈમેલ", login_password: "પાસવર્ડ", login_btn: "સાઇન ઇન કરો",
    btn_save: "સેવ કરો", btn_cancel: "રદ કરો", btn_add: "ઉમેરો", btn_edit: "બદલો",
    btn_delete: "કાઢી નાખો", btn_close: "બંધ કરો",
  },
  mr: {
    nav_dashboard: "डॅशबोर्ड", nav_customers: "ग्राहक", nav_loans: "गहाण",
    nav_new_loan: "नवीन गहाण", nav_reports: "अहवाल", nav_profile: "प्रोफाइल",
    signed_in_as: "लॉगिन:", sign_out: "साइन आउट",
    loading: "घराणा लोड होत आहे…",
    login_title: "घराणा", login_tag: "मॉर्टगेज मॅनेजमेंट",
    login_email: "ईमेल", login_password: "पासवर्ड", login_btn: "साइन इन करा",
    btn_save: "जतन करा", btn_cancel: "रद्द करा", btn_add: "जोडा", btn_edit: "बदला",
    btn_delete: "हटवा", btn_close: "बंद करा",
  },
};

function getLang() {
  return localStorage.getItem("gl_lang") || "en";
}

function setLang(lang) {
  localStorage.setItem("gl_lang", lang);
  location.reload();
}

function t(key) {
  const lang = getLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

// Applies translations to any element carrying data-i18n="key" in the DOM.
function applyTranslations(root) {
  (root || document).querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  (root || document).querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
}
