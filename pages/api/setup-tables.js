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

-- Enable Row Level Security
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own bookmarks" ON bookmarks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own notes" ON notes FOR ALL USING (auth.uid() = user_id);
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

  if (tables.bookmarks && tables.notes) {
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
