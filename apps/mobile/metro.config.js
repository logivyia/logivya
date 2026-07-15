const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;
const sourceRoot = path.resolve(__dirname, "src");
const workspaceRoot = path.resolve(__dirname, "../..");

config.watchFolders = [...new Set([...(config.watchFolders || []), workspaceRoot])];

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
