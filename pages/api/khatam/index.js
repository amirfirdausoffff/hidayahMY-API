import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { isValidDate } from '../../../src/lib/validate';

async function handler(req, res) {
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
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

  // GET - Get user's active khatam with computed stats
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('khatam_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!data) {
      return res.status(200).json({ success: true, khatam: null });
    }

    // Compute progress stats
    const completedSurahs = data.completed_surahs || {};
    const completedCount = Object.values(completedSurahs).filter(Boolean).length;
    const totalSurahs = 114;
    const progressPercent = Math.round((completedCount / totalSurahs) * 1000) / 10;

    const now = new Date();
    const startDate = new Date(data.start_date + 'T00:00:00');
    const targetDate = new Date(data.target_date + 'T00:00:00');
    const daysElapsed = Math.max(0, Math.floor((now - startDate) / 86400000));
    const daysRemaining = Math.max(0, Math.ceil((targetDate - now) / 86400000));
    const totalDays = Math.max(1, Math.floor((targetDate - startDate) / 86400000));

    // Calculate expected progress to determine if on track
    const expectedProgress = Math.min(100, (daysElapsed / totalDays) * 100);
    const isOnTrack = progressPercent >= expectedProgress * 0.8; // 80% threshold

    // Daily surahs needed to finish on time
    const surahsRemaining = totalSurahs - completedCount;
    const dailySurahsNeeded = daysRemaining > 0 ? Math.round((surahsRemaining / daysRemaining) * 10) / 10 : surahsRemaining;

    return res.status(200).json({
      success: true,
      khatam: {
        id: data.id,
        start_date: data.start_date,
        target_date: data.target_date,
        completed_surahs: completedSurahs,
        total_surahs: totalSurahs,
        completed_count: completedCount,
        progress_percent: progressPercent,
        days_elapsed: daysElapsed,
        days_remaining: daysRemaining,
        daily_surahs_needed: dailySurahsNeeded,
        is_on_track: isOnTrack,
        is_completed: data.is_completed,
        status: data.status,
        created_at: data.created_at,
      },
    });
  }

  // POST - Create a new khatam
  if (req.method === 'POST') {
    const { target_date } = req.body;

    if (!target_date || !isValidDate(target_date)) {
      return res.status(400).json({ success: false, error: 'target_date is required (YYYY-MM-DD)' });
    }

    // Target date must be in the future
    const target = new Date(target_date + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (target <= now) {
      return res.status(400).json({ success: false, error: 'target_date must be in the future' });
    }

    // Check for existing active khatam
    const { data: existing } = await supabaseAdmin
      .from('khatam_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, error: 'You already have an active khatam. Abandon or complete it first.' });
    }

    const today = now.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('khatam_progress')
      .insert({
        user_id: user.id,
        start_date: today,
        target_date,
        completed_surahs: {},
        is_completed: false,
        status: 'active',
      })
      .select('id, start_date, target_date, status')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(201).json({ success: true, khatam: data });
  }

  // PUT - Update target date or abandon khatam
  if (req.method === 'PUT') {
    const { target_date, status } = req.body;

    // Get active khatam
    const { data: active, error: findError } = await supabaseAdmin
      .from('khatam_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (findError || !active) {
      return res.status(404).json({ success: false, error: 'No active khatam found' });
    }

    const updates = { updated_at: new Date().toISOString() };

    if (target_date) {
      if (!isValidDate(target_date)) {
        return res.status(400).json({ success: false, error: 'Invalid target_date format (YYYY-MM-DD)' });
      }
      updates.target_date = target_date;
    }

    if (status === 'abandoned') {
      updates.status = 'abandoned';
    }

    const { data, error } = await supabaseAdmin
      .from('khatam_progress')
      .update(updates)
      .eq('id', active.id)
      .select('id, start_date, target_date, status')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, khatam: data });
  }
}

export default cors(handler);
