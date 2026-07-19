const HOME_ENTRY_DESKTOP_DURATION = 2200;
const HOME_ENTRY_MOBILE_DURATION = 1850;
const PARTICLE_FOCUS_DESKTOP_DURATION = 1100;
const PARTICLE_FOCUS_MOBILE_DURATION = 820;
const MOBILE_HOME_QUERY = "(max-width: 52rem)";

function getHomeEntryDuration() {
  return window.matchMedia(MOBILE_HOME_QUERY).matches
    ? HOME_ENTRY_MOBILE_DURATION
    : HOME_ENTRY_DESKTOP_DURATION;
}

function getParticleFocusDuration() {
  return window.matchMedia(MOBILE_HOME_QUERY).matches
    ? PARTICLE_FOCUS_MOBILE_DURATION
    : PARTICLE_FOCUS_DESKTOP_DURATION;
}

export function initHome() {
  const heatmap = document.getElementById("x7-heatmap");
  if (!heatmap) return;

  initHomeMotion();
  if (heatmap.children.length > 0) return;

  let days = window.__heatmapDays;
  if (typeof days === "string") {
    try {
      days = JSON.parse(days);
    } catch {
      days = [];
    }
  }
  if (!Array.isArray(days) || days.length === 0) return;

  const total = days.reduce((sum, day) => sum + Math.max(0, Number(day.count) || 0), 0);
  const max = days.reduce((highest, day) => Math.max(highest, Number(day.count) || 0), 0);
  const totalLabel = document.querySelector(".x7-heatmap-total");
  if (totalLabel) totalLabel.textContent = total > 0 ? `近一年 ${total} 篇更新` : "近一年暂无更新";

  const cells = days.slice(-371);
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

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    home.dataset.motion = "reduced";
    markHomeEntryComplete(true);
    return;
  }

  home.dataset.motion = "enhanced";
  initParticleField(home);
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

function initParticleField(home) {
  const hero = home.querySelector(".x7-home-hero");
  if (!hero) return;

  const canvas = document.createElement("canvas");
  canvas.className = "x7-home-particles";
  canvas.setAttribute("aria-hidden", "true");
  hero.prepend(canvas);

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const entryActive = document.documentElement.classList.contains("x7-home-entry-prime");
  const entryStartedAt = performance.now();
  const entryDuration = getParticleFocusDuration();
  canvas.dataset.entryPhase = entryActive ? "focus" : "ambient";

  let width = 0;
  let height = 0;
  let dpr = 1;
  let entryFocusOffsetX = 0;
  let pointerX = 0;
  let pointerY = 0;
  let frame = 0;
  let particles = [];

  const resize = () => {
    const rect = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    entryFocusOffsetX = window.innerWidth / 2 - (rect.left + width / 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const targetCount = Math.min(92, Math.max(42, Math.round(width / 16)));
    particles = Array.from({ length: targetCount }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: Math.random() * 0.8 + 0.2,
      r: Math.random() * 1.15 + 0.35,
      drift: (Math.random() - 0.5) * 0.18,
      phase: Math.random() * Math.PI * 2 + index,
      focusAngle: (index / targetCount) * Math.PI * 2 + Math.random() * 0.35,
      focusRadius: 28 + Math.random() * Math.min(96, width * 0.09),
    }));
  };

  const draw = (time) => {
    frame = window.requestAnimationFrame(draw);
    ctx.clearRect(0, 0, width, height);

    const progress = Number(home.style.getPropertyValue("--x7-home-scroll-progress")) || 0;
    const camera = 1 + progress * 0.42;
    const cx = width * 0.5 + pointerX * 12;
    const cy = height * 0.44 + pointerY * 8;
    const entryProgress = entryActive
      ? Math.min(1, Math.max(0, (time - entryStartedAt) / entryDuration))
      : 1;
    const isFocusing = entryActive && entryProgress < 1;
    const focusEnvelope = isFocusing ? Math.sin(Math.PI * entryProgress) : 0;
    if (!isFocusing && entryActive && canvas.dataset.entryPhase !== "ambient") {
      canvas.dataset.entryPhase = "ambient";
    }

    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      p.x += p.drift + pointerX * p.z * 0.04;
      p.y += (0.045 + p.z * 0.075) * camera;

      if (p.x < -12) p.x = width + 12;
      if (p.x > width + 12) p.x = -12;
      if (p.y > height + 14) p.y = -14;

      const pulse = 0.55 + Math.sin(time * 0.0012 + p.phase) * 0.45;
      const dx = (p.x - cx) * progress * 0.035;
      const dy = (p.y - cy) * progress * 0.05;
      const alpha = (0.03 + p.z * 0.075) * pulse * (1 - progress * 0.45);
      const radius = p.r * (1 + progress * 0.9);
      let drawX = p.x + dx;
      let drawY = p.y + dy;
      let entryGlow = 1;

      if (isFocusing) {
        const focusX = cx + entryFocusOffsetX + Math.cos(p.focusAngle + time * 0.00018) * p.focusRadius;
        const focusY = cy + Math.sin(p.focusAngle + time * 0.00014) * p.focusRadius * 0.55;
        const focusStrength = focusEnvelope * (0.58 + p.z * 0.18);
        drawX += (focusX - p.x) * focusStrength;
        drawY += (focusY - p.y) * focusStrength;
        entryGlow += focusEnvelope * 0.5;
      }

      ctx.beginPath();
      ctx.fillStyle = `rgba(116, 235, 255, ${alpha * entryGlow})`;
      ctx.arc(drawX, drawY, radius * entryGlow, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  hero.addEventListener("pointermove", (event) => {
    const rect = hero.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  }, { passive: true });

  hero.addEventListener("pointerleave", () => {
    pointerX = 0;
    pointerY = 0;
  }, { passive: true });

  const observer = new ResizeObserver(resize);
  const stopParticleField = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
  };
  const startParticleField = () => {
    if (frame) return;
    observer.observe(hero);
    resize();
    frame = window.requestAnimationFrame(draw);
  };

  startParticleField();
  window.addEventListener("pagehide", stopParticleField);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) startParticleField();
  });
}

function initScrollCinematography(home) {
  const hero = home.querySelector(".x7-home-hero");
  if (!hero) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    const range = Math.max(1, rect.height * 0.82);
    const progress = Math.min(1, Math.max(0, -rect.top / range));
    home.style.setProperty("--x7-home-scroll-progress", progress.toFixed(4));
  };

  const request = () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  };

  update();
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
}

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
