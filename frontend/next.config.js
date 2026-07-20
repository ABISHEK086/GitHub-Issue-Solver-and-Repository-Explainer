/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    const backendPaths = [
      "health",
      "analyze",
      "regenerate-diagram",
      "analyze-issue",
      "create-pr",
      "file-content",
    ];
    return backendPaths.map((path) => ({
      source: `/api/${path}`,
      destination: `${backend}/api/${path}`,
    }));
  },
};

module.exports = nextConfig;