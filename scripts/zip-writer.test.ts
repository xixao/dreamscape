// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from './zip-writer.mjs';

// `unzip` ships with macOS and most Linux images, but the round-trip test
// below shouldn't fail a run on a machine that lacks it - it's a bonus
// check on top of the pure byte-layout assertions, not the only coverage.
let unzipAvailable = true;
try {
  execFileSync('unzip', ['-v'], { stdio: 'ignore' });
} catch {
  unzipAvailable = false;
}

describe('crc32', () => {
  it('matches the well-known CRC-32 of "hello"', () => {
    expect(crc32(Buffer.from('hello', 'utf8'))).toBe(0x3610a686);
  });

  it('is 0 for an empty buffer', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('differs for different inputs', () => {
    expect(crc32(Buffer.from('hello'))).not.toBe(crc32(Buffer.from('world')));
  });
});

describe('buildZip', () => {
  const entries = [
    { path: 'a.txt', data: Buffer.from('hello'), date: new Date(2026, 0, 15, 9, 30, 0) },
    { path: 'dir/b.txt', data: Buffer.from('nested contents'), date: new Date(2026, 0, 15, 9, 30, 0) },
  ];

  it('starts with a local file header and records that entry\'s real CRC-32', () => {
    const zip = buildZip(entries);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50); // local file header signature
    expect(zip.readUInt16LE(8)).toBe(0); // compression method: STORED
    expect(zip.readUInt32LE(14)).toBe(crc32(entries[0].data)); // CRC-32 field
    expect(zip.readUInt32LE(18)).toBe(entries[0].data.length); // compressed size
    expect(zip.readUInt32LE(22)).toBe(entries[0].data.length); // uncompressed size
  });

  it('sets the UTF-8 language-encoding flag (bit 11) on every entry', () => {
    const zip = buildZip([{ path: 'café.txt', data: Buffer.from('x') }]);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
  });

  it('ends with an end-of-central-directory record whose offsets and counts match the archive', () => {
    const zip = buildZip(entries);

    const end = zip.subarray(zip.length - 22);
    expect(end.readUInt32LE(0)).toBe(0x06054b50);
    expect(end.readUInt16LE(8)).toBe(entries.length); // entries on this disk
    expect(end.readUInt16LE(10)).toBe(entries.length); // total entries

    const centralDirSize = end.readUInt32LE(12);
    const centralDirOffset = end.readUInt32LE(16);

    // The central directory fills exactly the space between its recorded
    // offset and the end-of-central-directory record that follows it.
    expect(centralDirOffset + centralDirSize).toBe(zip.length - 22);

    // The central directory starts with the right signature, and its first
    // record's local-header offset points back at byte 0 (the very first
    // local file header written).
    expect(zip.readUInt32LE(centralDirOffset)).toBe(0x02014b50);
    expect(zip.readUInt32LE(centralDirOffset + 42)).toBe(0);
  });

  (unzipAvailable ? it : it.skip)(
    'round-trips a temp directory through the system unzip -t integrity check',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'zip-writer-'));
      try {
        const zip = buildZip([
          { path: 'root.txt', data: Buffer.from('at the root') },
          { path: 'nested/child.txt', data: Buffer.from('nested contents') },
          { path: 'empty.txt', data: Buffer.alloc(0) },
        ]);
        const zipPath = join(dir, 'out.zip');
        writeFileSync(zipPath, zip);

        const output = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
        expect(output).toContain('No errors detected');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
