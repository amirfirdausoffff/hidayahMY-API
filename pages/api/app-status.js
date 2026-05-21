import { supabase, supabaseAdmin } from '../../src/lib/supabase';
import { cors } from '../../src/lib/cors';

const BUCKET = 'config';
const FILE = 'maintenance.json';

const DEFAULT_CONFIG = {
  enabled: false,
  message_en: 'We are currently under maintenance. Please check back soon.',
  message_bm: 'Kami sedang dalam penyelenggaraan. Sila cuba sebentar lagi.',
};

async function handler(req, res) {
  // GET — public, no auth needed
  if (req.method === 'GET') {
    try {
      const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(FILE);
      const response = await fetch(`${data.publicUrl}?t=${Date.now()}`);

      if (!response.ok) {
        return res.status(200).json({ success: true, ...DEFAULT_CONFIG });
      }

      const config = await response.json();
      return res.status(200).json({ success: true, ...config });
    } catch {
      return res.status(200).json({ success: true, ...DEFAULT_CONFIG });
    }
  }

  // PUT — admin only
  if (req.method === 'PUT') {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (user.user_metadata?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { enabled, message_en, message_bm } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled (boolean) is required' });
    }

    const config = {
      enabled,
      message_en: message_en || DEFAULT_CONFIG.message_en,
      message_bm: message_bm || DEFAULT_CONFIG.message_bm,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(FILE, JSON.stringify(config), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ success: false, error: 'Failed to update maintenance status' });
    }

    return res.status(200).json({ success: true, message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`, ...config });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
