import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: "../../.env.local" });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@examforge/shared"],
  serverExternalPackages: ["pg", "pg-pool"],
  typedRoutes: true,
  // The middleware runs on every non-public route (incl. our upload routes),
  // so Next must buffer the request body to pass it through. The default cap
  // is 10 MB (DEFAULT_BODY_CLONE_SIZE_LIMIT), which trims multi-file creator
  // uploads (audio + pdf + video can easily exceed that). Per-file size is
  // still gated server-side in the upload route handlers (MAX_SIZE_BYTES =
  // 500 MB), so we raise the middleware buffer well above that for combined
  // uploads. Lives under `experimental` in Next 15.5.x.
  // Source: next/dist/server/lib/router-utils/resolve-routes.js reads
  // `config.experimental.middlewareClientMaxBodySize` and feeds it to
  // getCloneableBody as the byte cap. Accepts a number (bytes) or a
  // bytes-format string ("1gb", "500mb").
  experimental: {
    // @ts-expect-error — typed as private experimental in 15.5.x but
    // documented at https://nextjs.org/docs/app/api-reference/config/next-config-js/middlewareClientMaxBodySize
    middlewareClientMaxBodySize: "1gb",
  },
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
