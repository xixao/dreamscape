import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow an isolated local preview alongside another development server.
  distDir: process.env.DREAMSCAPE_PREVIEW_DIST || '.next',
  // PGlite ships WebAssembly that Turbopack cannot bundle for the server
  // (it fails with "The path argument must be of type string ... Received an
  // instance of URL" on the first query). Loading it from node_modules at
  // runtime keeps the no-DATABASE_URL fallback in db/client.ts usable in
  // `next dev`, which is how the app is verified locally without touching the
  // shared Neon database. Production always sets DATABASE_URL and never
  // reaches that branch.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
