import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fail the build on type errors. A dashboard that compiles around a broken
  // type is exactly the kind of "works until Ricky clicks it" bug we cannot have.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
