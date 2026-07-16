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

    initX7SidebarTreeNavigation();

    // Restore sidebar tree scroll position.
    const sidebarScrollSurface = document.querySelector('#R-sidebar #R-content-wrapper');
    if (sidebarScrollSurface) {
        const scrollPos = sessionStorage.getItem('sidebar_scroll_pos');
        if (scrollPos) {
            // Use setTimeout to ensure DOM is fully rendered and other scripts have run
            setTimeout(() => {
                sidebarScrollSurface.scrollTop = parseInt(scrollPos, 10);
            }, 10);
        }

        // Save scroll position
        sidebarScrollSurface.addEventListener('scroll', function() {
            sessionStorage.setItem('sidebar_scroll_pos', sidebarScrollSurface.scrollTop);
        });
        
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
            // The article cockpit owns Escape while its chapter rail is open.
            if (document.querySelector('[data-x7-chapter-trigger][aria-expanded="true"]')) return;
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

});

function initX7SidebarTreeNavigation() {
    const sidebar = document.querySelector('#R-sidebar');
    if (!sidebar) return;

    const normalizePath = (url) => {
        const pathname = url.pathname.replace(/\/index\.html$/, '/');
        return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    };

    sidebar.addEventListener('click', function(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const link = event.target.closest && event.target.closest('a[href]');
        if (!link || !sidebar.contains(link)) return;

        let url;
        try {
            url = new URL(link.getAttribute('href'), window.location.href);
        } catch {
            return;
        }
        if (url.origin !== window.location.origin) return;

        const currentUrl = new URL(window.location.href);
        const isCurrentPage = normalizePath(url) === normalizePath(currentUrl) && url.search === currentUrl.search;
        if (isCurrentPage) {
            event.preventDefault();
            return;
        }

        const item = link.closest('li');
        const toggle = item?.querySelector(':scope > input[type="checkbox"]');
        if (!toggle) return;

        event.preventDefault();
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }, true);
}
