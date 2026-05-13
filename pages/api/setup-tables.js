import { supabaseAdmin } from '../../src/lib/supabase';
import { cors } from '../../src/lib/cors';

const SETUP_SQL = `
-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  reference_id text,
  title text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text DEFAULT '',
  type text DEFAULT 'general',
  reference_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prayer check-ins table
CREATE TABLE IF NOT EXISTS prayer_checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  prayer text NOT NULL CHECK (prayer IN ('subuh', 'zohor', 'asar', 'maghrib', 'isyak')),
  status smallint NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date, prayer)
);

-- FCM tokens table
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  platform text DEFAULT 'unknown',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notifications history table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  topic text DEFAULT 'general',
  data jsonb DEFAULT '{}',
  sent_by uuid REFERENCES auth.users(id),
  total_sent int DEFAULT 0,
  total_failed int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own bookmarks" ON bookmarks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own notes" ON notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own prayer_checkins" ON prayer_checkins FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own fcm_tokens" ON fcm_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all notifications" ON notifications FOR SELECT USING (true);
CREATE POLICY "Admins can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
`;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { secret } = req.body;
  if (secret !== 'hidayahmy-setup-2026') {
    return res.status(403).json({ success: false, error: 'Invalid setup secret' });
  }

  const tables = {};

  // Check if bookmarks table exists
  const { error: bookmarksError } = await supabaseAdmin
    .from('bookmarks')
    .select('id')
    .limit(0);
  tables.bookmarks = !bookmarksError;

  // Check if notes table exists
  const { error: notesError } = await supabaseAdmin
    .from('notes')
    .select('id')
    .limit(0);
  tables.notes = !notesError;

  // Check if prayer_checkins table exists
  const { error: checkinError } = await supabaseAdmin
    .from('prayer_checkins')
    .select('id')
    .limit(0);
  tables.prayer_checkins = !checkinError;

  // Check if fcm_tokens table exists
  const { error: fcmError } = await supabaseAdmin
    .from('fcm_tokens')
    .select('id')
    .limit(0);
  tables.fcm_tokens = !fcmError;

  // Check if notifications table exists
  const { error: notifError } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .limit(0);
  tables.notifications = !notifError;

  if (tables.bookmarks && tables.notes && tables.prayer_checkins && tables.fcm_tokens && tables.notifications) {
    return res.status(200).json({
      success: true,
      message: 'All tables already exist',
      tables,
    });
  }

  return res.status(200).json({
    success: false,
    message: 'One or more tables are missing. Please run the following SQL in Supabase SQL Editor.',
    tables,
    sql: SETUP_SQL,
  });
}

export default cors(handler);
