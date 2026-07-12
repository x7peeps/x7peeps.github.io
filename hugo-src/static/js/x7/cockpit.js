export function createInitializationRegistry() {
  const entries = new WeakMap();
  return {
    get(key) {
      return entries.get(key);
    },
    register(key, dispose) {
      let disposed = false;
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        dispose();
        if (entries.get(key) === cleanup) entries.delete(key);
      };
      entries.set(key, cleanup);
      return cleanup;
    },
  };
}

const initializedShells = createInitializationRegistry();

const normalized = (value) => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase();

export function readingProgress(scrollTop, scrollHeight, clientHeight) {
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return 0;
  const range = scrollHeight - clientHeight;
  if (range <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, scrollTop / range)) * 100);
}

export function matchesTreeQuery(query, text) {
  const needle = normalized(query);
  return needle === "" || normalized(text).includes(needle);
}

export function activeHeadingIndex(orderedTopPositions, offset) {
  if (!Array.isArray(orderedTopPositions) || orderedTopPositions.length === 0) return -1;
  const boundary = Number.isFinite(offset) ? offset : 0;
  let active = 0;
  for (let index = 0; index < orderedTopPositions.length; index += 1) {
    if (Number.isFinite(orderedTopPositions[index]) && orderedTopPositions[index] <= boundary) active = index;
  }
  return active;
}

export function nextFocusIndex(currentIndex, itemCount, backwards = false) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= itemCount) {
    return backwards ? itemCount - 1 : 0;
  }
  return (currentIndex + (backwards ? -1 : 1) + itemCount) % itemCount;
}

export function resolveScrollTarget(documentLike, windowLike) {
  const bodyInner = documentLike.querySelector("#R-body-inner");
  if (bodyInner) return { eventTarget: bodyInner, scrollElement: bodyInner };
  return {
    eventTarget: windowLike,
    scrollElement: documentLike.scrollingElement || documentLike.documentElement,
  };
}

function decodeFragment(value) {
  const fragment = String(value ?? "").replace(/^#/, "");
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), code, pre"));
}

function directChild(element, selector) {
  return Array.from(element.children).find((child) => child.matches(selector)) ?? null;
}

function installTreeFilter(addCleanup) {
  const tree = document.querySelector("[data-x7-knowledge-tree]");
  const input = tree?.querySelector("[data-x7-tree-filter]");
  if (!tree || !input) return;

  const items = Array.from(tree.querySelectorAll("li"));
  const originalHidden = new Map(items.map((item) => [item, item.hidden]));

  const revealBranch = (item) => {
    item.hidden = false;
    item.querySelectorAll("li").forEach((descendant) => { descendant.hidden = false; });
  };

  const filterItem = (item, query) => {
    const ownLink = directChild(item, "a");
    const ownMatch = matchesTreeQuery(query, ownLink?.textContent);
    if (ownMatch) {
      revealBranch(item);
      return true;
    }
    const childList = directChild(item, "ul");
    const childMatches = childList
      ? Array.from(childList.children).filter((child) => child.matches("li")).map((child) => filterItem(child, query)).some(Boolean)
      : false;
    item.hidden = !childMatches;
    return childMatches;
  };

  const applyFilter = () => {
    const query = normalized(input.value);
    if (!query) {
      items.forEach((item) => { item.hidden = originalHidden.get(item); });
      return;
    }
    const roots = items.filter((item) => !item.parentElement?.closest("li"));
    roots.forEach((item) => filterItem(item, query));
  };

  input.addEventListener("input", applyFilter);
  addCleanup(() => {
    input.removeEventListener("input", applyFilter);
    items.forEach((item) => { item.hidden = originalHidden.get(item); });
  });
}

export function initCockpit() {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const shell = document.querySelector("[data-x7-article-shell]");
  if (!shell) return () => {};
  const existingCleanup = initializedShells.get(shell);
  if (existingCleanup) return existingCleanup;

  const cleanups = [];
  const addCleanup = (cleanup) => cleanups.push(cleanup);
  const listen = (target, event, handler, options) => {
    target?.addEventListener(event, handler, options);
    if (target) addCleanup(() => target.removeEventListener(event, handler, options));
  };

  const { eventTarget: scrollTarget, scrollElement: progressSource } = resolveScrollTarget(document, window);
  const bodyInner = scrollTarget === progressSource && scrollTarget !== window ? scrollTarget : null;
  const usesBodyInner = Boolean(bodyInner);
  const scrollingElement = document.scrollingElement || document.documentElement;
  const article = shell.querySelector("[data-x7-article-content]");
  if (!article) return () => {};
  const radar = shell.querySelector("[data-x7-chapter-radar]");
  const trigger = shell.querySelector("[data-x7-chapter-trigger]");
  const closeButton = shell.querySelector("[data-x7-chapter-close]");
  const tocLinks = Array.from(shell.querySelectorAll("[data-x7-chapter-list] a[href*='#']"));
  const headings = Array.from(article?.querySelectorAll("h2[id], h3[id]") ?? []);
  const progressBar = shell.querySelector("[data-x7-progress-bar]");
  const progressTexts = Array.from(shell.querySelectorAll("[data-x7-progress-text], [data-x7-mobile-progress]"));
  const reducedMotionMedia = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const narrowMedia = window.matchMedia?.("(max-width: 68rem)");
  const prefersReducedMotion = reducedMotionMedia?.matches ?? false;
  const originalRadarState = radar ? {
    ariaHidden: radar.getAttribute("aria-hidden"),
    inert: radar.hasAttribute("inert"),
    open: radar.getAttribute("data-x7-open"),
    tabindex: radar.getAttribute("tabindex"),
  } : null;
  const originalTriggerExpanded = trigger?.getAttribute("aria-expanded") ?? null;
  const originalCurrent = new Map(tocLinks.map((link) => [link, link.getAttribute("aria-current")]));
  const fallbackTabindex = new Map();
  let frame = 0;
  shell.setAttribute("data-x7-cockpit-enhanced", "");

  const absoluteHeadingTops = () => headings.map((heading) => {
    if (usesBodyInner) return heading.getBoundingClientRect().top - bodyInner.getBoundingClientRect().top + bodyInner.scrollTop;
    return heading.getBoundingClientRect().top + (scrollingElement.scrollTop || window.scrollY || 0);
  });

  const setActiveHeading = () => {
    if (!headings.length || !tocLinks.length) return;
    const current = usesBodyInner ? bodyInner.scrollTop : (scrollingElement.scrollTop || window.scrollY || 0);
    const index = activeHeadingIndex(absoluteHeadingTops(), current + 48);
    const activeId = headings[index]?.id;
    let activeAssigned = false;
    tocLinks.forEach((link) => {
      if (!activeAssigned && decodeFragment(link.hash || link.getAttribute("href")?.split("#").pop()) === activeId) {
        link.setAttribute("aria-current", "location");
        activeAssigned = true;
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const update = () => {
    frame = 0;
    const percent = readingProgress(progressSource.scrollTop, progressSource.scrollHeight, progressSource.clientHeight);
    if (progressBar) progressBar.style.width = `${percent}%`;
    progressTexts.forEach((node) => { node.textContent = `${percent}% read`; });
    setActiveHeading();
  };
  const scheduleUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  listen(scrollTarget, "scroll", scheduleUpdate, { passive: true });
  listen(window, "resize", scheduleUpdate, { passive: true });
  scheduleUpdate();

  const isNarrow = () => narrowMedia?.matches ?? false;
  const restoreFallbackTabindex = () => {
    fallbackTabindex.forEach((value, element) => value === null ? element.removeAttribute("tabindex") : element.setAttribute("tabindex", value));
    fallbackTabindex.clear();
  };
  const setRailUnavailable = (unavailable) => {
    if (!radar) return;
    if (unavailable) {
      radar.setAttribute("inert", "");
      radar.setAttribute("aria-hidden", "true");
      if (!("inert" in radar)) {
        radar.querySelectorAll("a[href], button, input, select, textarea, [tabindex]").forEach((element) => {
          if (!fallbackTabindex.has(element)) fallbackTabindex.set(element, element.getAttribute("tabindex"));
          element.setAttribute("tabindex", "-1");
        });
      }
    } else {
      radar.removeAttribute("inert");
      radar.removeAttribute("aria-hidden");
      restoreFallbackTabindex();
    }
  };
  const closeRadar = (restoreFocus = true) => {
    if (!radar || !trigger) return;
    radar.removeAttribute("data-x7-open");
    trigger.setAttribute("aria-expanded", "false");
    setRailUnavailable(isNarrow());
    if (restoreFocus) trigger.focus();
  };
  const openRadar = () => {
    if (!radar || !trigger) return;
    radar.setAttribute("data-x7-open", "true");
    trigger.setAttribute("aria-expanded", "true");
    setRailUnavailable(false);
    (closeButton || tocLinks[0] || radar).focus();
  };
  if (radar && !radar.hasAttribute("tabindex")) radar.tabIndex = -1;
  listen(trigger, "click", () => trigger.getAttribute("aria-expanded") === "true" ? closeRadar() : openRadar());
  listen(closeButton, "click", () => closeRadar());
  const syncResponsiveRail = () => {
    if (!radar || !trigger) return;
    if (isNarrow()) {
      setRailUnavailable(trigger.getAttribute("aria-expanded") !== "true");
    } else {
      radar.removeAttribute("data-x7-open");
      trigger.setAttribute("aria-expanded", "false");
      setRailUnavailable(false);
    }
  };
  if (narrowMedia?.addEventListener) {
    narrowMedia.addEventListener("change", syncResponsiveRail);
    addCleanup(() => narrowMedia.removeEventListener("change", syncResponsiveRail));
  } else if (narrowMedia?.addListener) {
    narrowMedia.addListener(syncResponsiveRail);
    addCleanup(() => narrowMedia.removeListener(syncResponsiveRail));
  }
  syncResponsiveRail();

  tocLinks.forEach((link) => listen(link, "click", (event) => {
    const targetId = decodeFragment(link.hash || link.getAttribute("href")?.split("#").pop());
    const heading = headings.find((candidate) => candidate.id === targetId) || document.getElementById(targetId);
    if (!heading) return;
    event.preventDefault();
    history.pushState(null, "", link.hash || `#${encodeURIComponent(targetId)}`);
    if (usesBodyInner) {
      const top = heading.getBoundingClientRect().top - bodyInner.getBoundingClientRect().top + bodyInner.scrollTop - 20;
      bodyInner.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
    } else {
      heading.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }
    if (isNarrow()) closeRadar();
  }));

  const shortcutHandler = (event) => {
    if (event.key === "Tab" && isNarrow() && trigger?.getAttribute("aria-expanded") === "true" && radar) {
      const focusables = Array.from(radar.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      const next = nextFocusIndex(focusables.indexOf(document.activeElement), focusables.length, event.shiftKey);
      if (next >= 0) {
        event.preventDefault();
        focusables[next].focus();
      }
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (event.key === "Escape" && trigger?.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      closeRadar();
      return;
    }
    let destination = null;
    if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === "[") {
      destination = document.querySelector(".topbar-button-prev a[href]");
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === "]") {
      destination = document.querySelector(".topbar-button-next a[href]");
    }
    if (destination) {
      event.preventDefault();
      destination.click();
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
      const active = tocLinks.findIndex((link) => link.getAttribute("aria-current") === "location");
      const next = event.key === "ArrowUp" ? Math.max(0, active - 1) : Math.min(tocLinks.length - 1, active + 1);
      if (tocLinks[next] && next !== active) {
        event.preventDefault();
        tocLinks[next].click();
      }
    }
  };
  listen(document, "keydown", shortcutHandler);
  installTreeFilter(addCleanup);

  const cleanup = initializedShells.register(shell, () => {
    cleanups.splice(0).forEach((fn) => fn());
    shell.removeAttribute("data-x7-cockpit-enhanced");
    if (frame) window.cancelAnimationFrame(frame);
    originalCurrent.forEach((value, link) => value === null ? link.removeAttribute("aria-current") : link.setAttribute("aria-current", value));
    restoreFallbackTabindex();
    if (radar && originalRadarState) {
      originalRadarState.ariaHidden === null ? radar.removeAttribute("aria-hidden") : radar.setAttribute("aria-hidden", originalRadarState.ariaHidden);
      originalRadarState.inert ? radar.setAttribute("inert", "") : radar.removeAttribute("inert");
      originalRadarState.open === null ? radar.removeAttribute("data-x7-open") : radar.setAttribute("data-x7-open", originalRadarState.open);
      originalRadarState.tabindex === null ? radar.removeAttribute("tabindex") : radar.setAttribute("tabindex", originalRadarState.tabindex);
    }
    if (trigger) originalTriggerExpanded === null ? trigger.removeAttribute("aria-expanded") : trigger.setAttribute("aria-expanded", originalTriggerExpanded);
  });
  return cleanup;
}
