import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'DELETE') {
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

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { id } = req.query;

  // Get record to find storage path
  const { data: iqraAudio, error: fetchError } = await supabaseAdmin
    .from('iqra_audio')
    .select('storage_path')
    .eq('id', id)
    .single();

  if (fetchError || !iqraAudio) {
    return res.status(404).json({ success: false, error: 'Iqra audio not found' });
  }

  // Delete from storage
  await supabaseAdmin.storage
    .from('iqra-audio')
    .remove([iqraAudio.storage_path]);

  // Delete from database
  const { error: deleteError } = await supabaseAdmin
    .from('iqra_audio')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return res.status(400).json({ success: false, error: deleteError.message });
  }

  return res.status(200).json({ success: true, message: 'Iqra audio deleted' });
}

export default cors(handler);
