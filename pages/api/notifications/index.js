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

  // Get notifications (latest 50)
  // Show general notifications (no target) + notifications targeted to this user
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, title, body, topic, created_at')
    .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  return res.status(200).json({ success: true, notifications: data });
}

export default cors(handler);
