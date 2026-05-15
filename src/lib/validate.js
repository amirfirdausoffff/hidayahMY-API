/**
 * Input validation helpers
 */

const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidDate(str) {
  if (!str || typeof str !== 'string') return false;
  if (!DATE_REGEX.test(str)) return false;
  const d = new Date(str + 'T00:00:00');
  return !isNaN(d.getTime());
}

export function isValidMonth(str) {
  return str && typeof str === 'string' && MONTH_REGEX.test(str);
}

export function isValidEmail(str) {
  return str && typeof str === 'string' && EMAIL_REGEX.test(str) && str.length <= 254;
}

export function sanitizeString(str, maxLength = 500) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

/**
 * Return a safe error message — never expose internals
 */
export function safeError(error, fallback = 'Something went wrong') {
  // Only pass through known safe Supabase/auth messages
  const msg = error?.message || '';
  const safePatterns = [
    'already registered',
    'Invalid login credentials',
    'Email not confirmed',
    'Password should be',
    'not found',
    'required',
  ];
  for (const pattern of safePatterns) {
    if (msg.includes(pattern)) return msg;
  }
  // Log the real error server-side
  console.error('[API Error]', msg);
  return fallback;
}
