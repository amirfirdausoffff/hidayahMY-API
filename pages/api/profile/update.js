import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import nationalities from '../../../src/data/nationalities.json';

async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const { name, avatar_url, gender, date_of_birth, nationality_code } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (gender !== undefined) {
    if (!['male', 'female'].includes(gender)) {
      return res.status(400).json({
        success: false,
        error: 'Gender must be either male or female',
      });
    }
    updates.gender = gender;
  }
  if (date_of_birth !== undefined) {
    if (date_of_birth === null || date_of_birth === '') {
      updates.date_of_birth = null;
    } else if (!isValidDateOfBirth(date_of_birth)) {
      return res.status(400).json({
        success: false,
        error: 'Date of birth must be a valid past date in YYYY-MM-DD format',
      });
    } else {
      updates.date_of_birth = date_of_birth;
    }
  }
  if (nationality_code !== undefined) {
    if (nationality_code === null || nationality_code === '') {
      updates.nationality_code = null;
      updates.nationality = null;
    } else {
      const normalizedCode = typeof nationality_code === 'string'
        ? nationality_code.trim().toUpperCase()
        : '';
      const selectedNationality = nationalities.find(
        (item) => item.code === normalizedCode && item.code !== 'IL',
      );

      if (!selectedNationality) {
        return res.status(400).json({
          success: false,
          error: 'Please select a valid nationality',
        });
      }

      updates.nationality_code = selectedNationality.code;
      updates.nationality = selectedNationality.nationality;
    }
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, ...updates },
  });

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  return res.status(200).json({
    success: true,
    message: 'Profile updated',
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || '',
      avatar_url: data.user.user_metadata?.avatar_url || '',
      gender: data.user.user_metadata?.gender || null,
      date_of_birth: data.user.user_metadata?.date_of_birth || null,
      nationality_code: data.user.user_metadata?.nationality_code || null,
      nationality: data.user.user_metadata?.nationality || null,
    },
  });
}

function isValidDateOfBirth(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }

  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return date.getTime() <= todayUtc;
}

export default cors(handler);
