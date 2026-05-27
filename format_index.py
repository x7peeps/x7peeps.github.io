import re

with open("css/custom.css", "r", encoding="utf-8") as f:
    content = f.read()

# Fix transform overflow issue
content = re.sub(r'overflow-x: hidden;', r'overflow-x: hidden;\n  overflow-y: auto;', content)
# Ensure container doesn't clip transforms
content = re.sub(r'\.R-sidebarmenu ul\.collapsible-menu\.enlarge\.morespace\s*{\s*padding:\s*\.25rem \.6rem \.9rem \.6rem;\s*overflow-x:\s*hidden;\s*}', 
                 r'.R-sidebarmenu ul.collapsible-menu.enlarge.morespace{\n  padding: .25rem .6rem .9rem .6rem;\n  overflow-x: visible;\n}', content)
# Add tooltip helper via CSS since we can't easily add title attrs dynamically
new_css = """

/* --- UX & Efficiency Fixes --- */

/* 1. Hit Area for Chevron (Expand/Collapse) */
/* The label holds the chevron, we want to make it larger so it's easier to click */
#R-sidebar ul.collapsible-menu > li > label {
  padding: 8px 12px;
  margin-left: -12px; /* Pull it left to increase hit area without shifting icon */
  cursor: pointer;
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  display: flex;
  align-items: center;
  z-index: 10; /* Ensure it's above the link for the right side */
}

/* Ensure the link doesn't block the chevron click */
.R-sidebarmenu ul.collapsible-menu > li {
  position: relative;
}
.R-sidebarmenu ul.collapsible-menu > li > a.padding {
  padding-right: 30px !important; /* Leave space for the chevron */
}

/* 2. Text Truncation & Tooltip fallback */
/* Instead of just hiding with ellipsis, we can show full text on hover */
.R-sidebarmenu ul.collapsible-menu a.padding {
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 3. Fix Scrollbar clipping */
aside#R-sidebar {
  overflow: visible !important;
}
#R-content-wrapper {
  overflow-x: hidden;
  overflow-y: auto;
}
.R-sidebarmenu ul.collapsible-menu {
  overflow: visible !important;
}
"""

with open("css/custom.css", "w", encoding="utf-8") as f:
    f.write(content + new_css)

print("Updated CSS for UX fixes.")
