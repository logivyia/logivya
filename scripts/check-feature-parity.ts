import { existsSync } from "node:fs";
import path from "node:path";

import { platformFeatureRegistry, supportedPlatforms, type FeatureParityStatus, type PlatformFeatureParity } from "../src/config/platform-feature-parity";

type CheckIssue = {
  featureId: string;
  severity: "error" | "warning";
  message: string;
};

const root = process.cwd();
const issues: CheckIssue[] = [];
const seenIds = new Set<string>();
const registry: readonly PlatformFeatureParity[] = platformFeatureRegistry;

for (const feature of registry) {
  const featureStatus: FeatureParityStatus = feature.status;
  if (seenIds.has(feature.id)) {
    issues.push({
      featureId: feature.id,
      severity: "error",
      message: "Duplicate feature id in platformFeatureRegistry."
    });
  }
  seenIds.add(feature.id);

  if (feature.businessLogicOwner !== "backend") {
    issues.push({
      featureId: feature.id,
      severity: "error",
      message: "Business logic owner must stay backend for cross-platform parity."
    });
  }

  for (const platform of supportedPlatforms) {
    if (!isValidStatus(feature.platforms[platform])) {
      issues.push({
        featureId: feature.id,
        severity: "error",
        message: `Missing or invalid platform status for ${platform}.`
      });
    }
  }

  if (featureStatus === "implemented") {
    for (const platform of supportedPlatforms) {
      if (feature.platforms[platform] !== "implemented") {
        issues.push({
          featureId: feature.id,
          severity: "error",
          message: `Implemented features must be implemented on ${platform}; current status is ${feature.platforms[platform]}.`
        });
      }
    }
    assertFiles(feature.id, "web", feature.webFiles);
    assertFiles(feature.id, "mobile", feature.mobileFiles);
    assertFiles(feature.id, "api", feature.apiFiles);
    if (!feature.webRoutes.length) {
      issues.push({
        featureId: feature.id,
        severity: "error",
        message: "Implemented features must declare at least one desktop/mobile web route."
      });
    }
    if (!feature.mobileRoutes.length) {
      issues.push({
        featureId: feature.id,
        severity: "error",
        message: "Implemented features must declare at least one Android/mobile route."
      });
    }
    if (!feature.apiFiles.length) {
      issues.push({
        featureId: feature.id,
        severity: "error",
        message: "Implemented features must declare backend API/server files."
      });
    }
  }

  if (featureStatus === "partial" || featureStatus === "planned") {
    issues.push({
      featureId: feature.id,
      severity: "warning",
      message: `${feature.title} is ${featureStatus}; release scope must not call it complete on every platform.`
    });
  }

  if (featureStatus === "platformSpecific" && !("notes" in feature && feature.notes)) {
    issues.push({
      featureId: feature.id,
      severity: "error",
      message: "Platform-specific features must document the reason in notes."
    });
  }
}

function assertFiles(featureId: string, group: string, files: readonly string[]) {
  for (const file of files) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) {
      issues.push({
        featureId,
        severity: "error",
        message: `Missing ${group} parity file: ${file}`
      });
    }
  }
}

function isValidStatus(value: FeatureParityStatus) {
  return value === "implemented" || value === "partial" || value === "planned" || value === "platformSpecific";
}

const errors = issues.filter((issue) => issue.severity === "error");
const warnings = issues.filter((issue) => issue.severity === "warning");

console.log("Logivya cross-platform feature parity check");
console.log(`Features: ${platformFeatureRegistry.length}`);
console.log(`Implemented: ${platformFeatureRegistry.filter((feature) => feature.status === "implemented").length}`);
console.log(`Partial/planned: ${warnings.length}`);

for (const issue of issues) {
  const prefix = issue.severity === "error" ? "ERROR" : "WARN";
  console.log(`${prefix} [${issue.featureId}] ${issue.message}`);
}

if (errors.length) {
  console.error(`Feature parity check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log("Feature parity check passed for all implemented features.");
