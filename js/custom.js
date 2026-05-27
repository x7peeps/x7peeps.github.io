(() => {
  const hero = document.querySelector(".x7-hero");
  if (!hero) return;

  const bg = hero.querySelector(".x7-hero-bg");
  if (!bg) return;

  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (mediaQuery.matches) return;

  let raf = 0;
  let lastX = 0;
  let lastY = 0;

  const onMove = (e) => {
    const rect = hero.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    lastX = x;
    lastY = y;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const tx = Math.max(-0.5, Math.min(0.5, lastX));
      const ty = Math.max(-0.5, Math.min(0.5, lastY));
      bg.style.transform = `translate3d(${tx * 18}px, ${ty * 14}px, 0)`;
    });
  };

  const onLeave = () => {
    bg.style.transform = "";
  };

  hero.addEventListener("pointermove", onMove, { passive: true });
  hero.addEventListener("pointerleave", onLeave, { passive: true });
})();

(function() {
  const storageKey = 'relearn-menu-expanded-state';

  let expanded = [];
  const state = localStorage.getItem(storageKey);
  if (state) {
    try {
      expanded = JSON.parse(state);
    } catch (e) {
      console.error('Failed to parse menu state', e);
      expanded = [];
    }
  }

  // Restore state
  expanded.forEach(function(id) {
    const cb = document.getElementById(id);
    if (cb) {
      cb.checked = true;
    }
  });

  const checkboxes = document.querySelectorAll('#R-sidebar .collapsible-menu input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    // Add any that are checked by default (e.g., active path) but not in our list
    if (cb.checked && !expanded.includes(cb.id)) {
      expanded.push(cb.id);
    }
    
    cb.addEventListener('change', function() {
      if (cb.checked) {
        if (!expanded.includes(cb.id)) {
          expanded.push(cb.id);
        }
      } else {
        const index = expanded.indexOf(cb.id);
        if (index > -1) {
          expanded.splice(index, 1);
        }
      }
      localStorage.setItem(storageKey, JSON.stringify(expanded));
    });
  });

  localStorage.setItem(storageKey, JSON.stringify(expanded));
})();

