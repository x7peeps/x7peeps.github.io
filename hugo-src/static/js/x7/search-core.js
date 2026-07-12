export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase().trim();
}

function compareText(left, right) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function updatedTime(document) {
  const value = Date.parse(document?.updated ?? "");
  return Number.isNaN(value) ? 0 : value;
}

function tieBreak(left, right) {
  return right.score - left.score
    || updatedTime(right.document) - updatedTime(left.document)
    || compareText(normalizeSearchText(left.document?.title), normalizeSearchText(right.document?.title))
    || compareText(normalizeSearchText(left.document?.url), normalizeSearchText(right.document?.url))
    || left.index - right.index;
}

function tokenScore(fields, token) {
  if (fields.title === token) return 100;
  if (fields.title.startsWith(token)) return 80;
  if (fields.title.includes(token)) return 70;
  if (fields.tags.some(tag => tag === token)) return 60;
  if (fields.tags.some(tag => tag.includes(token))) return 50;
  if (fields.section.includes(token)) return 40;
  if (fields.summary.includes(token)) return 30;
  return 0;
}

export function searchDocuments(documents, query, options = {}) {
  const docs = Array.isArray(documents) ? documents : [];
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.trunc(options.limit)) : docs.length;
  const section = normalizeSearchText(options.section);
  const eligible = docs
    .map((document, index) => ({ document, index }))
    .filter(({ document }) => !section || normalizeSearchText(document?.section) === section);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    const recentOrder = new Map(
      (Array.isArray(options.recentUrls) ? options.recentUrls : [])
        .map(normalizeSearchText)
        .filter(Boolean)
        .map((url, index) => [url, index]),
    );
    return eligible
      .map(item => ({ ...item, recent: recentOrder.get(normalizeSearchText(item.document?.url)) }))
      .sort((left, right) => {
        const leftRecent = left.recent ?? Number.POSITIVE_INFINITY;
        const rightRecent = right.recent ?? Number.POSITIVE_INFINITY;
        return leftRecent - rightRecent
          || updatedTime(right.document) - updatedTime(left.document)
          || compareText(normalizeSearchText(left.document?.title), normalizeSearchText(right.document?.title))
          || compareText(normalizeSearchText(left.document?.url), normalizeSearchText(right.document?.url))
          || left.index - right.index;
      })
      .slice(0, limit)
      .map(({ document }) => document);
  }

  const tokens = normalizedQuery.split(/\s+/u);
  return eligible
    .map(({ document, index }) => {
      const fields = {
        title: normalizeSearchText(document?.title),
        tags: (Array.isArray(document?.tags) ? document.tags : []).map(normalizeSearchText),
        section: normalizeSearchText(document?.section),
        summary: normalizeSearchText(document?.summary),
      };
      const scores = tokens.map(token => tokenScore(fields, token));
      return { document, index, score: scores.every(Boolean) ? scores.reduce((sum, score) => sum + score, 0) : 0 };
    })
    .filter(({ score }) => score > 0)
    .sort(tieBreak)
    .slice(0, limit)
    .map(({ document }) => document);
}
