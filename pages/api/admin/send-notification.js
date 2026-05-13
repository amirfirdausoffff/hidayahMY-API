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

  const { title, body, topic } = req.body;

  if (!title || !body) {
    return res.status(400).json({ success: false, error: 'title and body are required' });
  }

  const fcmTopic = topic || 'general';

  // Send via FCM topic
  const message = {
    notification: { title, body },
    data: { type: 'announcement', topic: fcmTopic },
    topic: fcmTopic,
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
    const response = await messaging.send(message);

    // Save notification to history
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
