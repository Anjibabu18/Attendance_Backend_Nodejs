const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.appUser.findFirst({ where: { employee: { employeeNumber: 'ABT@07' } }, include: { employee: true } });
  const devices = await prisma.deviceRequest.findMany({ where: { employeeId: user.employee.id } });
  if (user.employee.deviceFingerprint && !devices.some(d => d.deviceId === user.employee.deviceFingerprint)) {
    devices.unshift({
      id: -1,
      employeeId: user.employee.id,
      deviceId: user.employee.deviceFingerprint,
      label: 'Legacy Device',
      approved: true,
      createdAt: new Date()
    });
  }
  console.log(devices);
}

main().finally(() => prisma.$disconnect());
