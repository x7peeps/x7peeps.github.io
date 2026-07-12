import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ignored = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|#|\?|\/\/)/;

async function siteEntries(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return siteEntries(filename);
    return entry.isFile() ? [filename] : [];
  }));
  return nested.flat();
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', quot: '"', apos: "'" };
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|quot|apos));/gi, (entity, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return named[name.toLowerCase()] ?? entity;
  });
}

export async function checkLinks(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const broken = [];
  const entries = await siteEntries(root);
  const existing = new Set(entries);

  for (const sourceFile of entries.filter((filename) => filename.endsWith('.html'))) {
    const html = (await readFile(sourceFile, 'utf8'))
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const references = [...html.matchAll(/<[^>]+>/g)].flatMap(([tag]) =>
      [...tag.matchAll(/\b(?:href|src)\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi)],
    );

    for (const match of references) {
      const raw = decodeHtmlEntities((match[2] ?? match[3] ?? '').trim());
      if (!raw || ignored.test(raw)) continue;

      const pathname = raw.split(/[?#]/, 1)[0];
      if (!pathname) continue;

      let decoded;
      try {
        decoded = decodeURIComponent(pathname);
      } catch {
        broken.push({ source: path.relative(root, sourceFile), url: raw, reason: 'malformed URL encoding' });
        continue;
      }

      const relativeTarget = decoded.startsWith('/')
        ? decoded.slice(1)
        : path.join(path.relative(root, path.dirname(sourceFile)), decoded);
      const target = path.resolve(root, relativeTarget);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        broken.push({ source: path.relative(root, sourceFile), url: raw, reason: 'target escapes output directory' });
        continue;
      }

      const candidates = [target, path.join(target, 'index.html'), `${target}.html`];
      if (!candidates.some((candidate) => existing.has(candidate))) {
        broken.push({ source: path.relative(root, sourceFile), url: raw, reason: 'target not found' });
      }
    }
  }

  return broken;
}

function formatBroken(link) {
  return `${link.source}: ${link.url} (${link.reason})`;
}

export function assessBaseline(current, baseline) {
  const currentSet = new Set(current);
  const baselineSet = new Set(baseline);
  return {
    added: [...currentSet].filter((line) => !baselineSet.has(line)).sort(),
    removed: [...baselineSet].filter((line) => !currentSet.has(line)).sort(),
  };
}

async function main() {
  const writeBaseline = process.argv.includes('--write-baseline');
  const root = process.argv.slice(2).find((argument) => argument !== '--write-baseline');
  if (!root) {
    console.error('Usage: node tests/check-links.mjs <generated-site-directory>');
    process.exitCode = 2;
    return;
  }

  const broken = await checkLinks(root);
  const current = [...new Set(broken.map(formatBroken))].sort();
  for (const link of broken) {
    console.error(formatBroken(link));
  }

  const baselineFile = fileURLToPath(new URL('./link-baseline.txt', import.meta.url));
  if (writeBaseline) {
    await writeFile(baselineFile, current.length ? `${current.join('\n')}\n` : '');
    console.error(`Wrote ${current.length} entries to ${baselineFile}`);
    return;
  }

  let baseline = [];
  try {
    baseline = (await readFile(baselineFile, 'utf8')).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const changes = assessBaseline(current, baseline);
  for (const line of changes.added) console.error(`NEW: ${line}`);
  for (const line of changes.removed) console.error(`STALE: ${line}`);
  if (changes.added.length || changes.removed.length) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
