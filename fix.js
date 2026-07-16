const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function fix() {
  await prisma.$executeRawUnsafe('UPDATE employees SET shift_id = NULL WHERE shift_id IS NOT NULL AND shift_id NOT IN (SELECT id FROM shifts)');
  console.log('Fixed');
  prisma.$disconnect();
}
fix();
