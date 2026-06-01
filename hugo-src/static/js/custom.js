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
        }
        
        // Save state on change
        cb.addEventListener('change', function() {
            sessionStorage.setItem('sidebar_state_' + this.id, this.checked ? 'checked' : 'unchecked');
        });
    });
});
