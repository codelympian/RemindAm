/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @remindam/shared is a local TS package compiled to dist; transpile it here.
  transpilePackages: ['@remindam/shared'],
};

export default nextConfig;
