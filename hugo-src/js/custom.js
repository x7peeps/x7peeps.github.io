(() => {
  const feed = document.getElementById("x7-feed");
  if (!feed) return;

  const list = feed.querySelector(".x7-feed-list");
  const sentinel = feed.querySelector(".x7-feed-sentinel");
  const countEl = feed.querySelector(".x7-feed-count");
  let page = 1;
  let loading = false;
  let done = false;
  let total = 0;

  const esc = (s) => {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  };

  function createCard(a, i) {
    const el = document.createElement("a");
    el.href = a.url;
    el.className = "x7-article";
    el.style.animationDelay = i * 40 + "ms";
    let h = "";
    if (a.thumb) {
      h += '<div class="x7-article-thumb"><img src="' + esc(a.thumb) + '" alt="" loading="lazy" decoding="async"></div>';
    }
    h += '<div class="x7-article-body">';
    h += '<div class="x7-article-date">' + esc(a.date) + "</div>";
    h += '<div class="x7-article-title">' + esc(a.title) + "</div>";
    if (a.summary) {
      h += '<p class="x7-article-summary">' + esc(a.summary) + "</p>";
    }
    h += "</div>";
    el.innerHTML = h;
    return el;
  }

  function showLoading() {
    const el = document.createElement("div");
    el.className = "x7-feed-loading";
    el.id = "x7-loading";
    el.innerHTML = "<span>加载中...</span>";
    feed.appendChild(el);
  }

  function hideLoading() {
    const el = document.getElementById("x7-loading");
    if (el) el.remove();
  }

  function showEnd() {
    const el = document.createElement("div");
    el.className = "x7-feed-end";
    el.textContent = "— 已展示全部文章 —";
    feed.appendChild(el);
  }

  async function loadPage() {
    if (loading || done) return;
    loading = true;
    showLoading();
    try {
      const url = page === 1 ? "/index.json" : "/page/" + page + "/index.json";
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      hideLoading();
      if (data.totalPages) total = data.totalPages;
      const frag = document.createDocumentFragment();
      data.pages.forEach((a, i) => frag.appendChild(createCard(a, i)));
      list.appendChild(frag);
      if (countEl && total) countEl.textContent = "共 " + total + " 篇";
      page++;
      if (!data.hasNext) {
        done = true;
        observer.disconnect();
        showEnd();
      }
    } catch (e) {
      hideLoading();
      const el = document.createElement("div");
      el.className = "x7-feed-loading";
      el.textContent = "加载失败，请刷新重试";
      feed.appendChild(el);
    }
    loading = false;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadPage();
    },
    { rootMargin: "300px" }
  );
  observer.observe(sentinel);
})();
