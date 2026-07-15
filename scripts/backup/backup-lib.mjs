import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

export const REQUIRED_ARCHIVE_TABLES = [
  "_prisma_migrations",
  "User",
  "Company",
  "WhatsAppAccount",
  "WhatsAppSession",
  "MessageCampaign",
  "MessageRecipient",
  "SupportTicket",
  "AuditLog",
];

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

export function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) result[rawKey] = inlineValue;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) result[rawKey] = argv[++index];
    else result[rawKey] = true;
  }
  return result;
}

export function encryptionKey() {
  const configured = requiredEnv("BACKUP_ENCRYPTION_KEY");
  const key = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64url");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY_MUST_BE_32_BYTES");
  return key;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function manifestSignature(manifest, key = encryptionKey()) {
  const unsigned = { ...manifest };
  delete unsigned.manifestHmac;
  return createHmac("sha256", key).update(JSON.stringify(stableValue(unsigned))).digest("hex");
}

export function assertManifestSignature(manifest, key = encryptionKey()) {
  const expected = manifestSignature(manifest, key);
  if (manifest.manifestHmac !== expected) throw new Error("BACKUP_MANIFEST_HMAC_MISMATCH");
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function databaseMetadataFromClient(client, connectionString) {
  const info = (await client.query(`
    SELECT current_database() AS database,
           current_schema() AS schema,
           current_setting('server_version') AS "serverVersion"
  `)).rows[0];
  const migration = (await client.query(`
    SELECT COUNT(*)::int AS count, MAX(finished_at) AS "latestFinishedAt"
    FROM "_prisma_migrations"
    WHERE rolled_back_at IS NULL
  `)).rows[0];
  const latestMigration = (await client.query(`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `)).rows[0]?.migration_name || null;
  const criticalTables = REQUIRED_ARCHIVE_TABLES.filter((table) => table !== "_prisma_migrations");
  const rowCounts = {};
  for (const table of criticalTables) {
    rowCounts[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count);
  }
  const url = new URL(connectionString);
  return {
    database: info.database,
    schema: info.schema,
    serverVersion: info.serverVersion,
    hostFingerprint: createHash("sha256").update(url.hostname.toLowerCase()).digest("hex").slice(0, 16),
    migrationCount: Number(migration.count),
    latestMigration,
    latestMigrationFinishedAt: migration.latestFinishedAt?.toISOString?.() || migration.latestFinishedAt || null,
    rowCounts,
  };
}

export async function readDatabaseBackupMetadata(connectionString) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await databaseMetadataFromClient(client, connectionString);
  } finally {
    await client.end();
  }
}

export async function openDatabaseBackupSnapshot(connectionString) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const snapshotId = (await client.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
    const source = await databaseMetadataFromClient(client, connectionString);
    return {
      snapshotId,
      source,
      close: async () => {
        await client.query("ROLLBACK").catch(() => undefined);
        await client.end();
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
    throw error;
  }
}

function safePgEnvironment(connectionString) {
  const url = new URL(connectionString);
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) throw new Error("BACKUP_DATABASE_URL_INVALID");
  const values = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || (url.hostname === "localhost" || url.hostname === "127.0.0.1" ? "disable" : "require"),
  };
  for (const [name, value] of Object.entries(values)) {
    if (!value || /[\r\n]/.test(value)) throw new Error(`BACKUP_DATABASE_COMPONENT_INVALID:${name}`);
  }
  return values;
}

async function writePgEnvFile(connectionString) {
  const filePath = path.join(os.tmpdir(), `logivya-pg-${randomUUID()}.env`);
  const contents = Object.entries(safePgEnvironment(connectionString)).map(([key, value]) => `${key}=${value}`).join("\n");
  await writeFile(filePath, `${contents}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return filePath;
}

function dockerToolConnectionString(connectionString) {
  const host = process.env.BACKUP_DOCKER_DATABASE_HOST?.trim();
  const port = process.env.BACKUP_DOCKER_DATABASE_PORT?.trim();
  if (!host && !port) return connectionString;
  const url = new URL(connectionString);
  if (host) url.hostname = host;
  if (port) {
    if (!/^\d{1,5}$/.test(port)) throw new Error("BACKUP_DOCKER_DATABASE_PORT_INVALID");
    url.port = port;
  }
  return url.toString();
}

function safeToolError(value) {
  return value
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/password\s*=\s*\S+/gi, "password=[REDACTED]")
    .slice(0, 4000)
    .trim();
}

function childExit(child, stderrChunks) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`POSTGRES_TOOL_FAILED:code=${code}:signal=${signal ?? "none"}:${safeToolError(Buffer.concat(stderrChunks).toString("utf8"))}`));
    });
  });
}

export async function spawnPgDump(connectionString, snapshotId) {
  const args = ["--format=custom", "--compress=6", "--no-owner", "--no-privileges"];
  if (snapshotId) args.push(`--snapshot=${snapshotId}`);
  if ((process.env.BACKUP_POSTGRES_TOOLS || "docker") === "native") {
    const child = spawn(process.env.PG_DUMP_BIN || "pg_dump", args, {
      env: { ...process.env, ...safePgEnvironment(connectionString) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    return { child, exit: childExit(child, stderr), cleanup: async () => undefined };
  }

  const envFile = await writePgEnvFile(dockerToolConnectionString(connectionString));
  const image = process.env.BACKUP_POSTGRES_IMAGE || "postgres:17";
  const child = spawn("docker", ["run", "--rm", "--env-file", envFile, image, "pg_dump", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  return {
    child,
    exit: childExit(child, stderr),
    cleanup: async () => rm(envFile, { force: true }),
  };
}

async function spawnPgRestoreList() {
  const args = ["--list"];
  if ((process.env.BACKUP_POSTGRES_TOOLS || "docker") === "native") {
    const child = spawn(process.env.PG_RESTORE_BIN || "pg_restore", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    return { child, exit: childExit(child, stderr) };
  }
  const child = spawn("docker", ["run", "--rm", "-i", process.env.BACKUP_POSTGRES_IMAGE || "postgres:17", "pg_restore", ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  return { child, exit: childExit(child, stderr) };
}

export async function inspectEncryptedArchive(archivePath, manifest, key = encryptionKey()) {
  assertManifestSignature(manifest, key);
  const actualChecksum = await sha256File(archivePath);
  if (actualChecksum !== manifest.checksumSha256) throw new Error("BACKUP_ARCHIVE_CHECKSUM_MISMATCH");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(manifest.encryption.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(manifest.encryption.authTag, "base64url"));
  const { child, exit } = await spawnPgRestoreList();
  const output = [];
  child.stdout.on("data", (chunk) => output.push(Buffer.from(chunk)));
  await Promise.all([pipeline(createReadStream(archivePath), decipher, child.stdin), exit]);
  const listing = Buffer.concat(output).toString("utf8");
  const missingTables = manifest.verification.requiredTables.filter((table) => !new RegExp(`\\b${table.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`).test(listing));
  if (missingTables.length) throw new Error(`BACKUP_REQUIRED_TABLES_MISSING:${missingTables.join(",")}`);
  return {
    checksumVerified: true,
    archiveParsed: true,
    listEntryCount: listing.split(/\r?\n/).filter((line) => line && !line.startsWith(";")).length,
    requiredTablesPresent: true,
    missingTables,
  };
}

export async function encryptDatabaseDump({ connectionString, archivePath, manifestBase, snapshotId }) {
  await mkdir(path.dirname(archivePath), { recursive: true });
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const dump = await spawnPgDump(connectionString, snapshotId);
  try {
    await Promise.all([pipeline(dump.child.stdout, cipher, createWriteStream(archivePath, { mode: 0o600 })), dump.exit]);
  } catch (error) {
    await rm(archivePath, { force: true });
    throw error;
  } finally {
    await dump.cleanup();
  }
  const authTag = cipher.getAuthTag();
  const fileStats = await stat(archivePath);
  const checksumSha256 = await sha256File(archivePath);
  const manifest = {
    ...manifestBase,
    sizeBytes: fileStats.size,
    checksumSha256,
    encryption: {
      algorithm: "AES-256-GCM",
      iv: iv.toString("base64url"),
      authTag: authTag.toString("base64url"),
      keyId: process.env.BACKUP_ENCRYPTION_KEY_ID || "unversioned",
      plaintextPersisted: false,
    },
  };
  manifest.manifestHmac = manifestSignature(manifest, key);
  return manifest;
}

function storageConfig(prefix) {
  const read = (suffix) => process.env[`${prefix}${suffix}`]?.trim();
  const bucket = read("BUCKET");
  if (!bucket) return null;
  const accessKeyId = read("ACCESS_KEY");
  const secretAccessKey = read("SECRET_KEY");
  if (!accessKeyId || !secretAccessKey) throw new Error(`BACKUP_STORAGE_CREDENTIALS_MISSING:${prefix}`);
  return {
    bucket,
    endpoint: read("ENDPOINT") || undefined,
    region: read("REGION") || "auto",
    forcePathStyle: read("FORCE_PATH_STYLE") === "true",
    credentials: { accessKeyId, secretAccessKey },
    serverSideEncryption: read("SERVER_SIDE_ENCRYPTION") || "AES256",
    kmsKeyId: read("KMS_KEY_ID") || undefined,
    label: prefix === "BACKUP_STORAGE_" ? "primary" : "secondary",
  };
}

async function uploadFile(client, config, filePath, objectKey, metadata, contentType) {
  const { Upload } = await import("@aws-sdk/lib-storage");
  const upload = new Upload({
    client,
    params: {
      Bucket: config.bucket,
      Key: objectKey,
      Body: createReadStream(filePath),
      ContentType: contentType,
      ...(config.serverSideEncryption !== "NONE" ? { ServerSideEncryption: config.serverSideEncryption } : {}),
      ...(config.kmsKeyId ? { SSEKMSKeyId: config.kmsKeyId } : {}),
      Metadata: metadata,
    },
  });
  await upload.done();
}

export async function uploadBackupCopies({ archivePath, manifestPath, manifest, requireSecondary }) {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const configs = [storageConfig("BACKUP_STORAGE_"), storageConfig("BACKUP_SECONDARY_STORAGE_")].filter(Boolean);
  if (!configs.some((config) => config.label === "primary")) throw new Error("BACKUP_PRIMARY_STORAGE_NOT_CONFIGURED");
  if (requireSecondary && !configs.some((config) => config.label === "secondary")) throw new Error("BACKUP_SECONDARY_STORAGE_NOT_CONFIGURED");

  const date = new Date(manifest.startedAt);
  const prefix = (process.env.BACKUP_STORAGE_PREFIX || "logivya-backups").replace(/^\/+|\/+$/g, "");
  const objectPrefix = `${prefix}/${manifest.environment}/postgres/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
  const archiveKey = `${objectPrefix}/${path.basename(archivePath)}`;
  const manifestKey = `${objectPrefix}/${path.basename(manifestPath)}`;
  const locations = [];

  for (const config of configs) {
    const client = new S3Client(config);
    await uploadFile(client, config, archivePath, archiveKey, {
      "backup-id": manifest.backupId,
      environment: manifest.environment,
      checksum: manifest.checksumSha256,
      encryption: "AES-256-GCM",
    }, "application/octet-stream");
    locations.push({ provider: "s3-compatible", boundary: config.label, bucket: config.bucket, objectKey: archiveKey });
    client.destroy();
  }

  manifest.storageLocations = locations;
  manifest.manifestHmac = manifestSignature(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  for (const config of configs) {
    const client = new S3Client(config);
    await uploadFile(client, config, manifestPath, manifestKey, {
      "backup-id": manifest.backupId,
      environment: manifest.environment,
      checksum: manifest.checksumSha256,
    }, "application/json");
    client.destroy();
  }
  return locations;
}

export async function loadManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export function createBackupIdentity(environment) {
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const correlationId = randomUUID();
  return {
    startedAt,
    correlationId,
    backupId: `${environment}-postgres-${stamp}-${correlationId.slice(0, 8)}`,
  };
}

export async function writeManifest(manifestPath, manifest) {
  manifest.manifestHmac = manifestSignature(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

export async function decryptToRestoreProcess(archivePath, manifest, target) {
  assertManifestSignature(manifest);
  if ((await sha256File(archivePath)) !== manifest.checksumSha256) throw new Error("BACKUP_ARCHIVE_CHECKSUM_MISMATCH");
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(manifest.encryption.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(manifest.encryption.authTag, "base64url"));

  let child;
  let cleanup = async () => undefined;
  const args = ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", target.database];
  if (target.container) {
    child = spawn("docker", ["exec", "-i", target.container, "pg_restore", "--username", target.user, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } else {
    const envFile = await writePgEnvFile(target.connectionString);
    const env = { ...process.env, ...safePgEnvironment(target.connectionString) };
    cleanup = async () => rm(envFile, { force: true });
    child = spawn(process.env.PG_RESTORE_BIN || "pg_restore", args, { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  }
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  child.stdout.resume();
  try {
    await Promise.all([pipeline(createReadStream(archivePath), decipher, child.stdin), childExit(child, stderr)]);
  } finally {
    await cleanup();
  }
}
