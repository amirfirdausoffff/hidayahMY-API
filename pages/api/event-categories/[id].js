import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { sanitizeString } from '../../../src/lib/validate';

async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Category ID is required' });
  }

  // Auth check (admin only for both PUT and DELETE)
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

  // PUT - Update category
  if (req.method === 'PUT') {
    const { name, name_ms, icon, sort_order, is_active } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = sanitizeString(name, 100);
    if (name_ms !== undefined) updateData.name_ms = sanitizeString(name_ms, 100);
    if (icon !== undefined) updateData.icon = sanitizeString(icon, 50);
    if (sort_order !== undefined) updateData.sort_order = parseInt(sort_order) || 0;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const { data: category, error } = await supabaseAdmin
      .from('event_categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    return res.status(200).json({ success: true, category });
  }

  // DELETE - Delete category
  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('event_categories')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, message: 'Category deleted' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
