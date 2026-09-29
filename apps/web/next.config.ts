import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve("../../.env"), quiet: true });

const nextConfig: NextConfig = {
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true" ? { output: "standalone" as const, outputFileTracingRoot: resolve("../..") } : {}),
  transpilePackages: ["@just4kids/contracts"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}/:path*` }];
  },
};

export default nextConfig;
