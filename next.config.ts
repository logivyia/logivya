import type { NextConfig } from "next";

const developmentScriptPolicy = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  deploymentId: process.env.DEPLOYMENT_VERSION || undefined,
  outputFileTracingIncludes: {
    "/*": ["./packages/locales/**/*.json"],
  },
  experimental: {
    cpus: 2,
    staticGenerationMaxConcurrency: 2,
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentScriptPolicy} https://accounts.google.com https://appleid.cdn-apple.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'self' https://accounts.google.com https://appleid.apple.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://appleid.apple.com; object-src 'none'; upgrade-insecure-requests` },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      ],
    }];
  },
};

export default nextConfig;
