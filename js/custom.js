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
