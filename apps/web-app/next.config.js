/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.xoobay.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.xoobay.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.samsung.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'store.storeimages.cdn-apple.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.alicdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.alicdn.com',
        pathname: '/**',
      },
      // sobuys.com - XooBay 产品图片主要来源
      {
        protocol: 'https',
        hostname: 'images.sobuys.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.sobuys.com',
        pathname: '/**',
      },
      // CJ Dropshipping 图片源
      {
        protocol: 'https',
        hostname: 'oss-cf.cjdropshipping.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.cjdropshipping.com',
        pathname: '/**',
      },
    ],
    // Allow any domain with unoptimized prop (fallback)
    unoptimized: false,
  },
}

module.exports = nextConfig
