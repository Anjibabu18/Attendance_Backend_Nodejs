const { triggerScheduledPushes } = require('./dist/services/cronService');

async function test() {
  const result = await triggerScheduledPushes();
  console.log('Result:', result);
}

test();
