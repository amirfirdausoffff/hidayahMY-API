import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'amirfirdausoff@gmail.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'HidayahMY <noreply@hidayahmy.com>';

/** Escape HTML to prevent injection in email templates */
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Send email notification to admin.
 * Fails silently — never blocks the API response.
 */
export async function notifyAdmin({ subject, html }) {
  if (!resend) {
    console.warn('[admin-notify] RESEND_API_KEY not set, skipping email');
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `[HidayahMY] ${subject}`,
      html,
    });
  } catch (e) {
    console.error('[admin-notify] Email failed:', e.message);
  }
}

/**
 * Notify: New user signed up
 */
export function notifyNewUser({ email, name, provider }) {
  const method = provider || 'Email/Password';
  notifyAdmin({
    subject: 'New User Signup',
    html: `
      <h3>New User Registered</h3>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px;color:#666;">Name</td><td style="padding:6px 12px;font-weight:600;">${esc(name) || '-'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Email</td><td style="padding:6px 12px;font-weight:600;">${esc(email)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Method</td><td style="padding:6px 12px;">${esc(method)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Time</td><td style="padding:6px 12px;">${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</td></tr>
      </table>
    `,
  });
}

/**
 * Notify: New event submitted
 */
export function notifyNewEvent({ title, location, userName, userEmail, status }) {
  notifyAdmin({
    subject: `New Event: ${String(title).slice(0, 60)}`,
    html: `
      <h3>New Event Submitted</h3>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px;color:#666;">Title</td><td style="padding:6px 12px;font-weight:600;">${esc(title)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Location</td><td style="padding:6px 12px;">${esc(location) || '-'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Status</td><td style="padding:6px 12px;">${esc(status) || 'pending'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">By</td><td style="padding:6px 12px;">${esc(userName || userEmail) || '-'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Time</td><td style="padding:6px 12px;">${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:13px;color:#888;">Review in <a href="https://admin.hidayahmy.com">Admin Panel</a></p>
    `,
  });
}

/**
 * Notify: New feedback received
 */
export function notifyNewFeedback({ email, feature, message }) {
  notifyAdmin({
    subject: `New Feedback: ${String(feature).slice(0, 60)}`,
    html: `
      <h3>New Feedback Received</h3>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px;color:#666;">Feature</td><td style="padding:6px 12px;font-weight:600;">${esc(feature)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">From</td><td style="padding:6px 12px;">${esc(email)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Time</td><td style="padding:6px 12px;">${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</td></tr>
      </table>
      <div style="margin-top:12px;padding:12px;background:#f5f5f5;border-radius:8px;font-size:14px;white-space:pre-wrap;">${esc(message)}</div>
      <p style="margin-top:16px;font-size:13px;color:#888;">Review in <a href="https://admin.hidayahmy.com">Admin Panel</a></p>
    `,
  });
}
