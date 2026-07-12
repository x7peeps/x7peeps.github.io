import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { assessBaseline, checkLinks } from './check-links.mjs';

const fixtureRoots = [];
after(async () => Promise.all(fixtureRoots.map((root) => rm(root, { recursive: true, force: true }))));

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'x7-links-'));
  fixtureRoots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const filename = path.join(root, name);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, contents);
  }
  return root;
}

test('accepts direct, directory-index, and extensionless HTML targets', async () => {
  const root = await fixture({
    'index.html': '<a href="/asset.svg">a</a><a href="/docs/">b</a><a href="/about">c</a>',
    'asset.svg': '',
    'docs/index.html': '',
    'about.html': '',
  });

  assert.deepEqual(await checkLinks(root), []);
});

test('ignores URLs with arbitrary valid URI schemes and protocol-relative URLs', async () => {
  const root = await fixture({
    'index.html': [
      'ftp://example.com/file',
      'file:///tmp/file',
      'blob:https://example.com/id',
      'webcal://example.com/calendar',
      'custom+scheme.value-1:payload',
      '//cdn.example.com/asset.js',
    ].map((url) => `<a href="${url}">external</a>`).join(''),
  });

  assert.deepEqual(await checkLinks(root), []);
});

test('does not accept a directory without an index document', async () => {
  const root = await fixture({ 'index.html': '<a href="/empty/">empty</a>', 'empty/.keep': '' });

  assert.equal((await checkLinks(root)).length, 1);
});

test('ignores references in comments and raw-content elements', async () => {
  const root = await fixture({
    'index.html': '<!-- <a href="missing-comment"> --><script>"<a href=missing-script>"</script><style><a href=missing-style></style><template><a href="missing-template"></template>',
  });

  assert.deepEqual(await checkLinks(root), []);
});

test('decodes HTML entities in URL attributes before resolving paths', async () => {
  const root = await fixture({
    'index.html': '<a href="asset&amp;name.html?x=1&amp;y=2">named</a><a href="numeric&#38;name.html">numeric</a>',
    'asset&name.html': '',
    'numeric&name.html': '',
  });

  assert.deepEqual(await checkLinks(root), []);
});

test('reports missing and malformed local URLs without throwing', async () => {
  const root = await fixture({
    'index.html': '<img src="missing.png"><a href="/%E0%A4%A">bad</a>',
  });

  const broken = await checkLinks(root);
  assert.equal(broken.length, 2);
  assert.ok(broken.every(({ source }) => source === 'index.html'));
});

test('baseline comparison rejects new and stale broken-link entries', () => {
  const current = ['index.html: missing.png (target not found)'];

  assert.deepEqual(assessBaseline(current, current), { added: [], removed: [] });
  assert.deepEqual(assessBaseline(current, []), { added: current, removed: [] });
  assert.deepEqual(assessBaseline([], current), { added: [], removed: current });
});
