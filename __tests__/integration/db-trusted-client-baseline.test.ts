/**
 * @jest-environment node
 *
 * Phase 4 / risk #2b — trusted-client **baseline allow** (alarm), not a harden.
 *
 * Authenticated members of H can today, under RLS + table GRANTs:
 * - direct DELETE on own `stock_items` without going through remove RPC
 * - INSERT into `stock_utilization_events` without a paired stock change
 *
 * This is accepted MVP debt (remove-stock-item F1). Treat green allow as the
 * known contract until an intentional security slice (pre–S-05). If these
 * asserts start failing, GRANTs/policies flipped — do not "fix" by rewriting
 * them to expect deny without that slice. Cross-household direct DELETE must
 * still fail (#1).
 *
 * Run: `npm run test:integration`
 */
import '../support/load-test-env';

import type { SupabaseClient } from '@supabase/supabase-js';

import { readIntegrationEnv } from '../support/env';
import {
  createAssertionClients,
  createSeedClient,
  seedIsolationFixture,
  teardownIsolationFixture,
  type AssertionClients,
  type IsolationFixture,
} from '../support/fixtures';
import { requireIntegrationSupabase } from '../support/require-supabase';

const envFromFile = readIntegrationEnv();
const describeBaseline = envFromFile ? describe : describe.skip;

async function readStockById(
  client: SupabaseClient,
  stockItemId: string
): Promise<{ id: string; quantity: number } | null> {
  const { data, error } = await client
    .from('stock_items')
    .select('id, quantity')
    .eq('id', stockItemId)
    .maybeSingle();

  if (error) {
    throw new Error(`stock read failed: ${error.message}`);
  }

  return data;
}

describeBaseline('DB trusted-client baseline (#2b allow)', () => {
  let admin: SupabaseClient;
  let fixture: IsolationFixture;
  let clients: AssertionClients;

  beforeAll(async () => {
    const env = await requireIntegrationSupabase(envFromFile);
    admin = createSeedClient(env);
    fixture = await seedIsolationFixture(admin);
    clients = await createAssertionClients(env, fixture);

    expect(fixture.userA.householdId).not.toBe(fixture.userB.householdId);
  }, 120_000);

  afterAll(async () => {
    if (admin && fixture) {
      await teardownIsolationFixture(admin, fixture);
    }
  }, 60_000);

  it('member A can direct-DELETE own stock_items without remove RPC', async () => {
    // Disposable own-household row so we do not disturb shared fixture stock.
    const { data: inserted, error: insertError } = await clients.userA
      .from('stock_items')
      .insert({
        household_id: fixture.userA.householdId,
        barcode: `2b-del-${fixture.sharedBarcode}`,
        quantity: 1,
        name: '2b baseline delete probe',
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    expect(inserted?.id).toBeTruthy();

    const { data: deleted, error: deleteError } = await clients.userA
      .from('stock_items')
      .delete()
      .eq('id', inserted!.id)
      .select('id');

    // Baseline ALLOW — alarm if this starts failing without a harden slice.
    expect(deleteError).toBeNull();
    expect(deleted).toEqual([{ id: inserted!.id }]);

    const gone = await readStockById(clients.userA, inserted!.id);
    expect(gone).toBeNull();
  });

  it('member A can INSERT unpaired stock_utilization_events', async () => {
    const { data: event, error } = await clients.userA
      .from('stock_utilization_events')
      .insert({
        household_id: fixture.userA.householdId,
        barcode: `2b-evt-${fixture.sharedBarcode}`,
        removed_by: fixture.userA.id,
      })
      .select('id, household_id, barcode')
      .single();

    // Baseline ALLOW — unpaired event is known MVP debt, not product desire forever.
    expect(error).toBeNull();
    expect(event).toEqual(
      expect.objectContaining({
        household_id: fixture.userA.householdId,
        barcode: `2b-evt-${fixture.sharedBarcode}`,
      })
    );
    expect(event?.id).toBeTruthy();

    // Stock row for A fixture barcode must be unchanged (no paired remove).
    const stillA = await readStockById(clients.userA, fixture.userA.stockItemId);
    expect(stillA?.quantity).toBe(2);
  });

  it('cross-household direct DELETE still fails (#1 alongside #2b allow)', async () => {
    const beforeB = await readStockById(clients.userB, fixture.userB.stockItemId);
    expect(beforeB).toEqual(
      expect.objectContaining({
        id: fixture.userB.stockItemId,
        quantity: 2,
      })
    );

    const { data: deleted, error } = await clients.userA
      .from('stock_items')
      .delete()
      .eq('id', fixture.userB.stockItemId)
      .select('id');

    // Own-household allow must not widen to B — RLS zero-row delete.
    expect(error).toBeNull();
    expect(deleted).toEqual([]);

    const afterB = await readStockById(clients.userB, fixture.userB.stockItemId);
    expect(afterB).toEqual(beforeB);
  });
});
