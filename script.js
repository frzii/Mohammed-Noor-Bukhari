let currentLang = localStorage.getItem("mnbk-language") || "en";

const showcase = document.querySelector(".premium-showcase");
const panels = document.querySelectorAll(".showcase-panel");
const visualCard = document.getElementById("visualCard");
const visualImages = document.querySelectorAll(".visual-dish-image");
const visualCurrent = document.getElementById("visualCurrent");
const visualTag = document.getElementById("visualTag");
const visualTitle = document.getElementById("visualTitle");
const visualDots = document.querySelectorAll("#visualDots button");

let activeIndex = 0;
let latestScrollY = window.scrollY;
let ticking = false;

const themeSettings = {
  rice: {
    accent: "#9b0000",
    accentSoft: "rgba(217, 164, 65, 0.24)"
  },
  chicken: {
    accent: "#a74210",
    accentSoft: "rgba(191, 89, 24, 0.22)"
  },
  kebab: {
    accent: "#6d220c",
    accentSoft: "rgba(126, 52, 18, 0.22)"
  },
  kabsa: {
    accent: "#bd7c21",
    accentSoft: "rgba(217, 164, 65, 0.28)"
  }
};

function formatNumber(number) {
  return String(number).padStart(2, "0");
}

function applyLanguage(language) {
  currentLang = language;

  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-en]").forEach((element) => {
    const translatedText = element.getAttribute(`data-${currentLang}`);

    if (translatedText) {
      element.textContent = translatedText;
    }
  });

  document.title =
    currentLang === "ar"
      ? "مطعم محمد نور بخاري البحرين | أرز بخاري ومشويات عربية"
      : "Mohammed Noor Bukhari Restaurant Bahrain | Bukhari Rice & Arabic Grills";

  updateVisualText(activeIndex);

  localStorage.setItem("mnbk-language", currentLang);
}

function toggleLanguage() {
  const nextLanguage = currentLang === "en" ? "ar" : "en";
  applyLanguage(nextLanguage);
  closeMenu();
}

function toggleMenu() {
  const menu = document.getElementById("mobileMenu");

  if (menu) {
    menu.classList.toggle("active");
  }
}

function closeMenu() {
  const menu = document.getElementById("mobileMenu");

  if (menu) {
    menu.classList.remove("active");
  }
}

function updateVisualText(index) {
  const panel = panels[index];

  if (!panel || !visualTitle || !visualTag || !visualCurrent) return;

  const title = panel.getAttribute(`data-visual-${currentLang}`) || panel.getAttribute("data-visual-en");

  visualTitle.textContent = title;
  visualTag.textContent = `${formatNumber(index + 1)} / ${formatNumber(panels.length)}`;
  visualCurrent.textContent = formatNumber(index + 1);
}

function setTheme(index) {
  const panel = panels[index];
  if (!panel || !showcase) return;

  const themeName = panel.dataset.theme || "rice";
  const theme = themeSettings[themeName] || themeSettings.rice;

  showcase.style.setProperty("--showcase-accent", theme.accent);
  showcase.style.setProperty("--showcase-accent-soft", theme.accentSoft);
}

function setActivePanel(index) {
  if (index === activeIndex) return;

  activeIndex = index;

  panels.forEach((panel, panelIndex) => {
    panel.classList.toggle("active", panelIndex === index);
  });

  visualImages.forEach((image, imageIndex) => {
    image.classList.toggle("active", imageIndex === index);
  });

  visualDots.forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === index);
  });

  updateVisualText(index);
  setTheme(index);

  if (visualCard) {
    visualCard.classList.remove("is-changing");

    requestAnimationFrame(() => {
      visualCard.classList.add("is-changing");
    });

    window.setTimeout(() => {
      visualCard.classList.remove("is-changing");
    }, 650);
  }
}

function getClosestPanelIndex() {
  let closestIndex = 0;
  let closestDistance = Infinity;
  const viewportCenter = window.innerHeight / 2;

  panels.forEach((panel, index) => {
    const rect = panel.getBoundingClientRect();
    const panelCenter = rect.top + rect.height / 2;
    const distance = Math.abs(viewportCenter - panelCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function getActivePanelProgress() {
  const panel = panels[activeIndex];

  if (!panel) return 0;

  const rect = panel.getBoundingClientRect();
  const viewportCenter = window.innerHeight / 2;
  const panelCenter = rect.top + rect.height / 2;

  const raw = (viewportCenter - panelCenter) / window.innerHeight;
  return Math.max(-1, Math.min(1, raw));
}

function animatePremiumVisual() {
  const nextIndex = getClosestPanelIndex();
  setActivePanel(nextIndex);

  if (visualCard && window.innerWidth > 760) {
    const progress = getActivePanelProgress();

    const floatY = Math.sin(latestScrollY * 0.003) * 14;
    const scrollLift = progress * -28;
    const rotateX = progress * 5;
    const scale = 1 - Math.abs(progress) * 0.025;
    const imageDepth = progress * -18;

    visualCard.style.setProperty("--visual-y", `${floatY + scrollLift}px`);
    visualCard.style.setProperty("--visual-rotate", `${rotateX}deg`);
    visualCard.style.setProperty("--visual-scale", scale.toFixed(3));
    visualCard.style.setProperty("--image-depth", `${imageDepth}px`);
  }

  ticking = false;
}

function onScroll() {
  latestScrollY = window.scrollY;

  if (!ticking) {
    requestAnimationFrame(animatePremiumVisual);
    ticking = true;
  }
}

visualDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    const index = Number(dot.dataset.index);
    const targetPanel = panels[index];

    if (!targetPanel) return;

    targetPanel.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  });
});

window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);

applyLanguage(currentLang);
setTheme(0);
updateVisualText(0);
animatePremiumVisual();

/*
Falling particle animation is paused for now.

Later, the system can be re-added here using:
- bukhari-rice.png
- chicken.png
- kabab-rise.png
- kabsa-rice.png

Current focus:
- premium sticky image parallax
- smooth image morphing
- active dish detection
- desktop motion
- mobile clean dish cards
*/