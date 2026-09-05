import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const reviewEmail = "appstore-review@logivya.com";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: reviewEmail },
    select: {
      email: true,
      status: true,
      emailVerifiedAt: true,
      mustChangePassword: true,
      mfaRequired: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { companyId: true, role: true, status: true },
      },
    },
  });

  if (!existing) throw new Error(`Review account not found: ${reviewEmail}`);
  if (existing.status !== "ACTIVE")
    throw new Error("Review account is not active.");
  if (existing.mustChangePassword)
    throw new Error("Review account requires a password change.");
  if (existing.mfaRequired) throw new Error("Review account requires MFA.");
  if (
    existing.memberships.length !== 1 ||
    existing.memberships[0].status !== "ACTIVE"
  ) {
    throw new Error(
      "Review account must have exactly one active company membership.",
    );
  }

  const updated = existing.emailVerifiedAt
    ? existing
    : await prisma.user.update({
        where: { email: reviewEmail },
        data: { emailVerifiedAt: new Date() },
        select: {
          email: true,
          status: true,
          emailVerifiedAt: true,
          mustChangePassword: true,
          mfaRequired: true,
          memberships: {
            where: { status: "ACTIVE" },
            select: { companyId: true, role: true, status: true },
          },
        },
      });

  console.log(
    JSON.stringify(
      {
        email: updated.email,
        status: updated.status,
        emailVerified: Boolean(updated.emailVerifiedAt),
        mustChangePassword: updated.mustChangePassword,
        mfaRequired: updated.mfaRequired,
        activeMemberships: updated.memberships.length,
        role: updated.memberships[0]?.role ?? null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
