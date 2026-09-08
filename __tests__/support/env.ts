import { loadTestEnv } from './load-test-env';

export type IntegrationEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

/**
 * Read integration credentials for the hosted test Supabase project.
 * Service role is seed-only — never place it in `EXPO_PUBLIC_*`.
 */
export function readIntegrationEnv(
  source: NodeJS.ProcessEnv = process.env
): IntegrationEnv | null {
  loadTestEnv();

  const url = source.SUPABASE_URL?.trim();
  const anonKey = source.SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return { url, anonKey, serviceRoleKey };
}

export function formatMissingIntegrationEnvMessage(): string {
  return [
    'Integration harness requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.',
    'Copy .env.test.example → .env.test.local and fill keys from a dedicated hosted test project (Project Settings → API).',
    'See __tests__/support/README.md.',
  ].join(' ');
}
