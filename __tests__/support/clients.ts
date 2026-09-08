import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { IntegrationEnv } from './env';

const noSessionAuth = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
} as const;

/** Seed/teardown only. Never use for product assertions. */
export function createSeedClient(env: IntegrationEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      ...noSessionAuth,
      storageKey: 'zw-test-seed',
    },
  });
}

/** Anon key, no JWT. */
export function createAnonClient(env: IntegrationEnv): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: {
      ...noSessionAuth,
      storageKey: 'zw-test-anon',
    },
  });
}

/**
 * Authenticated user client (anon key + password grant).
 * Each label gets an isolated in-memory auth storage key so sessions do not bleed.
 */
export async function createAuthedClient(
  env: IntegrationEnv,
  email: string,
  password: string,
  label: string
): Promise<SupabaseClient> {
  const client = createClient(env.url, env.anonKey, {
    auth: {
      ...noSessionAuth,
      storageKey: `zw-test-user-${label}`,
    },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signIn failed for ${label} (${email}): ${error.message}`);
  }

  return client;
}
