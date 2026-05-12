import Head from 'next/head';
import { useState } from 'react';

const METHOD_COLORS = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  DELETE: '#f93e3e',
};

const apiGroups = [
  {
    name: 'Auth',
    description: 'Authentication endpoints for Flutter app users (customers)',
    tag: 'auth',
    endpoints: [
      {
        method: 'POST', path: '/api/auth/register',
        summary: 'Register a new customer account',
        description: 'Creates a new user with role: customer. Returns user data and session token.',
        body: { email: 'user@example.com', password: 'yourpassword', name: 'Ahmad' },
        response: { success: true, user: { id: 'uuid', email: 'user@example.com', name: 'Ahmad' }, session: { access_token: '...', refresh_token: '...' } },
      },
      {
        method: 'POST', path: '/api/auth/login',
        summary: 'Login with email & password',
        description: 'Authenticates user and returns session tokens.',
        body: { email: 'user@example.com', password: 'yourpassword' },
        response: { success: true, user: { id: 'uuid', email: 'user@example.com' }, session: { access_token: '...', refresh_token: '...' } },
      },
      {
        method: 'POST', path: '/api/auth/sso',
        summary: 'SSO login (Google / Apple)',
        description: 'Sign in using ID token from Google or Apple. Automatically creates account if new user.',
        body: { provider: 'google', id_token: 'token_from_provider', access_token: 'optional' },
        response: { success: true, user: { id: 'uuid', email: 'user@gmail.com', provider: 'google' }, session: { access_token: '...' } },
      },
      {
        method: 'GET', path: '/api/auth/me',
        summary: 'Get current user profile',
        description: 'Returns the authenticated user\'s profile. Requires Bearer token.',
        auth: true,
        response: { success: true, user: { id: 'uuid', email: 'user@example.com', name: 'Ahmad', provider: 'email' } },
      },
      {
        method: 'POST', path: '/api/auth/refresh',
        summary: 'Refresh access token',
        description: 'Exchange a refresh token for a new access token.',
        body: { refresh_token: 'your_refresh_token' },
        response: { success: true, session: { access_token: '...', refresh_token: '...' } },
      },
      {
        method: 'POST', path: '/api/auth/logout',
        summary: 'Logout user',
        description: 'Invalidates the current session.',
        auth: true,
        response: { success: true, message: 'Logged out successfully' },
      },
    ],
  },
  {
    name: 'Profile',
    description: 'User profile management (requires Bearer token)',
    tag: 'profile',
    endpoints: [
      {
        method: 'PUT', path: '/api/profile/update',
        summary: 'Update display name',
        description: 'Updates user profile information. Requires Bearer token.',
        auth: true,
        body: { name: 'New Name' },
        response: { success: true, message: 'Profile updated', user: { id: 'uuid', email: '...', name: 'New Name' } },
      },
      {
        method: 'PUT', path: '/api/profile/password',
        summary: 'Change password',
        description: 'Change password for email-based accounts. Not available for SSO users.',
        auth: true,
        body: { new_password: 'newpassword123' },
        response: { success: true, message: 'Password updated successfully' },
      },
      {
        method: 'POST', path: '/api/profile/avatar',
        summary: 'Upload profile photo',
        description: 'Upload a base64-encoded image as profile avatar. Stored in Supabase Storage.',
        auth: true,
        body: { image: 'base64_encoded_image_data' },
        response: { success: true, message: 'Avatar uploaded', avatar_url: 'https://...' },
      },
      {
        method: 'DELETE', path: '/api/profile/avatar',
        summary: 'Remove profile photo',
        description: 'Removes the user\'s profile photo. Persists even after SSO re-login.',
        auth: true,
        response: { success: true, message: 'Avatar removed' },
      },
      {
        method: 'GET', path: '/api/profile/avatar',
        summary: 'Get resolved avatar URL',
        description: 'Returns the correct avatar URL respecting user preference (custom upload > SSO photo > none).',
        auth: true,
        response: { success: true, avatar_url: 'https://...', has_custom: true },
      },
    ],
  },
  {
    name: 'Admin',
    description: 'Admin-only endpoints (requires role: admin)',
    tag: 'admin',
    endpoints: [
      {
        method: 'GET', path: '/api/admin/stats',
        summary: 'Get dashboard statistics',
        description: 'Returns total customers, admins, and all users count.',
        auth: true, admin: true,
        response: { success: true, totalCustomers: 150, totalAdmins: 3, totalUsers: 153 },
      },
      {
        method: 'GET', path: '/api/admin/list-users?role=customer',
        summary: 'List users by role',
        description: 'List all users filtered by role. Use ?role=customer or ?role=admin.',
        auth: true, admin: true,
        response: { success: true, users: [{ id: 'uuid', email: '...', name: '...', role: 'customer', created_at: '...' }] },
      },
      {
        method: 'POST', path: '/api/admin/add-user',
        summary: 'Add new admin user',
        description: 'Creates a new admin account. No email verification required.',
        auth: true, admin: true,
        body: { email: 'worker@hidayahmy.com', password: 'password123', name: 'Worker Name' },
        response: { success: true, message: 'Admin user created successfully', user: { email: '...', role: 'admin' } },
      },
      {
        method: 'DELETE', path: '/api/admin/remove-user',
        summary: 'Remove a user',
        description: 'Permanently deletes a user. Cannot delete yourself.',
        auth: true, admin: true,
        body: { user_id: 'uuid_of_user_to_delete' },
        response: { success: true, message: 'User deleted successfully' },
      },
    ],
  },
];

function EndpointCard({ ep }) {
  const [open, setOpen] = useState(false);
  const color = METHOD_COLORS[ep.method] || '#888';

  return (
    <div style={{ border: `1px solid ${color}33`, borderRadius: '8px', marginBottom: '8px', overflow: 'hidden', background: '#fff' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
          cursor: 'pointer', background: `${color}08`,
        }}
      >
        <span style={{
          padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
          background: color, color: '#fff', minWidth: '60px', textAlign: 'center', fontFamily: 'monospace',
        }}>
          {ep.method}
        </span>
        <code style={{ fontSize: '14px', fontWeight: '600', color: '#333', flex: 1 }}>{ep.path}</code>
        {ep.auth && (
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#ffe0b2', color: '#e65100', fontWeight: '600' }}>
            {ep.admin ? 'ADMIN' : 'AUTH'}
          </span>
        )}
        <span style={{ fontSize: '13px', color: '#666', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ep.summary}
        </span>
        <span style={{ fontSize: '18px', color: '#999', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>v</span>
      </div>

      {open && (
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${color}22`, background: '#fafafa' }}>
          <p style={{ fontSize: '14px', color: '#555', margin: '0 0 16px' }}>{ep.description}</p>

          {ep.auth && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: '6px' }}>Authorization</div>
              <code style={{ fontSize: '13px', background: '#263238', color: '#80cbc4', padding: '8px 14px', borderRadius: '6px', display: 'block' }}>
                Bearer {'<access_token>'}
              </code>
            </div>
          )}

          {ep.body && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: '6px' }}>Request Body</div>
              <pre style={{ fontSize: '13px', background: '#263238', color: '#a5d6a7', padding: '14px', borderRadius: '6px', margin: 0, overflow: 'auto', lineHeight: 1.5 }}>
                {JSON.stringify(ep.body, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: '6px' }}>Response (200)</div>
            <pre style={{ fontSize: '13px', background: '#263238', color: '#90caf9', padding: '14px', borderRadius: '6px', margin: 0, overflow: 'auto', lineHeight: 1.5 }}>
              {JSON.stringify(ep.response, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Head>
        <title>HidayahMY API - Documentation</title>
        <link rel="icon" type="image/png" href="/hidayahicon.png" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: "'Inter', -apple-system, sans-serif" }}>
        {/* Top bar */}
        <div style={{ background: '#263238', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/hidayahicon.png" alt="HidayahMY" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
          <span style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>HidayahMY API</span>
          <span style={{ color: '#80cbc4', fontSize: '12px', fontWeight: '600', background: 'rgba(128,203,196,0.15)', padding: '3px 10px', borderRadius: '12px' }}>
            SANDBOX v1.0
          </span>
          <span style={{ marginLeft: 'auto', color: '#90a4ae', fontSize: '13px' }}>api.hidayahmy.com</span>
        </div>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '32px' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#263238', margin: '0 0 8px' }}>HidayahMY API Documentation</h1>
            <p style={{ fontSize: '15px', color: '#607d8b', margin: '0 0 16px' }}>
              REST API for HidayahMY Flutter App - Authentication, Profile Management & Admin Operations
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '12px', background: '#e8f5e9', color: '#2e7d32', fontWeight: '600' }}>Base URL: https://api.hidayahmy.com</span>
              <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '12px', background: '#e3f2fd', color: '#1565c0', fontWeight: '600' }}>Auth: Supabase JWT</span>
              <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '12px', background: '#fff3e0', color: '#e65100', fontWeight: '600' }}>Format: JSON</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
          {/* Role info */}
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '20px', marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#263238', margin: '0 0 12px' }}>Roles</h3>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px', padding: '12px 16px', background: '#e8f5e9', borderRadius: '8px', borderLeft: '4px solid #49cc90' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#2e7d32' }}>customer</div>
                <div style={{ fontSize: '12px', color: '#558b2f', marginTop: '4px' }}>App users registered via Flutter app (email, Google, Apple SSO)</div>
              </div>
              <div style={{ flex: 1, minWidth: '200px', padding: '12px 16px', background: '#fff3e0', borderRadius: '8px', borderLeft: '4px solid #fca130' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#e65100' }}>admin</div>
                <div style={{ fontSize: '12px', color: '#bf360c', marginTop: '4px' }}>Portal users added by other admins. Access to admin endpoints & portal.</div>
              </div>
            </div>
          </div>

          {/* API Groups */}
          {apiGroups.map((group) => (
            <div key={group.tag} style={{ marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#263238', margin: 0 }}>{group.name}</h2>
                <span style={{ fontSize: '13px', color: '#607d8b' }}>{group.description}</span>
              </div>
              {group.endpoints.map((ep) => (
                <EndpointCard key={ep.path + ep.method} ep={ep} />
              ))}
            </div>
          ))}

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#90a4ae', fontSize: '13px' }}>
            HidayahMY API Sandbox &copy; 2026 &middot; Built with Next.js & Supabase
          </div>
        </div>
      </div>
    </>
  );
}
