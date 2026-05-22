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

  const { data, error } = await supabaseAdmin
    .from('khatam_progress')
    .select('id, start_date, target_date, completed_surahs, is_completed, completed_at, status, created_at')
    .eq('user_id', user.id)
    .in('status', ['completed', 'abandoned'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const history = data.map((k) => {
    const completedCount = Object.values(k.completed_surahs || {}).filter(Boolean).length;
    const progressPercent = Math.round((completedCount / 114) * 1000) / 10;

    // Calculate duration in days
    const start = new Date(k.start_date + 'T00:00:00');
    const end = k.completed_at ? new Date(k.completed_at) : new Date(k.created_at);
    const durationDays = Math.max(1, Math.floor((end - start) / 86400000));

    return {
      id: k.id,
      start_date: k.start_date,
      target_date: k.target_date,
      completed_count: completedCount,
      progress_percent: progressPercent,
      is_completed: k.is_completed,
      completed_at: k.completed_at,
      status: k.status,
      duration_days: durationDays,
    };
  });

  return res.status(200).json({ success: true, history });
}

export default cors(handler);
