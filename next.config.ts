import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Client is generated outside node_modules, so include its native
  // query engine in the serverless function bundles.
  outputFileTracingIncludes: {
    "/*": ["./app/generated/prisma/**/*"],
  },
};

export default nextConfig;
