const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.appUser.findMany({
    where: { role: 'ROLE_ADMIN' }
  });
  console.log("=== ADMIN USERS ===");
  admins.forEach(admin => console.log(`Username: ${admin.username} | Role: ${admin.role}`));
}
main().finally(() => prisma.$disconnect());
