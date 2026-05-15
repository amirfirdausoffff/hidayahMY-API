import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  // GET - List azan sounds (public)
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('azan_sounds')
      .select('id, name, file_url, duration_seconds, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, azanSounds: data });
  }

  // POST - Save azan sound metadata (audio already uploaded to Storage from admin)
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

    const { name, file_url, storage_path, duration_seconds } = req.body;

    if (!name || !file_url || !storage_path) {
      return res.status(400).json({ success: false, error: 'name, file_url, and storage_path are required' });
    }

    const { data: azanSound, error: dbError } = await supabaseAdmin
      .from('azan_sounds')
      .insert({
        name,
        file_url,
        storage_path,
        duration_seconds: duration_seconds || null,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      return res.status(400).json({ success: false, error: dbError.message });
    }

    return res.status(201).json({ success: true, azanSound });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
