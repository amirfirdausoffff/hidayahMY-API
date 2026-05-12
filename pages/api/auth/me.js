import { supabase } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid Authorization header. Use: Bearer <access_token>',
    });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  return res.status(200).json({
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || data.user.user_metadata?.full_name || '',
      avatar: data.user.user_metadata?.avatar_url || '',
      provider: data.user.app_metadata?.provider || 'email',
      created_at: data.user.created_at,
    },
  });
}

export default cors(handler);
