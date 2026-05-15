import { supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { isValidEmail, safeError } from '../../../src/lib/validate';
import { checkRateLimit, getClientIp } from '../../../src/lib/rate-limit';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Rate limit: 3 attempts per 15 minutes
  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(`bootstrap:${ip}`, 3, 15 * 60 * 1000);
  if (!allowed) {
    return res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' });
  }

  const { secret, email, password, action } = req.body;

  const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(403).json({ success: false, error: 'Invalid secret' });
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Valid email is required' });
  }

  // Action: set-role — set an existing user as admin
  if (action === 'set-role') {
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const user = listData?.users?.find(u => u.email === email);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: 'admin' },
    });

    if (error) return res.status(400).json({ success: false, error: safeError(error) });

    return res.status(200).json({ success: true, message: `${email} is now admin` });
  }

  // Action: create — create a new admin user
  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'Admin', role: 'admin' },
  });

  if (error) return res.status(400).json({ success: false, error: safeError(error) });

  return res.status(201).json({
    success: true,
    message: 'Admin created',
    user: { email: data.user.email, role: 'admin' },
  });
}

export default cors(handler);
