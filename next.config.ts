import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.34.199.40"],
  serverExternalPackages: ["@deepseek-ai/cordis", "@deepseek-ai/dsh-*", "@earendil-works/pi-ai", "sharp"],
  async headers() {
    return [
      {
        source: "/vendor/manim-web-0.3.24/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
