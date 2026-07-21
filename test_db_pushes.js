const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPushes() {
  const pushes = await prisma.scheduledPush.findMany();
  console.log(pushes);
  
  const subs = await prisma.pushSubscription.findMany();
  console.log('Subscriptions:', subs.length);
}

checkPushes().finally(() => prisma.$disconnect());
