"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmployeeAttendance = exports.getEmployeeProfile = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const getEmployeeProfile = async (userId) => {
    const employee = await prisma.employee.findUnique({
        where: { userId },
        include: {
            assignedOfficeLocation: true,
            // department: true,
            // companyRole: true,
            // shift: true
        }
    });
    if (!employee) {
        throw new Error('Employee profile missing');
    }
    return {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        status: employee.status,
        profilePhotoUrl: employee.profilePhotoUrl,
        faceRegistered: Boolean(employee.faceDescriptor),
        assignedOfficeLocation: employee.assignedOfficeLocation,
        // Add other fields as they become available in Prisma
    };
};
exports.getEmployeeProfile = getEmployeeProfile;
const getEmployeeAttendance = async (employeeId, month) => {
    // month format 'YYYY-MM'
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const entries = await prisma.attendanceEntry.findMany({
        where: {
            employeeId,
            date: {
                gte: start,
                lt: end,
            },
        },
        orderBy: { date: 'asc' },
    });
    // Normalize: date -> YYYY-MM-DD string, inTime/outTime -> HH:mm:ss or null
    return entries.map(e => ({
        ...e,
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date).slice(0, 10),
        inTime: e.inTime instanceof Date ? e.inTime.toISOString().slice(11, 19) : (e.inTime ? String(e.inTime).slice(11, 19) : null),
        outTime: e.outTime instanceof Date ? e.outTime.toISOString().slice(11, 19) : (e.outTime ? String(e.outTime).slice(11, 19) : null),
    }));
};
exports.getEmployeeAttendance = getEmployeeAttendance;
