import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./prisma/aiven-ca.crt"],
  },
};

export default nextConfig;
