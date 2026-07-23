const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const employees = await prisma.employee.findMany({ include: { assignedOfficeLocation: true, department: true, shift: true, user: true, companyRole: true } });
  console.log(JSON.stringify(employees.map(e => ({ name: e.name, profilePhotoUrl: e.profilePhotoUrl })), null, 2));
}
main().finally(() => prisma.$disconnect());
