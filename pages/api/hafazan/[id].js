import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (!['PUT', 'DELETE'].includes(req.method)) {
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

  if (!id) {
    return res.status(400).json({ success: false, error: 'Entry ID is required' });
  }

  // Verify ownership
  const { data: entry, error: findError } = await supabaseAdmin
    .from('hafazan_entries')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (findError) {
    return res.status(400).json({ success: false, error: findError.message });
  }

  if (!entry) {
    return res.status(404).json({ success: false, error: 'Hafazan entry not found' });
  }

  // PUT - Update entry
  if (req.method === 'PUT') {
    const { status, strength } = req.body;
    const updates = { updated_at: new Date().toISOString() };

    if (status) {
      if (!['memorizing', 'memorized'].includes(status)) {
        return res.status(400).json({ success: false, error: 'status must be memorizing or memorized' });
      }
      updates.status = status;
    }

    if (strength) {
      if (!['weak', 'medium', 'strong'].includes(strength)) {
        return res.status(400).json({ success: false, error: 'strength must be weak, medium, or strong' });
      }
      updates.strength = strength;
    }

    const { data, error } = await supabaseAdmin
      .from('hafazan_entries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, entry: data });
  }

  // DELETE - Delete entry and its reviews
  if (req.method === 'DELETE') {
    // Reviews are cascade deleted via foreign key
    const { error } = await supabaseAdmin
      .from('hafazan_entries')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, message: 'Hafazan entry deleted' });
  }
}

export default cors(handler);
