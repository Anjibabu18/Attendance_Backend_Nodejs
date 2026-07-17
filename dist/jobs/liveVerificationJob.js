"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLiveVerificationCronJob = exports.runLiveVerificationJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const client_1 = require("@prisma/client");
const pushService_1 = require("../services/pushService");
const prisma = new client_1.PrismaClient();
const runLiveVerificationJob = async () => {
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        // Find all active employees who are currently checked in (but not out)
        const activeEntries = await prisma.attendanceEntry.findMany({
            where: {
                date: today,
                inTime: { not: null },
                outTime: null,
            },
            include: {
                employee: {
                    include: {
                        user: {
                            include: {
                                pushSubscriptions: true
                            }
                        }
                    }
                }
            }
        });
        if (activeEntries.length === 0)
            return;
        // Randomly select 10% of active employees (or at least 1)
        const selectionCount = Math.max(1, Math.floor(activeEntries.length * 0.1));
        const shuffled = activeEntries.sort(() => 0.5 - Math.random());
        const selectedEntries = shuffled.slice(0, selectionCount);
        for (const entry of selectedEntries) {
            // Check if they already have an active request
            const existingReq = await prisma.liveVerificationRequest.findFirst({
                where: {
                    employeeId: entry.employeeId,
                    status: 'PENDING',
                    expiresAt: { gt: new Date() }
                }
            });
            if (!existingReq) {
                const now = new Date();
                const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
                const newReq = await prisma.liveVerificationRequest.create({
                    data: {
                        employeeId: entry.employeeId,
                        date: today,
                        requestedAt: now,
                        expiresAt,
                        status: 'PENDING'
                    }
                });
                // Send Push Notification
                try {
                    await (0, pushService_1.sendPushToUser)(entry.employee.user.id, {
                        title: 'Security Check: Live Verification',
                        body: 'Please verify your face within the next 10 minutes to maintain your active shift.',
                        url: '/employee/dashboard',
                    });
                }
                catch (e) {
                    console.error('Failed to send verification push', e);
                }
            }
        }
    }
    catch (error) {
        console.error('Error in runLiveVerificationJob:', error);
    }
};
exports.runLiveVerificationJob = runLiveVerificationJob;
const startLiveVerificationCronJob = () => {
    // Run every 30 minutes
    node_cron_1.default.schedule('*/30 * * * *', () => {
        (0, exports.runLiveVerificationJob)();
    });
};
exports.startLiveVerificationCronJob = startLiveVerificationCronJob;
