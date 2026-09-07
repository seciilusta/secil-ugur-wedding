import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Keep images portable while Vercel serves the otherwise static pages. */
  images: { unoptimized: true },

  reactStrictMode: true,

  /** Keeps the rendered HTML free of the framework's build-id comment noise. */
  poweredByHeader: false,

  /** This project documents itself in its READMEs; no generated agent files. */
  agentRules: false,
};

export default nextConfig;
