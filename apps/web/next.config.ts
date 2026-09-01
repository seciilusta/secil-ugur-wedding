import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Fully static output. `next build` writes a self-contained `out/` directory
   * that any ordinary web server can host — there is no Node runtime, no route
   * handler and no server action in this application. The RSVP API is a separate,
   * independently deployable service reached over HTTP.
   */
  output: "export",

  /** Static export cannot run the image optimizer. */
  images: { unoptimized: true },

  /** Emits `out/index.html` style directories, which every static host serves. */
  trailingSlash: true,

  reactStrictMode: true,

  /** Keeps the exported HTML free of the framework's build-id comment noise. */
  poweredByHeader: false,

  /** This project documents itself in its READMEs; no generated agent files. */
  agentRules: false,
};

export default nextConfig;
