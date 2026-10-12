/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
    // Files read with fs at runtime: the watermark font and the logo on report PDFs.
    outputFileTracingIncludes: { "/api/**/*": ["./lib/fonts/**", "./public/brand/nexis-logo-dark.png"] },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
export default nextConfig;
