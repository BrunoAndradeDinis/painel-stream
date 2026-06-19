import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permitir uploads de arquivos grandes (até 500MB) nas rotas de API
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
};

export default nextConfig;
