const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRawUnsafe(`SHOW CREATE TABLE \`users\``);
    console.log(result);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
