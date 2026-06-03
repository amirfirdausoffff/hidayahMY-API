import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
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

  // GET - List user's hafazan entries
  if (req.method === 'GET') {
    const { status, due } = req.query;

    let query = supabaseAdmin
      .from('hafazan_entries')
      .select('*')
      .eq('user_id', user.id);

    if (status && ['memorizing', 'memorized'].includes(status)) {
      query = query.eq('status', status);
    }

    if (due === 'true') {
      const now = new Date().toISOString();
      query = query.or(`next_review_at.lte.${now},next_review_at.is.null`);
    }

    query = query
      .order('next_review_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      entries: data,
      total: data.length,
    });
  }

  // POST - Create new hafazan entry
  if (req.method === 'POST') {
    const { surah_number, start_ayah, end_ayah } = req.body;

    // Validate inputs
    if (!surah_number || !start_ayah || !end_ayah) {
      return res.status(400).json({ success: false, error: 'surah_number, start_ayah, and end_ayah are required' });
    }

    if (surah_number < 1 || surah_number > 114) {
      return res.status(400).json({ success: false, error: 'surah_number must be between 1 and 114' });
    }

    if (start_ayah < 1) {
      return res.status(400).json({ success: false, error: 'start_ayah must be at least 1' });
    }

    if (end_ayah < start_ayah) {
      return res.status(400).json({ success: false, error: 'end_ayah must be greater than or equal to start_ayah' });
    }

    // Check for overlapping entries
    const { data: overlapping, error: overlapError } = await supabaseAdmin
      .from('hafazan_entries')
      .select('id, start_ayah, end_ayah')
      .eq('user_id', user.id)
      .eq('surah_number', surah_number)
      .lte('start_ayah', end_ayah)
      .gte('end_ayah', start_ayah);

    if (overlapError) {
      return res.status(400).json({ success: false, error: overlapError.message });
    }

    if (overlapping && overlapping.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Overlapping hafazan entry exists for this surah and ayah range',
      });
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('hafazan_entries')
      .insert({
        user_id: user.id,
        surah_number,
        start_ayah,
        end_ayah,
        status: 'memorizing',
        strength: 'weak',
        review_count: 0,
        next_review_at: now,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(201).json({ success: true, entry: data });
  }
}

export default cors(handler);
