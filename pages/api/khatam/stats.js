import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  // Fetch all khatam records
  const { data: allKhatams, error } = await supabaseAdmin
    .from('khatam_progress')
    .select('id, user_id, start_date, target_date, completed_surahs, is_completed, completed_at, status, created_at');

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const active = allKhatams.filter((k) => k.status === 'active');
  const completed = allKhatams.filter((k) => k.status === 'completed');
  const abandoned = allKhatams.filter((k) => k.status === 'abandoned');

  // Progress distribution for active khatams
  const distribution = { '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 };
  let onTrackCount = 0;
  let behindCount = 0;

  for (const k of active) {
    const count = Object.values(k.completed_surahs || {}).filter(Boolean).length;
    const pct = (count / 114) * 100;

    if (pct < 25) distribution['0-25']++;
    else if (pct < 50) distribution['25-50']++;
    else if (pct < 75) distribution['50-75']++;
    else distribution['75-100']++;

    // Check if on track
    const now = new Date();
    const start = new Date(k.start_date + 'T00:00:00');
    const target = new Date(k.target_date + 'T00:00:00');
    const totalDays = Math.max(1, (target - start) / 86400000);
    const elapsed = Math.max(0, (now - start) / 86400000);
    const expectedPct = Math.min(100, (elapsed / totalDays) * 100);

    if (pct >= expectedPct * 0.8) onTrackCount++;
    else behindCount++;
  }

  // Average completion time for completed khatams
  let avgCompletionDays = 0;
  if (completed.length > 0) {
    const totalDays = completed.reduce((sum, k) => {
      const start = new Date(k.start_date + 'T00:00:00');
      const end = k.completed_at ? new Date(k.completed_at) : new Date();
      return sum + Math.max(1, Math.floor((end - start) / 86400000));
    }, 0);
    avgCompletionDays = Math.round(totalDays / completed.length);
  }

  // Recent completions (last 10)
  const recentCompletions = completed
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    .slice(0, 10)
    .map((k) => ({
      id: k.id,
      user_id: k.user_id,
      start_date: k.start_date,
      completed_at: k.completed_at,
      duration_days: Math.max(1, Math.floor((new Date(k.completed_at) - new Date(k.start_date + 'T00:00:00')) / 86400000)),
    }));

  // Unique users
  const uniqueActiveUsers = new Set(active.map((k) => k.user_id)).size;

  return res.status(200).json({
    success: true,
    stats: {
      total_khatams: allKhatams.length,
      active_count: active.length,
      completed_count: completed.length,
      abandoned_count: abandoned.length,
      completion_rate: allKhatams.length > 0
        ? Math.round((completed.length / (completed.length + abandoned.length || 1)) * 100)
        : 0,
      avg_completion_days: avgCompletionDays,
      unique_active_users: uniqueActiveUsers,
      on_track: onTrackCount,
      behind_schedule: behindCount,
      distribution,
      recent_completions: recentCompletions,
    },
  });
}

export default cors(handler);
