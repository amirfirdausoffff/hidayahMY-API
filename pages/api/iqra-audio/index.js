import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  // GET - List all iqra audio as a manifest map (public)
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('iqra_audio')
      .select('text_hash, arabic_text, file_url, level, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Build map: text_hash -> { arabic_text, file_url }
    const audioMap = {};
    for (const row of data) {
      audioMap[row.text_hash] = {
        arabic_text: row.arabic_text,
        file_url: row.file_url,
        level: row.level,
      };
    }

    return res.status(200).json({ success: true, audioMap, total: data.length });
  }

  // POST - Save iqra audio metadata (admin only)
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

    const { text_hash, arabic_text, file_url, storage_path, level } = req.body;

    if (!text_hash || !arabic_text || !file_url || !storage_path) {
      return res.status(400).json({
        success: false,
        error: 'text_hash, arabic_text, file_url, and storage_path are required',
      });
    }

    const { data: iqraAudio, error: dbError } = await supabaseAdmin
      .from('iqra_audio')
      .upsert({
        text_hash,
        arabic_text,
        file_url,
        storage_path,
        level: level || null,
      }, { onConflict: 'text_hash' })
      .select()
      .single();

    if (dbError) {
      return res.status(400).json({ success: false, error: dbError.message });
    }

    return res.status(201).json({ success: true, iqraAudio });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
