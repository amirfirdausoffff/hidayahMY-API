import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

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

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { period = 'daily', date } = req.query;
  const today = new Date().toISOString().split('T')[0];
  const targetDate = date || today;

  try {
    let analytics = {};

    if (period === 'daily') {
      // Get stats for a specific day
      const { data: checkins, error } = await supabaseAdmin
        .from('prayer_checkins')
        .select('user_id, prayer, date, status')
        .eq('date', targetDate)
        .eq('status', 1);

      if (error) throw error;

      const userMap = {};
      checkins.forEach((c) => {
        if (!userMap[c.user_id]) userMap[c.user_id] = [];
        userMap[c.user_id].push(c.prayer);
      });

      const prayerCounts = { subuh: 0, zohor: 0, asar: 0, maghrib: 0, isyak: 0 };
      checkins.forEach((c) => { prayerCounts[c.prayer]++; });

      const totalUsers = Object.keys(userMap).length;
      const perfectUsers = Object.values(userMap).filter((p) => p.length === 5).length;

      analytics = {
        date: targetDate,
        total_users: totalUsers,
        perfect_users: perfectUsers,
        total_checkins: checkins.length,
        prayer_breakdown: prayerCounts,
      };

    } else if (period === 'weekly') {
      // Get stats for the week containing targetDate
      const target = new Date(targetDate);
      const dayOfWeek = target.getDay();
      const monday = new Date(target);
      monday.setDate(target.getDate() - ((dayOfWeek + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekStart = monday.toISOString().split('T')[0];
      const weekEnd = sunday.toISOString().split('T')[0];

      const { data: checkins, error } = await supabaseAdmin
        .from('prayer_checkins')
        .select('user_id, prayer, date, status')
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .eq('status', 1);

      if (error) throw error;

      // Daily breakdown for the week
      const dailyStats = {};
      const allDates = [];
      for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        allDates.push(ds);
        dailyStats[ds] = { users: new Set(), checkins: 0, perfect: 0 };
      }

      const usersByDate = {};
      checkins.forEach((c) => {
        if (!dailyStats[c.date]) return;
        dailyStats[c.date].users.add(c.user_id);
        dailyStats[c.date].checkins++;
        if (!usersByDate[c.date]) usersByDate[c.date] = {};
        if (!usersByDate[c.date][c.user_id]) usersByDate[c.date][c.user_id] = 0;
        usersByDate[c.date][c.user_id]++;
      });

      Object.keys(usersByDate).forEach((date) => {
        Object.values(usersByDate[date]).forEach((count) => {
          if (count === 5) dailyStats[date].perfect++;
        });
      });

      const dailySummary = allDates.map((d) => ({
        date: d,
        users: dailyStats[d].users.size,
        checkins: dailyStats[d].checkins,
        perfect_users: dailyStats[d].perfect,
      }));

      const uniqueUsers = new Set(checkins.map((c) => c.user_id));

      analytics = {
        week_start: weekStart,
        week_end: weekEnd,
        total_users: uniqueUsers.size,
        total_checkins: checkins.length,
        daily_summary: dailySummary,
      };

    } else if (period === 'monthly') {
      // Get stats for the month
      const [year, month] = targetDate.split('-').slice(0, 2);
      const monthStart = `${year}-${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const monthEnd = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

      const { data: checkins, error } = await supabaseAdmin
        .from('prayer_checkins')
        .select('user_id, prayer, date, status')
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .eq('status', 1);

      if (error) throw error;

      // Weekly breakdown within the month
      const weeklyStats = [];
      let weekStart = new Date(monthStart);
      while (weekStart <= new Date(monthEnd)) {
        const wEnd = new Date(weekStart);
        wEnd.setDate(wEnd.getDate() + 6);
        const actualEnd = wEnd > new Date(monthEnd) ? new Date(monthEnd) : wEnd;

        const ws = weekStart.toISOString().split('T')[0];
        const we = actualEnd.toISOString().split('T')[0];

        const weekCheckins = checkins.filter((c) => c.date >= ws && c.date <= we);
        const weekUsers = new Set(weekCheckins.map((c) => c.user_id));

        weeklyStats.push({
          week_start: ws,
          week_end: we,
          users: weekUsers.size,
          checkins: weekCheckins.length,
        });

        weekStart.setDate(weekStart.getDate() + 7);
      }

      // Prayer breakdown for the month
      const prayerCounts = { subuh: 0, zohor: 0, asar: 0, maghrib: 0, isyak: 0 };
      checkins.forEach((c) => { prayerCounts[c.prayer]++; });

      const uniqueUsers = new Set(checkins.map((c) => c.user_id));

      // Calculate perfect days per user
      const userDays = {};
      checkins.forEach((c) => {
        const key = `${c.user_id}_${c.date}`;
        if (!userDays[key]) userDays[key] = 0;
        userDays[key]++;
      });
      const totalPerfectDays = Object.values(userDays).filter((count) => count === 5).length;

      analytics = {
        month: `${year}-${month}`,
        total_users: uniqueUsers.size,
        total_checkins: checkins.length,
        total_perfect_days: totalPerfectDays,
        prayer_breakdown: prayerCounts,
        weekly_summary: weeklyStats,
      };
    }

    // Get today's active users with emails (for the "checked today" list)
    const { data: todayCheckins, error: todayError } = await supabaseAdmin
      .from('prayer_checkins')
      .select('user_id, prayer')
      .eq('date', today)
      .eq('status', 1);

    if (todayError) throw todayError;

    const todayUserMap = {};
    todayCheckins.forEach((c) => {
      if (!todayUserMap[c.user_id]) todayUserMap[c.user_id] = [];
      todayUserMap[c.user_id].push(c.prayer);
    });

    // Get user emails
    const userIds = Object.keys(todayUserMap);
    let todayUsers = [];

    if (userIds.length > 0) {
      const { data: { users: authUsers }, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 1000,
      });

      if (!usersError && authUsers) {
        const userEmailMap = {};
        authUsers.forEach((u) => { userEmailMap[u.id] = u.email; });

        todayUsers = userIds.map((uid) => ({
          user_id: uid,
          email: userEmailMap[uid] || 'Unknown',
          prayers: todayUserMap[uid],
          count: todayUserMap[uid].length,
          is_perfect: todayUserMap[uid].length === 5,
        })).sort((a, b) => b.count - a.count);
      }
    }

    return res.status(200).json({
      success: true,
      analytics,
      today_users: todayUsers,
      today_total: todayUsers.length,
    });

  } catch (error) {
    console.error('[prayer-checkin-admin-stats] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export default cors(handler);
