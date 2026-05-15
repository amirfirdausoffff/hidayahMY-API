import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { isValidDate } from '../../../src/lib/validate';

const VALID_PRAYERS = ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'];

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Fast JWT decode — avoid network call to Supabase Auth for every request
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // GET - Get prayer check-ins by date or date range
  if (req.method === 'GET') {
    const { date, date_from, date_to } = req.query;

    // Single date query
    if (date) {
      const { data, error } = await supabaseAdmin
        .from('prayer_checkins')
        .select('prayer, status')
        .eq('user_id', user.id)
        .eq('date', date);

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      const prayers = {};
      for (const row of data) {
        prayers[row.prayer] = row.status;
      }

      return res.status(200).json({ success: true, date, prayers });
    }

    // Date range query
    if (date_from && date_to) {
      const { data, error } = await supabaseAdmin
        .from('prayer_checkins')
        .select('date, prayer, status')
        .eq('user_id', user.id)
        .gte('date', date_from)
        .lte('date', date_to)
        .order('date', { ascending: true });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      const grouped = {};
      for (const row of data) {
        if (!grouped[row.date]) grouped[row.date] = {};
        grouped[row.date][row.prayer] = row.status;
      }

      return res.status(200).json({ success: true, date_from, date_to, checkins: grouped });
    }

    return res.status(400).json({ success: false, error: 'Provide date or date_from & date_to query params' });
  }

  // POST - Upsert a prayer check-in
  if (req.method === 'POST') {
    const { date, prayer, status } = req.body;

    if (!date || !isValidDate(date)) {
      return res.status(400).json({ success: false, error: 'date is required (YYYY-MM-DD)' });
    }

    if (!prayer || !VALID_PRAYERS.includes(prayer)) {
      return res.status(400).json({ success: false, error: `prayer must be one of: ${VALID_PRAYERS.join(', ')}` });
    }

    if (status !== 0 && status !== 1) {
      return res.status(400).json({ success: false, error: 'status must be 0 (unchecked) or 1 (checked)' });
    }

    const { data, error } = await supabaseAdmin
      .from('prayer_checkins')
      .upsert(
        {
          user_id: user.id,
          date,
          prayer,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date,prayer' }
      )
      .select('id, date, prayer, status')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, checkin: data });
  }
}

export default cors(handler);
