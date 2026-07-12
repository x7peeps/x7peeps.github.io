import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assessBaseline, checkLinks } from './check-links.mjs';

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'x7-links-'));
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
