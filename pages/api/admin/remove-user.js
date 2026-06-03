import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'DELETE') {
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

  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ success: false, error: 'user_id is required' });
  }

  if (user_id === requestingUser.id) {
    return res.status(400).json({ success: false, error: 'You cannot delete yourself' });
  }

  // Only allow removing admin users via this endpoint (Team page)
  // For customers, use /api/admin/delete-customer which cleans up all data
  const { data: { user: targetUser }, error: targetError } = await supabaseAdmin.auth.admin.getUserById(user_id);
  if (targetError || !targetUser) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  if (targetUser.user_metadata?.role !== 'admin') {
    return res.status(400).json({ success: false, error: 'Use delete-customer endpoint for non-admin users' });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);

  if (error) {
    return res.status(400).json({ success: false, error: 'Failed to delete user' });
  }

  return res.status(200).json({
    success: true,
    message: 'Admin user removed successfully',
  });
}

export default cors(handler);
