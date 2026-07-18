const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const req = await prisma.deviceRequest.findMany({});
  console.log(req);
}
main().finally(()=>prisma.$disconnect());
