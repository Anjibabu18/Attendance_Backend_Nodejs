"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVapidPublicKey = getVapidPublicKey;
exports.saveSubscription = saveSubscription;
exports.removeSubscription = removeSubscription;
exports.removeAllSubscriptions = removeAllSubscriptions;
exports.sendPushToUser = sendPushToUser;
exports.sendPushToMultipleUsers = sendPushToMultipleUsers;
const web_push_1 = __importDefault(require("web-push"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// VAPID keys - generate once and store in .env
// To generate: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@attendance.app';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    web_push_1.default.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
function getVapidPublicKey() {
    return VAPID_PUBLIC_KEY;
}
async function saveSubscription(userId, subscription) {
    return prisma.pushSubscription.upsert({
        where: {
            uk_push_sub_user_endpoint: {
                userId,
                endpoint: subscription.endpoint,
            },
        },
        update: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
        },
        create: {
            userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
        },
    });
}
async function removeSubscription(userId, endpoint) {
    return prisma.pushSubscription.deleteMany({
        where: { userId, endpoint },
    });
}
async function removeAllSubscriptions(userId) {
    return prisma.pushSubscription.deleteMany({
        where: { userId },
    });
}
async function sendPushToUser(userId, payload) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    const jsonPayload = JSON.stringify(payload);
    const results = await Promise.allSettled(subs.map(async (sub) => {
        try {
            await web_push_1.default.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
            }, jsonPayload);
        }
        catch (err) {
            // If subscription is expired/invalid (410 Gone or 404), remove it
            if (err.statusCode === 410 || err.statusCode === 404) {
                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => { });
            }
            throw err;
        }
    }));
    return results;
}
async function sendPushToMultipleUsers(userIds, payload) {
    const results = await Promise.allSettled(userIds.map((userId) => sendPushToUser(userId, payload)));
    return results;
}
