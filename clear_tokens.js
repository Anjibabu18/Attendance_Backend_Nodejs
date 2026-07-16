const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$executeRawUnsafe('DELETE FROM office_qr_tokens').then(() => {
  console.log('Cleared tokens');
  prisma.$disconnect();
});
