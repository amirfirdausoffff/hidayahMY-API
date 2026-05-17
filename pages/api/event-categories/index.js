import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { sanitizeString } from '../../../src/lib/validate';

async function handler(req, res) {
  // GET - List all categories (public)
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('event_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, categories: data });
  }

  // POST - Add category (admin only)
  if (req.method === 'POST') {
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

    const { name, name_ms, icon, sort_order } = req.body;

    if (!name || !name_ms) {
      return res.status(400).json({ success: false, error: 'name and name_ms are required' });
    }

    const { data: category, error: insertError } = await supabaseAdmin
      .from('event_categories')
      .insert({
        name: sanitizeString(name, 100),
        name_ms: sanitizeString(name_ms, 100),
        icon: sanitizeString(icon || 'calendar', 50),
        sort_order: parseInt(sort_order) || 0,
      })
      .select()
      .single();

    if (insertError) {
      return res.status(400).json({ success: false, error: insertError.message });
    }

    return res.status(201).json({ success: true, category });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
