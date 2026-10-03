(() => {
  try {
    const preference = localStorage.getItem("mdp-theme") || "system";
    const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.themePreference = preference;
    const locale = localStorage.getItem("mdp-locale") === "ar" ? "ar" : "en";
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.locale = locale;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = "en";
  }
})();
