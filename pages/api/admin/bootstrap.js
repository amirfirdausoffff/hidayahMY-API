import { supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { secret, email, password, action } = req.body;

  if (secret !== 'hidayahmy-bootstrap-2026') {
    return res.status(403).json({ success: false, error: 'Invalid secret' });
  }

  // Action: set-role — set an existing user as admin
  if (action === 'set-role') {
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const user = listData?.users?.find(u => u.email === email);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: 'admin' },
    });

    if (error) return res.status(400).json({ success: false, error: error.message });

    return res.status(200).json({ success: true, message: `${email} is now admin` });
  }

  // Action: create — create a new admin user
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'Admin', role: 'admin' },
  });

  if (error) return res.status(400).json({ success: false, error: error.message });

  return res.status(201).json({
    success: true,
    message: 'Admin created',
    user: { email: data.user.email, role: 'admin' },
  });
}

export default cors(handler);
