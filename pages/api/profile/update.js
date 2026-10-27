import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
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

  const { name, avatar_url, gender } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (gender !== undefined) {
    if (!['male', 'female'].includes(gender)) {
      return res.status(400).json({
        success: false,
        error: 'Gender must be either male or female',
      });
    }
    updates.gender = gender;
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, ...updates },
  });

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  return res.status(200).json({
    success: true,
    message: 'Profile updated',
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || '',
      avatar_url: data.user.user_metadata?.avatar_url || '',
      gender: data.user.user_metadata?.gender || null,
    },
  });
}

export default cors(handler);
