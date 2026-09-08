import '../support/load-test-env';

import {
  LocalSupabaseUnavailableError,
  requireLocalSupabase,
} from '../support/require-supabase';

describe('integration readiness (fail-fast)', () => {
  it('rejects missing env with a clear error (no silent pass)', async () => {
    await expect(requireLocalSupabase(null)).rejects.toBeInstanceOf(
      LocalSupabaseUnavailableError
    );
    await expect(requireLocalSupabase(null)).rejects.toThrow(
      /SUPABASE_URL.*SUPABASE_ANON_KEY.*SUPABASE_SERVICE_ROLE_KEY/s
    );
  });

  it('rejects an unreachable local Supabase URL with a clear error', async () => {
    await expect(
      requireLocalSupabase({
        url: 'http://127.0.0.1:1',
        anonKey: 'test-anon-key',
        serviceRoleKey: 'test-service-role-key',
      })
    ).rejects.toBeInstanceOf(LocalSupabaseUnavailableError);

    await expect(
      requireLocalSupabase({
        url: 'http://127.0.0.1:1',
        anonKey: 'test-anon-key',
        serviceRoleKey: 'test-service-role-key',
      })
    ).rejects.toThrow(/unreachable|Local Supabase/i);
  });
});
