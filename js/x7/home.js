export function initHome() {
  const heatmap = document.getElementById("x7-heatmap");
  if (!heatmap || heatmap.children.length > 0) return;

  let days = window.__heatmapDays;
  if (typeof days === "string") {
    try {
      days = JSON.parse(days);
    } catch {
      days = [];
    }
  }
  if (!Array.isArray(days) || days.length === 0) return;

  const total = days.reduce((sum, day) => sum + Math.max(0, Number(day.count) || 0), 0);
  const max = days.reduce((highest, day) => Math.max(highest, Number(day.count) || 0), 0);
  const totalLabel = document.querySelector(".x7-heatmap-total");
  if (totalLabel) totalLabel.textContent = total > 0 ? `近一年 ${total} 篇更新` : "近一年暂无更新";

  const cells = days.slice(-371);
  const startOffset = new Date(cells[0]?.date || Date.now()).getDay();
  const padded = Array.from({ length: startOffset }, () => null).concat(cells);
  const weekCount = Math.ceil(padded.length / 7);
  heatmap.style.gridTemplateColumns = `repeat(${weekCount}, var(--x7-heatmap-cell-size))`;

  const levelFor = (count) => {
    if (!max || !count) return 0;
    const ratio = count / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const frag = document.createDocumentFragment();
  padded.forEach((day) => {
    const cell = document.createElement("span");
    cell.className = "x7-heatmap-cell";
    if (!day) {
      cell.setAttribute("aria-hidden", "true");
      cell.style.visibility = "hidden";
      frag.appendChild(cell);
      return;
    }

    const count = Math.max(0, Number(day.count) || 0);
    const level = levelFor(count);
    if (level > 0) cell.dataset.level = String(level);
    const label = `${day.date} ${count > 0 ? `${count} 篇更新` : "无更新"}`;
    cell.title = label;
    cell.setAttribute("aria-label", label);
    frag.appendChild(cell);
  });

  heatmap.appendChild(frag);
}
