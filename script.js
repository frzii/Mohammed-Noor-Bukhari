const FRAME_COUNT = 120;

const DESKTOP_FRAME_FOLDER = "sequence";
const MOBILE_FRAME_FOLDER = "sequrnce-mobile";

const FRAME_PREFIX = "frame_";
const FRAME_EXTENSION = "webp";
const FRAME_START = 1;
const FRAME_PAD = 4;

/*
  Mobile image fit:
  "contain" = shows the full mobile image without cropping.
  "cover" = fills the full phone screen, but crops if your frames are landscape.

  Keep this as "contain" for your current sequrnce-mobile images.
  If you later make portrait mobile frames, change it to "cover".
*/
const MOBILE_IMAGE_FIT = "contain";

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
let activeFrameFolder = "";
let activeLoadToken = 0;

const sequenceCache = new Map();

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

function getActiveFrameFolder() {
  return mobileQuery.matches ? MOBILE_FRAME_FOLDER : DESKTOP_FRAME_FOLDER;
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

function getSequenceSources(folder) {
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const frameNumber = FRAME_START + index;
    return `${folder}/${FRAME_PREFIX}${padFrameNumber(frameNumber)}.${FRAME_EXTENSION}`;
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

function showLoader() {
  if (loader) {
    loader.classList.remove("is-hidden");
  }

  document.body.classList.add("is-loading");
  updateLoaderProgress(0, FRAME_COUNT);
}

function hideLoader() {
  window.setTimeout(() => {
    if (loader) {
      loader.classList.add("is-hidden");
    }

    document.body.classList.remove("is-loading");
  }, 350);
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

async function preloadImages(sources, loadToken) {
  let completed = 0;

  const results = await Promise.all(
    sources.map(async (source) => {
      const result = await loadImage(source);

      completed += 1;

      if (loadToken === activeLoadToken) {
        updateLoaderProgress(completed, sources.length);
      }

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

  const dprLimit = mobileQuery.matches ? 1.5 : 2;
  const dpr = Math.min(window.devicePixelRatio || 1, dprLimit);

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

function getDrawBox(image, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;

  let drawWidth;
  let drawHeight;

  const shouldContainOnMobile = mobileQuery.matches && MOBILE_IMAGE_FIT === "contain";

  if (shouldContainOnMobile) {
    /*
      Mobile contain mode:
      Shows the full frame without cropping or zooming too much.
      This is best for your current landscape mobile sequence.
    */
    if (imageRatio > canvasRatio) {
      drawWidth = width;
      drawHeight = width / imageRatio;
    } else {
      drawHeight = height;
      drawWidth = height * imageRatio;
    }
  } else {
    /*
      Cover mode:
      Fills the full canvas like background-size: cover.
      Use this for desktop or for proper portrait mobile frames.
    */
    if (imageRatio > canvasRatio) {
      drawHeight = height;
      drawWidth = height * imageRatio;
    } else {
      drawWidth = width;
      drawHeight = width / imageRatio;
    }
  }

  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  return {
    x,
    y,
    drawWidth,
    drawHeight
  };
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

  const box = getDrawBox(image, width, height);

  ctx.drawImage(image, box.x, box.y, box.drawWidth, box.drawHeight);

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

function applyLoadedSequence(folder, sequenceImages) {
  loadedFrames = sequenceImages;
  activeFrameFolder = folder;
  isSequenceReady = true;
  activeFrame = -1;

  if (frameTotal) {
    frameTotal.textContent = formatCounterNumber(loadedFrames.length);
  }

  resizeCanvas();
  updateStoryBeats(springProgress);
  updateScrollHint(springProgress);
  drawFrame(getFrameIndex(springProgress));
}

async function loadActiveSequence() {
  if (!canvas || !ctx || !sequenceScroll) return;

  const folder = getActiveFrameFolder();

  if (folder === activeFrameFolder && loadedFrames.length) {
    resizeCanvas();
    return;
  }

  activeLoadToken += 1;
  const loadToken = activeLoadToken;

  isSequenceReady = false;
  loadedFrames = [];
  activeFrame = -1;

  showLoader();
  resizeCanvas();

  const cachedFrames = sequenceCache.get(folder);

  if (cachedFrames && cachedFrames.length) {
    if (loadToken !== activeLoadToken) return;

    applyLoadedSequence(folder, cachedFrames);
    hideLoader();
    return;
  }

  const sequenceImages = await preloadImages(getSequenceSources(folder), loadToken);

  if (loadToken !== activeLoadToken) {
    return;
  }

  if (!sequenceImages.length) {
    console.error(
      `No sequence frames loaded. Check folder and file names: ${folder}/frame_0001.webp, ${folder}/frame_0002.webp, etc.`
    );

    if (loader) {
      const loaderText = loader.querySelector("p");

      if (loaderText) {
        loaderText.textContent = `Frames not found in ${folder}`;
      }
    }

    return;
  }

  sequenceCache.set(folder, sequenceImages);
  applyLoadedSequence(folder, sequenceImages);
  hideLoader();
}

async function initSequence() {
  if (!canvas || !ctx || !sequenceScroll) return;

  await loadActiveSequence();
}

function onResize() {
  resizeCanvas();
  updateTargetProgress();
}

function onBreakpointChange() {
  const newFolder = getActiveFrameFolder();

  if (newFolder !== activeFrameFolder) {
    loadActiveSequence();
  } else {
    onResize();
  }
}

function bindEvents() {
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onBreakpointChange, { passive: true });

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", onBreakpointChange);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(onBreakpointChange);
  }

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
  window.removeEventListener("orientationchange", onBreakpointChange);

  if (typeof mobileQuery.removeEventListener === "function") {
    mobileQuery.removeEventListener("change", onBreakpointChange);
  } else if (typeof mobileQuery.removeListener === "function") {
    mobileQuery.removeListener(onBreakpointChange);
  }

  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

applyLanguage(currentLang);
bindEvents();
initSequence();

rafId = requestAnimationFrame(animationLoop);

window.addEventListener("pagehide", cleanup, { once: true });