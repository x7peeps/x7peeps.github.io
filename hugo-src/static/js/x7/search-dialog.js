import { searchDocuments } from "./search-core.js";

const RECENTS_KEY = "x7.search.recentUrls";
const MAX_RESULTS = 12;

export function nextActiveIndex(current, count, direction) {
  if (!count) return -1;
  return (current + direction + count) % count;
}

export function createSearchIndexLoader(fetchImpl, endpoint, options = {}) {
  let promise = null;
  return {
    load() {
      if (promise) return promise;
      promise = fetchImpl(endpoint, options)
        .then(response => {
          if (!response.ok) throw new Error(`Search index ${response.status}`);
          return response.json();
        })
        .then(value => {
          if (!Array.isArray(value)) throw new TypeError("Search index must be an array");
          return value;
        })
        .catch(error => {
          promise = null;
          throw error;
        });
      return promise;
    },
  };
}

function readRecents() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(item => typeof item === "string").slice(0, MAX_RESULTS) : [];
  } catch {
    return [];
  }
}

function rememberUrl(url) {
  if (!url) return;
  try {
    const recents = [url, ...readRecents().filter(item => item !== url)].slice(0, MAX_RESULTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    // Search remains useful when storage is unavailable.
  }
}

function setPreview(dialog, document) {
  dialog.querySelector("[data-x7-preview-title]").textContent = document?.title || "选择结果以预览";
  dialog.querySelector("[data-x7-preview-section]").textContent = document?.section ? `章节 · ${document.section}` : "";
  dialog.querySelector("[data-x7-preview-summary]").textContent = document?.summary || "";
  const tags = Array.isArray(document?.tags) ? document.tags.filter(tag => typeof tag === "string") : [];
  dialog.querySelector("[data-x7-preview-tags]").textContent = tags.length ? `标签 · ${tags.join(" · ")}` : "";
}

export function initSearchDialog({ navigate = url => window.location.assign(url) } = {}) {
  const dialog = document.querySelector("[data-x7-search-dialog]");
  const openButtons = [...document.querySelectorAll("[data-x7-search-open]")];
  if (!dialog || !openButtons.length || dialog.dataset.x7Initialized === "true") return () => {};
  dialog.dataset.x7Initialized = "true";

  const input = dialog.querySelector("[data-x7-search-input]");
  const closeButton = dialog.querySelector("[data-x7-search-close]");
  const resultsList = dialog.querySelector("[data-x7-search-results]");
  const status = dialog.querySelector("[data-x7-search-status]");
  const endpoint = dialog.dataset.searchUrl;
  const controller = new AbortController();
  let documents = null;
  const loader = createSearchIndexLoader(fetch, endpoint, { signal: controller.signal, credentials: "same-origin" });
  let currentResults = [];
  let activeIndex = -1;
  let renderTimer = 0;
  let opener = null;

  const setActive = (nextIndex, reveal = false) => {
    const options = [...resultsList.querySelectorAll(":scope > [role=option]")];
    if (!options.length || nextIndex < 0) {
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
      setPreview(dialog, null);
      return;
    }
    activeIndex = nextIndex;
    options.forEach((option, index) => option.setAttribute("aria-selected", String(index === activeIndex)));
    input.setAttribute("aria-activedescendant", options[activeIndex].id);
    setPreview(dialog, currentResults[activeIndex]);
    if (reveal) options[activeIndex].scrollIntoView({ block: "nearest" });
  };

  const goToResult = index => {
    const result = currentResults[index];
    if (!result?.url) return;
    rememberUrl(result.url);
    navigate(result.url);
  };

  const render = () => {
    currentResults = searchDocuments(documents, input.value, { recentUrls: readRecents(), limit: MAX_RESULTS });
    resultsList.replaceChildren();
    currentResults.forEach((document, index) => {
      const li = resultsList.ownerDocument.createElement("li");
      li.id = `x7-search-result-${index}`;
      li.role = "option";
      li.tabIndex = -1;
      li.dataset.url = typeof document.url === "string" ? document.url : "";
      li.setAttribute("aria-selected", "false");
      const title = resultsList.ownerDocument.createElement("strong");
      title.textContent = document.title || document.url || "未命名页面";
      const meta = resultsList.ownerDocument.createElement("span");
      meta.textContent = [document.section, document.summary].filter(Boolean).join(" · ");
      li.append(title, meta);
      li.addEventListener("pointermove", () => setActive(index));
      li.addEventListener("click", () => goToResult(index));
      resultsList.append(li);
    });
    status.textContent = input.value.trim()
      ? currentResults.length ? `${currentResults.length} 个结果` : "没有匹配结果，请尝试知识树。"
      : currentResults.length ? "最近访问与最新内容" : "暂无可搜索内容。";
    setActive(currentResults.length ? 0 : -1);
  };

  const scheduleRender = () => {
    clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 80);
  };

  const load = () => {
    status.textContent = "正在加载索引…";
    return loader.load()
      .then(value => {
        documents = value;
        render();
      })
      .catch(error => {
        if (error.name === "AbortError") return;
        status.textContent = "搜索暂时不可用，请使用左侧知识树浏览。";
        resultsList.replaceChildren();
        setPreview(dialog, null);
      });
    return loadPromise;
  };

  const open = trigger => {
    if (dialog.open) return;
    opener = trigger instanceof HTMLElement ? trigger : document.activeElement;
    dialog.showModal();
    input.setAttribute("aria-expanded", "true");
    input.focus();
    load();
  };

  const onShortcut = event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      open(document.activeElement);
    }
  };
  const onDialogKeydown = event => {
    if (event.target !== input) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(nextActiveIndex(activeIndex, currentResults.length, event.key === "ArrowDown" ? 1 : -1), true);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      goToResult(activeIndex);
    }
  };
  const onClose = () => {
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    opener?.focus?.();
    opener = null;
  };
  const onOpenClick = event => open(event.currentTarget);
  const onCloseClick = () => dialog.close();

  openButtons.forEach(button => button.addEventListener("click", onOpenClick));
  document.addEventListener("keydown", onShortcut);
  input.addEventListener("input", scheduleRender);
  dialog.addEventListener("keydown", onDialogKeydown);
  closeButton.addEventListener("click", onCloseClick);
  dialog.addEventListener("close", onClose);

  const cleanup = () => {
    clearTimeout(renderTimer);
    controller.abort();
    openButtons.forEach(button => button.removeEventListener("click", onOpenClick));
    document.removeEventListener("keydown", onShortcut);
    input.removeEventListener("input", scheduleRender);
    dialog.removeEventListener("keydown", onDialogKeydown);
    closeButton.removeEventListener("click", onCloseClick);
    dialog.removeEventListener("close", onClose);
    delete dialog.dataset.x7Initialized;
  };
  window.addEventListener("pagehide", cleanup, { once: true });
  return cleanup;
}
