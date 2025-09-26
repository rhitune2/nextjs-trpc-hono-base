import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
  }
}

export default nextConfig
