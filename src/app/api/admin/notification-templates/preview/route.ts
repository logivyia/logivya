import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import {
  renderText,
  validateTemplateSource,
} from "@/server/notifications/template-policy";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  subject: z.string().max(200).optional(),
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(20_000),
  requiredVariables: z.array(z.string()).max(50).default([]),
  variables: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin("admin.notifications.read", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "NOTIFICATION_TEMPLATE_INVALID" },
        { status: 400 },
      );
    const validation = validateTemplateSource(parsed.data);
    if (!validation.valid)
      return NextResponse.json(
        {
          error: "NOTIFICATION_TEMPLATE_INVALID",
          undeclared: validation.undeclared,
        },
        { status: 400 },
      );
    const variables = withSafeExamples(
      parsed.data.requiredVariables,
      parsed.data.variables,
    );
    return NextResponse.json({
      preview: {
        subject: renderText(
          parsed.data.subject || parsed.data.title || "Logivya",
          variables,
        ),
        title: renderText(
          parsed.data.title || parsed.data.subject || "Logivya",
          variables,
        ),
        body: renderText(parsed.data.body, variables),
      },
      variables,
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

function withSafeExamples(required: string[], input: Record<string, unknown>) {
  const result = structuredClone(input);
  for (const key of required) {
    const parts = key.split(".");
    let target = result;
    for (const part of parts.slice(0, -1)) {
      if (
        !target[part] ||
        typeof target[part] !== "object" ||
        Array.isArray(target[part])
      )
        target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts.at(-1)!] ??= `Sample ${key}`;
  }
  return result;
}
