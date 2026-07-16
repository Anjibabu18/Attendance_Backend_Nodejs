import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isoDate = (date = new Date()) => date.toISOString().slice(0, 10);
const formatDate = (date = new Date(), options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(date);

const createTransporter = () => {
  if (process.env.MAIL_ENABLED !== 'true') return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT) || 587,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
};

const buildHtmlEmail = (managerName: string, data: {
  date: string;
  present: number;
  absent: number;
  onLeave: number;
  late: number;
  pendingLeaves: number;
  pendingRegularizations: number;
  teamSize: number;
}) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f8ff; margin: 0; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 8px 32px rgba(15,23,42,0.08); }
    .header { background: linear-gradient(135deg, #0b63ff, #0047cc); border-radius: 12px; padding: 24px; color: white; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 900; }
    .header p { margin: 4px 0 0; opacity: 0.85; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat { border-radius: 12px; padding: 16px; text-align: center; }
    .stat .num { font-size: 32px; font-weight: 900; }
    .stat .lbl { font-size: 13px; font-weight: 600; margin-top: 4px; }
    .present { background: #dcfce7; color: #166534; }
    .absent { background: #fee2e2; color: #991b1b; }
    .leave { background: #fef3c7; color: #92400e; }
    .late { background: #ede9fe; color: #5b21b6; }
    .pending { background: #dbeafe; color: #1e40af; }
    .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border: none; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Daily Attendance Digest</h1>
      <p>${data.date} &nbsp; Team size: ${data.teamSize} employees</p>
    </div>
    <p style="margin:0 0 16px; color:#475569; font-size:15px;">Good morning, <strong>${managerName}</strong>. Here is today's snapshot:</p>
    <div class="stats">
      <div class="stat present"><div class="num">${data.present}</div><div class="lbl">Present</div></div>
      <div class="stat absent"><div class="num">${data.absent}</div><div class="lbl">Absent</div></div>
      <div class="stat leave"><div class="num">${data.onLeave}</div><div class="lbl">On Leave</div></div>
    </div>
    <div class="stats">
      <div class="stat late"><div class="num">${data.late}</div><div class="lbl">Late Today</div></div>
      <div class="stat pending"><div class="num">${data.pendingLeaves}</div><div class="lbl">Leave Requests</div></div>
      <div class="stat pending"><div class="num">${data.pendingRegularizations}</div><div class="lbl">Regularizations</div></div>
    </div>
    <div style="background:#f8fafc; border-radius:10px; padding:16px;">
      <div class="row"><span style="color:#475569; font-weight:600;">Attendance rate today</span><strong>${data.teamSize > 0 ? Math.round(((data.present + data.onLeave) / data.teamSize) * 100) : 0}%</strong></div>
      <div class="row"><span style="color:#475569; font-weight:600;">Action required</span><strong style="color:${(data.pendingLeaves + data.pendingRegularizations) > 0 ? '#0b63ff' : '#166534'}">${data.pendingLeaves + data.pendingRegularizations > 0 ? `${data.pendingLeaves + data.pendingRegularizations} pending approvals` : 'All clear'}</strong></div>
    </div>
    <div class="footer">WorkTrack Attendance System</div>
  </div>
</body>
</html>
`;

const sendDailyDigests = async () => {
  const transporter = createTransporter();
  if (!transporter) return;

  const today = isoDate();
  const todayStart = new Date(`${today}T00:00:00Z`);
  const todayEnd = new Date(`${today}T23:59:59Z`);

  const managers = await prisma.appUser.findMany({
    where: { role: 'ROLE_MANAGER' },
    include: {
      managerAssignments: {
        include: {
          employee: {
            include: {
              attendanceEntries: { where: { date: { gte: todayStart, lte: todayEnd } } },
            },
          },
        },
      },
    },
  });

  for (const manager of managers) {
    if (!manager.username.includes('@')) continue;

    const teamEmployees = manager.managerAssignments.map((assignment) => assignment.employee);
    if (teamEmployees.length === 0) continue;

    const todayEntries = teamEmployees.map((employee) => employee.attendanceEntries[0]).filter(Boolean);
    const present = todayEntries.filter((entry) => entry?.status === 'PRESENT').length;
    const absent = Math.max(0, teamEmployees.length - todayEntries.length);
    const onLeave = todayEntries.filter((entry) => entry?.status === 'LEAVE').length;
    const late = todayEntries.filter((entry) => (entry?.lateMinutes || 0) > 0 && entry?.status === 'PRESENT').length;

    const employeeIds = teamEmployees.map((employee) => employee.id);
    const [pendingLeaves, pendingRegularizations] = await Promise.all([
      prisma.leaveRequest.count({ where: { employeeId: { in: employeeIds }, status: 'PENDING' } }),
      prisma.regularizationRequest.count({ where: { employeeId: { in: employeeIds }, status: 'PENDING' } }),
    ]);

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: manager.username,
        subject: `Daily Attendance Digest - ${formatDate(new Date(), { day: '2-digit', month: 'short', year: 'numeric' })}`,
        html: buildHtmlEmail('Manager', {
          date: formatDate(new Date(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
          present,
          absent,
          onLeave,
          late,
          pendingLeaves,
          pendingRegularizations,
          teamSize: teamEmployees.length,
        }),
      });
      console.log(`[EmailDigest] Sent to ${manager.username}`);
    } catch (err) {
      console.error(`[EmailDigest] Failed for ${manager.username}:`, err);
    }
  }
};

export const startEmailDigestJob = () => {
  cron.schedule('30 8 * * 1-5', async () => {
    console.log('[EmailDigest] Running daily digest...');
    try {
      await sendDailyDigests();
    } catch (err) {
      console.error('[EmailDigest] Job error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[EmailDigest] Daily digest job scheduled (8:30 AM IST, Mon-Fri).');
};
