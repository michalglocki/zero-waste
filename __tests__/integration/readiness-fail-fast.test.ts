/**
 * @jest-environment node
 */
import '../support/load-test-env';

import {
  IntegrationSupabaseUnavailableError,
  requireIntegrationSupabase,
} from '../support/require-supabase';

describe('integration readiness (fail-fast)', () => {
  it('rejects missing env with a clear error (no silent pass)', async () => {
    await expect(requireIntegrationSupabase(null)).rejects.toBeInstanceOf(
      IntegrationSupabaseUnavailableError
    );
    await expect(requireIntegrationSupabase(null)).rejects.toThrow(
      /SUPABASE_URL.*SUPABASE_ANON_KEY.*SUPABASE_SERVICE_ROLE_KEY/s
    );
  });

  it('rejects an unreachable integration Supabase URL with a clear error', async () => {
    await expect(
      requireIntegrationSupabase({
        url: 'http://127.0.0.1:1',
        anonKey: 'test-anon-key',
        serviceRoleKey: 'test-service-role-key',
      })
    ).rejects.toBeInstanceOf(IntegrationSupabaseUnavailableError);

    await expect(
      requireIntegrationSupabase({
        url: 'http://127.0.0.1:1',
        anonKey: 'test-anon-key',
        serviceRoleKey: 'test-service-role-key',
      })
    ).rejects.toThrow(/unreachable|Integration Supabase|readiness|failed/i);
  }, 20_000);
});
