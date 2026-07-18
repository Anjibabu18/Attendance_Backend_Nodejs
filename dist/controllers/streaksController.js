"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStreaks = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const streaksService_1 = require("../services/streaksService");
const getStreaks = async (req, res) => {
    try {
        const username = req.user?.username;
        if (!username)
            return res.status(401).json({ error: 'Unauthorized' });
        const user = await prisma_1.default.appUser.findUnique({ where: { username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await prisma_1.default.employee.findFirst({ where: { userId: user.id } });
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
