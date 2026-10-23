import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

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

    // Upsert: same token updates, new token inserts
    const { data, error } = await supabaseAdmin
      .from('fcm_tokens')
      .upsert(
        {
          user_id: user.id,
          fcm_token,
          platform: platform || 'unknown',
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
