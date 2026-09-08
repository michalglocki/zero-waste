/**
 * @jest-environment node
 *
 * S-05 Phase 1 — utilization frequency / XOR events / recompute-on-re-add.
 * Assertion clients use user JWTs only — service role is seed/teardown.
 *
 * Run: `npm run test:integration` (requires migrated test project + .env.test.local).
 */
import '../support/load-test-env';

import { randomUUID } from 'node:crypto';

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
const describeUtil = envFromFile ? describe : describe.skip;

type UtilStockRow = {
  id: string;
  quantity: number;
  util_removal_count: number;
  util_last_removed_at: string | null;
  util_avg_interval_seconds: number | null;
  recommendation_ignored_at: string | null;
};

async function readUtilStock(
  client: SupabaseClient,
  stockItemId: string
): Promise<UtilStockRow | null> {
  const { data, error } = await client
    .from('stock_items')
    .select(
      'id, quantity, util_removal_count, util_last_removed_at, util_avg_interval_seconds, recommendation_ignored_at'
    )
    .eq('id', stockItemId)
    .maybeSingle();

  if (error) {
    throw new Error(`util stock read failed: ${error.message}`);
  }

  return data;
}

describeUtil('DB utilization frequency (S-05 Phase 1)', () => {
  let admin: SupabaseClient;
  let fixture: IsolationFixture;
  let clients: AssertionClients;
  let runId: string;

  beforeAll(async () => {
    const env = await requireIntegrationSupabase(envFromFile);
    admin = createSeedClient(env);
    fixture = await seedIsolationFixture(admin);
    clients = await createAssertionClients(env, fixture);
    runId = randomUUID().replace(/-/g, '').slice(0, 12);
  }, 120_000);

  afterAll(async () => {
    if (admin && fixture) {
      await teardownIsolationFixture(admin, fixture);
    }
  }, 60_000);

  it('no-code remove inserts name_key utilization event', async () => {
    const name = `Util NoCode ${runId}`;
    const { data: added, error: addError } = await clients.userA.rpc(
      'add_stock_item_manual_no_barcode',
      { p_name: name, p_delta: 2 }
    );
    expect(addError).toBeNull();
    expect(added?.id).toBeTruthy();

    const { data: removed, error: removeError } = await clients.userA.rpc(
      'remove_stock_item_by_id',
      { p_id: added!.id }
    );
    expect(removeError).toBeNull();
    expect(removed).toEqual(
      expect.objectContaining({
        deleted: false,
        item: expect.objectContaining({
          id: added!.id,
          quantity: 1,
          util_removal_count: 1,
        }),
      })
    );

    const { data: events, error: eventError } = await clients.userA
      .from('stock_utilization_events')
      .select('household_id, barcode, name_key')
      .eq('name_key', name.toLowerCase());

    expect(eventError).toBeNull();
    expect(events).toEqual([
      expect.objectContaining({
        household_id: fixture.userA.householdId,
        barcode: null,
        name_key: name.toLowerCase(),
      }),
    ]);
  });

  it('two removes set util avg on surviving qty≥1 row', async () => {
    const barcode = `util2-${runId}`;
    const { data: added, error: addError } = await clients.userA.rpc(
      'add_stock_item_by_barcode',
      { p_barcode: barcode, p_delta: 3 }
    );
    expect(addError).toBeNull();
    expect(added?.id).toBeTruthy();

    const { error: r1 } = await clients.userA.rpc('remove_stock_item_by_barcode', {
      p_barcode: barcode,
    });
    expect(r1).toBeNull();

    const afterOne = await readUtilStock(clients.userA, added!.id);
    expect(afterOne).toEqual(
      expect.objectContaining({
        quantity: 2,
        util_removal_count: 1,
        util_avg_interval_seconds: null,
      })
    );
    expect(afterOne?.util_last_removed_at).toBeTruthy();

    // Distinct removed_at so (max−min)/(N−1) is measurable.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const { data: second, error: r2 } = await clients.userA.rpc(
      'remove_stock_item_by_barcode',
      { p_barcode: barcode }
    );
    expect(r2).toBeNull();
    expect(second).toEqual(
      expect.objectContaining({
        deleted: false,
        item: expect.objectContaining({
          quantity: 1,
          util_removal_count: 2,
        }),
      })
    );

    const afterTwo = await readUtilStock(clients.userA, added!.id);
    expect(afterTwo?.util_removal_count).toBe(2);
    expect(afterTwo?.util_avg_interval_seconds).not.toBeNull();
    expect(afterTwo!.util_avg_interval_seconds!).toBeGreaterThan(0);
  });

  it('last-unit delete leaves events; re-add restores util columns', async () => {
    const barcode = `util-readd-${runId}`;
    const { data: added, error: addError } = await clients.userA.rpc(
      'add_stock_item_by_barcode',
      { p_barcode: barcode, p_delta: 2 }
    );
    expect(addError).toBeNull();

    await clients.userA.rpc('remove_stock_item_by_barcode', { p_barcode: barcode });
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const { data: lastRemove, error: lastError } = await clients.userA.rpc(
      'remove_stock_item_by_barcode',
      { p_barcode: barcode }
    );
    expect(lastError).toBeNull();
    expect(lastRemove).toEqual({ deleted: true });

    const gone = await readUtilStock(clients.userA, added!.id);
    expect(gone).toBeNull();

    const { data: events, error: eventError } = await clients.userA
      .from('stock_utilization_events')
      .select('id')
      .eq('barcode', barcode);
    expect(eventError).toBeNull();
    expect(events?.length).toBe(2);

    const { data: readded, error: readdError } = await clients.userA.rpc(
      'add_stock_item_by_barcode',
      { p_barcode: barcode, p_delta: 1 }
    );
    expect(readdError).toBeNull();
    expect(readded).toEqual(
      expect.objectContaining({
        barcode,
        quantity: 1,
        util_removal_count: 2,
      })
    );
    expect(readded?.util_avg_interval_seconds).not.toBeNull();
    expect(readded!.util_avg_interval_seconds!).toBeGreaterThan(0);
  });

  it('add clears recommendation_ignored_at set on the live row', async () => {
    const barcode = `util-ignore-${runId}`;
    const { data: added, error: addError } = await clients.userA.rpc(
      'add_stock_item_by_barcode',
      { p_barcode: barcode, p_delta: 1 }
    );
    expect(addError).toBeNull();

    const ignoredAt = new Date().toISOString();
    const { error: seedIgnoreError } = await admin
      .from('stock_items')
      .update({ recommendation_ignored_at: ignoredAt })
      .eq('id', added!.id);
    expect(seedIgnoreError).toBeNull();

    const before = await readUtilStock(clients.userA, added!.id);
    expect(before?.recommendation_ignored_at).toBeTruthy();

    const { data: bumped, error: bumpError } = await clients.userA.rpc(
      'add_stock_item_by_barcode',
      { p_barcode: barcode, p_delta: 1 }
    );
    expect(bumpError).toBeNull();
    expect(bumped?.quantity).toBe(2);
    expect(bumped?.recommendation_ignored_at).toBeNull();
  });

  it('member A cannot read household B utilization events or util columns', async () => {
    const beforeB = await readUtilStock(clients.userB, fixture.userB.stockItemId);
    expect(beforeB).toEqual(
      expect.objectContaining({
        id: fixture.userB.stockItemId,
        quantity: 2,
      })
    );

    const { data: eventsB, error: listError } = await clients.userA
      .from('stock_utilization_events')
      .select('id, household_id')
      .eq('household_id', fixture.userB.householdId);

    expect(listError).toBeNull();
    expect(eventsB).toEqual([]);

    const { data: stockB, error: stockError } = await clients.userA
      .from('stock_items')
      .select('id, util_removal_count')
      .eq('id', fixture.userB.stockItemId);

    expect(stockError).toBeNull();
    expect(stockB).toEqual([]);

    const afterB = await readUtilStock(clients.userB, fixture.userB.stockItemId);
    expect(afterB).toEqual(beforeB);
  });
});
