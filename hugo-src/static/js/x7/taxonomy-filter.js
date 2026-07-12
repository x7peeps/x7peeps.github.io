const initialized = new WeakMap();

export const normalizeFilterValue = (value) => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .toLocaleLowerCase();

export function matchesTaxonomyFilters(item = {}, filters = {}) {
  return ["section", "year", "type"].every((dimension) => {
    const selected = normalizeFilterValue(filters[dimension]);
    return !selected || normalizeFilterValue(item[dimension]) === selected;
  });
}

export function getTaxonomyResultContainer(item) {
  return item?.closest?.("li") ?? item;
}

export function initTaxonomyFilters(root = document) {
  const form = root.querySelector("[data-x7-taxonomy-filters]");
  if (!form) return () => {};
  const existing = initialized.get(form);
  if (existing) return existing;

  const resultsRoot = form.closest("[data-x7-taxonomy-results]");
  const items = [...(resultsRoot?.querySelectorAll("[data-x7-taxonomy-result]") ?? [])];
  const containers = items.map(getTaxonomyResultContainer);
  const status = resultsRoot?.querySelector("[data-x7-taxonomy-status]");
  const controls = Object.fromEntries(["section", "year", "type"].map((dimension) => [
    dimension,
    form.querySelector(`[data-x7-taxonomy-filter="${dimension}"]`),
  ]));
  const originalHidden = new Map(containers.map((container) => [container, container.hidden]));

  const apply = () => {
    const filters = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control?.value ?? ""]));
    let visible = 0;
    items.forEach((item, index) => {
      const matches = matchesTaxonomyFilters({
        section: item.dataset.x7ResultSection,
        year: item.dataset.x7ResultYear,
        type: item.dataset.x7ResultType,
      }, filters);
      containers[index].hidden = !matches;
      if (matches) visible += 1;
    });
    if (status) status.textContent = `${visible} 篇文章`;
  };
  const reset = () => window.setTimeout(apply, 0);
  form.addEventListener("change", apply);
  form.addEventListener("reset", reset);
  apply();

  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    form.removeEventListener("change", apply);
    form.removeEventListener("reset", reset);
    containers.forEach((container) => { container.hidden = originalHidden.get(container); });
    if (status) status.textContent = `${items.length} 篇文章`;
    initialized.delete(form);
  };
  initialized.set(form, cleanup);
  return cleanup;
}
