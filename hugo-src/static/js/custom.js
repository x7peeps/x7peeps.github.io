// Override the theme's scrollToPositions function to prevent sidebar from jumping around on refresh
window.addEventListener('DOMContentLoaded', function() {
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
        activeSidebarItem.appendChild(tocContainer);

        // Hide the original topbar TOC button
        if (topbarTocBtn) {
            topbarTocBtn.style.display = 'none';
        }
    }
});
