import { supabase } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { isValidEmail, sanitizeString, safeError } from '../../../src/lib/validate';
import { checkRateLimit, getClientIp } from '../../../src/lib/rate-limit';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Rate limit: 5 registrations per 15 minutes per IP
  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' });
  }

  const { email, password, name } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Valid email is required' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  const safeName = sanitizeString(name, 100);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: safeName },
    },
  });

  if (error) {
    return res.status(400).json({ success: false, error: safeError(error, 'Registration failed') });
  }

  return res.status(201).json({
    success: true,
    message: 'Account created successfully',
    user: {
      id: data.user?.id,
      email: data.user?.email,
      name: data.user?.user_metadata?.name || '',
      created_at: data.user?.created_at,
    },
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        }
      : null,
  });
}

export default cors(handler);
