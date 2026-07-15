import path from "node:path";
import { inspectEncryptedArchive, loadManifest, parseArgs } from "./backup-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.manifest) throw new Error("USAGE: --manifest <path> [--archive <path>]");
const manifestPath = path.resolve(String(args.manifest));
const manifest = await loadManifest(manifestPath);
const archivePath = path.resolve(String(args.archive || path.join(path.dirname(manifestPath), manifest.archiveFile)));
const verification = await inspectEncryptedArchive(archivePath, manifest);
console.log(JSON.stringify({
  backupId: manifest.backupId,
  status: "VERIFIED",
  checksumSha256: manifest.checksumSha256,
  sizeBytes: manifest.sizeBytes,
  ...verification,
}, null, 2));
