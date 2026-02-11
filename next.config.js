/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  logging: {
    fetches: {
      fullUrl: false,
    },
  },

  // Ignore TypeScript errors in build (for submodule compatibility)
  typescript: {
    // Dangerously allow production builds to complete even if there are type errors
    // This is needed because Tokamak-Zk-EVM submodule has type issues with @noble/curves
    ignoreBuildErrors: true,
  },

  webpack: (config, { isServer }) => {
    // Ignore React Native and optional modules that wagmi connectors try to import
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // MetaMask SDK optional dependencies
        "@react-native-async-storage/async-storage": false,
        // WalletConnect/pino optional dependencies
        "pino-pretty": false,
      };
    }

    // Suppress warnings for optional dependencies (both client and server)
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };

    // Ignore specific module warnings
    config.ignoreWarnings = [
      { module: /@metamask\/sdk/ },
      { module: /pino/ },
      { module: /@walletconnect/ },
      { module: /web-worker/ },
    ];

    return config;
  },
};

module.exports = nextConfig;
