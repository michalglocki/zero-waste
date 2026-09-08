import '../support/load-test-env';

import { readIntegrationEnv } from '../support/env';
import {
  createAssertionClients,
  createSeedClient,
  seedIsolationFixture,
  teardownIsolationFixture,
} from '../support/fixtures';
import { requireLocalSupabase } from '../support/require-supabase';

/**
 * Live self-check against local Supabase. Requires `.env.test.local` and a
 * running stack (`npx supabase start`). See __tests__/support/README.md.
 *
 * When credentials are configured but the API is down, `requireLocalSupabase`
 * fails the suite — never a false green. When credentials are absent, this
 * suite is skipped under plain `npm test` (use `npm run test:integration`
 * which refuses to start without env).
 */
const envFromFile = readIntegrationEnv();
const describeHarness = envFromFile ? describe : describe.skip;

describeHarness('isolation fixture harness (local Supabase)', () => {
  it('seeds distinct households and authenticates A and B (service role seed-only)', async () => {
    const env = await requireLocalSupabase(envFromFile);
    const admin = createSeedClient(env);
    const fixture = await seedIsolationFixture(admin);

    try {
      expect(fixture.userA.householdId).not.toBe(fixture.userB.householdId);
      expect(fixture.userA.stockItemId).not.toBe(fixture.userB.stockItemId);
      expect(fixture.sharedBarcode.length).toBeGreaterThan(0);

      const clients = await createAssertionClients(env, fixture);

      const { data: rowsA, error: errorA } = await clients.userA
        .from('stock_items')
        .select('id, household_id, barcode');

      expect(errorA).toBeNull();
      expect(rowsA).toEqual([
        expect.objectContaining({
          id: fixture.userA.stockItemId,
          household_id: fixture.userA.householdId,
          barcode: fixture.sharedBarcode,
        }),
      ]);

      const { data: rowsB, error: errorB } = await clients.userB
        .from('stock_items')
        .select('id, household_id, barcode');

      expect(errorB).toBeNull();
      expect(rowsB).toEqual([
        expect.objectContaining({
          id: fixture.userB.stockItemId,
          household_id: fixture.userB.householdId,
          barcode: fixture.sharedBarcode,
        }),
      ]);

      const { data: rowsNonMember, error: errorNonMember } =
        await clients.nonMember.from('stock_items').select('id');

      expect(errorNonMember).toBeNull();
      expect(rowsNonMember).toEqual([]);

      // Structural fixture assert for later #1 suites: two households seeded.
      expect(
        new Set([fixture.userA.householdId, fixture.userB.householdId]).size
      ).toBe(2);
    } finally {
      await teardownIsolationFixture(admin, fixture);
    }
  }, 60_000);
});
