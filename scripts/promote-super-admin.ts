import { prisma } from "@/server/db";
import { ADMIN_PERMISSIONS } from "@/server/auth/admin-permissions";

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("SUPER_ADMIN_EMAIL is required");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found. Please register first.");

  await prisma.$transaction(async (transaction) => {
    await transaction.platformAdmin.upsert({
      where: { userId: user.id },
      create: { userId: user.id, role: "SUPER_ADMIN", permissions: [...ADMIN_PERMISSIONS], isActive: true, requiresMfa: true },
      update: { role: "SUPER_ADMIN", permissions: [...ADMIN_PERMISSIONS], isActive: true, requiresMfa: true },
    });
    for (const code of ADMIN_PERMISSIONS) {
      const permission = await transaction.adminPermission.upsert({ where: { code }, create: { code }, update: {} });
      await transaction.adminRolePermission.upsert({
        where: { role_permissionId: { role: "SUPER_ADMIN", permissionId: permission.id } },
        create: { role: "SUPER_ADMIN", permissionId: permission.id },
        update: {},
      });
    }
  }, { timeout: 30_000 });
  console.log(`Promoted existing user ${email} to SUPER_ADMIN without changing credentials.`);
}

main().finally(() => prisma.$disconnect());
