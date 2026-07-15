import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";

export const SESSION_COOKIE = "logivya_session";
const SESSION_DAYS = 30;

export async function createSession(
  userId: string,
  companyId: string,
  request: Request,
  options: { mfaVerified?: boolean } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.userSession.create({
    data: {
      userId,
      companyId,
      sessionTokenHash: hashOpaqueToken(token),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      userAgent: request.headers.get("user-agent"),
      expiresAt,
      mfaVerifiedAt: options.mfaVerified ? new Date() : null,
    },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.userSession.updateMany({
      where: { sessionTokenHash: hashOpaqueToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionContext() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: { sessionTokenHash: hashOpaqueToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.companyId) return null;
  if (session.user.mfaRequired && !session.mfaVerifiedAt) return null;
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: session.companyId, userId: session.userId } },
    include: { company: true },
  });
  if (!membership || membership.status !== "ACTIVE") return null;
  return { session, user: session.user, company: membership.company, membership };
}

export async function requireSession() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  return context;
}

export async function requireApiSession() {
  const context = await getSessionContext();
  if (!context) throw new Error("UNAUTHORIZED");
  return context;
}
