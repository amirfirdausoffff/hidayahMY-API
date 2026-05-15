import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

const VALID_PRAYERS = ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'];

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  const { month } = req.query;
  const now = new Date();
  let year, monthNum;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    [year, monthNum] = month.split('-').map(Number);
  } else {
    year = now.getFullYear();
    monthNum = now.getMonth() + 1;
  }

  const lastDay = new Date(year, monthNum, 0).getDate();
  const monthStart = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Streak: go back max 90 days for current streak (nobody has 365-day streak realistically)
  // and use the same query for longest streak within that window
  const streakFrom = new Date(now);
  streakFrom.setDate(streakFrom.getDate() - 90);
  const streakFromStr = formatDate(streakFrom);
  const todayStr = formatDate(now);

  // ── Single query: fetch all checked prayers from streak window ──
  // This covers both the month data AND the streak data in one query
  // since the month is always within the 90-day streak window (or we fetch both ranges)
  const fetchFrom = monthStart < streakFromStr ? monthStart : streakFromStr;
  const fetchTo = monthEnd > todayStr ? todayStr : monthEnd > todayStr ? todayStr : (monthEnd > todayStr ? todayStr : monthEnd);
  const actualTo = todayStr > monthEnd ? todayStr : monthEnd;

  const { data: allData, error: queryError } = await supabaseAdmin
    .from('prayer_checkins')
    .select('date, prayer')
    .eq('user_id', user.id)
    .gte('date', fetchFrom)
    .lte('date', actualTo)
    .eq('status', 1)
    .order('date', { ascending: true });

  if (queryError) {
    return res.status(400).json({ success: false, error: queryError.message });
  }

  // ── Process all data in a single pass ──
  const byDate = {};       // all dates → Set of prayers
  const monthByDate = {};   // month dates only → Set of prayers
  const prayerBreakdown = {};
  for (const p of VALID_PRAYERS) prayerBreakdown[p] = 0;

  for (const row of allData) {
    // All dates (for streak)
    if (!byDate[row.date]) byDate[row.date] = new Set();
    byDate[row.date].add(row.prayer);

    // Month dates only (for stats)
    if (row.date >= monthStart && row.date <= monthEnd) {
      if (!monthByDate[row.date]) monthByDate[row.date] = new Set();
      monthByDate[row.date].add(row.prayer);
      prayerBreakdown[row.prayer]++;
    }
  }

  // ── Monthly stats ──
  const isCurrentMonth = year === now.getFullYear() && monthNum === now.getMonth() + 1;
  const countableDays = isCurrentMonth ? now.getDate() : lastDay;
  let totalPrayers = 0;
  let perfectDays = 0;

  for (const prayers of Object.values(monthByDate)) {
    totalPrayers += prayers.size;
    if (prayers.size === 5) perfectDays++;
  }

  // ── Streak calculation — only iterate dates that have data ──
  // Build sorted unique dates from byDate keys
  const sortedDates = Object.keys(byDate).sort();

  // Longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  for (const ds of sortedDates) {
    if (byDate[ds].size === 5) {
      if (prevDate) {
        // Check if consecutive
        const prev = new Date(prevDate + 'T00:00:00');
        const curr = new Date(ds + 'T00:00:00');
        const diffDays = (curr - prev) / 86400000;
        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDate = ds;
    } else {
      tempStreak = 0;
      prevDate = null;
    }
  }

  // Current streak (backwards from today)
  const todayPrayers = byDate[todayStr];
  const todayComplete = todayPrayers && todayPrayers.size === 5;
  let currentStreak = 0;

  // Start from today (if complete) or yesterday
  const checkDate = new Date(now);
  if (!todayComplete) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  for (let i = 0; i < 90; i++) {
    const ds = formatDate(checkDate);
    const prayers = byDate[ds];
    if (prayers && prayers.size === 5) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // ── Daily summary ──
  const dailySummary = {};
  for (const [date, prayers] of Object.entries(monthByDate)) {
    dailySummary[date] = prayers.size;
  }

  return res.status(200).json({
    success: true,
    month: `${year}-${String(monthNum).padStart(2, '0')}`,
    days_in_month: lastDay,
    countable_days: countableDays,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    perfect_days: perfectDays,
    total_prayers: totalPrayers,
    max_prayers: countableDays * 5,
    prayer_breakdown: prayerBreakdown,
    daily_summary: dailySummary,
  });
}

export default cors(handler);
