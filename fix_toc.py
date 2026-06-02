import re

with open('hugo-src/static/js/custom.js', 'r') as f:
    js = f.read()

replacement_js = """
        // Hide the original topbar TOC button
        if (topbarTocBtn) {
            topbarTocBtn.style.display = 'none';
        }

        // Make TOC collapsible
        const tocItems = tocContainer.querySelectorAll('li');
        let tocCounter = 0;
        tocItems.forEach(li => {
            const subUl = li.querySelector(':scope > ul');
            if (subUl) {
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
"""

js = js.replace("""
        // Hide the original topbar TOC button
        if (topbarTocBtn) {
            topbarTocBtn.style.display = 'none';
        }

        // Add smooth scrolling to TOC links
""", replacement_js)

with open('hugo-src/static/js/custom.js', 'w') as f:
    f.write(js)
    
with open('hugo-src/static/css/custom.css', 'a') as f:
    f.write("""

/* 12. Collapsible Sidebar Inline TOC */
#R-sidebar .sidebar-inline-toc li.toc-has-children {
  position: relative;
}
#R-sidebar .sidebar-inline-toc input.toc-checkbox {
  position: absolute !important;
  opacity: 0 !important;
  width: 16px !important;
  height: 16px !important;
  left: -4px !important;
  top: 2px !important;
  z-index: 3 !important;
  cursor: pointer !important;
  margin: 0 !important;
}
#R-sidebar .sidebar-inline-toc label.toc-label {
  position: absolute !important;
  left: -4px !important;
  top: 2px !important;
  height: 16px !important;
  width: 16px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  z-index: 2 !important;
  color: rgba(255,255,255,0.3) !important;
  transition: color 0.2s ease !important;
  margin: 0 !important;
  padding: 0 !important;
}
#R-sidebar .sidebar-inline-toc label.toc-label:hover {
  color: var(--x7-text) !important;
}
#R-sidebar .sidebar-inline-toc label.toc-label i {
  font-size: 0.65rem !important;
  transition: transform 0.2s ease !important;
  display: block !important;
}
#R-sidebar .sidebar-inline-toc input.toc-checkbox:checked ~ label.toc-label i {
  transform: rotate(90deg) !important;
}
#R-sidebar .sidebar-inline-toc li.toc-has-children > input.toc-checkbox ~ ul {
  display: none !important;
}
#R-sidebar .sidebar-inline-toc li.toc-has-children > input.toc-checkbox:checked ~ ul {
  display: block !important;
}
#R-sidebar .sidebar-inline-toc li.toc-has-children > a {
  padding-left: 14px !important; /* Make room for the chevron */
}
""")
