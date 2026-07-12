import { createAmbientParticles, createQualityDowngrader, mapSemanticCenters, placeNodes, qualityFor } from "./constellation-core.js";

const instances = new WeakMap();
const NOOP = () => {};

function parseGraph(element) {
  try {
    const value = JSON.parse(element?.textContent || "null");
    if (!Array.isArray(value) || value.length > 32) return null;
    return value.every((node) => node && typeof node.id === "string" && typeof node.title === "string" &&
      typeof node.url === "string" && Number.isFinite(node.count)) ? value : null;
  } catch { return null; }
}

export function initConstellation(env = globalThis) {
  const doc = env?.document;
  if (!doc?.querySelector) return NOOP;
  const canvas = doc.querySelector("[data-x7-constellation]");
  const data = doc.querySelector("[data-x7-constellation-data]");
  const hero = doc.querySelector(".x7-ch-hero");
  const fallback = doc.querySelector("[data-x7-constellation-fallback]");
  const domainGrid = doc.querySelector(".x7-ch-domain-grid");
  if (!canvas || !data || !hero) return NOOP;
  const active = instances.get(canvas);
  if (active) return active.cleanup;

  const graph = parseGraph(data);
  const reducedMotion = !!env.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const saveData = !!env.navigator?.connection?.saveData;
  const base = qualityFor({ width: env.innerWidth, reducedMotion, saveData, deviceMemory: env.navigator?.deviceMemory });
  if (!graph || !base.animated) return NOOP;
  const context = canvas.getContext?.("2d", { alpha: true });
  if (!context) return NOOP;

  let destroyed = false;
  let running = false;
  let intersecting = true;
  let frameId = 0;
  let resizeId = 0;
  let lastTime;
  let width = 0;
  let height = 0;
  let nodes = [];
  let particles = [];
  let pointer = null;
  let quality = { particles: base.particles, blur: base.blur };
  const downgrade = createQualityDowngrader(quality);
  const links = [...doc.querySelectorAll?.("[data-x7-domain-link]") || []];
  const styles = env.getComputedStyle?.(doc.documentElement);
  const token = (name, fallbackValue) => styles?.getPropertyValue?.(name)?.trim() || fallbackValue;
  const colors = {
    line: token("--x7-border", "rgba(117,199,255,.16)"),
    node: token("--x7-ion", "#75c7ff"),
    point: token("--x7-muted", "#98a6b7"),
  };

  function layout() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Number.isFinite(rect.width) ? rect.width : 1);
    height = Math.max(1, Number.isFinite(rect.height) ? rect.height : 1);
    const dpr = Math.min(Number.isFinite(env.devicePixelRatio) ? Math.max(1, env.devicePixelRatio) : 1, base.dprCap);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const navRect = domainGrid?.getBoundingClientRect?.();
    const mapped = mapSemanticCenters(links.map((link) => ({ id: link.dataset?.nodeId, ...link.getBoundingClientRect?.() })), navRect, width, height);
    const centers = new Map(mapped.map((node) => [node.id, node]));
    const fallbackNodes = placeNodes(graph, width, height);
    nodes = fallbackNodes.map((node) => ({ ...node, ...(centers.get(node.id) || {}) }));
    particles = createAmbientParticles(base.particles, width, height, 0x7837);
  }

  function draw(time = 0) {
    frameId = 0;
    if (!running || destroyed) return;
    if (lastTime !== undefined) quality = downgrade(time - lastTime);
    lastTime = time;
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.strokeStyle = colors.line;
    for (let i = 0; i < nodes.length - 1; i += 1) {
      context.beginPath(); context.moveTo(nodes[i].x, nodes[i].y); context.lineTo(nodes[i + 1].x, nodes[i + 1].y); context.stroke();
    }
    context.fillStyle = colors.point;
    for (const point of particles.slice(0, quality.particles)) {
      context.globalAlpha = .2 + .25 * (1 + Math.sin(time / 1600 + point.phase));
      context.beginPath(); context.arc(point.x, point.y, point.radius, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    context.shadowColor = colors.node;
    context.shadowBlur = quality.blur;
    context.fillStyle = colors.node;
    for (const node of nodes) { context.beginPath(); context.arc(node.x, node.y, 2.8, 0, Math.PI * 2); context.fill(); }
    context.shadowBlur = 0;
    if (pointer) {
      const gradient = context.createRadialGradient?.(pointer.x, pointer.y, 0, pointer.x, pointer.y, 72);
      if (gradient) { gradient.addColorStop(0, "rgba(117,199,255,.16)"); gradient.addColorStop(1, "rgba(117,199,255,0)"); context.fillStyle = gradient; context.fillRect(pointer.x - 72, pointer.y - 72, 144, 144); }
    }
    if (canvas.dataset.state !== "enhanced") {
      canvas.dataset.state = "enhanced";
      canvas.dataset.x7Enhanced = "true";
      if (fallback) fallback.dataset.state = "enhanced";
    }
    frameId = env.requestAnimationFrame(draw);
  }

  function start() {
    if (destroyed || running || doc.hidden || !intersecting) return;
    running = true; lastTime = undefined;
    frameId = env.requestAnimationFrame(draw);
  }
  function stop() {
    running = false;
    if (frameId) env.cancelAnimationFrame(frameId);
    frameId = 0;
  }
  function onVisibility() { if (doc.hidden) stop(); else start(); }
  function onPointer(event) {
    const rect = hero.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function clearPointer() { pointer = null; }
  function scheduleLayout() {
    if (resizeId) return;
    resizeId = env.requestAnimationFrame(() => { resizeId = 0; layout(); });
  }

  canvas.hidden = false;
  canvas.dataset.state = "preparing";
  if (fallback) fallback.dataset.state = "preparing";
  layout();
  doc.addEventListener("visibilitychange", onVisibility);
  hero.addEventListener("pointermove", onPointer, { passive: true });
  hero.addEventListener("pointerleave", clearPointer, { passive: true });
  const resizeObserver = env.ResizeObserver ? new env.ResizeObserver(scheduleLayout) : null;
  if (resizeObserver) resizeObserver.observe(hero); else env.addEventListener?.("resize", scheduleLayout, { passive: true });
  const intersectionObserver = env.IntersectionObserver ? new env.IntersectionObserver(([entry]) => {
    intersecting = !!entry?.isIntersecting;
    if (intersecting) start(); else stop();
  }) : null;
  intersectionObserver?.observe(hero);

  const cleanup = () => {
    if (destroyed) return;
    destroyed = true; stop();
    if (resizeId) env.cancelAnimationFrame(resizeId);
    doc.removeEventListener("visibilitychange", onVisibility);
    hero.removeEventListener("pointermove", onPointer);
    hero.removeEventListener("pointerleave", clearPointer);
    resizeObserver?.disconnect(); intersectionObserver?.disconnect();
    if (!resizeObserver) env.removeEventListener?.("resize", scheduleLayout);
    canvas.hidden = true; delete canvas.dataset.x7Enhanced; delete canvas.dataset.state;
    if (fallback) delete fallback.dataset.state;
    instances.delete(canvas);
  };
  instances.set(canvas, { cleanup });
  start();
  return cleanup;
}
