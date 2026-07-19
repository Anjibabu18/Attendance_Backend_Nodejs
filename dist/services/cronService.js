"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reloadCronJobs = reloadCronJobs;
exports.initializeCronJobs = initializeCronJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../prisma"));
const pushService_1 = require("./pushService");
// Store running tasks to be able to stop them when reloading
let runningJobs = [];
async function reloadCronJobs() {
    console.log('[Cron] Reloading cron jobs...');
    // 1. Stop all existing jobs
    for (const job of runningJobs) {
        job.stop();
    }
    runningJobs = [];
    // 2. Fetch all active scheduled pushes from DB
    const scheduledPushes = await prisma_1.default.scheduledPush.findMany({
        where: { isActive: true },
    });
    // 3. Schedule them
    for (const push of scheduledPushes) {
        if (!node_cron_1.default.validate(push.cronExpression)) {
            console.error(`[Cron] Invalid cron expression for Push ID ${push.id}: ${push.cronExpression}`);
            continue;
        }
        const job = node_cron_1.default.schedule(push.cronExpression, async () => {
            console.log(`[Cron] Executing scheduled push: ${push.title}`);
            try {
                // Fetch users who have active push subscriptions
                const distinctUserIds = await prisma_1.default.pushSubscription.findMany({
                    select: { userId: true },
                    distinct: ['userId'],
                });
                const userIds = distinctUserIds.map((sub) => sub.userId);
                // Send notification to each user
                const results = await Promise.allSettled(userIds.map((userId) => (0, pushService_1.sendPushToUser)(userId, {
                    title: push.title,
                    body: push.body,
                    icon: '/favicon.ico',
                    url: '/employee',
                })));
                const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
                console.log(`[Cron] Successfully sent push '${push.title}' to ${fulfilledCount}/${userIds.length} users.`);
            }
            catch (err) {
                console.error(`[Cron] Failed to execute push '${push.title}':`, err);
            }
        });
        runningJobs.push(job);
    }
    console.log(`[Cron] Successfully loaded ${runningJobs.length} active scheduled pushes.`);
}
async function initializeCronJobs() {
    await reloadCronJobs();
}
