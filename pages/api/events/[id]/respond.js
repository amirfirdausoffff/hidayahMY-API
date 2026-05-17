import { supabase, supabaseAdmin } from '../../../../src/lib/supabase';
import { cors } from '../../../../src/lib/cors';
import { sanitizeString } from '../../../../src/lib/validate';

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

  const { id } = req.query;
  const { response, report_reason } = req.body;

  if (!response) {
    return res.status(400).json({ success: false, error: 'response is required' });
  }

  const validResponses = ['interested', 'going', 'attended', 'reported'];
  if (!validResponses.includes(response)) {
    return res.status(400).json({
      success: false,
      error: 'response must be one of: interested, going, attended, reported',
    });
  }

  // Verify event exists
  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id, report_count, verified_count, status')
    .eq('id', id)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ success: false, error: 'Event not found' });
  }

  // Upsert the response
  const upsertData = {
    user_id: user.id,
    event_id: id,
    response,
    report_reason: response === 'reported' ? sanitizeString(report_reason || '', 500) : null,
    created_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabaseAdmin
    .from('event_responses')
    .upsert(upsertData, { onConflict: 'user_id,event_id' });

  if (upsertError) {
    return res.status(400).json({ success: false, error: upsertError.message });
  }

  // Handle reported response
  if (response === 'reported') {
    const newReportCount = (event.report_count || 0) + 1;
    const updateData = { report_count: newReportCount };

    if (newReportCount >= 3) {
      updateData.status = 'reported';
    }

    await supabaseAdmin
      .from('events')
      .update(updateData)
      .eq('id', id);
  }

  // Handle attended response
  if (response === 'attended') {
    await supabaseAdmin
      .from('events')
      .update({ verified_count: (event.verified_count || 0) + 1 })
      .eq('id', id);
  }

  // Get updated response counts
  const { data: allResponses } = await supabaseAdmin
    .from('event_responses')
    .select('response')
    .eq('event_id', id);

  const counts = { interested: 0, going: 0, attended: 0, reported: 0 };
  if (allResponses) {
    for (const r of allResponses) {
      if (counts[r.response] !== undefined) {
        counts[r.response]++;
      }
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Response recorded',
    response,
    response_counts: counts,
  });
}

export default cors(handler);
