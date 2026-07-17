import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { renderText, validateTemplateSource } from "@/server/notifications/template-policy";

const schema = z.object({
  subject: z.string().max(200).optional(),
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(20_000),
  requiredVariables: z.array(z.string()).max(50).default([]),
  variables: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin("platform:read", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_INVALID" }, { status: 400 });
    const validation = validateTemplateSource(parsed.data);
    if (!validation.valid) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_INVALID", undeclared: validation.undeclared }, { status: 400 });
    const variables = withSafeExamples(parsed.data.requiredVariables, parsed.data.variables);
    return NextResponse.json({ preview: { subject: renderText(parsed.data.subject || parsed.data.title || "Logivya", variables), title: renderText(parsed.data.title || parsed.data.subject || "Logivya", variables), body: renderText(parsed.data.body, variables) }, variables });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_TEMPLATE_PREVIEW_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}

function withSafeExamples(required: string[], input: Record<string, unknown>) {
  const result = structuredClone(input);
  for (const key of required) {
    const parts = key.split(".");
    let target = result;
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts.at(-1)!] ??= `Sample ${key}`;
  }
  return result;
}
