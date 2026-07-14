import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function resolveSupabaseUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.VITE_SUPABASE_URL
  );
}

function resolveServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SECRET_KEY
  );
}

export function hasSupabase(): boolean {
  return Boolean(resolveSupabaseUrl() && resolveServiceRoleKey());
}

/**
 * Server-side Supabase client (service role). Never expose the service key to the browser.
 */
export function getSupabase(): SupabaseClient {
  const url = resolveSupabaseUrl();
  const serviceKey = resolveServiceRoleKey();

  if (!url || !serviceKey) {
    throw new Error(
      'Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY on the server.',
    );
  }

  if (!client) {
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
