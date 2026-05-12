import Head from 'next/head';

const styles = {
  body: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0D7377 0%, #14919B 50%, #095456 100%)',
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: '#fff',
    padding: '40px 20px',
  },
  container: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  logo: {
    width: '60px',
    height: '60px',
    background: 'rgba(255,255,255,0.2)',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    fontSize: '28px',
    fontWeight: '700',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: '16px',
    opacity: 0.8,
    margin: 0,
  },
  badge: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.2)',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    marginTop: '12px',
  },
  card: {
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '16px',
    backdropFilter: 'blur(10px)',
  },
  endpoint: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  method: (color) => ({
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    background: color,
    minWidth: '55px',
    textAlign: 'center',
  }),
  path: {
    fontSize: '16px',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  desc: {
    fontSize: '14px',
    opacity: 0.8,
    marginLeft: '67px',
  },
  section: {
    fontSize: '20px',
    fontWeight: '700',
    marginBottom: '16px',
    marginTop: '32px',
  },
  code: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '12px',
    padding: '20px',
    fontSize: '13px',
    fontFamily: 'monospace',
    overflowX: 'auto',
    whiteSpace: 'pre',
    lineHeight: '1.6',
  },
};

const endpoints = [
  {
    method: 'POST',
    color: '#2ecc71',
    path: '/api/auth/register',
    desc: 'Register with email & password',
  },
  {
    method: 'POST',
    color: '#3498db',
    path: '/api/auth/login',
    desc: 'Login with email & password',
  },
  {
    method: 'POST',
    color: '#9b59b6',
    path: '/api/auth/sso',
    desc: 'Login with Google or Apple SSO',
  },
  {
    method: 'GET',
    color: '#e67e22',
    path: '/api/auth/me',
    desc: 'Get current user profile (requires Bearer token)',
  },
  {
    method: 'POST',
    color: '#1abc9c',
    path: '/api/auth/refresh',
    desc: 'Refresh access token',
  },
  {
    method: 'POST',
    color: '#e74c3c',
    path: '/api/auth/logout',
    desc: 'Logout user',
  },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>HidayahMY API</title>
        <link rel="icon" type="image/png" href="/hidayahicon.png" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div style={styles.body}>
        <div style={styles.container}>
          <div style={styles.header}>
            <div style={styles.logo}>H</div>
            <h1 style={styles.title}>HidayahMY API</h1>
            <p style={styles.subtitle}>Sandbox API for HidayahMY Flutter App</p>
            <span style={styles.badge}>SANDBOX v1.0</span>
          </div>

          <h2 style={styles.section}>Endpoints</h2>
          {endpoints.map((ep) => (
            <div key={ep.path} style={styles.card}>
              <div style={styles.endpoint}>
                <span style={styles.method(ep.color)}>{ep.method}</span>
                <span style={styles.path}>{ep.path}</span>
              </div>
              <p style={styles.desc}>{ep.desc}</p>
            </div>
          ))}

          <h2 style={styles.section}>Quick Start</h2>

          <div style={styles.card}>
            <p style={{ margin: '0 0 12px', fontWeight: '600' }}>Register</p>
            <div style={styles.code}>{`POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword",
  "name": "Ahmad"
}`}</div>
          </div>

          <div style={styles.card}>
            <p style={{ margin: '0 0 12px', fontWeight: '600' }}>Login</p>
            <div style={styles.code}>{`POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}`}</div>
          </div>

          <div style={styles.card}>
            <p style={{ margin: '0 0 12px', fontWeight: '600' }}>SSO (Google / Apple)</p>
            <div style={styles.code}>{`POST /api/auth/sso
Content-Type: application/json

{
  "provider": "google",
  "id_token": "token_from_google_sign_in"
}`}</div>
          </div>

          <div style={styles.card}>
            <p style={{ margin: '0 0 12px', fontWeight: '600' }}>Get Profile</p>
            <div style={styles.code}>{`GET /api/auth/me
Authorization: Bearer <access_token>`}</div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '48px', opacity: 0.6, fontSize: '14px' }}>
            <p>HidayahMY API Sandbox &copy; 2026</p>
          </div>
        </div>
      </div>
    </>
  );
}
