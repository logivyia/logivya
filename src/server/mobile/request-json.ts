import type { NextResponse } from "next/server";
import { mobileError } from "@/server/mobile/response";

type MobileJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse };

export async function readMobileJson(request: Request): Promise<MobileJsonResult> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return {
      ok: false,
      response: await mobileError("VALIDATION_ERROR", "api.error.invalidJson", { status: 400 }),
    };
  }
}
