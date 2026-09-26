import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // No Docker (BUILD_STANDALONE=1) gera um servidor enxuto em .next/standalone.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  // Pacotes com binário/wasm ou sockets ficam fora do bundle do servidor.
  serverExternalPackages: ["sql.js", "msedge-tts"],
  // Garante que o wasm do SQLite vá junto no deploy da rota de .apkg.
  outputFileTracingIncludes: {
    "/api/apkg": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // O service worker precisa ser sempre o mais novo.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
