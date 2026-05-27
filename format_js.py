import re

with open("js/custom.js", "r", encoding="utf-8") as f:
    content = f.read()

# Let's add a script to automatically add `title` attributes to sidebar items 
# if they are truncated, to improve content display efficiency.

new_js = """
// --- UX Enhancements ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Auto-add title attributes to sidebar links if they are truncated
  const sidebarLinks = document.querySelectorAll(".R-sidebarmenu a.padding");
  sidebarLinks.forEach(link => {
    // A simple way to check if text is truncated: scrollWidth > clientWidth
    // But even if not, adding a title helps with efficiency.
    const text = link.textContent.trim();
    if (text && !link.hasAttribute('title')) {
      link.setAttribute('title', text);
    }
  });

  // 2. Make the whole row click expand if it's a folder but has no link
  // (Relearn usually handles this, but we can enhance hit areas)
  const folderLabels = document.querySelectorAll("#R-sidebar ul.collapsible-menu > li > label");
  folderLabels.forEach(label => {
    label.addEventListener("mouseenter", () => {
      label.closest("li").classList.add("hover-chevron");
    });
    label.addEventListener("mouseleave", () => {
      label.closest("li").classList.remove("hover-chevron");
    });
  });
});
"""

with open("js/custom.js", "w", encoding="utf-8") as f:
    f.write(content + new_js)

print("Updated JS for UX fixes.")
