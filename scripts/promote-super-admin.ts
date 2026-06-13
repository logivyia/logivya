import { loadEnvConfig } from "@next/env";

const email = process.argv[2]?.trim().toLowerCase();

async function main() {
  if (!email) {
    console.error("Usage: npm exec tsx scripts/promote-super-admin.ts -- <email>");
    process.exitCode = 1;
    return;
  }

  loadEnvConfig(process.cwd());
  const { prisma } = await import("../src/server/db");
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      console.error("User not found. Please register first.");
      process.exitCode = 1;
    } else {
      await prisma.platformAdmin.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          role: "SUPER_ADMIN",
          permissions: ["*"],
          isActive: true,
          requiresMfa: false,
        },
        update: {
          role: "SUPER_ADMIN",
          permissions: ["*"],
          isActive: true,
        },
      });
      console.log(`${user.email} promoted to SUPER_ADMIN.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "SUPER_ADMIN promotion failed.");
    process.exitCode = 1;
  });
