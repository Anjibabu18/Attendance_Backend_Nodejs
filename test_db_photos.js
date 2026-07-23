const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const employees = await prisma.employee.findMany();
  console.log(employees.map(e => ({ name: e.name, profilePhotoUrl: e.profilePhotoUrl })));
}
main().finally(() => prisma.$disconnect());
