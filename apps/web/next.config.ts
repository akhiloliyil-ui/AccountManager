import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Database drivers and file parsers load native/WASM assets at runtime; keep them out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "unpdf", "xlsx"],
  experimental: {
    // Statement spreadsheets and promotion PDFs are uploaded through Server Actions.
    serverActions: { bodySizeLimit: "16mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
