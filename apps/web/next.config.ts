import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      // Behind nginx/edge proxies; avoids Origin vs X-Forwarded-Host mismatch on non-:443 ports.
      allowedOrigins: [
        'localhost:8088',
        '127.0.0.1:8088',
        '192.168.100.221:3031',
        'pfs-monitor.systemup.inf.br',
      ],
    },
  },
};

export default nextConfig;
