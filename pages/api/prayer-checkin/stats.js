import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

const VALID_PRAYERS = ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'];

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // Query params: month (YYYY-MM) — defaults to current month
  const { month } = req.query;
  const now = new Date();
  let year, monthNum;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    [year, monthNum] = month.split('-').map(Number);
  } else {
    year = now.getFullYear();
    monthNum = now.getMonth() + 1;
  }

  // Date range for the requested month
  const monthStart = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const monthEnd = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Fetch all check-ins for the month
  const { data: monthData, error: monthError } = await supabaseAdmin
    .from('prayer_checkins')
    .select('date, prayer, status')
    .eq('user_id', user.id)
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .eq('status', 1)
    .order('date', { ascending: true });

  if (monthError) {
    return res.status(400).json({ success: false, error: monthError.message });
  }

  // Group by date
  const byDate = {};
  for (const row of monthData) {
    if (!byDate[row.date]) byDate[row.date] = new Set();
    byDate[row.date].add(row.prayer);
  }

  // Monthly stats
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const daysInMonth = lastDay;
  // Only count days up to today if current month
  const isCurrentMonth = year === now.getFullYear() && monthNum === now.getMonth() + 1;
  const countableDays = isCurrentMonth ? now.getDate() : daysInMonth;

  let totalPrayers = 0;
  let perfectDays = 0;

  for (const [date, prayers] of Object.entries(byDate)) {
    totalPrayers += prayers.size;
    if (prayers.size === 5) perfectDays++;
  }

  // Per-prayer breakdown for the month
  const prayerBreakdown = {};
  for (const p of VALID_PRAYERS) {
    prayerBreakdown[p] = 0;
  }
  for (const row of monthData) {
    prayerBreakdown[row.prayer]++;
  }

  // Current streak & longest streak — fetch last 365 days of data
  const streakFrom = new Date(now);
  streakFrom.setDate(streakFrom.getDate() - 365);
  const streakFromStr = `${streakFrom.getFullYear()}-${String(streakFrom.getMonth() + 1).padStart(2, '0')}-${String(streakFrom.getDate()).padStart(2, '0')}`;

  const { data: streakData, error: streakError } = await supabaseAdmin
    .from('prayer_checkins')
    .select('date, prayer')
    .eq('user_id', user.id)
    .gte('date', streakFromStr)
    .lte('date', todayStr)
    .eq('status', 1)
    .order('date', { ascending: true });

  if (streakError) {
    return res.status(400).json({ success: false, error: streakError.message });
  }

  // Group streak data by date
  const streakByDate = {};
  for (const row of streakData) {
    if (!streakByDate[row.date]) streakByDate[row.date] = new Set();
    streakByDate[row.date].add(row.prayer);
  }

  // Calculate current streak (consecutive days with 5/5, going backwards from today/yesterday)
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  // Build array of dates from streakFrom to today
  const allDates = [];
  const d = new Date(streakFrom);
  while (d <= now) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    allDates.push(ds);
    d.setDate(d.getDate() + 1);
  }

  // Calculate longest streak
  for (const ds of allDates) {
    const prayers = streakByDate[ds];
    if (prayers && prayers.size === 5) {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Calculate current streak (backwards from today)
  // If today is not complete, start from yesterday
  const todayPrayers = streakByDate[todayStr];
  const todayComplete = todayPrayers && todayPrayers.size === 5;

  currentStreak = 0;
  for (let i = allDates.length - 1; i >= 0; i--) {
    const ds = allDates[i];
    // Skip today if not complete
    if (ds === todayStr && !todayComplete) continue;
    const prayers = streakByDate[ds];
    if (prayers && prayers.size === 5) {
      currentStreak++;
    } else {
      break;
    }
  }

  return res.status(200).json({
    success: true,
    month: `${year}-${String(monthNum).padStart(2, '0')}`,
    days_in_month: daysInMonth,
    countable_days: countableDays,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    perfect_days: perfectDays,
    total_prayers: totalPrayers,
    max_prayers: countableDays * 5,
    prayer_breakdown: prayerBreakdown,
    // Daily summary: { "2026-05-01": 5, "2026-05-02": 3, ... }
    daily_summary: Object.fromEntries(
      Object.entries(byDate).map(([date, prayers]) => [date, prayers.size])
    ),
  });
}

export default cors(handler);
