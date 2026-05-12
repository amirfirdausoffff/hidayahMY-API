import { supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { secret } = req.body;

  // One-time secret to create first admin
  if (secret !== 'hidayahmy-bootstrap-2026') {
    return res.status(403).json({ success: false, error: 'Invalid secret' });
  }

  // Check if any admin already exists
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
  const existingAdmin = listData?.users?.find(u => u.user_metadata?.role === 'admin');

  if (existingAdmin) {
    return res.status(400).json({ success: false, error: 'Admin already exists. Use the admin portal to add more.' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: 'admin@hidayahmy.com',
    password: 'password',
    email_confirm: true,
    user_metadata: { name: 'Admin', role: 'admin' },
  });

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  return res.status(201).json({
    success: true,
    message: 'First admin created',
    user: {
      email: data.user.email,
      role: 'admin',
    },
  });
}

export default cors(handler);
