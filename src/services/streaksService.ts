import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getEmployeeStreaks = async (employeeId: number) => {
  const now = new Date();
  const yearStart = new Date(`${now.getFullYear()}-01-01T00:00:00Z`);

  // Fetch all entries for the current year, sorted desc by date
  const entries = await prisma.attendanceEntry.findMany({
    where: {
      employeeId,
      date: { gte: yearStart },
    },
    orderBy: { date: 'desc' },
    include: { employee: { include: { shift: true } } },
  });

  if (entries.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      punctualityScore: 0,
      badges: [],
      totalOnTime: 0,
      totalDays: 0,
    };
  }

  // On-time = PRESENT and lateMinutes <= 0
  const onTimeDays = entries.filter(e => e.status === 'PRESENT' && (e.lateMinutes || 0) <= 0);
  const presentDays = entries.filter(e => e.status === 'PRESENT');
  const totalDays = entries.length;

  // Calculate current on-time streak (consecutive days from most recent backwards)
  // We'll walk day by day
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  // Build a set of on-time date strings
  const onTimeDateSet = new Set(onTimeDays.map(e => e.date.toISOString().split('T')[0]));
  const presentDateSet = new Set(presentDays.map(e => e.date.toISOString().split('T')[0]));

  // Walk through all working days in descending order from today
  const cursor = new Date(now);
  let lookingForCurrent = true;
  const checked: string[] = [];

  for (let i = 0; i < 365; i++) {
    const dateStr = cursor.toISOString().split('T')[0];
    const dow = cursor.getUTCDay(); // 0=Sun, 6=Sat
    cursor.setUTCDate(cursor.getUTCDate() - 1);

    // Skip weekends (simple approach - ignore Sat/Sun)
    if (dow === 0 || dow === 6) continue;

    // Only consider days we have an entry for
    if (!presentDateSet.has(dateStr)) {
      // If we're still looking for the current streak start and there's no entry yet (future/today), skip
      if (lookingForCurrent) continue;
      // Gap in streak — break
      break;
    }

    checked.push(dateStr);
    if (onTimeDateSet.has(dateStr)) {
      tempStreak++;
      if (lookingForCurrent) currentStreak++;
    } else {
      lookingForCurrent = false;
      tempStreak = 0;
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  const punctualityScore = totalDays > 0 ? Math.round((onTimeDays.length / Math.max(presentDays.length, 1)) * 100) : 0;

  // Badges
  const badges: string[] = [];
  const thisMonthStart = new Date(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`);
  const thisMonthEntries = entries.filter(e => e.date >= thisMonthStart);
  const thisMonthPresent = thisMonthEntries.filter(e => e.status === 'PRESENT');
  const thisMonthOnTime = thisMonthPresent.filter(e => (e.lateMinutes || 0) <= 0);

  if (thisMonthPresent.length > 0 && thisMonthOnTime.length === thisMonthPresent.length) {
    badges.push('⭐ Perfect Month');
  }
  if (currentStreak >= 7) badges.push('🔥 Week Streak');
  if (currentStreak >= 30) badges.push('🏆 Month Streak');
  if (punctualityScore >= 95) badges.push('🎯 Punctuality Pro');

  // Check for early bird (check-in before scheduled time by 15+ min)
  const earlyBirdDays = entries.filter(e => (e.lateMinutes || 0) < -15).length;
  if (earlyBirdDays >= 5) badges.push('🌅 Early Bird');

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    punctualityScore,
    badges,
    totalOnTime: onTimeDays.length,
    totalDays: presentDays.length,
  };
};
