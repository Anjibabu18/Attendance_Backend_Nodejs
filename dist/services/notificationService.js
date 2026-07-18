"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyAllByRole = exports.notifyAllHr = exports.notifyUserRecord = exports.notifyUsername = exports.notify = exports.pushToSseClients = exports.addSseClient = exports.sseClients = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const pushService_1 = require("./pushService");
exports.sseClients = new Map();
const addSseClient = (userId, res) => {
    if (!exports.sseClients.has(userId)) {
        exports.sseClients.set(userId, new Set());
    }
    exports.sseClients.get(userId).add(res);
    res.on('close', () => {
        const clients = exports.sseClients.get(userId);
        if (clients) {
            clients.delete(res);
            if (clients.size === 0)
                exports.sseClients.delete(userId);
        }
    });
};
exports.addSseClient = addSseClient;
const pushToSseClients = (userId, data) => {
    const clients = exports.sseClients.get(userId);
    if (clients) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        clients.forEach(res => res.write(payload));
    }
};
exports.pushToSseClients = pushToSseClients;
const notify = async (userId, title, message) => {
    if (!userId)
        return null;
    const dbNotification = await prisma_1.default.notification.create({ data: { userId, title, message } });
    (0, exports.pushToSseClients)(userId, dbNotification);
    try {
        await (0, pushService_1.sendPushToUser)(userId, {
            title,
            body: message,
            icon: '/pwa-192x192.png',
            url: '/employee'
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
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    return (0, exports.notify)(user?.id, title, message);
};
exports.notifyUsername = notifyUsername;
const notifyUserRecord = async (user, title, message) => {
    return (0, exports.notify)(user?.id, title, message);
};
exports.notifyUserRecord = notifyUserRecord;
const notifyAllHr = async (title, message) => {
    const hrUsers = await prisma_1.default.appUser.findMany({ where: { role: 'ROLE_HR' } });
    await Promise.allSettled(hrUsers.map(u => (0, exports.notify)(u.id, title, message)));
};
exports.notifyAllHr = notifyAllHr;
const notifyAllByRole = async (role, title, message) => {
    const users = await prisma_1.default.appUser.findMany({ where: { role } });
    await Promise.allSettled(users.map(u => (0, exports.notify)(u.id, title, message)));
};
exports.notifyAllByRole = notifyAllByRole;
