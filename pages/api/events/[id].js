import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { sanitizeString } from '../../../src/lib/validate';
import { messaging } from '../../../src/lib/firebase-admin';

async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Event ID is required' });
  }

  // GET - Get single event by ID (public)
  if (req.method === 'GET') {
    const { data: event, error } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Get response counts
    const { data: responses } = await supabaseAdmin
      .from('event_responses')
      .select('response')
      .eq('event_id', id);

    const counts = { interested: 0, going: 0, attended: 0, reported: 0 };
    if (responses) {
      for (const r of responses) {
        if (counts[r.response] !== undefined) {
          counts[r.response]++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      event: { ...event, response_counts: counts },
    });
  }

  // PUT - Update event (auth, owner or admin)
  if (req.method === 'PUT') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing authorization' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    // Fetch existing event
    const { data: event, error: fetchError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const isAdmin = user.user_metadata?.role === 'admin';
    const isOwner = event.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, error: 'You can only update your own events' });
    }

    const {
      title, description, event_type, location_name, latitude, longitude,
      start_date, end_date, is_recurring, recurrence_rule, audience,
      tags, category_id, status, rejection_reason,
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };

    if (title !== undefined) updateData.title = sanitizeString(title, 200);
    if (description !== undefined) updateData.description = sanitizeString(description, 2000);
    if (event_type !== undefined) updateData.event_type = sanitizeString(event_type, 50);
    if (location_name !== undefined) updateData.location_name = sanitizeString(location_name, 300);
    if (latitude !== undefined) updateData.latitude = parseFloat(latitude);
    if (longitude !== undefined) updateData.longitude = parseFloat(longitude);
    if (start_date !== undefined) updateData.start_date = new Date(start_date).toISOString();
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date).toISOString() : null;
    if (is_recurring !== undefined) updateData.is_recurring = is_recurring;
    if (recurrence_rule !== undefined) updateData.recurrence_rule = recurrence_rule ? sanitizeString(recurrence_rule, 100) : null;
    if (audience !== undefined) updateData.audience = sanitizeString(audience, 50);
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.map(t => sanitizeString(t, 50)) : [];
    if (category_id !== undefined) updateData.category_id = category_id || null;

    // Only admin can change status and rejection_reason
    if (isAdmin) {
      if (status !== undefined) updateData.status = status;
      if (rejection_reason !== undefined) updateData.rejection_reason = sanitizeString(rejection_reason, 500);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, error: updateError.message });
    }

    // Send notifications when admin changes event status
    if (isAdmin && status && (status === 'approved' || status === 'rejected') && event.user_id) {
      try {
        const isApproved = status === 'approved';

        // 1. Notify creator (bilingual)
        const creatorTitleEn = isApproved ? 'Event Approved' : 'Event Rejected';
        const creatorTitleBm = isApproved ? 'Acara Diluluskan' : 'Acara Ditolak';
        const creatorBodyEn = isApproved
          ? `Your event "${event.title}" has been approved.`
          : `Your event "${event.title}" was rejected. Reason: ${rejection_reason || 'No reason provided'}`;
        const creatorBodyBm = isApproved
          ? `Acara anda "${event.title}" telah diluluskan.`
          : `Acara anda "${event.title}" telah ditolak. Sebab: ${rejection_reason || 'Tiada sebab diberikan'}`;

        const { data: tokens } = await supabaseAdmin
          .from('fcm_tokens')
          .select('fcm_token')
          .eq('user_id', event.user_id);

        if (tokens && tokens.length > 0) {
          const fcmTokens = tokens.map((t) => t.fcm_token);
          const fcmResponse = await messaging.sendEachForMulticast({
            notification: { title: creatorTitleEn, body: creatorBodyEn },
            data: {
              type: 'event_status',
              event_id: id,
              status,
              title_en: creatorTitleEn,
              title_bm: creatorTitleBm,
              body_en: creatorBodyEn,
              body_bm: creatorBodyBm,
            },
            tokens: fcmTokens,
            android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
            apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } },
          });

          const invalidTokens = [];
          fcmResponse.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const code = resp.error?.code;
              if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
                invalidTokens.push(fcmTokens[idx]);
              }
            }
          });
          if (invalidTokens.length > 0) {
            await supabaseAdmin.from('fcm_tokens').delete().in('fcm_token', invalidTokens);
          }
        }

        // Save creator notification
        await supabaseAdmin.from('notifications').insert({
          title: creatorTitleEn,
          body: creatorBodyEn,
          topic: 'general',
          sent_by: user.id,
          target_user_id: event.user_id,
          data: {
            type: 'event_status',
            event_id: id,
            status,
            title_en: creatorTitleEn,
            title_bm: creatorTitleBm,
            body_en: creatorBodyEn,
            body_bm: creatorBodyBm,
          },
        });

        // 2. Broadcast to all users if approved (new event announcement)
        if (isApproved) {
          const broadcastTitleEn = 'New Event';
          const broadcastTitleBm = 'Acara Baharu';
          const broadcastBodyEn = `"${event.title}" at ${event.location_name}`;
          const broadcastBodyBm = `"${event.title}" di ${event.location_name}`;

          await messaging.send({
            notification: { title: broadcastTitleEn, body: broadcastBodyEn },
            data: {
              type: 'new_event',
              event_id: id,
              title_en: broadcastTitleEn,
              title_bm: broadcastTitleBm,
              body_en: broadcastBodyEn,
              body_bm: broadcastBodyBm,
            },
            topic: 'general',
            android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
            apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } },
          });

          await supabaseAdmin.from('notifications').insert({
            title: broadcastTitleEn,
            body: broadcastBodyEn,
            topic: 'general',
            sent_by: user.id,
            data: {
              type: 'new_event',
              event_id: id,
              title_en: broadcastTitleEn,
              title_bm: broadcastTitleBm,
              body_en: broadcastBodyEn,
              body_bm: broadcastBodyBm,
            },
          });
        }
      } catch (notifError) {
        console.error('[event-notification] Error:', notifError.message);
      }
    }

    return res.status(200).json({ success: true, event: updated });
  }

  // DELETE - Delete event (auth, owner or admin)
  if (req.method === 'DELETE') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing authorization' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    // Fetch existing event
    const { data: event, error: fetchError } = await supabaseAdmin
      .from('events')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const isAdmin = user.user_metadata?.role === 'admin';
    const isOwner = event.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, error: 'You can only delete your own events' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return res.status(400).json({ success: false, error: deleteError.message });
    }

    return res.status(200).json({ success: true, message: 'Event deleted' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
