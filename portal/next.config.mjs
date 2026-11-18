/** @type {import('next').NextConfig} */
const isLowMemBuild = process.env.LOW_MEM_BUILD === "1";

const nextConfig = {
  devIndicators: false,
  ...(isLowMemBuild
    ? {
        experimental: {
          cpus: 1,
          webpackBuildWorker: false,
          webpackMemoryOptimizations: true,
          parallelServerCompiles: false,
          parallelServerBuildTraces: false,
        },
      }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
