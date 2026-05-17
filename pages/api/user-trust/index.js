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

  // Get or create trust score
  let { data: trust } = await supabaseAdmin
    .from('user_trust_scores')
    .select('score, level, updated_at')
    .eq('user_id', user.id)
    .single();

  if (!trust) {
    const { data: newTrust } = await supabaseAdmin
      .from('user_trust_scores')
      .upsert({ user_id: user.id, score: 10, level: 'new' }, { onConflict: 'user_id' })
      .select()
      .single();
    trust = newTrust || { score: 10, level: 'new' };
  }

  // Calculate daily events remaining
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { count: todayCount } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString())
    .lte('created_at', todayEnd.toISOString());

  const dailyEventsRemaining = Math.max(0, 3 - (todayCount || 0));

  // Determine level from score
  let level = 'new';
  if (trust.score < 0) level = 'banned';
  else if (trust.score <= 20) level = 'new';
  else if (trust.score <= 50) level = 'trusted';
  else level = 'verified';

  return res.status(200).json({
    success: true,
    score: trust.score,
    level,
    daily_events_remaining: dailyEventsRemaining,
  });
}

export default cors(handler);
