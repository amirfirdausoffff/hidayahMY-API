import { supabase } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    // Set session to invalidate
    await supabase.auth.admin?.signOut?.(token).catch(() => {});
  }

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}

export default cors(handler);
