"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitVerification = exports.getPendingVerification = void 0;
const client_1 = require("@prisma/client");
const faceVerificationService_1 = require("../services/faceVerificationService");
const cloudinaryService_1 = require("../services/cloudinaryService");
const prisma = new client_1.PrismaClient();
const getPendingVerification = async (req, res) => {
    try {
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await prisma.employee.findUnique({ where: { userId: user.id } });
        if (!employee)
            return res.status(404).json({ error: 'Employee not found' });
        const pendingReq = await prisma.liveVerificationRequest.findFirst({
            where: {
                employeeId: employee.id,
                status: 'PENDING',
                expiresAt: { gt: new Date() }
            },
            orderBy: { requestedAt: 'desc' }
        });
        res.json({ pendingRequest: pendingReq });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.getPendingVerification = getPendingVerification;
const submitVerification = async (req, res) => {
    try {
        const { requestId } = req.params;
        const faceDescriptorStr = req.body.faceDescriptor;
        const file = req.file;
        if (!faceDescriptorStr || !file) {
            return res.status(400).json({ error: 'Face descriptor and photo are required' });
        }
        const faceDescriptor = JSON.parse(faceDescriptorStr);
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await prisma.employee.findUnique({ where: { userId: user.id } });
        if (!employee)
            return res.status(404).json({ error: 'Employee not found' });
        const verificationReq = await prisma.liveVerificationRequest.findUnique({ where: { id: Number(requestId) } });
        if (!verificationReq)
            return res.status(404).json({ error: 'Verification request not found' });
        if (verificationReq.employeeId !== employee.id)
            return res.status(403).json({ error: 'Forbidden' });
        if (verificationReq.status !== 'PENDING')
            return res.status(400).json({ error: 'Request is no longer pending' });
        if (new Date() > verificationReq.expiresAt) {
            await prisma.liveVerificationRequest.update({ where: { id: verificationReq.id }, data: { status: 'MISSED' } });
            return res.status(400).json({ error: 'Verification request has expired' });
        }
        if (!employee.faceDescriptor) {
            return res.status(400).json({ error: 'Employee face not registered' });
        }
        const faceResult = await (0, faceVerificationService_1.verifyFace)(employee.faceDescriptor, faceDescriptor);
        const publicId = `emp-${employee.id}/${new Date().toISOString().split('T')[0]}/live-verification-${verificationReq.id}`;
        const uploadResult = await (0, cloudinaryService_1.uploadAttendancePhoto)(file.buffer, publicId);
        const status = faceResult.verified ? 'VERIFIED' : 'FAILED';
        const updatedReq = await prisma.liveVerificationRequest.update({
            where: { id: verificationReq.id },
            data: {
                status,
                photoUrl: uploadResult.url,
                similarityScore: faceResult.similarityScore
            }
        });
        if (!faceResult.verified) {
            return res.status(400).json({ error: 'Face verification failed', data: updatedReq });
        }
        res.json({ success: true, data: updatedReq });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.submitVerification = submitVerification;
