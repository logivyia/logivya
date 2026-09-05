const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;
const sourceRoot = path.resolve(__dirname, "src");
const workspaceRoot = path.resolve(__dirname, "../..");
const configuredMaxWorkers = Number(process.env.LOGIVYA_METRO_MAX_WORKERS);

if (Number.isInteger(configuredMaxWorkers) && configuredMaxWorkers > 0) {
  config.maxWorkers = configuredMaxWorkers;
}

config.watchFolders = [...new Set([...(config.watchFolders || []), workspaceRoot])];

// The monorepo watch root is needed for shared source, not generated web builds
// or archived release binaries. Crawling these causes avoidable I/O and races
// with Next's output cleanup when mobile and web checks run together.
const existingBlockList = config.resolver.blockList;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  ...[".next", "artifacts", ".local-android"].map(
    (directory) => new RegExp(`^${escapeRegExp(path.join(workspaceRoot, directory))}(?:[\\\\/]|$)`),
  ),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "zustand/middleware") {
    return context.resolveRequest(context, require.resolve("zustand/middleware"), platform);
  }

  if (moduleName.startsWith("@logivya/validation/")) {
    return context.resolveRequest(
      context,
      path.join(workspaceRoot, "packages", "validation", "src", moduleName.slice("@logivya/validation/".length)),
      platform
    );
  }

  if (moduleName === "@logivya/logging") {
    return context.resolveRequest(
      context,
      path.join(workspaceRoot, "packages", "logging", "src", "index.ts"),
      platform
    );
  }

  if (moduleName.startsWith("@logivya/logging/")) {
    return context.resolveRequest(
      context,
      path.join(workspaceRoot, "packages", "logging", "src", moduleName.slice("@logivya/logging/".length)),
      platform
    );
  }

  if (moduleName.startsWith("@/")) {
    return context.resolveRequest(context, path.join(sourceRoot, moduleName.slice(2)), platform);
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
