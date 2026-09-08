import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @remindam/shared is a local TS package compiled to dist; transpile it here.
  transpilePackages: ['@remindam/shared'],
  // This is a multi-package monorepo (root holds prettier + orchestration scripts,
  // so a root lockfile legitimately exists). Pin file-tracing to this app to avoid
  // Next inferring the repo root and to keep standalone output tracing correct.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
