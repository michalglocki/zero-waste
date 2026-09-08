/**
 * @jest-environment node
 *
 * Phase 3: DB isolation proofs for risks #1, #2a, #5 against hosted test Supabase.
 * Assertion clients use user JWTs / anon key only — service role is seed/teardown.
 *
 * Run: `npm run test:integration` (see __tests__/support/README.md).
 * `npm test` (jest-expo) deliberately excludes this folder.
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
const describeIsolation = envFromFile ? describe : describe.skip;

async function readStockById(
  client: SupabaseClient,
  stockItemId: string
): Promise<{ id: string; quantity: number; household_id: string } | null> {
  const { data, error } = await client
    .from('stock_items')
    .select('id, quantity, household_id')
    .eq('id', stockItemId)
    .maybeSingle();

  if (error) {
    throw new Error(`stock read failed: ${error.message}`);
  }

  return data;
}

describeIsolation('DB isolation (#1 / #2a / #5)', () => {
  let admin: SupabaseClient;
  let fixture: IsolationFixture;
  let clients: AssertionClients;

  beforeAll(async () => {
    const env = await requireIntegrationSupabase(envFromFile);
    admin = createSeedClient(env);
    fixture = await seedIsolationFixture(admin);
    clients = await createAssertionClients(env, fixture);

    // Structural fixture assert: #1 is unfalsifiable with a single household.
    expect(fixture.userA.householdId).not.toBe(fixture.userB.householdId);
    expect(
      new Set([fixture.userA.householdId, fixture.userB.householdId]).size
    ).toBe(2);
    expect(fixture.userA.stockItemId).not.toBe(fixture.userB.stockItemId);
  }, 120_000);

  afterAll(async () => {
    if (admin && fixture) {
      await teardownIsolationFixture(admin, fixture);
    }
  }, 60_000);

  describe('risk #1 — cross-household isolation', () => {
    it('member A cannot SELECT household B stock', async () => {
      const { data: allRows, error: listError } = await clients.userA
        .from('stock_items')
        .select('id, household_id');

      expect(listError).toBeNull();
      expect(allRows).toEqual([
        expect.objectContaining({
          id: fixture.userA.stockItemId,
          household_id: fixture.userA.householdId,
        }),
      ]);

      const { data: byId, error: byIdError } = await clients.userA
        .from('stock_items')
        .select('id')
        .eq('id', fixture.userB.stockItemId);

      expect(byIdError).toBeNull();
      expect(byId).toEqual([]);
    });

    it('member A cannot UPDATE or DELETE household B stock rows', async () => {
      const before = await readStockById(clients.userB, fixture.userB.stockItemId);
      expect(before).toEqual(
        expect.objectContaining({
          id: fixture.userB.stockItemId,
          quantity: 2,
          household_id: fixture.userB.householdId,
        })
      );

      const { data: updated, error: updateError } = await clients.userA
        .from('stock_items')
        .update({ quantity: 99, name: 'leaked-update' })
        .eq('id', fixture.userB.stockItemId)
        .select('id');

      // RLS filters the row — PostgREST reports success with zero matching rows.
      expect(updateError).toBeNull();
      expect(updated).toEqual([]);

      const { data: deleted, error: deleteError } = await clients.userA
        .from('stock_items')
        .delete()
        .eq('id', fixture.userB.stockItemId)
        .select('id');

      expect(deleteError).toBeNull();
      expect(deleted).toEqual([]);

      const after = await readStockById(clients.userB, fixture.userB.stockItemId);
      expect(after).toEqual(before);
    });

    // Adaptation: hosted test DB may lack remove_stock_item_by_id; plan allows
    // "B's id or shared barcode" — barcode path is the #1 RPC probe.
    it('shared-barcode RPC mutate as A touches only A; B quantity unchanged', async () => {
      const beforeB = await readStockById(clients.userB, fixture.userB.stockItemId);
      expect(beforeB?.quantity).toBe(2);

      const { data: added, error: addError } = await clients.userA.rpc(
        'add_stock_item_by_barcode',
        {
          p_barcode: fixture.sharedBarcode,
          p_delta: 1,
        }
      );

      expect(addError).toBeNull();
      expect(added).toEqual(
        expect.objectContaining({
          id: fixture.userA.stockItemId,
          household_id: fixture.userA.householdId,
          quantity: 3,
        })
      );

      const afterAddB = await readStockById(
        clients.userB,
        fixture.userB.stockItemId
      );
      expect(afterAddB).toEqual(beforeB);

      const { data: removed, error: removeError } = await clients.userA.rpc(
        'remove_stock_item_by_barcode',
        { p_barcode: fixture.sharedBarcode }
      );

      expect(removeError).toBeNull();
      expect(removed).toEqual(
        expect.objectContaining({
          deleted: false,
          item: expect.objectContaining({
            id: fixture.userA.stockItemId,
            quantity: 2,
          }),
        })
      );

      const afterRemoveB = await readStockById(
        clients.userB,
        fixture.userB.stockItemId
      );
      expect(afterRemoveB).toEqual(beforeB);
    });
  });

  describe('risk #2a — membership deny', () => {
    it('authenticated-without-membership SELECT is empty (not authz alone)', async () => {
      const { data, error } = await clients.nonMember
        .from('stock_items')
        .select('id');

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('non-member INSERT into stock_items fails household check', async () => {
      const { data, error } = await clients.nonMember
        .from('stock_items')
        .insert({
          // current_household_id() is null → WITH CHECK fails
          household_id: fixture.userA.householdId,
          barcode: `nm-${fixture.sharedBarcode}`,
          quantity: 1,
          name: 'should-fail',
        })
        .select('id');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it('non-member stock RPCs raise not a household member', async () => {
      const { error: addError } = await clients.nonMember.rpc(
        'add_stock_item_by_barcode',
        {
          p_barcode: fixture.sharedBarcode,
          p_delta: 1,
        }
      );
      expect(addError?.message).toMatch(/not a household member/i);

      // Prefer by-barcode while remove_stock_item_by_id may be absent on older test DBs.
      const { error: removeError } = await clients.nonMember.rpc(
        'remove_stock_item_by_barcode',
        { p_barcode: fixture.sharedBarcode }
      );
      expect(removeError?.message).toMatch(/not a household member/i);

      const stillA = await readStockById(clients.userA, fixture.userA.stockItemId);
      expect(stillA?.quantity).toBe(2);
    });
  });

  describe('risk #5 — anon + non-member DB gate', () => {
    it('anon cannot SELECT stock_items', async () => {
      const { data, error } = await clients.anon
        .from('stock_items')
        .select('id')
        .limit(1);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied|not authorized|JWT|denied/i);
    });

    it('anon cannot INSERT / UPDATE / DELETE stock_items', async () => {
      const { error: insertError } = await clients.anon.from('stock_items').insert({
        household_id: fixture.userA.householdId,
        barcode: `anon-${fixture.sharedBarcode}`,
        quantity: 1,
      });
      expect(insertError).not.toBeNull();

      const { error: updateError } = await clients.anon
        .from('stock_items')
        .update({ quantity: 1 })
        .eq('id', fixture.userA.stockItemId);
      expect(updateError).not.toBeNull();

      const { error: deleteError } = await clients.anon
        .from('stock_items')
        .delete()
        .eq('id', fixture.userA.stockItemId);
      expect(deleteError).not.toBeNull();

      const stillA = await readStockById(clients.userA, fixture.userA.stockItemId);
      expect(stillA?.quantity).toBe(2);
    });

    it('anon cannot EXECUTE stock RPCs', async () => {
      const { error: addError } = await clients.anon.rpc('add_stock_item_by_barcode', {
        p_barcode: fixture.sharedBarcode,
        p_delta: 1,
      });
      expect(addError).not.toBeNull();

      const { error: removeError } = await clients.anon.rpc(
        'remove_stock_item_by_barcode',
        { p_barcode: fixture.sharedBarcode }
      );
      expect(removeError).not.toBeNull();
    });

    it('non-member empty SELECT is paired with failed mutation (empty ≠ authz)', async () => {
      const { data: listed, error: listError } = await clients.nonMember
        .from('stock_items')
        .select('id');
      expect(listError).toBeNull();
      expect(listed).toEqual([]);

      const { error: updateError } = await clients.nonMember
        .from('stock_items')
        .update({ quantity: 1 })
        .eq('id', fixture.userA.stockItemId)
        .select('id');
      // No visible rows under RLS — zero-row update, A unchanged.
      expect(updateError).toBeNull();

      const { error: rpcError } = await clients.nonMember.rpc(
        'remove_stock_item_by_barcode',
        { p_barcode: fixture.sharedBarcode }
      );
      expect(rpcError?.message).toMatch(/not a household member/i);

      const stillA = await readStockById(clients.userA, fixture.userA.stockItemId);
      const stillB = await readStockById(clients.userB, fixture.userB.stockItemId);
      expect(stillA?.quantity).toBe(2);
      expect(stillB?.quantity).toBe(2);
    });
  });
});
