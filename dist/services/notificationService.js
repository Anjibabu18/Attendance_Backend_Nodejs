"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyUserRecord = exports.notifyUsername = exports.notify = void 0;
const client_1 = require("@prisma/client");
const pushService_1 = require("./pushService");
const prisma = new client_1.PrismaClient();
const notify = async (userId, title, message) => {
    if (!userId)
        return null;
    const dbNotification = await prisma.notification.create({ data: { userId, title, message } });
    // Also send Web Push Notification
    try {
        await (0, pushService_1.sendPushToUser)(userId, {
            title,
            body: message,
            icon: '/pwa-192x192.png',
            url: '/employee/more'
        });
    }
    catch (err) {
        console.error(`[Notify] Failed to send push to user ${userId}:`, err);
    }
    return dbNotification;
};
exports.notify = notify;
const notifyUsername = async (username, title, message) => {
    if (!username)
        return null;
    const user = await prisma.appUser.findUnique({ where: { username } });
    return (0, exports.notify)(user?.id, title, message);
};
exports.notifyUsername = notifyUsername;
const notifyUserRecord = async (user, title, message) => {
    return (0, exports.notify)(user?.id, title, message);
};
exports.notifyUserRecord = notifyUserRecord;
