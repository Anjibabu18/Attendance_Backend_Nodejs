const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.appUser.findFirst({ where: { employee: { employeeNumber: 'ABT@07' } }, include: { employee: true } });
  console.log("Device fingerprint in DB:", user.employee.deviceFingerprint);
  
  const reqObj = await prisma.deviceRequest.findMany({ where: { employeeId: user.employee.id } });
  console.log("Device Requests:", reqObj);
}

main().finally(() => prisma.$disconnect());
