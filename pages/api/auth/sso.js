import { supabase } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { provider, id_token, access_token, nonce } = req.body;

  const validProviders = ['google', 'apple'];
  if (!provider || !validProviders.includes(provider)) {
    return res.status(400).json({
      success: false,
      error: `Provider is required. Supported: ${validProviders.join(', ')}`,
    });
  }

  if (!id_token) {
    return res.status(400).json({
      success: false,
      error: 'id_token is required from the SSO provider',
    });
  }

  const credentials = {
    provider,
    token: id_token,
  };

  if (access_token) credentials.access_token = access_token;
  if (nonce) credentials.nonce = nonce;

  const { data, error } = await supabase.auth.signInWithIdToken(credentials);

  if (error) {
    return res.status(401).json({ success: false, error: error.message });
  }

  return res.status(200).json({
    success: true,
    message: `SSO login with ${provider} successful`,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
      avatar: data.user.user_metadata?.avatar_url || '',
      provider: provider,
      created_at: data.user.created_at,
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
  });
}

export default cors(handler);
