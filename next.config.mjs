/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.64.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

export default nextConfig;
