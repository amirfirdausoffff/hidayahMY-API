import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // DELETE - remove avatar
  if (req.method === 'DELETE') {
    // Remove file from storage
    await supabaseAdmin.storage.from('avatars').remove([`${user.id}`]);

    // Mark as removed so SSO photo won't come back
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, custom_avatar: 'removed' },
    });

    return res.status(200).json({
      success: true,
      message: 'Avatar removed',
    });
  }

  // POST - upload avatar
  if (req.method === 'POST') {
    const { image } = req.body; // base64 encoded image

    if (!image) {
      return res.status(400).json({ success: false, error: 'Image data required' });
    }

    // Decode base64
    const buffer = Buffer.from(image, 'base64');
    const filePath = `${user.id}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      return res.status(400).json({ success: false, error: uploadError.message });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Save to custom_avatar so it persists across SSO re-logins
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, custom_avatar: avatarUrl },
    });

    return res.status(200).json({
      success: true,
      message: 'Avatar uploaded',
      avatar_url: avatarUrl,
    });
  }

  // GET - resolve avatar (respects custom preference)
  if (req.method === 'GET') {
    const customAvatar = user.user_metadata?.custom_avatar;
    let avatarUrl = '';

    if (customAvatar === 'removed') {
      avatarUrl = '';
    } else if (customAvatar) {
      avatarUrl = customAvatar;
    } else {
      avatarUrl = user.user_metadata?.avatar_url || '';
    }

    return res.status(200).json({
      success: true,
      avatar_url: avatarUrl,
      has_custom: !!customAvatar,
    });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
