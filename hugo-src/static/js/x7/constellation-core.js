const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function qualityFor(options = {}) {
  if (options.reducedMotion || options.saveData) {
    return { animated: false, particles: 0, blur: 0, dprCap: 1 };
  }
  const width = finite(options.width, 0);
  const memory = finite(options.deviceMemory, 2);
  if (width < 640 || memory <= 2) {
    return { animated: true, particles: 40, blur: 2, dprCap: 1.5 };
  }
  return { animated: true, particles: 120, blur: 6, dprCap: 2 };
}

export function placeNodes(nodes, width, height, padding = 24) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const w = Math.max(padding * 2, finite(width, padding * 2));
  const h = Math.max(padding * 2, finite(height, padding * 2));
  const rx = Math.max(0, w / 2 - padding);
  const ry = Math.max(0, h / 2 - padding);
  if (nodes.length === 1) return [{ ...nodes[0], x: Math.round(w / 2), y: Math.round(h / 2) }];
  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    return {
      ...node,
      x: Math.round(w / 2 + Math.cos(angle) * rx * .72),
      y: Math.round(h / 2 + Math.sin(angle) * ry * .72),
    };
  });
}

export function mapSemanticCenters(linkRects, navRect, canvasWidth, canvasHeight, padding = 24) {
  if (!Array.isArray(linkRects) || !linkRects.length || !navRect ||
      !Number.isFinite(navRect.width) || !Number.isFinite(navRect.height) || navRect.width <= 0 || navRect.height <= 0) return [];
  const width = finite(canvasWidth, 0);
  const height = finite(canvasHeight, 0);
  if (width < padding * 2 || height < padding * 2) return [];
  const used = new Set();
  return linkRects.map((rect, index) => {
    if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null;
    const nx = (rect.left + rect.width / 2 - navRect.left) / navRect.width;
    const ny = (rect.top + rect.height / 2 - navRect.top) / navRect.height;
    let x = Math.round(padding + Math.min(1, Math.max(0, nx)) * (width - padding * 2));
    let y = Math.round(padding + Math.min(1, Math.max(0, ny)) * (height - padding * 2));
    while (used.has(`${x}:${y}`)) {
      x = Math.min(width - padding, Math.max(padding, x + ((index % 2) ? -1 : 1) * (index + 1)));
      y = Math.min(height - padding, Math.max(padding, y + index + 1));
    }
    used.add(`${x}:${y}`);
    return { id: rect.id, x, y };
  }).filter(Boolean);
}

function seededRandom(seed) {
  let state = (finite(seed, 1) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function createAmbientParticles(count, width, height, seed = 7) {
  const random = seededRandom(seed);
  const total = Math.max(0, Math.floor(finite(count, 0)));
  const w = Math.max(0, finite(width, 0));
  const h = Math.max(0, finite(height, 0));
  return Array.from({ length: total }, () => ({
    x: random() * w,
    y: random() * h,
    radius: .35 + random() * 1.1,
    phase: random() * Math.PI * 2,
  }));
}

export function createQualityDowngrader(initial, options = {}) {
  const sampleSize = Math.max(2, Math.floor(finite(options.sampleSize, 24)));
  const threshold = finite(options.threshold, 22);
  const samples = [];
  let quality = { particles: Math.max(0, initial.particles | 0), blur: Math.max(0, finite(initial.blur, 0)) };
  let downgraded = false;
  return (duration) => {
    if (!downgraded && Number.isFinite(duration)) {
      samples.push(Math.max(0, duration));
      if (samples.length > sampleSize) samples.shift();
      if (samples.length === sampleSize && samples.reduce((sum, value) => sum + value, 0) / sampleSize > threshold) {
        quality = { particles: Math.floor(quality.particles / 2), blur: quality.blur / 2 };
        downgraded = true;
      }
    }
    return { ...quality };
  };
}
