import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

type Gate = {
  name: string;
  passed: boolean;
  evidence: string;
};

function exists(file: string) {
  return existsSync(path.join(root, file));
}

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function envPassed(name: string) {
  return process.env[name]?.toLowerCase() === "passed";
}

const gates: Gate[] = [
  {
    name: "Stable-core governance docs",
    passed: exists("docs/STABLE_WHATSAPP_CORE.md") && exists("docs/PRODUCTION_ACCEPTANCE_GATE.md"),
    evidence: "docs/STABLE_WHATSAPP_CORE.md and docs/PRODUCTION_ACCEPTANCE_GATE.md",
  },
  {
    name: "Stable-core test script",
    passed: read("package.json").includes("\"test:stable-core\""),
    evidence: "package.json test:stable-core",
  },
  {
    name: "Real Android device acceptance",
    passed: envPassed("LOGIVYA_REAL_ANDROID_ACCEPTANCE"),
    evidence: "Set LOGIVYA_REAL_ANDROID_ACCEPTANCE=passed after real-device QR, phone pairing, group sync, send, delete-for-everyone verification.",
  },
  {
    name: "Mobile web acceptance",
    passed: envPassed("LOGIVYA_MOBILE_WEB_ACCEPTANCE"),
    evidence: "Set LOGIVYA_MOBILE_WEB_ACCEPTANCE=passed after authenticated mobile-web smoke tests.",
  },
  {
    name: "Desktop web acceptance",
    passed: envPassed("LOGIVYA_DESKTOP_WEB_ACCEPTANCE"),
    evidence: "Set LOGIVYA_DESKTOP_WEB_ACCEPTANCE=passed after authenticated desktop-web smoke tests.",
  },
  {
    name: "Production worker and Redis acceptance",
    passed: envPassed("LOGIVYA_WORKER_REDIS_ACCEPTANCE"),
    evidence: "Set LOGIVYA_WORKER_REDIS_ACCEPTANCE=passed after worker heartbeat, queue retry, and reconnect recovery are verified on production-like infrastructure.",
  },
  {
    name: "Database ownership and migration acceptance",
    passed: envPassed("LOGIVYA_DATABASE_ACCEPTANCE"),
    evidence: "Set LOGIVYA_DATABASE_ACCEPTANCE=passed after orphan/duplicate/ownership audit and migration safety checks pass against target data.",
  },
  {
    name: "Google Play update acceptance",
    passed: envPassed("LOGIVYA_PLAY_UPDATE_ACCEPTANCE"),
    evidence: "Set LOGIVYA_PLAY_UPDATE_ACCEPTANCE=passed after versionCode, package id, min/target SDK/device coverage and signing lineage are confirmed.",
  },
];

const failed = gates.filter((gate) => !gate.passed);

for (const gate of gates) {
  const status = gate.passed ? "PASS" : "BLOCKED";
  console.log(`${status} ${gate.name}: ${gate.evidence}`);
}

if (failed.length) {
  console.error(`Release acceptance gate blocked: ${failed.length} gate(s) missing evidence.`);
  process.exit(2);
}

console.log("Release acceptance gate passed.");
