import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
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

  if (requestingUser.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { role } = req.query;

  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  let filtered = users;

  if (role) {
    filtered = users.filter((u) => u.user_metadata?.role === role);
  }

  const result = filtered.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name || '',
    role: u.user_metadata?.role || '',
    created_at: u.created_at,
    avatar_url: u.user_metadata?.avatar_url || '',
  }));

  return res.status(200).json({
    success: true,
    users: result,
  });
}

export default cors(handler);
