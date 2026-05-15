import { supabase } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'PUT') {
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

  // Only email users can change password
  const provider = user.app_metadata?.provider || 'email';
  if (provider !== 'email') {
    return res.status(400).json({
      success: false,
      error: 'Password change not available for SSO accounts',
    });
  }

  const { new_password } = req.body;

  if (!new_password || new_password.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters',
    });
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: new_password,
  });

  if (error) {
    console.error('[password] Update error:', error.message);
    return res.status(400).json({ success: false, error: 'Failed to update password' });
  }

  return res.status(200).json({
    success: true,
    message: 'Password updated successfully',
  });
}

export default cors(handler);
