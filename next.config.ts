import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The libSQL client ships a native binary for its local-file driver, which
  // a bundler cannot inline. Marking it external leaves it in node_modules so
  // the deployment traces the real binary instead of producing a bundle that
  // fails to load at runtime.
  serverExternalPackages: ["@libsql/client", "libsql"],
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
