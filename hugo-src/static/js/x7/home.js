const HOME_ENTRY_DESKTOP_DURATION = 2200;
const HOME_ENTRY_MOBILE_DURATION = 1850;
const MOBILE_HOME_QUERY = "(max-width: 52rem)";
const homeScrollControllers = new WeakMap();

function getHomeEntryDuration() {
  return window.matchMedia(MOBILE_HOME_QUERY).matches
    ? HOME_ENTRY_MOBILE_DURATION
    : HOME_ENTRY_DESKTOP_DURATION;
}

export function buildHeatmapSource(input) {
  let days = input;
  if (typeof days === "string") {
    try {
      days = JSON.parse(days);
    } catch {
      days = [];
    }
  }

  if (!Array.isArray(days)) days = [];
  const normalizedDays = days.slice(-365).map((day) => ({
    date: String(day?.date || ""),
    count: Math.max(0, Number(day?.count) || 0),
  }));

  return {
    days: normalizedDays,
    total: normalizedDays.reduce((sum, day) => sum + day.count, 0),
    max: normalizedDays.reduce((highest, day) => Math.max(highest, day.count), 0),
    signature: normalizedDays.map((day) => `${day.date}:${day.count}`).join("|"),
  };
}

export function initHome() {
  const heatmap = document.getElementById("x7-heatmap");
  if (!heatmap) return;

  initHomeMotion();
  const source = buildHeatmapSource(window.__heatmapDays);
  if (source.days.length === 0) return;

  const { days, total, max, signature } = source;
  const totalLabel = document.querySelector(".x7-heatmap-total");
  if (totalLabel) totalLabel.textContent = total > 0 ? `近一年 ${total} 篇更新` : "近一年暂无更新";

  if (heatmap.children.length > 0 && heatmap.dataset.sourceSignature === signature) return;
  heatmap.dataset.sourceSignature = signature;
  heatmap.replaceChildren();

  const cells = days;
  const startOffset = new Date(cells[0]?.date || Date.now()).getDay();
  const padded = Array.from({ length: startOffset }, () => null).concat(cells);
  const weekCount = Math.ceil(padded.length / 7);
  heatmap.style.setProperty("--x7-heatmap-week-count", String(weekCount));
  heatmap.style.aspectRatio = `${weekCount} / 7`;

  const levelFor = (count) => {
    if (!max || !count) return 0;
    const ratio = count / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const frag = document.createDocumentFragment();
  padded.forEach((day) => {
    const cell = document.createElement("span");
    cell.className = "x7-heatmap-cell";
    if (!day) {
      cell.setAttribute("aria-hidden", "true");
      cell.style.visibility = "hidden";
      frag.appendChild(cell);
      return;
    }

    const count = Math.max(0, Number(day.count) || 0);
    const level = levelFor(count);
    if (level > 0) cell.dataset.level = String(level);
    const label = `${day.date} ${count > 0 ? `${count} 篇更新` : "无更新"}`;
    cell.title = label;
    cell.setAttribute("aria-label", label);
    frag.appendChild(cell);
  });

  heatmap.appendChild(frag);
}

function initHomeMotion() {
  const home = document.querySelector("[data-x7-home]");
  if (!home || home.dataset.motionReady === "true") return;
  home.dataset.motionReady = "true";

  import("./home-scene.js")
    .then((module) => {
      const controller = module.initHomeScene(home);
      replayHomeSceneProgress(home);
      return controller;
    })
    .catch((error) => {
      home.dataset.scene = "failed";
      console.warn("X7 fullscreen scene unavailable", error);
    });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    home.dataset.motion = "reduced";
    markHomeEntryComplete(true);
    return;
  }

  home.dataset.motion = "enhanced";
  initScrollCinematography(home);
  initRevealSequence(home);
  markHomeEntryComplete();
}

function markHomeEntryComplete(immediate = false) {
  const root = document.documentElement;
  if (!root.classList.contains("x7-home-entry-prime")) {
    root.classList.add("x7-home-entry-complete");
    return;
  }

  const key = `${window.relearn?.absBaseUri || location.origin}/x7-home-entry-complete`;
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // If storage is unavailable, still consume the visual state safely.
  }

  const finish = () => {
    root.classList.remove("x7-home-entry-prime");
    root.classList.add("x7-home-entry-complete");
  };

  if (immediate) {
    finish();
    return;
  }

  window.setTimeout(finish, getHomeEntryDuration());
}

export function homeScrollProgress({
  scrollTop,
  homeTop,
  homeHeight,
  viewportHeight,
}) {
  const range = Math.max(1, homeHeight - viewportHeight);
  return Math.min(1, Math.max(0, (scrollTop - homeTop) / range));
}

export function resolveHomeScrollTarget(documentRef, windowRef) {
  return documentRef.querySelector("#R-body-inner") || windowRef;
}

function dispatchHomeSceneProgress(home, progress, windowRef) {
  if (home.dataset) home.dataset.sceneProgress = String(progress);
  home.dispatchEvent(new windowRef.CustomEvent("x7:scene-progress", {
    detail: { progress },
  }));
}

export function replayHomeSceneProgress(home, windowRef = window) {
  const progress = Number(home.dataset?.sceneProgress);
  if (!Number.isFinite(progress)) return false;
  dispatchHomeSceneProgress(home, progress, windowRef);
  return true;
}

function initScrollCinematography(home, {
  documentRef = document,
  windowRef = window,
} = {}) {
  homeScrollControllers.get(home)?.destroy();

  let ticking = false;
  let frameId = 0;
  let destroyed = false;
  let suspended = false;
  const scrollTarget = resolveHomeScrollTarget(documentRef, windowRef);
  const update = () => {
    if (destroyed || suspended) return;
    ticking = false;
    frameId = 0;
    const homeRect = home.getBoundingClientRect();
    const scrollTop = scrollTarget === windowRef
      ? Number(windowRef.scrollY ?? windowRef.pageYOffset ?? 0)
      : Number(scrollTarget.scrollTop || 0);
    const viewportHeight = scrollTarget === windowRef
      ? Number(windowRef.innerHeight || documentRef.documentElement?.clientHeight || 0)
      : Number(scrollTarget.clientHeight || 0);
    const targetTop = scrollTarget === windowRef
      ? 0
      : Number(scrollTarget.getBoundingClientRect().top || 0);
    const progress = homeScrollProgress({
      scrollTop,
      homeTop: homeRect.top - targetTop + scrollTop,
      homeHeight: Number(home.offsetHeight || homeRect.height || 0),
      viewportHeight,
    });
    home.style.setProperty("--x7-home-scroll-progress", String(progress));
    dispatchHomeSceneProgress(home, progress, windowRef);
  };

  const request = () => {
    if (!destroyed && !suspended && !ticking) {
      ticking = true;
      frameId = windowRef.requestAnimationFrame(update);
    }
  };

  const cancelPending = () => {
    if (frameId) windowRef.cancelAnimationFrame(frameId);
    frameId = 0;
    ticking = false;
  };
  const onPageHide = (event) => {
    if (event.persisted === true) {
      suspended = true;
      cancelPending();
      return;
    }
    destroy();
  };
  const onPageShow = (event) => {
    if (destroyed || event.persisted !== true) return;
    suspended = false;
    update();
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scrollTarget.removeEventListener("scroll", request);
    windowRef.removeEventListener("resize", request);
    windowRef.removeEventListener("pagehide", onPageHide);
    windowRef.removeEventListener("pageshow", onPageShow);
    cancelPending();
    if (homeScrollControllers.get(home)?.destroy === destroy) {
      homeScrollControllers.delete(home);
    }
  };
  const controller = { destroy };
  homeScrollControllers.set(home, controller);
  update();
  scrollTarget.addEventListener("scroll", request, { passive: true });
  windowRef.addEventListener("resize", request, { passive: true });
  windowRef.addEventListener("pagehide", onPageHide);
  windowRef.addEventListener("pageshow", onPageShow);
  return controller;
}

export { initScrollCinematography };

function initRevealSequence(home) {
  const revealTargets = [
    ".x7-home-avatar",
    ".x7-home-kicker",
    ".x7-hero-title",
    ".x7-hero-subtitle",
    ".x7-hero-mission",
    ".x7-heatmap-panel",
    ".x7-feed-header",
    ".x7-feed-list > li"
  ];

  const nodes = home.querySelectorAll(revealTargets.join(","));
  nodes.forEach((node, index) => {
    node.classList.add("x7-reveal");
    node.style.setProperty("--x7-reveal-order", String(Math.min(index, 18)));
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -10% 0px",
    threshold: 0.08
  });

  nodes.forEach((node) => observer.observe(node));
}
