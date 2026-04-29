const FRAME_COUNT = 120;
const FRAME_FOLDER = "sequence";
const FRAME_PREFIX = "frame_";
const FRAME_EXTENSION = "webp";
const FRAME_START = 1;
const FRAME_PAD = 4;

const BACKGROUND_COLOR = "#050505";
const SPRING_STIFFNESS = 100;
const SPRING_DAMPING = 30;

let currentLang = localStorage.getItem("mnbk-language") || "en";

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileQuery = window.matchMedia("(max-width: 760px)");

const sequenceScroll = document.getElementById("sequenceScroll");
const canvas = document.getElementById("sequenceCanvas");
const ctx = canvas ? canvas.getContext("2d", { alpha: false, desynchronized: true }) : null;

const loader = document.getElementById("loader");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const frameCurrent = document.getElementById("frameCurrent");
const frameTotal = document.getElementById("frameTotal");
const scrollHint = document.getElementById("scrollHint");
const storyBeats = Array.from(document.querySelectorAll(".story-beat"));

let loadedFrames = [];
let activeFrame = -1;

let canvasWidth = 0;
let canvasHeight = 0;

let targetProgress = 0;
let springProgress = 0;
let springVelocity = 0;
let lastTime = performance.now();

let rafId = 0;
let isSequenceReady = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function padFrameNumber(value) {
  return String(value).padStart(FRAME_PAD, "0");
}

function formatCounterNumber(value) {
  return String(value).padStart(3, "0");
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

  localStorage.setItem("mnbk-language", currentLang);
}

function toggleLanguage() {
  applyLanguage(currentLang === "en" ? "ar" : "en");
  closeMenu();
}

window.toggleMenu = toggleMenu;
window.closeMenu = closeMenu;
window.toggleLanguage = toggleLanguage;

function getSequenceSources() {
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const frameNumber = FRAME_START + index;
    return `${FRAME_FOLDER}/${FRAME_PREFIX}${padFrameNumber(frameNumber)}.${FRAME_EXTENSION}`;
  });
}

function updateLoaderProgress(loadedCount, totalCount) {
  const percentage = totalCount > 0 ? Math.round((loadedCount / totalCount) * 100) : 0;

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }

  if (progressText) {
    progressText.textContent = `${percentage}%`;
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();

    image.decoding = "async";
    image.loading = "eager";

    image.onload = () => {
      resolve({
        image,
        ok: true,
        src
      });
    };

    image.onerror = () => {
      resolve({
        image: null,
        ok: false,
        src
      });
    };

    image.src = src;
  });
}

async function preloadImages(sources) {
  let completed = 0;

  const results = await Promise.all(
    sources.map(async (source) => {
      const result = await loadImage(source);

      completed += 1;
      updateLoaderProgress(completed, sources.length);

      return result;
    })
  );

  const failedFrames = results.filter((result) => !result.ok).map((result) => result.src);

  if (failedFrames.length > 0) {
    console.warn(
      `${failedFrames.length} frame(s) failed to load. First missing frames:`,
      failedFrames.slice(0, 15)
    );
  }

  return results
    .filter((result) => result.ok && result.image)
    .map((result) => result.image);
}

function resizeCanvas() {
  if (!canvas || !ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);

  canvasWidth = Math.floor(width * dpr);
  canvasHeight = Math.floor(height * dpr);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  activeFrame = -1;
  drawFrame(getFrameIndex(springProgress));
}

function getScrollProgress() {
  if (!sequenceScroll) return 0;

  const rect = sequenceScroll.getBoundingClientRect();
  const scrollableDistance = Math.max(1, sequenceScroll.offsetHeight - window.innerHeight);

  return clamp(-rect.top / scrollableDistance, 0, 1);
}

function getFrameIndex(progress) {
  if (!loadedFrames.length) return 0;

  const index = Math.round(clamp(progress, 0, 1) * (loadedFrames.length - 1));
  return clamp(index, 0, loadedFrames.length - 1);
}

function drawFrame(index) {
  if (!ctx || !canvas || !loadedFrames.length || !loadedFrames[index]) return;

  if (index === activeFrame && canvas.width === canvasWidth && canvas.height === canvasHeight) {
    return;
  }

  const image = loadedFrames[index];

  const width = canvas.width;
  const height = canvas.height;

  ctx.save();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);

  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;

  let drawWidth;
  let drawHeight;

  /**
   * Cover behavior:
   * fills the full screen like background-size: cover.
   */
  if (imageRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
  }

  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  ctx.drawImage(image, x, y, drawWidth, drawHeight);

  ctx.restore();

  activeFrame = index;

  if (frameCurrent) {
    frameCurrent.textContent = formatCounterNumber(index + 1);
  }
}

function getBeatState(progress, start, end) {
  const fadeEdge = Math.min(0.1, (end - start) / 2);

  if (progress <= start || progress >= end) {
    return {
      opacity: 0,
      y: progress < start ? 20 : -20
    };
  }

  if (progress < start + fadeEdge) {
    const local = (progress - start) / fadeEdge;

    return {
      opacity: local,
      y: lerp(20, 0, local)
    };
  }

  if (progress > end - fadeEdge) {
    const local = (progress - (end - fadeEdge)) / fadeEdge;

    return {
      opacity: 1 - local,
      y: lerp(0, -20, local)
    };
  }

  return {
    opacity: 1,
    y: 0
  };
}

function updateStoryBeats(progress) {
  storyBeats.forEach((beat) => {
    const start = Number(beat.dataset.start || 0);
    const end = Number(beat.dataset.end || 1);

    const state = getBeatState(progress, start, end);
    const shouldCenter = beat.classList.contains("beat-center") || mobileQuery.matches;

    beat.style.opacity = state.opacity.toFixed(3);

    beat.style.transform = shouldCenter
      ? `translate(-50%, ${state.y.toFixed(2)}px)`
      : `translateY(${state.y.toFixed(2)}px)`;

    beat.style.pointerEvents = state.opacity > 0.8 ? "auto" : "none";
  });
}

function updateScrollHint(progress) {
  if (!scrollHint) return;

  const opacity = clamp(1 - progress / 0.1, 0, 1);
  scrollHint.style.opacity = opacity.toFixed(3);
}

function updateTargetProgress() {
  targetProgress = getScrollProgress();
}

function animationLoop(now) {
  const delta = clamp((now - lastTime) / 1000, 0, 0.05);
  lastTime = now;

  updateTargetProgress();

  if (reducedMotionQuery.matches) {
    springProgress = targetProgress;
    springVelocity = 0;
  } else {
    const force = (targetProgress - springProgress) * SPRING_STIFFNESS;

    springVelocity += (force - springVelocity * SPRING_DAMPING) * delta;
    springProgress += springVelocity * delta;
    springProgress = clamp(springProgress, 0, 1);
  }

  if (isSequenceReady) {
    drawFrame(getFrameIndex(springProgress));
    updateStoryBeats(springProgress);
    updateScrollHint(springProgress);
  }

  rafId = requestAnimationFrame(animationLoop);
}

async function initSequence() {
  if (!canvas || !ctx || !sequenceScroll) return;

  document.body.classList.add("is-loading");

  resizeCanvas();
  updateLoaderProgress(0, FRAME_COUNT);

  const sequenceImages = await preloadImages(getSequenceSources());

  if (!sequenceImages.length) {
    console.error(
      "No sequence frames loaded. Your files must be named like sequence/frame_0001.png, sequence/frame_0002.png, etc."
    );

    if (loader) {
      const loaderText = loader.querySelector("p");

      if (loaderText) {
        loaderText.textContent = "Frames not found. Check sequence folder names.";
      }
    }

    return;
  }

  loadedFrames = sequenceImages;

  if (frameTotal) {
    frameTotal.textContent = formatCounterNumber(loadedFrames.length);
  }

  isSequenceReady = true;

  resizeCanvas();
  updateStoryBeats(0);
  updateScrollHint(0);

  window.setTimeout(() => {
    if (loader) {
      loader.classList.add("is-hidden");
    }

    document.body.classList.remove("is-loading");
  }, 350);
}

function onResize() {
  resizeCanvas();
  updateTargetProgress();
}

function bindEvents() {
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  document.querySelectorAll(".mobile-menu a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

function cleanup() {
  cancelAnimationFrame(rafId);

  window.removeEventListener("resize", onResize);
  window.removeEventListener("orientationchange", onResize);

  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

applyLanguage(currentLang);
bindEvents();
initSequence();

rafId = requestAnimationFrame(animationLoop);

window.addEventListener("pagehide", cleanup, { once: true });