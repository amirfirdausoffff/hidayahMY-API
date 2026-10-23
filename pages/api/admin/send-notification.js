import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { messaging } from '../../../src/lib/firebase-admin';
import { sanitizeString } from '../../../src/lib/validate';

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

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const rawTitle = req.body.title;
  const rawBody = req.body.body;
  const { topic, user_id } = req.body;
  const platform = req.body.platform || 'all';

  if (!['all', 'android', 'ios'].includes(platform)) {
    return res.status(400).json({ success: false, error: 'Invalid platform' });
  }

  if (!rawTitle || !rawBody) {
    return res.status(400).json({ success: false, error: 'title and body are required' });
  }

  const title = sanitizeString(rawTitle, 200);
  const body = sanitizeString(rawBody, 1000);
  const fcmTopic = sanitizeString(topic, 50) || 'general';

  try {
    const notificationData = {
      type: 'announcement',
      topic: fcmTopic,
      ...(platform !== 'all' ? { target_platform: platform } : {}),
    };

    // Mode: send to specific user by user_id
    if (user_id || platform !== 'all') {
      // Platform targeting must use device tokens, not a shared FCM topic.
      // Read all pages before sending so a database error cannot cause a partial broadcast.
      const fcmTokens = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        let query = supabaseAdmin.from('fcm_tokens').select('fcm_token').order('fcm_token').range(offset, offset + pageSize - 1);
        if (user_id) query = query.eq('user_id', user_id);
        if (platform !== 'all') query = query.eq('platform', platform);
        const { data: tokens, error: tokenError } = await query;
        if (tokenError) return res.status(400).json({ success: false, error: tokenError.message });
        fcmTokens.push(...(tokens || []).map((item) => item.fcm_token));
        if (!tokens || tokens.length < pageSize) break;
      }

      if (fcmTokens.length === 0) {
        return res.status(200).json({ success: false, error: 'No registered devices found for this target' });
      }

      let sent = 0;
      let failed = 0;
      const invalidTokens = [];
      for (let start = 0; start < fcmTokens.length; start += 500) {
        const batch = fcmTokens.slice(start, start + 500);
        const response = await messaging.sendEachForMulticast({
          notification: { title, body },
          data: notificationData,
          tokens: batch,
          android: {
            priority: 'high',
            notification: { channelId: 'announcements', sound: 'default' },
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } },
          },
        });
        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((result, index) => {
          if (['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(result.error?.code)) {
            invalidTokens.push(batch[index]);
          }
        });
      }

      for (let start = 0; start < invalidTokens.length; start += 500) {
        await supabaseAdmin.from('fcm_tokens').delete().in('fcm_token', invalidTokens.slice(start, start + 500));
      }

      if (sent === 0) {
        return res.status(200).json({ success: false, error: 'No notification was delivered', sent, failed });
      }

      const { error: historyError } = await supabaseAdmin.from('notifications').insert({
        title,
        body,
        topic: fcmTopic,
        sent_by: user.id,
        total_sent: sent,
        total_failed: failed,
        ...(user_id ? { target_user_id: user_id } : {}),
        data: { ...notificationData, ...(user_id ? { target: 'user' } : {}) },
      });
      if (historyError) console.error('[send-notification] History save failed:', historyError.message);

      return res.status(200).json({
        success: true,
        message: user_id ? 'Notification sent to user' : `Notification sent to ${platform} devices`,
        sent,
        failed,
        topic: fcmTopic,
        platform,
        ...(historyError ? { warning: 'Push sent, but notification history could not be saved' } : {}),
      });
    }

    // Mode: send to topic (all subscribers)
    const message = {
      notification: { title, body },
      data: { type: 'announcement', topic: fcmTopic },
      topic: fcmTopic,
      android: {
        priority: 'high',
        notification: { channelId: 'announcements', sound: 'default' },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } },
      },
    };

    const response = await messaging.send(message);

    await supabaseAdmin
      .from('notifications')
      .insert({
        title,
        body,
        topic: fcmTopic,
        sent_by: user.id,
        data: { type: 'announcement', topic: fcmTopic },
      });

    return res.status(200).json({
      success: true,
      message: `Notification sent to topic: ${fcmTopic}`,
      messageId: response,
      topic: fcmTopic,
    });
  } catch (error) {
    console.error('[send-notification] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to send notification' });
  }
}

export default cors(handler);
