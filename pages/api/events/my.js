import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'GET') {
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

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  // Get response counts for each event
  const eventIds = (events || []).map(e => e.id);
  let responseCounts = {};

  if (eventIds.length > 0) {
    const { data: responses } = await supabaseAdmin
      .from('event_responses')
      .select('event_id, response')
      .in('event_id', eventIds);

    if (responses) {
      for (const r of responses) {
        if (!responseCounts[r.event_id]) {
          responseCounts[r.event_id] = { interested: 0, going: 0, attended: 0, reported: 0 };
        }
        if (responseCounts[r.event_id][r.response] !== undefined) {
          responseCounts[r.event_id][r.response]++;
        }
      }
    }
  }

  const eventsWithCounts = (events || []).map(event => ({
    ...event,
    interested_count: responseCounts[event.id]?.interested || 0,
    going_count: responseCounts[event.id]?.going || 0,
    attended_count: responseCounts[event.id]?.attended || 0,
  }));

  return res.status(200).json({ success: true, events: eventsWithCounts });
}

export default cors(handler);
