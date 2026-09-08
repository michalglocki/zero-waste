import type { IntegrationEnv } from './env';
import { formatMissingIntegrationEnvMessage, readIntegrationEnv } from './env';

const HEALTH_TIMEOUT_MS = 3_000;

export class LocalSupabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalSupabaseUnavailableError';
  }
}

/**
 * Fail fast when local Supabase URL/keys are missing or the API is unreachable.
 * Never silently pass — callers must not treat a missing DB as green coverage.
 */
export async function requireLocalSupabase(
  env: IntegrationEnv | null = readIntegrationEnv()
): Promise<IntegrationEnv> {
  if (!env) {
    throw new LocalSupabaseUnavailableError(formatMissingIntegrationEnvMessage());
  }

  const healthUrl = new URL('/auth/v1/health', env.url).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: { apikey: env.anonKey },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LocalSupabaseUnavailableError(
        `Local Supabase health check failed (${response.status}) at ${healthUrl}. ` +
          'Run `npx supabase start` and apply migrations before integration tests.'
      );
    }
  } catch (error) {
    if (error instanceof LocalSupabaseUnavailableError) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : String(error);
    throw new LocalSupabaseUnavailableError(
      `Local Supabase is unreachable at ${env.url} (${detail}). ` +
        'Run `npx supabase start` (Docker required) before integration tests. ' +
        'See __tests__/support/README.md.'
    );
  } finally {
    clearTimeout(timer);
  }

  return env;
}
