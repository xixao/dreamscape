import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly that Turbopack cannot bundle for the server
  // (it fails with "The path argument must be of type string ... Received an
  // instance of URL" on the first query). Loading it from node_modules at
  // runtime keeps the no-DATABASE_URL fallback in db/client.ts usable in
  // `next dev`, which is how the app is verified locally without touching the
  // shared Neon database. Production always sets DATABASE_URL and never
  // reaches that branch.
  serverExternalPackages: ['@electric-sql/pglite'],
  // A git worktree checked out beside this repo (e.g. for isolated task
  // branches) symlinks its own node_modules to this project's rather than
  // duplicating it. Node, tsc, ESLint and Vitest all follow that symlink
  // transparently, but Turbopack's own root-boundary check does not: it
  // fails `next build` outright with "Symlink [project]/node_modules is
  // invalid, it points out of the filesystem root" because the symlink
  // target sits outside the worktree directory it infers as the project
  // root. Widening the root to the shared parent directory (which contains
  // both worktrees) lets Turbopack resolve through it like everything else
  // already does; harmless when there is no sibling worktree either.
  turbopack: {
    root: path.join(process.cwd(), '..'),
  },
};

export default nextConfig;
