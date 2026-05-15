import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  // GET - List backgrounds
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('backgrounds')
      .select('id, name, category, image_url, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, backgrounds: data });
  }

  // POST - Save background metadata (image already uploaded to Storage from admin)
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

    const { name, category, image_url, storage_path } = req.body;

    if (!name || !category || !image_url || !storage_path) {
      return res.status(400).json({ success: false, error: 'name, category, image_url, and storage_path are required' });
    }

    if (!['dashboard', 'prayer', 'both'].includes(category)) {
      return res.status(400).json({ success: false, error: 'category must be "dashboard", "prayer", or "both"' });
    }

    const { data: bg, error: dbError } = await supabaseAdmin
      .from('backgrounds')
      .insert({
        name,
        category,
        image_url,
        storage_path,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      return res.status(400).json({ success: false, error: dbError.message });
    }

    return res.status(201).json({ success: true, background: bg });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
