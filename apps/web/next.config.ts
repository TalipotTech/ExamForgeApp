import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: "../../.env.local" });

const nextConfig: NextConfig = {
  transpilePackages: ["@examforge/shared"],
  serverExternalPackages: ["pg", "pg-pool"],
  typedRoutes: true,
};

export default nextConfig;
