import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const baseUrl = process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!baseUrl) throw new Error("SMOKE_BASE_URL or NEXT_PUBLIC_APP_URL is missing.");

type SmokeCase = {
  name: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  expected: number[];
};

const cases: SmokeCase[] = [
  { name: "public health", path: "/api/health", expected: [200] },
  { name: "db health", path: "/api/health/db", expected: [200] },
  { name: "redis health", path: "/api/health/redis", expected: [200] },
  { name: "worker health", path: "/api/health/worker", expected: [200] },
  { name: "mobile app version", path: "/api/mobile/app-version", expected: [200] },
  { name: "auth me requires session", path: "/api/auth/me", expected: [401, 403] },
  { name: "admin dashboard guarded", path: "/api/admin/dashboard", expected: [401, 403] },
  { name: "admin support guarded", path: "/api/admin/support/tickets", expected: [401, 403] },
  { name: "user support guarded", path: "/api/support/tickets", expected: [401, 403] },
  {
    name: "mobile send guarded",
    path: "/api/mobile/messages/send",
    method: "POST",
    body: { title: "smoke", content: "smoke", groupIds: [], categoryIds: [] },
    expected: [401, 403],
  },
];

function urlFor(route: string) {
  return new URL(route, baseUrl).toString();
}

async function main() {
  const results = [];
  for (const item of cases) {
    const response = await fetch(urlFor(item.path), {
      method: item.method ?? "GET",
      headers: item.body ? { "content-type": "application/json" } : undefined,
      body: item.body ? JSON.stringify(item.body) : undefined,
      redirect: "manual",
    });
    const pass = item.expected.includes(response.status);
    results.push({
      name: item.name,
      path: item.path,
      status: response.status,
      expected: item.expected,
      pass,
    });
  }

  const failed = results.filter((result) => !result.pass);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), failed: failed.length, results }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
