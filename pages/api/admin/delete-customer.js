import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'DELETE') {
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

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { user_id, admin_password } = req.body;

  if (!user_id) {
    return res.status(400).json({ success: false, error: 'user_id is required' });
  }

  if (!admin_password) {
    return res.status(400).json({ success: false, error: 'Admin password is required for confirmation' });
  }

  // Verify admin password by signing in
  const { error: passwordError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: admin_password,
  });

  if (passwordError) {
    return res.status(403).json({ success: false, error: 'Incorrect admin password' });
  }

  // Prevent deleting yourself
  if (user_id === user.id) {
    return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
  }

  // Verify target user exists
  const { data: { user: targetUser }, error: targetError } = await supabaseAdmin.auth.admin.getUserById(user_id);
  if (targetError || !targetUser) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Prevent deleting other admins
  if (targetUser.user_metadata?.role === 'admin') {
    return res.status(403).json({ success: false, error: 'Cannot delete admin accounts from here' });
  }

  const errors = [];

  try {
    // Delete all user data (same as delete-account.js)

    // 1. Delete hafazan reviews & entries
    const { data: hafazanEntries } = await supabaseAdmin
      .from('hafazan_entries')
      .select('id')
      .eq('user_id', user_id);
    if (hafazanEntries && hafazanEntries.length > 0) {
      const entryIds = hafazanEntries.map(e => e.id);
      const { error: hr } = await supabaseAdmin
        .from('hafazan_reviews')
        .delete()
        .in('entry_id', entryIds);
      if (hr) errors.push(`hafazan_reviews: ${hr.message}`);
    }
    const { error: he } = await supabaseAdmin
      .from('hafazan_entries')
      .delete()
      .eq('user_id', user_id);
    if (he) errors.push(`hafazan_entries: ${he.message}`);

    // 2. Delete khatam progress
    const { error: kp } = await supabaseAdmin
      .from('khatam_progress')
      .delete()
      .eq('user_id', user_id);
    if (kp) errors.push(`khatam_progress: ${kp.message}`);

    // 3. Delete event responses by this user
    const { error: e1 } = await supabaseAdmin
      .from('event_responses')
      .delete()
      .eq('user_id', user_id);
    if (e1) errors.push(`event_responses: ${e1.message}`);

    // 4. Get user's events and clean up
    const { data: userEvents } = await supabaseAdmin
      .from('events')
      .select('id, image_urls')
      .eq('user_id', user_id);

    if (userEvents && userEvents.length > 0) {
      const eventIds = userEvents.map(e => e.id);
      await supabaseAdmin.from('event_responses').delete().in('event_id', eventIds);

      const imagePaths = userEvents
        .filter(e => e.image_urls && e.image_urls.length > 0)
        .flatMap(e => e.image_urls)
        .map(url => {
          const match = url.match(/event-images\/(.+?)(\?|$)/);
          return match ? match[1] : null;
        })
        .filter(Boolean);

      if (imagePaths.length > 0) {
        await supabaseAdmin.storage.from('event-images').remove(imagePaths);
      }

      const { error: e2 } = await supabaseAdmin.from('events').delete().eq('user_id', user_id);
      if (e2) errors.push(`events: ${e2.message}`);
    }

    // 5. Delete prayer check-ins
    const { error: e3 } = await supabaseAdmin.from('prayer_checkins').delete().eq('user_id', user_id);
    if (e3) errors.push(`prayer_checkins: ${e3.message}`);

    // 6. Delete bookmarks
    const { error: e4 } = await supabaseAdmin.from('bookmarks').delete().eq('user_id', user_id);
    if (e4) errors.push(`bookmarks: ${e4.message}`);

    // 7. Delete notes
    const { error: e5 } = await supabaseAdmin.from('notes').delete().eq('user_id', user_id);
    if (e5) errors.push(`notes: ${e5.message}`);

    // 8. Delete FCM tokens
    const { error: e6 } = await supabaseAdmin.from('fcm_tokens').delete().eq('user_id', user_id);
    if (e6) errors.push(`fcm_tokens: ${e6.message}`);

    // 9. Nullify feedback user_id
    const { error: e7 } = await supabaseAdmin.from('feedback').update({ user_id: null }).eq('user_id', user_id);
    if (e7) errors.push(`feedback: ${e7.message}`);

    // 10. Delete targeted notifications
    const { error: e8 } = await supabaseAdmin.from('notifications').delete().eq('target_user_id', user_id);
    if (e8) errors.push(`notifications: ${e8.message}`);

    // 11. Nullify sent_by
    const { error: e9 } = await supabaseAdmin.from('notifications').update({ sent_by: null }).eq('sent_by', user_id);
    if (e9) errors.push(`notifications (sent_by): ${e9.message}`);

    // 12. Delete user trust score
    const { error: e10 } = await supabaseAdmin.from('user_trust_scores').delete().eq('user_id', user_id);
    if (e10) errors.push(`user_trust_scores: ${e10.message}`);

    // 13. Delete avatar
    await supabaseAdmin.storage.from('avatars').remove([user_id]);

    // 14. Finally delete the auth user
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteUserError) {
      console.error('Failed to delete auth user:', deleteUserError.message);
      return res.status(500).json({ success: false, error: 'Failed to delete user account' });
    }

    if (errors.length > 0) {
      console.warn(`Admin deleted user ${user_id} with warnings:`, errors);
    }

    return res.status(200).json({
      success: true,
      message: `User ${targetUser.email} and all associated data deleted.`,
    });

  } catch (err) {
    console.error('Admin delete customer error:', err);
    return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
  }
}

export default cors(handler);
