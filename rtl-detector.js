// Auto-detect language changes and apply RTL layout
(function () {
  const html = document.documentElement;
  const rtlLanguages = ["ar", "he", "fa", "ur", "yi"];

  function checkAndApplyRTL() {
    const currentLang = html.getAttribute("lang") || "en";
    const langCode = currentLang.split("-")[0].toLowerCase();

    if (rtlLanguages.includes(langCode)) {
      html.setAttribute("dir", "rtl");
      console.log("RTL layout applied for language:", currentLang);
    } else {
      html.setAttribute("dir", "ltr");
      console.log("LTR layout applied for language:", currentLang);
    }
  }

  // Check on page load
  checkAndApplyRTL();

  // Monitor for language attribute changes (e.g., Google Translate)
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === "attributes" && mutation.attributeName === "lang") {
        checkAndApplyRTL();
      }
    });
  });

  observer.observe(html, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  // Also check periodically for Google Translate changes
  setInterval(checkAndApplyRTL, 1000);
})();
