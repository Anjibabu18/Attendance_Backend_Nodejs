const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.appUser.findFirst({ where: { employee: { employeeNumber: 'ABT@07' } }, include: { employee: true } });
  
  // mock request
  const deviceId = 'unknown'; // or whatever
  let approved = false;
  let registered = false;

  if (user.employee.deviceFingerprint === deviceId) {
    approved = true;
    registered = true;
  } else {
    const reqObj = await prisma.deviceRequest.findFirst({ where: { employeeId: user.employee.id, deviceId } });
    if (reqObj) {
      approved = reqObj.approved;
      registered = true;
    }
  }
  
  console.log({ deviceId, approved, registered });
}

main().finally(() => prisma.$disconnect());
