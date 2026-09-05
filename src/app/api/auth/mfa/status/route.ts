import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { pendingMfaEnrollmentStatus } from "@/server/security/mfa";
import { listMfaMethodState } from "@/server/security/mfa-policy";

export async function GET() {
  try {
    const context = await requireApiSession();
    const [methodState, setup] = await Promise.all([
      listMfaMethodState({
        userId: context.user.id,
        companyPolicy: context.company.mfaPolicy,
        role: context.membership.role,
        preferredMethod: context.user.preferredMfaMethod,
      }),
      pendingMfaEnrollmentStatus(context.user.id),
    ]);
    const enabled = methodState.methods.filter((method) => method.enabled);
    return NextResponse.json({
      enabled: enabled.length > 0,
      enabledAt: enabled[0]?.enabledAt,
      verifiedEmail: context.user.email,
      methods: methodState.methods,
      preferredMethod: methodState.preferredMethod,
      ...setup,
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
