import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {RemoteZipArchive} from '../web/zip-source.js';

const LIMITS = Object.freeze({
  packageBytes: 256 * 1024 * 1024,
  streamedPackageBytes: 64 * 1024 * 1024 * 1024,
  entries: 5000,
  entryBytes: 16 * 1024 * 1024 * 1024,
  bufferedEntryBytes: 256 * 1024 * 1024,
  totalUncompressedBytes: 128 * 1024 * 1024 * 1024,
  centralDirectoryBytes: 64 * 1024 * 1024,
  compressionRatio: 250,
});

test('RemoteZipArchive preserves the platform fetch receiver', async () => {
  const bytes = readFileSync(new URL('../../../examples/canonical/external/qti3-minimal.p2lrn', import.meta.url));
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = function (_url, options = {}) {
    assert.equal(this, globalThis, 'platform fetch must be invoked with globalThis as receiver');
    calls += 1;
    const headers = options.headers ?? {};
    const range = headers.Range ?? headers.range;
    assert.match(String(range), /^bytes=\d+-\d+$/);
    const [, startRaw, endRaw] = String(range).match(/^bytes=(\d+)-(\d+)$/);
    const start = Number(startRaw);
    const end = Number(endRaw);
    assert.ok(start >= 0 && end >= start && end < bytes.byteLength);
    const body = bytes.subarray(start, end + 1);
    return Promise.resolve(new Response(body, {
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${bytes.byteLength}`,
        'content-length': String(body.byteLength),
        etag: '"p2lrn-fetch-binding-test"',
      },
    }));
  };

  try {
    const archive = await RemoteZipArchive.open('https://example.invalid/course.p2lrn', LIMITS);
    assert.ok(archive.names().includes('META-INF/manifest.json'));
    assert.ok(archive.names().includes('content/graph.json'));
    assert.ok(calls >= 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
