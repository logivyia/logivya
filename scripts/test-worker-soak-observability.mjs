import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const source = readFileSync(new URL("../ops/vps/audit-whatsapp-worker-soak.sh", import.meta.url), "utf8");
const awk = source.match(/unexpected_connection_closed="\$\(awk '([\s\S]*?)' "\$log_file"\)"/)?.[1];
assert(awk, "The audit must count structured, non-intentional connection closes.");
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const count = (lines) => Number(execFileSync(bash, ["-c", `awk ${quote(awk)}`], {
  input: lines.join("\n") + "\n", encoding: "utf8",
}).trim());
const closed = (code, intentional = false) => JSON.stringify({ eventName: "whatsapp.connection.closed", code, intentional });
assert.equal(count([]), 0);
assert.equal(count([closed(500)]), 1);
assert.equal(count([closed(428), closed(401), closed(null)]), 3);
assert.equal(count([closed(515), closed(500, true)]), 0);
assert.equal(count([closed(5150)]), 1, "5150 must not be mistaken for the expected 515 restart.");
assert.equal(count(['{ "intentional" : false, "code" : 500, "eventName" : "whatsapp.connection.closed" }']), 1);
assert.equal(count(['{"eventName":"another.event","code":500}']), 0);
assert.match(source, /unexpected_connection_closed != 0 \|\| provider_job_failures != 0/);
assert.match(source, /restart_count != 0/);
assert.match(source, /EXPECTED_REDIS_ERROR_REPLIES:-0/);
assert.match(source, /"structuredConnectionClosed":%d/);
assert.match(source, /"decryptionFailures":%d/);
assert(!/CONFIG RESETSTAT|ACL LOG RESET|docker restart/.test(source));
console.log("Worker soak structured-close coverage: PASS (7 fixtures; strict gates preserved).");
