const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findUnique({
    where: { employeeNumber: 'ABT@07' },
    include: { user: true }
  });
  if (emp) {
    console.log('Employee Device Fingerprint:', emp.deviceFingerprint);
    const reqs = await prisma.deviceRequest.findMany({
      where: { employeeId: emp.id }
    });
    console.log('DeviceReqs:', reqs);
  }
}

main().finally(() => prisma.$disconnect());
