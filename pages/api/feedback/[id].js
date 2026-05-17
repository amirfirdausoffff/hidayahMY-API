import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { messaging } from '../../../src/lib/firebase-admin';

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

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { id } = req.query;

  // Get feedback by id
  const { data: feedback, error: fetchError } = await supabaseAdmin
    .from('feedback')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !feedback) {
    return res.status(404).json({ success: false, error: 'Feedback not found' });
  }

  // Update status to resolved
  const { error: updateError } = await supabaseAdmin
    .from('feedback')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq('id', id);

  if (updateError) {
    return res.status(400).json({ success: false, error: updateError.message });
  }

  // Send push notification if user_id exists
  if (feedback.user_id) {
    try {
      const { data: tokens } = await supabaseAdmin
        .from('fcm_tokens')
        .select('fcm_token')
        .eq('user_id', feedback.user_id);

      if (tokens && tokens.length > 0) {
        const fcmTokens = tokens.map((t) => t.fcm_token);

        const message = {
          tokens: fcmTokens,
          notification: {
            title: 'Feedback Resolved',
            body: `Your feedback about ${feedback.feature} has been resolved. Thank you!`,
          },
          android: {
            priority: 'high',
            notification: { channelId: 'announcements', sound: 'default' },
          },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
        };

        const response = await messaging.sendEachForMulticast(message);

        // Clean up invalid tokens
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error?.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(fcmTokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          await supabaseAdmin
            .from('fcm_tokens')
            .delete()
            .in('fcm_token', invalidTokens);
        }
      }

      // Log to notifications table
      await supabaseAdmin
        .from('notifications')
        .insert({
          title: 'Feedback Resolved',
          body: `Your feedback about ${feedback.feature} has been resolved. Thank you!`,
          topic: 'feedback',
          sent_by: user.id,
          target_user_id: feedback.user_id,
          data: { type: 'feedback', feedback_id: id },
        });
    } catch (error) {
      console.error('[feedback-resolve] FCM error:', error.message);
    }
  }

  return res.status(200).json({ success: true, message: 'Feedback resolved and user notified' });
}

export default cors(handler);
