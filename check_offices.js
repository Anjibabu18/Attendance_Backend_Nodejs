const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const offices = await prisma.officeLocation.findMany();
  console.log(offices);
}

main().finally(() => prisma.$disconnect());
