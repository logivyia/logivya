import { readFileSync } from "node:fs";

const reportPath = process.argv[2] || "trivy-results.json";
const report = JSON.parse(readFileSync(reportPath, "utf8").replace(/^\uFEFF/u, ""));
const blockedSeverities = new Set(["HIGH", "CRITICAL"]);
const findings = [];

for (const result of report.Results || []) {
  for (const vulnerability of result.Vulnerabilities || []) {
    if (!blockedSeverities.has(vulnerability.Severity)) continue;
    findings.push({
      target: result.Target || "container",
      id: vulnerability.VulnerabilityID || "UNKNOWN",
      severity: vulnerability.Severity,
      packageName: vulnerability.PkgName || "unknown-package",
      installedVersion: vulnerability.InstalledVersion || "unknown",
      fixedVersion: vulnerability.FixedVersion || "not-available",
    });
  }
}

const escapeCommandValue = (value) => String(value)
  .replaceAll("%", "%25")
  .replaceAll("\r", "%0D")
  .replaceAll("\n", "%0A");

for (const finding of findings.slice(0, 100)) {
  const title = `Trivy ${finding.severity} ${finding.id}`;
  const message = `${finding.target}: ${finding.packageName}@${finding.installedVersion}; fixed=${finding.fixedVersion}`;
  console.error(`::error title=${escapeCommandValue(title)}::${escapeCommandValue(message)}`);
}

if (findings.length > 100) {
  console.error(`::error title=Trivy report truncated::${findings.length - 100} additional blocking findings`);
}

if (findings.length > 0) {
  console.error(`Container vulnerability policy failed with ${findings.length} HIGH/CRITICAL findings.`);
  process.exitCode = 1;
} else {
  console.log("Container vulnerability policy passed: no HIGH/CRITICAL findings.");
}
