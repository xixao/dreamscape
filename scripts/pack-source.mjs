// Packs the project's own source tree into public/dreamscape-source.zip
// (plus a small public/dreamscape-source.json stats file), so the files
// page and the editor's More menu can offer a coworker a straight download
// of the running product from the production site itself - no separate
// git access required. Runs as the `prebuild` hook (see package.json), so
// every `npm run build` - including Vercel's - regenerates the archive
// from whatever got deployed.
//
// Dependency-free by design: this writes into the public output of a
// production build, so it deliberately doesn't reach for a zip library -
// see scripts/zip-writer.mjs.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildZip } from './zip-writer.mjs';

// Directories skipped entirely (never descended into): build/tooling
// output, VCS metadata, and vendored agent/skill files that don't belong
// in a coworker's copy of the product.
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.next', '.git', '.vercel', '.superpowers', '.agents', '.claude']);

// Individual files skipped by basename, wherever they occur in the tree.
// `.git` is here too, not just above: in a linked git worktree (which is
// how this very script is meant to be run - see the worktree setup this
// project's tooling uses) the top-level `.git` is a plain *file* pointing
// at the real gitdir elsewhere on disk, not a directory, so it only hits
// the directory check in a plain clone. Confirmed live: a first run of
// this packer from inside a worktree shipped that pointer file - it
// leaked a local absolute path and obviously isn't part of the product.
// `next-env.d.ts` is Next's own auto-generated type stub, regenerated on
// every `next dev`/`next build`. Both it and any `*.tsbuildinfo` below are
// already in .gitignore for the same reason: confirmed live too - running
// this project's own documented pre-deploy checklist (`npx tsc --noEmit`
// before `npm run build`, per the README) leaves a tsconfig.tsbuildinfo
// next to it, and without this exclusion that cache file (hundreds of KB
// of file signatures, no source) rides along into the archive.
const EXCLUDED_FILE_NAMES = new Set(['skills-lock.json', 'AGENTS.md', 'CLAUDE.md', '.DS_Store', '.git', 'next-env.d.ts']);

// Exact project-relative (forward-slash) paths skipped: the packer's own
// previous output, so re-running it never zips up last run's archive.
const EXCLUDED_RELATIVE_PATHS = new Set(['public/dreamscape-source.zip', 'public/dreamscape-source.json']);

const ARCHIVE_ROOT = 'dreamscape';

function toPosix(relativePath) {
  return sep === '/' ? relativePath : relativePath.split(sep).join('/');
}

/** True if a directory named `name` should never be descended into. */
export function isExcludedDir(name) {
  return EXCLUDED_DIR_NAMES.has(name);
}

/**
 * True if the file at `relativePath` (forward-slash, relative to the
 * project root) should be left out of the archive - any dotenv file
 * (`.env`, `.env.local`, ...), any `*.tsbuildinfo` cache, the named
 * exclusions, or the packer's own generated output.
 */
export function isExcludedFile(relativePath) {
  if (EXCLUDED_RELATIVE_PATHS.has(relativePath)) return true;
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  if (name.startsWith('.env')) return true;
  if (name.endsWith('.tsbuildinfo')) return true;
  return EXCLUDED_FILE_NAMES.has(name);
}

/**
 * Walks `rootDir` and returns `{ absolutePath, relativePath }` for every
 * file to include in the archive, skipping the directories/files above.
 * Symlinks are skipped (neither a file nor a directory to `Dirent`), which
 * also avoids any risk of a symlink cycle. Entries within each directory
 * are sorted by name so the result - and the archive built from it - is
 * deterministic rather than depending on filesystem listing order.
 */
export function collectFiles(rootDir) {
  const results = [];

  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (isExcludedDir(entry.name)) continue;
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;

      const relativePath = toPosix(relative(rootDir, absolutePath));
      if (isExcludedFile(relativePath)) continue;

      results.push({ absolutePath, relativePath });
    }
  }

  walk(rootDir);
  return results;
}

/**
 * Builds the archive buffer and its stats for the project rooted at
 * `rootDir`, without writing anything - the pure part of the packer, so
 * tests can check its output directly.
 */
export function packSource(rootDir) {
  const files = collectFiles(rootDir);
  const builtAt = new Date();

  const entries = files.map(({ absolutePath, relativePath }) => ({
    path: `${ARCHIVE_ROOT}/${relativePath}`,
    data: readFileSync(absolutePath),
    date: builtAt,
  }));

  const zip = buildZip(entries);

  return {
    zip,
    stats: {
      builtAt: builtAt.toISOString(),
      files: entries.length,
      bytes: zip.length,
    },
  };
}

/**
 * Writes public/dreamscape-source.zip and public/dreamscape-source.json
 * under `rootDir` and returns the stats that went into the JSON file.
 */
export function writeSourceArchive(rootDir) {
  const { zip, stats } = packSource(rootDir);
  const publicDir = join(rootDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'dreamscape-source.zip'), zip);
  writeFileSync(join(publicDir, 'dreamscape-source.json'), `${JSON.stringify(stats, null, 2)}\n`);
  return stats;
}

function isMainModule() {
  return process.argv[1] != null && import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const stats = writeSourceArchive(process.cwd());
  console.log(`Wrote public/dreamscape-source.zip: ${stats.files} files, ${stats.bytes} bytes.`);
}
