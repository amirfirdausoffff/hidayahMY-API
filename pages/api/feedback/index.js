import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

async function handler(req, res) {
  // POST - Submit feedback
  if (req.method === 'POST') {
    // Optional auth - don't fail if missing
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    const { email, feature, message, images } = req.body;

    if (!email || !feature || !message) {
      return res.status(400).json({ success: false, error: 'email, feature, and message are required' });
    }

    // Handle image uploads
    let imageUrls = null;
    if (images && Array.isArray(images) && images.length > 0) {
      const maxImages = images.slice(0, 2);
      imageUrls = [];

      for (let i = 0; i < maxImages.length; i++) {
        const buffer = Buffer.from(maxImages[i], 'base64');
        const filePath = `feedback/${Date.now()}_${i}.jpg`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('feedback')
          .upload(filePath, buffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          return res.status(400).json({ success: false, error: `Image upload failed: ${uploadError.message}` });
        }

        const { data: urlData } = supabaseAdmin.storage
          .from('feedback')
          .getPublicUrl(filePath);

        imageUrls.push(urlData.publicUrl);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('feedback')
      .insert({
        user_id: userId,
        email,
        feature,
        message,
        image_urls: imageUrls,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(201).json({ success: true, feedback: data });
  }

  // GET - List all feedback (admin only)
  if (req.method === 'GET') {
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

    const { data, error } = await supabaseAdmin
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, feedback: data });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
