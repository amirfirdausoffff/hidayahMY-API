import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Client for auth operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (user management)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;

// auth.admin.listUsers() only returns one page (default 50). Walk every page.
export async function listAllUsers() {
  const perPage = 1000;
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return { users, error };
    users.push(...data.users);
    if (data.users.length < perPage) return { users, error: null };
  }
}
