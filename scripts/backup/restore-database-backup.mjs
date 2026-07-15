import path from "node:path";
import { decryptToRestoreProcess, inspectEncryptedArchive, loadManifest, parseArgs, requiredEnv } from "./backup-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.manifest) throw new Error("USAGE: --manifest <path> [--archive <path>]");
if (process.env.RESTORE_CONFIRM_ISOLATED !== "YES") throw new Error("RESTORE_CONFIRM_ISOLATED_REQUIRED");

const manifestPath = path.resolve(String(args.manifest));
const manifest = await loadManifest(manifestPath);
const archivePath = path.resolve(String(args.archive || path.join(path.dirname(manifestPath), manifest.archiveFile)));
await inspectEncryptedArchive(archivePath, manifest);

const container = process.env.RESTORE_DOCKER_CONTAINER?.trim();
let target;
if (container) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(container)) throw new Error("RESTORE_CONTAINER_INVALID");
  target = {
    container,
    database: process.env.RESTORE_DATABASE_NAME || "logivya_restore",
    user: process.env.RESTORE_DATABASE_USER || "postgres",
  };
} else {
  const connectionString = requiredEnv("RESTORE_DATABASE_URL");
  const url = new URL(connectionString);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", ...String(process.env.RESTORE_ALLOWED_HOSTS || "").split(",").map((value) => value.trim()).filter(Boolean)]);
  if (!allowedHosts.has(url.hostname) || /\.neon\.tech$/i.test(url.hostname)) throw new Error("RESTORE_TARGET_NOT_ISOLATED");
  target = { connectionString, database: decodeURIComponent(url.pathname.replace(/^\//, "")), user: decodeURIComponent(url.username) };
}

const startedAt = Date.now();
await decryptToRestoreProcess(archivePath, manifest, target);
console.log(JSON.stringify({
  backupId: manifest.backupId,
  status: "RESTORED",
  target: container ? `docker:${container}` : "isolated-database",
  durationMs: Date.now() - startedAt,
  outboundMessagingEnabled: false,
}, null, 2));
