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

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { title, body, topic, user_id } = req.body;

  if (!title || !body) {
    return res.status(400).json({ success: false, error: 'title and body are required' });
  }

  const fcmTopic = topic || 'general';

  try {
    // Mode: send to specific user by user_id
    if (user_id) {
      const { data: tokens, error: tokenError } = await supabaseAdmin
        .from('fcm_tokens')
        .select('fcm_token')
        .eq('user_id', user_id);

      if (tokenError) {
        return res.status(400).json({ success: false, error: tokenError.message });
      }

      if (!tokens || tokens.length === 0) {
        return res.status(200).json({ success: false, error: 'No devices found for this user' });
      }

      const fcmTokens = tokens.map((t) => t.fcm_token);

      const message = {
        notification: { title, body },
        data: { type: 'announcement', topic: fcmTopic },
        tokens: fcmTokens,
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

      // Save to history
      await supabaseAdmin
        .from('notifications')
        .insert({
          title,
          body,
          topic: fcmTopic,
          sent_by: user.id,
          target_user_id: user_id,
          data: { type: 'announcement', topic: fcmTopic, target: 'user' },
        });

      return res.status(200).json({
        success: true,
        message: 'Notification sent to user',
        sent: response.successCount,
        failed: response.failureCount,
        topic: fcmTopic,
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
        payload: { aps: { sound: 'default', badge: 1 } },
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
    return res.status(500).json({ success: false, error: error.message });
  }
}

export default cors(handler);
