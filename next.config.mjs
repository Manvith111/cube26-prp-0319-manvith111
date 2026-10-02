import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow an isolated build dir (e.g. when a second dev server runs on the same
  // project) so concurrent processes don't corrupt each other's .next chunks.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

// Makes Cloudflare bindings available via getCloudflareContext() during
// `next dev`. The file repo is still selected on Node, so dev keeps using the
// local data/ store; this only wires the bindings up for the preview worker.
initOpenNextCloudflareForDev();

export default nextConfig;
