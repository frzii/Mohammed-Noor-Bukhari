let currentLang = "en";

function toggleLanguage() {
  currentLang = currentLang === "en" ? "ar" : "en";

  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-en]").forEach((element) => {
    element.textContent = element.getAttribute(`data-${currentLang}`);
  });

  document.title =
    currentLang === "ar"
      ? "مطعم محمد نور بخاري البحرين | أرز بخاري ومشويات"
      : "Mohammed Noor Bukhari Restaurant Bahrain | Authentic Bukhari & Grills";
}