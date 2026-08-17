import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. saveDeckHtml() re-uploads the whole generated deck
      // (all inline CSS/JS plus every slide's markup) on every autosave, which
      // exceeds the default well before a deck has many slides or widgets.
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
