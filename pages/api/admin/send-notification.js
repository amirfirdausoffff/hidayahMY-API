import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { messaging } from '../../../src/lib/firebase-admin';

async function handler(req, res) {
  if (req.method !== 'POST') {
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

  // Admin check
  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { title, body, data: notifData } = req.body;

  if (!title || !body) {
    return res.status(400).json({ success: false, error: 'title and body are required' });
  }

  // Get all FCM tokens
  const { data: tokens, error: tokenError } = await supabaseAdmin
    .from('fcm_tokens')
    .select('fcm_token');

  if (tokenError) {
    return res.status(400).json({ success: false, error: tokenError.message });
  }

  if (!tokens || tokens.length === 0) {
    return res.status(200).json({ success: true, message: 'No devices to send to', sent: 0, failed: 0 });
  }

  const fcmTokens = tokens.map((t) => t.fcm_token);

  // Send via FCM using sendEachForMulticast
  const message = {
    notification: { title, body },
    data: notifData || {},
    tokens: fcmTokens,
    android: {
      priority: 'high',
      notification: {
        channelId: 'announcements',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };

  try {
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

    // Remove invalid tokens from database
    if (invalidTokens.length > 0) {
      await supabaseAdmin
        .from('fcm_tokens')
        .delete()
        .in('fcm_token', invalidTokens);
    }

    // Save notification to history
    await supabaseAdmin
      .from('notifications')
      .insert({
        title,
        body,
        data: notifData || {},
        sent_by: user.id,
        total_sent: response.successCount,
        total_failed: response.failureCount,
      });

    return res.status(200).json({
      success: true,
      message: 'Notification sent',
      sent: response.successCount,
      failed: response.failureCount,
      cleaned: invalidTokens.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export default cors(handler);
