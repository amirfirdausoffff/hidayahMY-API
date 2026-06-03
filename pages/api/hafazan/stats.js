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

  // Total entries
  const { count: totalEntries } = await supabaseAdmin
    .from('hafazan_entries')
    .select('*', { count: 'exact', head: true });

  // Unique users
  const { data: usersData } = await supabaseAdmin
    .from('hafazan_entries')
    .select('user_id');

  const uniqueUsers = usersData ? new Set(usersData.map(u => u.user_id)).size : 0;

  // Entries by status
  const { count: memorizingCount } = await supabaseAdmin
    .from('hafazan_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'memorizing');

  const { count: memorizedCount } = await supabaseAdmin
    .from('hafazan_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'memorized');

  // Total reviews and avg rating
  const { data: reviewStats } = await supabaseAdmin
    .from('hafazan_reviews')
    .select('rating');

  const totalReviews = reviewStats ? reviewStats.length : 0;
  const avgRating = totalReviews > 0
    ? Math.round((reviewStats.reduce((sum, r) => sum + r.rating, 0) / totalReviews) * 100) / 100
    : 0;

  // Top memorized surahs
  const { data: memorizedEntries } = await supabaseAdmin
    .from('hafazan_entries')
    .select('surah_number')
    .eq('status', 'memorized');

  const surahCounts = {};
  if (memorizedEntries) {
    memorizedEntries.forEach(e => {
      surahCounts[e.surah_number] = (surahCounts[e.surah_number] || 0) + 1;
    });
  }

  const topSurahs = Object.entries(surahCounts)
    .map(([surah_number, count]) => ({ surah_number: parseInt(surah_number), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recent activity (last 10 reviews with user info)
  const { data: recentReviews } = await supabaseAdmin
    .from('hafazan_reviews')
    .select('id, entry_id, user_id, rating, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return res.status(200).json({
    success: true,
    stats: {
      total_entries: totalEntries || 0,
      total_users: uniqueUsers,
      entries_by_status: {
        memorizing: memorizingCount || 0,
        memorized: memorizedCount || 0,
      },
      total_reviews: totalReviews,
      avg_rating: avgRating,
      top_memorized_surahs: topSurahs,
      recent_activity: recentReviews || [],
    },
  });
}

export default cors(handler);
