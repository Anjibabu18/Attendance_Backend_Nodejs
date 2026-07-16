const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    const rows = await prisma.$queryRawUnsafe('DESCRIBE users');
    console.log('=== users table columns ===');
    rows.forEach(r => console.log(r.Field, '|', r.Type, '| NULL:', r.Null, '| Default:', r.Default));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
