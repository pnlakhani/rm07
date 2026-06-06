/**
 * Next.js config. Security headers align with TRD §9 (HSTS, no-sniff, frame deny, referrer policy).
 * The full CSP `strict-dynamic` + nonce policy is applied at the edge/middleware in the auth ticket;
 * here we ship the always-on transport + framing headers.
 * @type {import('next').NextConfig}
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@rm07/ui', '@rm07/core'],
  // Linting is handled by the root flat ESLint config + CI, not by `next build`.
  // Next 14's built-in `next lint` is incompatible with ESLint 9 (flat config), so we
  // disable the build-time lint step. Type errors remain fatal.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
