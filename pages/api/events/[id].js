import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { sanitizeString } from '../../../src/lib/validate';

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
