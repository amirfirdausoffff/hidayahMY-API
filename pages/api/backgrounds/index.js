import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  // GET - List backgrounds (public for app users, requires auth)
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

  // POST - Upload background (admin only)
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

    const { name, category, image } = req.body;

    if (!name || !category || !image) {
      return res.status(400).json({ success: false, error: 'name, category, and image (base64) are required' });
    }

    if (!['dashboard', 'prayer'].includes(category)) {
      return res.status(400).json({ success: false, error: 'category must be "dashboard" or "prayer"' });
    }

    // Decode base64 image
    const matches = image.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, error: 'Invalid image format. Must be base64 data URI (png, jpg, or webp)' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const fileName = `${category}/${Date.now()}_${name.replace(/\s+/g, '_').toLowerCase()}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('backgrounds')
      .upload(fileName, buffer, {
        contentType: `image/${matches[1]}`,
        upsert: false,
      });

    if (uploadError) {
      return res.status(400).json({ success: false, error: uploadError.message });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('backgrounds')
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;

    // Save metadata to database
    const { data: bg, error: dbError } = await supabaseAdmin
      .from('backgrounds')
      .insert({
        name,
        category,
        image_url: imageUrl,
        storage_path: fileName,
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
