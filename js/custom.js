// Override the theme's scrollToPositions function to prevent sidebar from jumping around on refresh
window.addEventListener('DOMContentLoaded', function() {
    // Make the logo scroll with the sidebar instead of staying fixed at the top
    const headerWrapper = document.getElementById('R-header-wrapper');
    const contentWrapper = document.getElementById('R-content-wrapper');
    if (headerWrapper && contentWrapper) {
        contentWrapper.insertBefore(headerWrapper, contentWrapper.firstChild);
    }

    // We can intercept the scrollIntoView on the active element to prevent the jumping
    const activeItem = document.querySelector("#R-sidebar li.active a");
    if (activeItem) {
        // Prevent scrollIntoView from doing anything when called by the theme's JS
        activeItem.scrollIntoView = function() {
            // Do nothing to prevent the sidebar from jumping to center
        };
    }

    // Persist sidebar menu state across page loads
    const checkboxes = document.querySelectorAll('#R-sidebar input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const id = cb.id;
        if (id) {
            // 1. Restore state from sessionStorage
            const state = sessionStorage.getItem('sidebar_state_' + id);
            if (state === 'checked') {
                cb.checked = true;
            } else if (state === 'unchecked') {
                // Do not uncheck if it's the active path (Hugo sets active path to checked by default)
                const li = cb.closest('li');
                if (li && !li.classList.contains('active')) {
                    cb.checked = false;
                }
            }
            
            // 2. If Hugo auto-expanded this because it's the active path, 
            // save it to sessionStorage so it stays open when clicking other folders.
            if (cb.checked) {
                sessionStorage.setItem('sidebar_state_' + id, 'checked');
            }
        }
        
        // 3. Save state on manual toggle
        cb.addEventListener('change', function() {
            sessionStorage.setItem('sidebar_state_' + this.id, this.checked ? 'checked' : 'unchecked');
        });
    });

    // Restore sidebar scroll position
    const sidebarMenu = document.querySelector('.R-sidebarmenu.R-shortcutmenu-main');
    if (sidebarMenu) {
        const scrollPos = sessionStorage.getItem('sidebar_scroll_pos');
        if (scrollPos) {
            // Use setTimeout to ensure DOM is fully rendered and other scripts have run
            setTimeout(() => {
                sidebarMenu.scrollTop = parseInt(scrollPos, 10);
            }, 10);
        }

        // Save scroll position
        sidebarMenu.addEventListener('scroll', function() {
            sessionStorage.setItem('sidebar_scroll_pos', sidebarMenu.scrollTop);
        });
        
        // Also listen to wheel events in case perfect-scrollbar is interfering
        sidebarMenu.addEventListener('wheel', function(e) {
            // Let the native scroll handle it
        }, { passive: true });

    }

    // Allow clicking empty space in the mobile sidebar to close it
    const sidebar = document.querySelector('#R-sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', function(e) {
            // If the click is directly on the sidebar or content wrapper (empty space)
            if (e.target.id === 'R-sidebar' || e.target.id === 'R-content-wrapper' || e.target.classList.contains('R-sidebarmenu')) {
                const overlay = document.querySelector('#R-body-overlay');
                if (overlay) {
                    overlay.click(); // Trigger the theme's close logic
                }
            }
        });
    }
    // Allow Esc key to toggle sidebar
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const overlay = document.querySelector('#R-body-overlay');
            const sidebarBtn = document.querySelector('.topbar-button-sidebar button');
            
            // If overlay is visible, clicking it closes the sidebar
            if (overlay && window.getComputedStyle(overlay).display !== 'none') {
                overlay.click();
            } else if (sidebarBtn && window.getComputedStyle(sidebarBtn).display !== 'none') {
                // Otherwise, if the sidebar button is visible, click it to open
                sidebarBtn.click();
            }
        }
    });

    // Move TOC to active sidebar item
    const activeSidebarItem = document.querySelector("#R-sidebar li.active");
    const topbarTocNav = document.querySelector('.topbar-button-toc nav.TableOfContents');
    const topbarTocBtn = document.querySelector('.topbar-button-toc');

    if (activeSidebarItem && topbarTocNav && topbarTocNav.textContent.trim().length > 0) {
        const tocContainer = document.createElement('div');
        tocContainer.className = 'sidebar-inline-toc';
        
        // Move the TOC from topbar to sidebar
        tocContainer.appendChild(topbarTocNav);
        
        // Cleanup empty wrapper li elements generated by Hugo for skipped heading levels (e.g. H1 -> H3)
        const emptyLis = Array.from(tocContainer.querySelectorAll('li')).filter(li => {
            return li.querySelector('ul') && !li.querySelector('a');
        }).reverse();
        
        emptyLis.forEach(li => {
            const ul = li.querySelector('ul');
            if (ul) {
                while (ul.children.length > 0) {
                    li.parentNode.insertBefore(ul.children[0], li);
                }
            }
            li.remove();
        });

        // Insert right after the <a> tag to avoid being placed after child pages
        const activeLink = activeSidebarItem.querySelector(':scope > a');
        if (activeLink) {
            activeLink.insertAdjacentElement('afterend', tocContainer);
            
            // Allow clicking the active article title to toggle the entire inline TOC
            activeLink.addEventListener('click', function(e) {
                e.preventDefault(); // Prevent jumping to top
                if (tocContainer.style.display === 'none') {
                    tocContainer.style.display = 'block';
                } else {
                    tocContainer.style.display = 'none';
                }
            });
        } else {
            activeSidebarItem.appendChild(tocContainer);
        }

        // Hide the original topbar TOC button
        if (topbarTocBtn) {
            topbarTocBtn.style.display = 'none';
        }

        // Make TOC collapsible
        const tocItems = tocContainer.querySelectorAll('li');
        let tocCounter = 0;
        tocItems.forEach(li => {
            const subUl = li.querySelector(':scope > ul');
            const link = li.querySelector(':scope > a');
            // Only add toggle if the li has both a sub-list and an actual link (text)
            // This prevents duplicate chevrons on empty wrapper <li> generated by Hugo for skipped heading levels
            if (subUl && link) {
                tocCounter++;
                const cbId = 'toc-toggle-' + tocCounter;
                
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = cbId;
                cb.className = 'toc-checkbox';
                cb.checked = true; // Default expanded
                
                const label = document.createElement('label');
                label.htmlFor = cbId;
                label.className = 'toc-label';
                label.innerHTML = '<i class="fas fa-chevron-right"></i>';
                
                li.insertBefore(label, li.firstChild);
                li.insertBefore(cb, li.firstChild);
                li.classList.add('toc-has-children');
            }
        });

        // Add smooth scrolling to TOC links
        const tocLinks = tocContainer.querySelectorAll('a[href^="#"]');
        tocLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                const targetId = this.getAttribute('href').substring(1);
                
                let decodedTargetId = targetId;
                try {
                    decodedTargetId = decodeURIComponent(targetId);
                } catch(err) {}
                
                const targetElement = document.getElementById(decodedTargetId) || document.getElementById(targetId);
                
                if (targetElement) {
                    e.preventDefault();
                    history.pushState(null, null, '#' + targetId);
                    
                    // Auto-close sidebar on mobile/narrow screens BEFORE scrolling
                    // because the theme locks body scrolling (overflow: hidden) when sidebar is open!
                    const overlay = document.querySelector('#R-body-overlay');
                    let delay = 10;
                    if (overlay && window.getComputedStyle(overlay).display !== 'none') {
                        overlay.click();
                        delay = 150; // Give time for the sidebar close animation and overflow:hidden removal
                    }
                    
                    // Update active state
                    tocLinks.forEach(l => l.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Wait for layout unlock, then scroll
                    setTimeout(() => {
                        const scrollContainer = document.querySelector('#R-body-inner');
                        
                        if (scrollContainer) {
                            // Calculate relative position within the scroll container
                            const containerRect = scrollContainer.getBoundingClientRect();
                            const elementRect = targetElement.getBoundingClientRect();
                            const absoluteTop = elementRect.top + scrollContainer.scrollTop - containerRect.top;
                            
                            scrollContainer.scrollTo({
                                top: absoluteTop - 20, // Add padding
                                behavior: 'smooth'
                            });
                        } else {
                            targetElement.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                        }
                    }, delay);
                }
            });
        });
    }
});


// Interactive Global Spotlight (throttled via rAF to prevent flicker)
window.addEventListener('DOMContentLoaded', function() {
    let rafPending = false;
    let lastX = 0, lastY = 0;
    document.addEventListener('mousemove', (e) => {
        lastX = e.clientX;
        lastY = e.clientY;
        if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(() => {
                document.body.style.setProperty('--mouse-x', `${lastX}px`);
                document.body.style.setProperty('--mouse-y', `${lastY}px`);
                rafPending = false;
            });
        }
    });
});

// Homepage infinite scroll article feed
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
    let h = '<div class="x7-article-body">';
    h += '<div class="x7-article-title-row">';
    h += '<span class="x7-article-title">' + esc(a.title) + "</span>";
    h += '<span class="x7-article-category">' + esc(a.category || a.section) + "</span>";
    h += "</div>";
    if (a.summary) {
      h += '<p class="x7-article-summary">' + esc(a.summary) + "</p>";
    }
    h += '<div class="x7-article-meta-row">';
    if (a.tags && a.tags.length) {
      h += '<span class="x7-article-tags">';
      a.tags.slice(0, 4).forEach(function(t) {
        h += '<span class="x7-article-tag">' + esc(t) + "</span>";
      });
      h += "</span>";
    }
    h += '<span class="x7-article-date">' + esc(a.date) + "</span>";
    h += "</div>";
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

  const scrollRoot = document.getElementById("R-body-inner") || null;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadPage();
    },
    { root: scrollRoot, rootMargin: "300px" }
  );
  observer.observe(sentinel);
})();

// Homepage GitHub-style heatmap
document.addEventListener("DOMContentLoaded", function() {
  if (document.getElementById("x7-heatmap")) return;

  var raw = window.__heatmapDays;
  if (!raw) return;

  var days;
  try { days = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return; }
  if (!days || !days.length) return;

  var heroTitle = document.querySelector(".x7-hero-title");
  if (!heroTitle) return;

  var WEEKS = 26;
  var DAYS = 7;
  var insertTarget = document.querySelector(".x7-hero-mission") || heroTitle;

  const container = document.createElement("div");
  container.className = "x7-heatmap";
  container.id = "x7-heatmap";

  let maxCount = 0;
  days.forEach((d) => { if (d.count > maxCount) maxCount = d.count; });

  const totalCells = WEEKS * DAYS;
  const padded = new Array(totalCells).fill(null);
  let idx = days.length - 1;
  for (let w = WEEKS - 1; w >= 0; w--) {
    for (let d = DAYS - 1; d >= 0; d--) {
      const pos = w * DAYS + d;
      if (idx >= 0) { padded[pos] = days[idx]; idx--; }
    }
  }

  const frag = document.createDocumentFragment();
  for (let d = 0; d < DAYS; d++) {
    const row = document.createElement("div");
    row.className = "x7-heatmap-row";
    for (let w = 0; w < WEEKS; w++) {
      const cell = document.createElement("div");
      cell.className = "x7-heatmap-cell";
      const dayData = padded[w * DAYS + d];
      if (dayData) {
        const count = dayData.count;
        let level = 0;
        if (maxCount > 0 && count > 0) {
          const ratio = count / maxCount;
          if (ratio <= 0.25) level = 1;
          else if (ratio <= 0.5) level = 2;
          else if (ratio <= 0.75) level = 3;
          else level = 4;
        }
        if (level > 0) cell.setAttribute("data-level", level);
        const label = count > 0 ? count + " 篇文章" : "无更新";
        cell.setAttribute("data-tip", dayData.date + " " + label);
      } else {
        cell.style.visibility = "hidden";
      }
      row.appendChild(cell);
    }
    frag.appendChild(row);
  }

  const legend = document.createElement("div");
  legend.className = "x7-heatmap-legend";
  legend.innerHTML = "少 <div class=\"x7-heatmap-legend-cell\"></div>" +
    "<div class=\"x7-heatmap-legend-cell\" style=\"background:rgba(98,185,255,0.15)\"></div>" +
    "<div class=\"x7-heatmap-legend-cell\" style=\"background:rgba(98,185,255,0.35)\"></div>" +
    "<div class=\"x7-heatmap-legend-cell\" style=\"background:rgba(98,185,255,0.6)\"></div>" +
    "<div class=\"x7-heatmap-legend-cell\" style=\"background:rgba(98,185,255,0.85)\"></div> 多";

  container.appendChild(frag);
  container.appendChild(legend);
  insertTarget.parentNode.insertBefore(container, insertTarget.nextSibling);
});