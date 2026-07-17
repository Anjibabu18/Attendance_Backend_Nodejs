import prisma from '../prisma';
import { Response } from 'express';
import { LiveVerificationStatus } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import { verifyFace } from '../services/faceVerificationService';
import { uploadAttendancePhoto } from '../services/cloudinaryService';



export const getPendingVerification = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.appUser.findUnique({ where: { username: req.user!.username } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const employee = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const pendingReq = await prisma.liveVerificationRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      },
      orderBy: { requestedAt: 'desc' }
    });

    res.json({ pendingRequest: pendingReq });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const submitVerification = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    const faceDescriptorStr = req.body.faceDescriptor;
    const file = req.file;

    if (!faceDescriptorStr || !file) {
      return res.status(400).json({ error: 'Face descriptor and photo are required' });
    }

    const faceDescriptor = JSON.parse(faceDescriptorStr);
    
    const user = await prisma.appUser.findUnique({ where: { username: req.user!.username } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    const employee = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const verificationReq = await prisma.liveVerificationRequest.findUnique({ where: { id: Number(requestId) } });
    if (!verificationReq) return res.status(404).json({ error: 'Verification request not found' });
    if (verificationReq.employeeId !== employee.id) return res.status(403).json({ error: 'Forbidden' });
    if (verificationReq.status !== 'PENDING') return res.status(400).json({ error: 'Request is no longer pending' });
    if (new Date() > verificationReq.expiresAt) {
      await prisma.liveVerificationRequest.update({ where: { id: verificationReq.id }, data: { status: 'MISSED' } });
      return res.status(400).json({ error: 'Verification request has expired' });
    }

    if (!employee.faceDescriptor) {
      return res.status(400).json({ error: 'Employee face not registered' });
    }

    const faceResult = await verifyFace(employee.faceDescriptor as any, faceDescriptor);
    const publicId = `emp-${employee.id}/${new Date().toISOString().split('T')[0]}/live-verification-${verificationReq.id}`;
    const uploadResult = await uploadAttendancePhoto(file.buffer, publicId);

    const status: LiveVerificationStatus = faceResult.verified ? 'VERIFIED' : 'FAILED';
    
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
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
