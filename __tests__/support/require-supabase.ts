import { createSeedClient } from './clients';
import type { IntegrationEnv } from './env';
import { formatMissingIntegrationEnvMessage, readIntegrationEnv } from './env';

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

  try {
    const admin = createSeedClient(env);
    const { error } = await admin.from('households').select('id').limit(1);

    if (error) {
      const detail =
        typeof error.message === 'string' && error.message.length > 0
          ? error.message
          : JSON.stringify(error);
      throw new IntegrationSupabaseUnavailableError(
        `Integration Supabase readiness check failed: ${detail}. ` +
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
  }

  return env;
}
