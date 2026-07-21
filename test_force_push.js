const { PrismaClient } = require('@prisma/client');
const { sendPushToUser } = require('./dist/services/pushService');

const prisma = new PrismaClient();

async function forceTrigger() {
  const push = await prisma.scheduledPush.findUnique({ where: { id: 1 } });
  
  const distinctUserIds = await prisma.pushSubscription.findMany({
    select: { userId: true },
    distinct: ['userId'],
  });

  const userIds = distinctUserIds.map((sub) => sub.userId);
  
  const results = await Promise.allSettled(
    userIds.map((userId) => 
      sendPushToUser(userId, {
        title: push.title,
        body: push.body,
        icon: '/favicon.ico',
        url: '/employee',
      })
    )
  );

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');
  
  console.log(`Successfully sent to ${fulfilled.length}/${userIds.length} users.`);
  
  if (rejected.length > 0) {
    console.error('Errors:');
    rejected.forEach(r => console.error(r.reason));
  }
}

forceTrigger().finally(() => prisma.$disconnect());
