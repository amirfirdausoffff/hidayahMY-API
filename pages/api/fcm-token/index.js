import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { messaging } from '../../../src/lib/firebase-admin';
import { OS_TOPICS } from '../../../src/lib/os-notification-topics';

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
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

  // POST - Register or update FCM token
  if (req.method === 'POST') {
    const { fcm_token, platform } = req.body;

    if (!fcm_token) {
      return res.status(400).json({ success: false, error: 'fcm_token is required' });
    }

    // Preserve the platform reported by older app versions that omit it on re-registration.
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('fcm_tokens').select('platform').eq('fcm_token', fcm_token).maybeSingle();
    if (lookupError) return res.status(400).json({ success: false, error: lookupError.message });
    const reportedPlatform = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
    const previousPlatform = typeof existing?.platform === 'string' ? existing.platform.trim().toLowerCase() : '';
    const knownPlatform = OS_TOPICS[reportedPlatform]
      ? reportedPlatform
      : OS_TOPICS[previousPlatform] ? previousPlatform : 'unknown';

    // New/changed tokens join the OS topic before they become visible in the
    // database. This closes the gap between backfill completion and topic sends.
    if (OS_TOPICS[knownPlatform] && previousPlatform !== knownPlatform) {
      try {
        const result = await messaging.subscribeToTopic(fcm_token, OS_TOPICS[knownPlatform]);
        if (result.failureCount > 0) throw result.errors?.[0]?.error || new Error('Topic subscription failed');
        if (OS_TOPICS[previousPlatform]) {
          const removed = await messaging.unsubscribeFromTopic(fcm_token, OS_TOPICS[previousPlatform]);
          if (removed.failureCount > 0) throw removed.errors?.[0]?.error || new Error('Old topic removal failed');
        }
      } catch (error) {
        console.error('[fcm-token] OS topic registration failed:', error.message);
        return res.status(503).json({ success: false, error: 'Device registration temporarily unavailable' });
      }
    }

    // Upsert: same token updates, new token inserts
    const { data, error } = await supabaseAdmin
      .from('fcm_tokens')
      .upsert(
        {
          user_id: user.id,
          fcm_token,
          platform: knownPlatform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fcm_token' }
      )
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, message: 'Token registered', token: data });
  }

  // DELETE - Remove FCM token (on logout)
  if (req.method === 'DELETE') {
    const { fcm_token } = req.body;

    if (!fcm_token) {
      return res.status(400).json({ success: false, error: 'fcm_token is required' });
    }

    const { error } = await supabaseAdmin
      .from('fcm_tokens')
      .delete()
      .eq('fcm_token', fcm_token)
      .eq('user_id', user.id);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, message: 'Token removed' });
  }
}

export default cors(handler);
