"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOut = exports.checkIn = exports.evaluatePlace = exports.distanceMeters = void 0;
const client_1 = require("@prisma/client");
const cloudinaryService_1 = require("./cloudinaryService");
const faceVerificationService_1 = require("./faceVerificationService");
const attendanceReportService_1 = require("./attendanceReportService");
const prisma = new client_1.PrismaClient();
const validateCoordinates = (latitude, longitude) => {
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        throw new Error('latitude must be between -90 and 90');
    }
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('longitude must be between -180 and 180');
    }
};
const distanceMeters = (lat1, lon1, lat2, lon2) => {
    const earthRadiusMeters = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const haversine = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return earthRadiusMeters * angularDistance;
};
exports.distanceMeters = distanceMeters;
const evaluatePlace = async (employee, latitude, longitude) => {
    validateCoordinates(latitude, longitude);
    let office = null;
    if (employee.assignedOfficeLocationId) {
        office = await prisma.officeLocation.findUnique({ where: { id: employee.assignedOfficeLocationId } });
    }
    if (!office || !office.active) {
        office = await prisma.officeLocation.findFirst({ where: { active: true } });
    }
    if (!office) {
        throw new Error('No active office location found');
    }
    const distance = (0, exports.distanceMeters)(office.latitude, office.longitude, latitude, longitude);
    return { office, distanceMeters: distance, insideRadius: distance <= office.radiusMeters };
};
exports.evaluatePlace = evaluatePlace;
const assertWithinAssignedOffice = async (employee, latitude, longitude) => {
    const place = await (0, exports.evaluatePlace)(employee, latitude, longitude);
    if (!place.insideRadius) {
        throw new Error(`Outside office radius. Distance: ${Math.round(place.distanceMeters)}m, Allowed: ${Math.round(place.office.radiusMeters)}m`);
    }
};
const checkIn = async (employee, latitude, longitude, photoBuffer, faceDescriptor, isHardware = false) => {
    if (!isHardware && (!photoBuffer || photoBuffer.length === 0)) {
        throw new Error('Selfie photo is required for punch');
    }
    if (!isHardware) {
        await assertWithinAssignedOffice(employee, latitude, longitude);
    }
    // Get start of today in UTC or local timezone equivalent.
    // For simplicity assuming today means UTC today matching the Java logic which was likely localized.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await (0, attendanceReportService_1.assertPayrollUnlocked)(today.toISOString().slice(0, 7));
    const existing = await prisma.attendanceEntry.findFirst({
        where: { employeeId: employee.id, date: today },
    });
    if (existing && existing.inTime) {
        throw new Error('Already checked in today');
    }
    let uploadUrl = null;
    let faceScore = null;
    let faceVerified = true; // Default true for hardware
    if (!isHardware && !employee.faceDescriptor) {
        throw new Error('Face registration required before punching. Please register Face AI first.');
    }
    if (!isHardware && !faceDescriptor) {
        throw new Error('Live face verification is required for punch.');
    }
    if (!isHardware && photoBuffer && faceDescriptor) {
        // Face Verification using Descriptor
        const faceResult = await (0, faceVerificationService_1.verifyFace)(employee.faceDescriptor, faceDescriptor);
        if (!faceResult.verified) {
            throw new Error(`Face verification failed: ${faceResult.message}`);
        }
        faceScore = faceResult.similarityScore;
        faceVerified = faceResult.verified;
        // Upload to Cloudinary
        const publicId = `emp-${employee.id}/${today.toISOString().split('T')[0]}/checkin`;
        const uploadResult = await (0, cloudinaryService_1.uploadAttendancePhoto)(photoBuffer, publicId);
        uploadUrl = uploadResult.url;
    }
    const now = new Date();
    // Create or Update Attendance Entry
    const entry = await prisma.attendanceEntry.upsert({
        where: {
            uk_attendance_emp_date: { employeeId: employee.id, date: today }
        },
        update: {
            inTime: now,
            checkInLatitude: isHardware ? null : latitude,
            checkInLongitude: isHardware ? null : longitude,
            checkInPhotoUrl: uploadUrl,
            checkInFaceScore: faceScore,
            checkInFaceVerified: faceVerified,
            status: 'PRESENT',
            isHardwarePunch: isHardware || false
        },
        create: {
            employeeId: employee.id,
            date: today,
            inTime: now,
            checkInLatitude: isHardware ? null : latitude,
            checkInLongitude: isHardware ? null : longitude,
            checkInPhotoUrl: uploadUrl,
            checkInFaceScore: faceScore,
            checkInFaceVerified: faceVerified,
            status: 'PRESENT',
            isHardwarePunch: isHardware || false
        }
    });
    // IMPOSSIBLE TRAVEL / FRAUD DETECTION
    try {
        const lastEntry = await prisma.attendanceEntry.findFirst({
            where: { employeeId: employee.id, id: { not: entry.id }, OR: [{ inTime: { not: null } }, { outTime: { not: null } }] },
            orderBy: { date: 'desc' }
        });
        if (lastEntry) {
            const lastLat = lastEntry.checkOutLatitude || lastEntry.checkInLatitude;
            const lastLon = lastEntry.checkOutLongitude || lastEntry.checkInLongitude;
            const lastTime = lastEntry.outTime || lastEntry.inTime;
            if (lastLat && lastLon && lastTime) {
                const dist = (0, exports.distanceMeters)(lastLat, lastLon, latitude, longitude);
                const hoursDelta = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
                if (hoursDelta > 0 && hoursDelta < 24) { // Only check if within 24 hours
                    const speedKmh = (dist / 1000) / hoursDelta;
                    if (speedKmh > 800) { // Commercial airliner speed
                        await prisma.attendanceException.create({
                            data: {
                                employeeId: employee.id,
                                type: 'IMPOSSIBLE_TRAVEL',
                                message: `Fraud alert: Device moved ${Math.round(dist / 1000)}km in ${hoursDelta.toFixed(1)} hours (${Math.round(speedKmh)} km/h).`
                            }
                        });
                    }
                }
            }
        }
    }
    catch (err) {
        console.error("Fraud detection error", err);
    }
    return entry;
};
exports.checkIn = checkIn;
const checkOut = async (employee, latitude, longitude, photoBuffer, faceDescriptor, isHardware = false) => {
    if (!isHardware && (!photoBuffer || photoBuffer.length === 0)) {
        throw new Error('Selfie photo is required for punch');
    }
    if (!isHardware) {
        await assertWithinAssignedOffice(employee, latitude, longitude);
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await (0, attendanceReportService_1.assertPayrollUnlocked)(today.toISOString().slice(0, 7));
    const existing = await prisma.attendanceEntry.findFirst({
        where: { employeeId: employee.id, date: today },
    });
    if (!existing || !existing.inTime) {
        throw new Error('No check-in found for today');
    }
    if (existing.outTime) {
        throw new Error('Already checked out today');
    }
    let uploadUrl = null;
    let faceScore = null;
    let faceVerified = true;
    if (!isHardware && !employee.faceDescriptor) {
        throw new Error('Face registration required before punching. Please register Face AI first.');
    }
    if (!isHardware && !faceDescriptor) {
        throw new Error('Live face verification is required for punch.');
    }
    if (!isHardware && photoBuffer && faceDescriptor) {
        // Face Verification using Descriptor
        const faceResult = await (0, faceVerificationService_1.verifyFace)(employee.faceDescriptor, faceDescriptor);
        if (!faceResult.verified) {
            throw new Error(`Face verification failed: ${faceResult.message}`);
        }
        faceScore = faceResult.similarityScore;
        faceVerified = faceResult.verified;
        // Upload to Cloudinary
        const publicId = `emp-${employee.id}/${today.toISOString().split('T')[0]}/checkout`;
        const uploadResult = await (0, cloudinaryService_1.uploadAttendancePhoto)(photoBuffer, publicId);
        uploadUrl = uploadResult.url;
    }
    const now = new Date();
    // Calculate worked minutes roughly
    const workedMinutes = Math.floor((now.getTime() - existing.inTime.getTime()) / 60000);
    // Determine Status based on worked minutes
    const settings = await prisma.attendanceSettings.findFirst() || {
        fullDayMinutes: 480,
        halfDayMinutes: 240,
        earlyLeaveGraceMinutes: 10
    };
    let newStatus = 'PRESENT';
    if (workedMinutes < settings.halfDayMinutes) {
        newStatus = 'ABSENT';
    }
    else if (workedMinutes < (settings.fullDayMinutes - settings.earlyLeaveGraceMinutes)) {
        newStatus = 'HALF_DAY';
    }
    const entry = await prisma.attendanceEntry.update({
        where: { id: existing.id },
        data: {
            outTime: now,
            workedMinutes,
            status: newStatus,
            checkOutLatitude: isHardware ? null : latitude,
            checkOutLongitude: isHardware ? null : longitude,
            checkOutPhotoUrl: uploadUrl,
            checkOutFaceScore: faceScore,
            checkOutFaceVerified: faceVerified,
            isHardwarePunch: isHardware || false
        },
    });
    // IMPOSSIBLE TRAVEL / FRAUD DETECTION
    try {
        const lastEntry = await prisma.attendanceEntry.findFirst({
            where: { employeeId: employee.id, OR: [{ inTime: { not: null } }, { outTime: { not: null } }] },
            orderBy: { date: 'desc' } // Wait, for checkOut, the last punch is the checkIn of the same day.
        });
        // For checkOut, we just compare with checkIn of the SAME day. It's much simpler.
        const lastLat = existing.checkInLatitude;
        const lastLon = existing.checkInLongitude;
        const lastTime = existing.inTime;
        if (lastLat && lastLon && lastTime) {
            const dist = (0, exports.distanceMeters)(lastLat, lastLon, latitude, longitude);
            const hoursDelta = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
            if (hoursDelta > 0 && hoursDelta < 24) {
                const speedKmh = (dist / 1000) / hoursDelta;
                if (speedKmh > 800) {
                    await prisma.attendanceException.create({
                        data: {
                            employeeId: employee.id,
                            type: 'IMPOSSIBLE_TRAVEL',
                            message: `Fraud alert: Device moved ${Math.round(dist / 1000)}km in ${hoursDelta.toFixed(1)} hours (${Math.round(speedKmh)} km/h) since check-in.`
                        }
                    });
                }
            }
        }
    }
    catch (err) {
        console.error("Fraud detection error", err);
    }
    return entry;
};
exports.checkOut = checkOut;
