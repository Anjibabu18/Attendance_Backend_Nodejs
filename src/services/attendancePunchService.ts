import prisma from '../prisma';
import { Employee, AttendanceEntry, OfficeLocation } from '@prisma/client';
import { uploadAttendancePhoto } from './cloudinaryService';
import { verifyFace } from './faceVerificationService';
import { assertPayrollUnlocked } from './attendanceReportService';
import { logFaceVerification } from './auditService';
import { notify, notifyAllHr } from './notificationService';



const validateCoordinates = (latitude: number, longitude: number) => {
  if (isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('latitude must be between -90 and 90');
  }
  if (isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('longitude must be between -180 and 180');
  }
};

export const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const earthRadiusMeters = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const haversine =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * angularDistance;
};

export const evaluatePlace = async (employee: Employee, latitude: number, longitude: number) => {
  validateCoordinates(latitude, longitude);
  let office: OfficeLocation | null = null;
  
  if (employee.assignedOfficeLocationId) {
    office = await prisma.officeLocation.findUnique({ where: { id: Number(employee.assignedOfficeLocationId) } });
  }
  
  if (!office || !office.active) {
    office = await prisma.officeLocation.findFirst({ where: { active: true } });
  }
  
  if (!office) {
    throw new Error('No active office location found');
  }

  try {
    validateCoordinates(Number(office.latitude), Number(office.longitude));
  } catch {
    throw new Error("Office location is invalid. Admin must save correct latitude and longitude for this office.");
  }

  const distance = distanceMeters(office.latitude, office.longitude, latitude, longitude);
  return { office, distanceMeters: distance, insideRadius: distance <= office.radiusMeters };
};

const assertWithinAssignedOffice = async (employee: Employee, latitude: number, longitude: number) => {
  const place = await evaluatePlace(employee, latitude, longitude);
  if (!place.insideRadius) {
    throw new Error(`Outside office radius. Distance: ${Math.round(place.distanceMeters)}m, Allowed: ${Math.round(place.office.radiusMeters)}m`);
  }
};

export const checkIn = async (
  employee: Employee,
  latitude: number,
  longitude: number,
  photoBuffer: Buffer | null,
  faceDescriptor: number[] | null,
  isHardware: boolean = false
) => {
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

  await assertPayrollUnlocked(today.toISOString().slice(0, 7));

  const existing = await prisma.attendanceEntry.findFirst({
    where: { employeeId: employee.id, date: today },
  });

  if (existing && existing.inTime) {
    throw new Error('Already checked in today');
  }

  let uploadUrl = null;
  let faceScore = null;
  let faceVerified = true; // Default true for hardware

  if (!isHardware && photoBuffer) {
    // Upload to Cloudinary without Face AI validation
    const publicId = `emp-${employee.id}/${today.toISOString().split('T')[0]}/checkin`;
    const uploadResult = await uploadAttendancePhoto(photoBuffer, publicId);
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

  if (!isHardware) {
    await logFaceVerification({ employeeId: employee.id, attendanceEntryId: entry.id, action: 'CHECK_IN', similarityScore: faceScore, verified: Boolean(faceVerified), message: 'Verified by Browser ML', photoUrl: uploadUrl });
  }

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
        const dist = distanceMeters(lastLat, lastLon, latitude, longitude);
        const hoursDelta = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
        if (hoursDelta > 0 && hoursDelta < 24) { // Only check if within 24 hours
          const speedKmh = (dist / 1000) / hoursDelta;
          if (speedKmh > 800) { // Commercial airliner speed
            await prisma.attendanceException.create({
              data: {
                employeeId: employee.id,
                type: 'IMPOSSIBLE_TRAVEL',
                message: `Fraud alert: Device moved ${Math.round(dist/1000)}km in ${hoursDelta.toFixed(1)} hours (${Math.round(speedKmh)} km/h).`
              }
            });
            notifyAllHr('⚠️ Fraud Alert', `Impossible travel detected for ${employee.name || 'Employee #' + employee.id}: ${Math.round(dist/1000)}km in ${hoursDelta.toFixed(1)}h (${Math.round(speedKmh)} km/h).`).catch(() => {});
          }
        }
      }
    }
  } catch (err) { console.error("Fraud detection error", err); }

  // Notify employee of successful check-in
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  notify(employee.userId, '✅ Punched In', `You checked in at ${timeStr}. Have a great day!`).catch(() => {});

  return entry;
};

export const checkOut = async (
  employee: Employee,
  latitude: number,
  longitude: number,
  photoBuffer: Buffer | null,
  faceDescriptor: number[] | null,
  isHardware: boolean = false
) => {
  if (!isHardware && (!photoBuffer || photoBuffer.length === 0)) {
    throw new Error('Selfie photo is required for punch');
  }

  if (!isHardware) {
    await assertWithinAssignedOffice(employee, latitude, longitude);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await assertPayrollUnlocked(today.toISOString().slice(0, 7));

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

  if (!isHardware && photoBuffer) {
    // Upload to Cloudinary without Face AI validation
    const publicId = `emp-${employee.id}/${today.toISOString().split('T')[0]}/checkout`;
    const uploadResult = await uploadAttendancePhoto(photoBuffer, publicId);
    uploadUrl = uploadResult.url;
  }

  const now = new Date();
  
  // Determine Status: < 4 hours = ABSENT, 4 to 8 hours = HALF_DAY, >= 8 hours = PRESENT
  const workedMinutes = Math.floor((now.getTime() - existing.inTime.getTime()) / 60000);
  const FULL_DAY_MINUTES = 480; // 8 hours
  const HALF_DAY_MINUTES = 240; // 4 hours

  let newStatus: any;
  let overtimeMinutes = 0;

  if (workedMinutes >= FULL_DAY_MINUTES) {
    newStatus = 'PRESENT';
    overtimeMinutes = workedMinutes - FULL_DAY_MINUTES; // Minutes beyond 8h
  } else if (workedMinutes >= HALF_DAY_MINUTES) {
    newStatus = 'HALF_DAY';
    overtimeMinutes = 0;
  } else {
    newStatus = 'ABSENT';
    overtimeMinutes = 0;
  }

  const entry = await prisma.attendanceEntry.update({
    where: { id: existing.id },
    data: {
      outTime: now,
      workedMinutes,
      status: newStatus,
      overtimeMinutes,
      checkOutLatitude: isHardware ? null : latitude,
      checkOutLongitude: isHardware ? null : longitude,
      checkOutPhotoUrl: uploadUrl,
      checkOutFaceScore: faceScore,
      checkOutFaceVerified: faceVerified,
      isHardwarePunch: isHardware || false
    },
  });

  if (!isHardware) {
    await logFaceVerification({ employeeId: employee.id, attendanceEntryId: entry.id, action: 'CHECK_OUT', similarityScore: faceScore, verified: Boolean(faceVerified), message: 'Verified by Browser ML', photoUrl: uploadUrl });
  }

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
      const dist = distanceMeters(lastLat, lastLon, latitude, longitude);
      const hoursDelta = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
      if (hoursDelta > 0 && hoursDelta < 24) { 
        const speedKmh = (dist / 1000) / hoursDelta;
        if (speedKmh > 800) { 
          await prisma.attendanceException.create({
            data: {
              employeeId: employee.id,
              type: 'IMPOSSIBLE_TRAVEL',
              message: `Fraud alert: Device moved ${Math.round(dist/1000)}km in ${hoursDelta.toFixed(1)} hours (${Math.round(speedKmh)} km/h) since check-in.`
            }
          });
          notifyAllHr('⚠️ Fraud Alert', `Impossible travel on checkout for ${employee.name || 'Employee #' + employee.id}: ${Math.round(dist/1000)}km in ${hoursDelta.toFixed(1)}h since check-in.`).catch(() => {});
        }
      }
    }
  } catch (err) { console.error("Fraud detection error", err); }

  // Notify employee of successful check-out with status details
  const hrs = Math.floor(workedMinutes / 60);
  const mins = workedMinutes % 60;
  const outTimeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  let notifMessage = `You checked out at ${outTimeStr}. Today's work: ${hrs}h ${mins}m.`;
  if (newStatus === 'HALF_DAY') {
    notifMessage += ` (Half Day — worked less than 8 hours)`;
  } else if (overtimeMinutes > 0) {
    const otHrs = Math.floor(overtimeMinutes / 60);
    const otMins = overtimeMinutes % 60;
    notifMessage += ` Overtime: ${otHrs}h ${otMins}m 🌟`;
  }
  notify(employee.userId, '✅ Punched Out', notifMessage).catch(() => {});

  return entry;
};






