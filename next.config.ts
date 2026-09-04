import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["10.34.199.40"],
  // The agent runtime uses dynamic provider loading (pi-ai) and native
  // modules (sharp) that bundlers cannot statically trace; resolve them at
  // runtime from node_modules instead.
  serverExternalPackages: ["@deepseek-ai/cordis", "@deepseek-ai/dsh-*", "@earendil-works/pi-ai", "sharp"],
};

export default nextConfig;
