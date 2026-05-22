import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { messaging } from '../../../src/lib/firebase-admin';

async function handler(req, res) {
  if (req.method !== 'POST') {
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

  const { surah_number, is_read } = req.body;

  if (!surah_number || typeof surah_number !== 'number' || surah_number < 1 || surah_number > 114) {
    return res.status(400).json({ success: false, error: 'surah_number must be between 1 and 114' });
  }

  if (typeof is_read !== 'boolean') {
    return res.status(400).json({ success: false, error: 'is_read must be a boolean' });
  }

  // Get active khatam
  const { data: active, error: findError } = await supabaseAdmin
    .from('khatam_progress')
    .select('id, completed_surahs')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (findError || !active) {
    return res.status(404).json({ success: false, error: 'No active khatam found' });
  }

  // Update completed_surahs
  const completedSurahs = active.completed_surahs || {};
  if (is_read) {
    completedSurahs[String(surah_number)] = true;
  } else {
    delete completedSurahs[String(surah_number)];
  }

  // Check if all 114 surahs are completed
  const completedCount = Object.values(completedSurahs).filter(Boolean).length;
  const isFullyCompleted = completedCount >= 114;

  const updates = {
    completed_surahs: completedSurahs,
    updated_at: new Date().toISOString(),
  };

  if (isFullyCompleted) {
    updates.is_completed = true;
    updates.completed_at = new Date().toISOString();
    updates.status = 'completed';
  }

  const { error: updateError } = await supabaseAdmin
    .from('khatam_progress')
    .update(updates)
    .eq('id', active.id);

  if (updateError) {
    return res.status(400).json({ success: false, error: updateError.message });
  }

  // Send congratulatory push notification on completion
  if (isFullyCompleted) {
    try {
      const { data: tokens } = await supabaseAdmin
        .from('fcm_tokens')
        .select('fcm_token')
        .eq('user_id', user.id);

      if (tokens && tokens.length > 0) {
        const fcmTokens = tokens.map((t) => t.fcm_token);
        await messaging.sendEachForMulticast({
          notification: {
            title: 'Tahniah! Khatam Al-Quran! 🎉',
            body: 'Alhamdulillah, anda telah berjaya khatam Al-Quran. Semoga Allah memberkati usaha anda.',
          },
          data: { type: 'khatam_completed' },
          tokens: fcmTokens,
          android: {
            priority: 'high',
            notification: { channelId: 'announcements', sound: 'default' },
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } },
          },
        });
      }
    } catch (e) {
      console.error('[khatam/mark] FCM notification error:', e.message);
    }
  }

  return res.status(200).json({
    success: true,
    surah_number,
    is_read,
    completed_count: completedCount,
    total_surahs: 114,
    is_completed: isFullyCompleted,
  });
}

export default cors(handler);
