function readAuthenticatorLevel(accessToken) {
  try {
    const parts = accessToken?.split('.');
    if (parts?.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

// Call this only after supabase.auth.getUser(accessToken) has verified the JWT.
// The user role is authoritative app_metadata; the token's AAL proves that this
// specific session has completed a second-factor challenge.
export function hasAdminMfa(user, accessToken) {
  return user?.app_metadata?.role === 'admin' && readAuthenticatorLevel(accessToken) === 'aal2';
}
