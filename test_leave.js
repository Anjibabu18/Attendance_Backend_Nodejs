const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const leaves = await prisma.leaveRequest.findMany({
    where: { status: 'PENDING' },
    include: { employee: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(leaves, null, 2));
}
main().finally(() => prisma.$disconnect());
