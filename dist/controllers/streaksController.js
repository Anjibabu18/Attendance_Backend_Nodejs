"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStreaks = void 0;
const client_1 = require("@prisma/client");
const streaksService_1 = require("../services/streaksService");
const prisma = new client_1.PrismaClient();
const getStreaks = async (req, res) => {
    try {
        const username = req.user?.username;
        if (!username)
            return res.status(401).json({ error: 'Unauthorized' });
        const user = await prisma.appUser.findUnique({ where: { username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
        if (!employee)
            return res.status(404).json({ error: 'Employee not found' });
        const streaks = await (0, streaksService_1.getEmployeeStreaks)(employee.id);
        res.json(streaks);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getStreaks = getStreaks;
