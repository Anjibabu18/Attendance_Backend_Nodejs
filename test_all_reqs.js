const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const req = await prisma.deviceRequest.findMany();
  console.log("ALL Device requests in DB:", req);
}
main().finally(() => prisma.$disconnect());
