import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email =
  process.env.GOOGLE_PLAY_REVIEW_EMAIL || "appstore-review@logivya.com";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function maskPhone(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        status: true,
        emailVerifiedAt: true,
        mustChangePassword: true,
        mfaRequired: true,
        preferredMfaMethod: true,
        locale: true,
        updatedAt: true,
        memberships: {
          select: {
            role: true,
            status: true,
            lifecycleState: true,
            company: {
              select: {
                name: true,
                mfaPolicy: true,
                subscriptions: {
                  orderBy: { updatedAt: "desc" },
                  take: 1,
                  select: {
                    status: true,
                    endsAt: true,
                    currentPeriodEndsAt: true,
                    plan: { select: { name: true, slug: true } },
                  },
                },
                accounts: {
                  where: { archivedAt: null },
                  select: {
                    status: true,
                    phoneNumber: true,
                    lastConnectedAt: true,
                    lastHeartbeatAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) throw new Error(`Review account not found: ${email}`);

    console.log(
      JSON.stringify(
        {
          ...user,
          memberships: user.memberships.map((membership) => ({
            ...membership,
            company: {
              ...membership.company,
              accounts: membership.company.accounts.map((account) => ({
                ...account,
                phoneNumber: maskPhone(account.phoneNumber),
              })),
            },
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
