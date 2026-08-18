import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is a built-in module — keep it out of the bundler graph.
  serverExternalPackages: [],
  experimental: {
    // Server Actions handle CSV uploads; allow a generous body for big statements.
    serverActions: { bodySizeLimit: "12mb" },
  },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
