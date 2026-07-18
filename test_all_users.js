const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.appUser.findMany({ include: { employee: true } });
  console.log(users.map(u => ({
    username: u.username,
    role: u.role,
    device: u.employee?.deviceFingerprint,
    requests: u.employee?.id
  })));
  
  for (const u of users) {
    if (u.employee) {
      const reqs = await prisma.deviceRequest.findMany({ where: { employeeId: u.employee.id } });
      console.log(`Reqs for ${u.username}:`, reqs.map(r => ({ id: r.id, registered: true, approved: r.approved })));
    }
  }
}

main().finally(() => prisma.$disconnect());
