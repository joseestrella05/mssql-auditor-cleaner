const path = require('path');
require('./patch-fs.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mssql', 'msnodesqlv8'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.symlinks = false;
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    };
    return config;
  },
};

module.exports = nextConfig;

