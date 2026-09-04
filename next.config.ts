import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.34.199.40"],
  serverExternalPackages: ["@deepseek-ai/cordis", "@deepseek-ai/dsh-*", "@earendil-works/pi-ai", "sharp"],
};

export default nextConfig;
