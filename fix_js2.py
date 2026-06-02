import re

with open('hugo-src/static/js/custom.js', 'r') as f:
    js = f.read()

# Make sure perfect-scrollbar isn't fighting us
replacement = """
        // Save scroll position
        sidebarMenu.addEventListener('scroll', function() {
            sessionStorage.setItem('sidebar_scroll_pos', sidebarMenu.scrollTop);
        });
        
        // Also listen to wheel events in case perfect-scrollbar is interfering
        sidebarMenu.addEventListener('wheel', function(e) {
            // Let the native scroll handle it
        }, { passive: true });
"""

js = js.replace("""
        // Save scroll position
        sidebarMenu.addEventListener('scroll', function() {
            sessionStorage.setItem('sidebar_scroll_pos', sidebarMenu.scrollTop);
        });""", replacement)

with open('hugo-src/static/js/custom.js', 'w') as f:
    f.write(js)
