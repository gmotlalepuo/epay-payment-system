/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Pin the workspace root so Next stops picking up the stray
  // package-lock.json in C:\Users\Bopaki\ and treating it as the root.
  turbopack: {
    root: import.meta.dirname,
  },
}

export default nextConfig
