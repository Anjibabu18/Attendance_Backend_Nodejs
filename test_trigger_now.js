const { triggerScheduledPushes } = require('./dist/services/cronService');
const prisma = require('./dist/prisma').default;

async function test() {
  // modify the cron to match current time temporarily
  const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const cronExp = `${nowIST.getMinutes()} ${nowIST.getHours()} * * *`;
  
  await prisma.scheduledPush.update({
    where: { id: 1 },
    data: { cronExpression: cronExp }
  });
  
  const result = await triggerScheduledPushes();
  console.log('Result:', result);
}

test();
