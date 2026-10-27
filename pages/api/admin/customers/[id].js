import { supabase, supabaseAdmin } from '../../../../src/lib/supabase';
import { cors } from '../../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const { data: { user: requestingUser }, error: authError } =
    await supabase.auth.getUser(token);
  if (authError || !requestingUser) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  if (requestingUser.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const userId = String(req.query.id || '');
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }

  const customer = data.user;
  if (customer.user_metadata?.role === 'admin') {
    return res.status(403).json({ success: false, error: 'Customer profile only' });
  }

  const { data: deviceTokens, error: devicesError } = await supabaseAdmin
    .from('fcm_tokens')
    .select('platform')
    .eq('user_id', customer.id);
  if (devicesError) {
    return res.status(500).json({ success: false, error: devicesError.message });
  }

  const platforms = [...new Set(
    (deviceTokens || [])
      .map((item) => (item.platform || '').trim().toLowerCase())
      .filter((platform) => ['ios', 'android'].includes(platform)),
  )];
  const metadata = customer.user_metadata || {};

  return res.status(200).json({
    success: true,
    customer: {
      id: customer.id,
      name: metadata.name || metadata.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      gender: ['male', 'female'].includes(metadata.gender) ? metadata.gender : null,
      date_of_birth: metadata.date_of_birth || null,
      avatar_url:
        metadata.custom_avatar && metadata.custom_avatar !== 'removed'
          ? metadata.custom_avatar
          : metadata.avatar_url || '',
      provider: customer.app_metadata?.provider || 'email',
      providers: customer.app_metadata?.providers || [],
      platforms,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
      last_sign_in_at: customer.last_sign_in_at,
      email_confirmed_at: customer.email_confirmed_at,
      phone_confirmed_at: customer.phone_confirmed_at,
    },
  });
}

export default cors(handler);
