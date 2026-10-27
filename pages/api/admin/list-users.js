import { supabase, supabaseAdmin, listAllUsers } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !requestingUser) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  if (requestingUser.app_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { role } = req.query;

  const { users, error } = await listAllUsers();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  let filtered = users;

  if (role) {
    filtered = users.filter((u) => {
      const authoritativeRole = u.app_metadata?.role === 'admin' ? 'admin' : 'customer';
      return authoritativeRole === role;
    });
  }

  // A user can have more than one signed-in device. The FCM token records the
  // platform reported by the mobile app, which is more reliable than the auth
  // provider (Apple and Google sign-in can both be used on either platform).
  const userIds = filtered.map((u) => u.id);
  let tokens = [];

  if (userIds.length > 0) {
    const { data, error: tokensError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('user_id, platform')
      .in('user_id', userIds);

    if (tokensError) {
      return res.status(500).json({ success: false, error: tokensError.message });
    }

    tokens = data || [];
  }

  const platformsByUser = tokens.reduce((platforms, token) => {
    const platform = (token.platform || '').trim().toLowerCase();
    if (!['ios', 'android'].includes(platform)) return platforms;

    if (!platforms[token.user_id]) platforms[token.user_id] = new Set();
    platforms[token.user_id].add(platform);
    return platforms;
  }, {});

  const result = filtered.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name || '',
    role: u.app_metadata?.role === 'admin' ? 'admin' : 'customer',
    provider: u.app_metadata?.provider || '',
    created_at: u.created_at,
    avatar_url: u.user_metadata?.avatar_url || '',
    platforms: [...(platformsByUser[u.id] || [])],
  }));

  return res.status(200).json({
    success: true,
    users: result,
  });
}

export default cors(handler);
