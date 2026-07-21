const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.scheduledPush.createMany({
    data: [
      { title: 'Morning Check-in', body: 'Don\'t forget to mark your attendance for the day. Have a great shift!', cronExpression: '30 9 * * 1,2,3,4,5' },
      { title: 'Lunch Break Over', body: 'Hope you had a good lunch! Time to get back to work.', cronExpression: '30 13 * * 1,2,3,4,5' },
      { title: 'Evening Checkout', body: 'Your shift is almost over. Don\'t forget to punch out before you leave!', cronExpression: '40 17 * * 1,2,3,4,5' }
    ]
  });
  console.log('Successfully added schedules!');
}
main().catch(console.error).finally(() => prisma.$disconnect());
