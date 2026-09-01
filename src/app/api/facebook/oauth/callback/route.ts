import { MembershipStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { resolveFacebookPagesAccess } from "@/server/facebook/access";
import { storeFacebookConnection } from "@/server/facebook/accounts";
import { facebookPagesProvider } from "@/server/facebook/provider";
import { verifyAndConsumeFacebookOAuthState } from "@/server/facebook/oauth-state";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";

export const dynamic = "force-dynamic";

function mobileRedirect(status: "connected" | "error", values: Record<string, string | number> = {}) {
  const query = new URLSearchParams({ status });
  for (const [key, value] of Object.entries(values)) query.set(key, String(value));
  return new Response(null, { status: 302, headers: { Location: `logivya://facebook?${query}` } });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const stateValue = query.get("state") || "";
  try {
    if (query.get("error")) return mobileRedirect("error", { code: "access_denied" });
    const code = query.get("code");
    if (!code) return mobileRedirect("error", { code: "code_missing" });
    const state = await verifyAndConsumeFacebookOAuthState(stateValue);
    const membership = await prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId: state.companyId, userId: state.userId } },
      select: { status: true, role: true },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE || !["OWNER", "ADMIN"].includes(membership.role)) {
      return mobileRedirect("error", { code: "permission_denied" });
    }
    if (!(await resolveFacebookPagesAccess(state.userId, state.platform))) {
      return mobileRedirect("error", { code: "feature_not_available" });
    }
    const token = await facebookPagesProvider.exchangeAuthorizationCode(code);
    const facebook = await facebookPagesProvider.getAuthorizedIdentityAndPages(token.access_token);
    const result = await storeFacebookConnection({
      companyId: state.companyId,
      userId: state.userId,
      userAccessToken: token.access_token,
      tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      ...facebook,
    });
    await writeAuditLog(request, {
      companyId: state.companyId,
      userId: state.userId,
      action: "facebook.pages.discovered",
      entityType: "FacebookPageConnection",
      entityId: facebook.profile.id,
      after: {
        discoveredPages: result.discoveredPages,
        alreadyConnectedPages: result.connectedPages,
        ownershipConflicts: result.ownershipConflicts,
        permissions: facebook.permissions.map((item) => ({ permission: item.permission, status: item.status })),
      },
    }).catch((error) => logger.error("facebook.oauth_audit_failed", error, { companyId: state.companyId, userId: state.userId }));
    return mobileRedirect("connected", { pages: result.discoveredPages, selection: "required" });
  } catch (error) {
    logger.error("facebook.oauth_callback_failed", error);
    return mobileRedirect("error", { code: "oauth_failed" });
  }
}
