"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vapidKey = vapidKey;
exports.subscribe = subscribe;
exports.unsubscribe = unsubscribe;
exports.testPush = testPush;
const prisma_1 = __importDefault(require("../prisma"));
const pushService_1 = require("../services/pushService");
async function currentUserId(req) {
    const authUser = req.user;
    if (!authUser?.username)
        return null;
    const user = await prisma_1.default.appUser.findUnique({ where: { username: authUser.username } });
    return user?.id ?? null;
}
async function vapidKey(req, res) {
    const key = (0, pushService_1.getVapidPublicKey)();
    if (!key) {
        return res.status(500).json({ error: 'VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env' });
    }
    res.json({ publicKey: key });
}
async function subscribe(req, res) {
    try {
        const userId = await currentUserId(req);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { subscription } = req.body;
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }
        await (0, pushService_1.saveSubscription)(userId, subscription);
        res.json({ ok: true, message: 'Push subscription saved' });
    }
    catch (error) {
        console.error('[Push] Subscribe error:', error);
        res.status(400).json({ error: error.message });
    }
}
async function unsubscribe(req, res) {
    try {
        const userId = await currentUserId(req);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { endpoint } = req.body;
        if (endpoint) {
            await (0, pushService_1.removeSubscription)(userId, endpoint);
        }
        else {
            await (0, pushService_1.removeAllSubscriptions)(userId);
        }
        res.json({ ok: true, message: 'Push subscription removed' });
    }
    catch (error) {
        console.error('[Push] Unsubscribe error:', error);
        res.status(400).json({ error: error.message });
    }
}
async function testPush(req, res) {
    try {
        const userId = await currentUserId(req);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        await (0, pushService_1.sendPushToUser)(userId, {
            title: '✨ Push is Working!',
            body: 'You are now ready to receive real-time attendance and schedule alerts.',
            icon: 'https://attendance-two-smoky.vercel.app/pwa-192x192.png',
            url: '/employee',
            data: {
                requireInteraction: true,
                actions: [
                    { action: 'open', title: '🚀 Let\'s Go!' }
                ]
            }
        });
        res.json({ ok: true, message: 'Test notification sent' });
    }
    catch (error) {
        console.error('[Push] Test error:', error);
        res.status(400).json({ error: error.message });
    }
}
