import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/security/passwords";

async function main() {
  if (!process.env.DATABASE_URL?.includes("logivya_support_test")) throw new Error("Visual test setup refuses to run outside the isolated support database.");
  const password = "SupportVisual!123";
  const passwordHash = await hashPassword(password, process.env.PASSWORD_PEPPER ?? "");
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "burakidim@gmail.com" } });
  const ticket = await prisma.supportTicket.findFirst({
    where: { createdBy: { email: { not: "burakidim@gmail.com" } } },
    orderBy: { createdAt: "desc" },
    select: { createdBy: { select: { id: true, email: true } } },
  });
  if (!ticket) throw new Error("No normal support user is available for visual testing.");
  await prisma.user.updateMany({
    where: { id: { in: [admin.id, ticket.createdBy.id] } },
    data: { passwordHash },
  });
  console.log(JSON.stringify({ adminEmail: admin.email, userEmail: ticket.createdBy.email, password }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
