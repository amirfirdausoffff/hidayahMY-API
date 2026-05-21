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

  // Verify the user from token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const userId = user.id;
  const errors = [];

  try {
    // 1. Delete event responses by this user
    const { error: e1 } = await supabaseAdmin
      .from('event_responses')
      .delete()
      .eq('user_id', userId);
    if (e1) errors.push(`event_responses: ${e1.message}`);

    // 2. Get user's events (to clean up event images from storage)
    const { data: userEvents } = await supabaseAdmin
      .from('events')
      .select('id, image_urls')
      .eq('user_id', userId);

    if (userEvents && userEvents.length > 0) {
      // Delete event responses by others on user's events
      const eventIds = userEvents.map(e => e.id);
      const { error: e2a } = await supabaseAdmin
        .from('event_responses')
        .delete()
        .in('event_id', eventIds);
      if (e2a) errors.push(`event_responses (on user events): ${e2a.message}`);

      // Delete event images from storage
      const imagePaths = userEvents
        .filter(e => e.image_urls && e.image_urls.length > 0)
        .flatMap(e => e.image_urls)
        .map(url => {
          // Extract storage path from URL
          const match = url.match(/event-images\/(.+?)(\?|$)/);
          return match ? match[1] : null;
        })
        .filter(Boolean);

      if (imagePaths.length > 0) {
        const { error: storageErr } = await supabaseAdmin.storage
          .from('event-images')
          .remove(imagePaths);
        if (storageErr) errors.push(`event-images storage: ${storageErr.message}`);
      }

      // Delete user's events
      const { error: e2b } = await supabaseAdmin
        .from('events')
        .delete()
        .eq('user_id', userId);
      if (e2b) errors.push(`events: ${e2b.message}`);
    }

    // 3. Delete prayer check-ins
    const { error: e3 } = await supabaseAdmin
      .from('prayer_checkins')
      .delete()
      .eq('user_id', userId);
    if (e3) errors.push(`prayer_checkins: ${e3.message}`);

    // 4. Delete bookmarks
    const { error: e4 } = await supabaseAdmin
      .from('bookmarks')
      .delete()
      .eq('user_id', userId);
    if (e4) errors.push(`bookmarks: ${e4.message}`);

    // 5. Delete notes
    const { error: e5 } = await supabaseAdmin
      .from('notes')
      .delete()
      .eq('user_id', userId);
    if (e5) errors.push(`notes: ${e5.message}`);

    // 6. Delete FCM tokens
    const { error: e6 } = await supabaseAdmin
      .from('fcm_tokens')
      .delete()
      .eq('user_id', userId);
    if (e6) errors.push(`fcm_tokens: ${e6.message}`);

    // 7. Nullify user_id in feedback (SET NULL, keep feedback for records)
    const { error: e7 } = await supabaseAdmin
      .from('feedback')
      .update({ user_id: null })
      .eq('user_id', userId);
    if (e7) errors.push(`feedback: ${e7.message}`);

    // 8. Delete notifications targeted to this user
    const { error: e8 } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('target_user_id', userId);
    if (e8) errors.push(`notifications (targeted): ${e8.message}`);

    // 9. Nullify sent_by in notifications sent by this user (keep notification history)
    const { error: e9 } = await supabaseAdmin
      .from('notifications')
      .update({ sent_by: null })
      .eq('sent_by', userId);
    if (e9) errors.push(`notifications (sent_by): ${e9.message}`);

    // 10. Delete user trust score
    const { error: e10 } = await supabaseAdmin
      .from('user_trust_scores')
      .delete()
      .eq('user_id', userId);
    if (e10) errors.push(`user_trust_scores: ${e10.message}`);

    // 11. Delete avatar from storage
    const { error: avatarErr } = await supabaseAdmin.storage
      .from('avatars')
      .remove([userId]);
    if (avatarErr) errors.push(`avatar storage: ${avatarErr.message}`);

    // 12. Finally, delete the auth user
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('Failed to delete auth user:', deleteUserError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete account. Please try again or contact support.',
      });
    }

    if (errors.length > 0) {
      console.warn(`Account ${userId} deleted with partial data cleanup warnings:`, errors);
    }

    return res.status(200).json({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
    });

  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again or contact support.',
    });
  }
}

export default cors(handler);
