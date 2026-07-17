import prisma from '../prisma';
import nodemailer from 'nodemailer';




const mailEnabled = process.env.MAIL_ENABLED === 'true';
const mailUser = process.env.MAIL_USERNAME || process.env.MAIL_USER;
const mailPassword = process.env.MAIL_PASSWORD || process.env.MAIL_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587'),
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: mailUser,
    pass: mailPassword,
  },
});

const getHrRecipients = async (): Promise<string[]> => {
  const override = process.env.MAIL_HR_RECIPIENTS;
  if (override && override.trim().length > 0) {
    return override.split(',').map(e => e.trim()).filter(e => e.length > 0);
  }

  const hrs = await prisma.appUser.findMany({
    where: { role: 'ROLE_HR' },
  });

  return hrs
    .map(hr => hr.username.trim().toLowerCase())
    .filter(u => u.includes('@') && !u.startsWith('@') && !u.endsWith('@'));
};

const wrapInTemplate = (bodyText: string) => `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .header { background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); padding: 30px 20px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px; }
  .content { padding: 40px 30px; color: #334155; line-height: 1.6; font-size: 16px; }
  .content p { margin-bottom: 20px; }
  .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
  .btn { display: inline-block; padding: 12px 24px; background-color: #2563EB; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 10px; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Attendance Portal</h1>
    </div>
    <div class="content">
      ${bodyText.split('\\n').map(line => `<p>${line}</p>`).join('')}
    </div>
    <div class="footer">
      This is an automated message from the Attendance System.<br/>
      Please do not reply to this email.
    </div>
  </div>
</body>
</html>
`;

const send = async (subject: string, body: string, to: string[]) => {
  if (!mailEnabled || to.length === 0) return;

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@attendance.local',
      to: to.join(', '),
      subject,
      text: body,
      html: wrapInTemplate(body),
    });
  } catch (ex) {
    console.warn(`Mail send failed for subject '${subject}' to ${to}`, ex);
  }
};

export const notifyHr = async (subject: string, body: string) => {
  const hrs = await getHrRecipients();
  await send(subject, body, hrs);
};

export const notifyUser = async (to: string | null | undefined, subject: string, body: string) => {
  if (!to || to.trim().length === 0) return;
  await send(subject, body, [to.trim()]);
};


