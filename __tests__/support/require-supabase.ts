import type { IntegrationEnv } from './env';
import { formatMissingIntegrationEnvMessage, readIntegrationEnv } from './env';

const HEALTH_TIMEOUT_MS = 3_000;

export class IntegrationSupabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationSupabaseUnavailableError';
  }
}

/**
 * Fail fast when the integration Supabase URL/keys are missing or the API is unreachable.
 * Never silently pass — callers must not treat a missing DB as green coverage.
 */
export async function requireIntegrationSupabase(
  env: IntegrationEnv | null = readIntegrationEnv()
): Promise<IntegrationEnv> {
  if (!env) {
    throw new IntegrationSupabaseUnavailableError(
      formatMissingIntegrationEnvMessage()
    );
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
      throw new IntegrationSupabaseUnavailableError(
        `Integration Supabase health check failed (${response.status}) at ${healthUrl}. ` +
          'Confirm SUPABASE_URL / keys and that migrations are applied (see __tests__/support/README.md).'
      );
    }
  } catch (error) {
    if (error instanceof IntegrationSupabaseUnavailableError) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : String(error);
    throw new IntegrationSupabaseUnavailableError(
      `Integration Supabase is unreachable at ${env.url} (${detail}). ` +
        'Check .env.test.local and network access to the hosted test project. ' +
        'See __tests__/support/README.md.'
    );
  } finally {
    clearTimeout(timer);
  }

  return env;
}
