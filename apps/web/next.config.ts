import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: "../../.env.local" });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@examforge/shared"],
  serverExternalPackages: ["pg", "pg-pool"],
  typedRoutes: true,
  async rewrites() {
    return [
      {
        // Proxy tRPC calls through same origin so cookies are forwarded
        source: "/api/trpc/:path*",
        destination: `${apiUrl}/trpc/:path*`,
      },
    ];
  },
};

export default nextConfig;
