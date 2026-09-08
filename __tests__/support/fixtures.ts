import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAnonClient,
  createAuthedClient,
  createSeedClient,
} from './clients';
import type { IntegrationEnv } from './env';

export type FixtureUser = {
  id: string;
  email: string;
  password: string;
  householdId: string;
  stockItemId: string;
};

export type NonMemberUser = {
  id: string;
  email: string;
  password: string;
};

export type IsolationFixture = {
  sharedBarcode: string;
  userA: FixtureUser;
  userB: FixtureUser;
  nonMember: NonMemberUser;
};

export type AssertionClients = {
  anon: SupabaseClient;
  userA: SupabaseClient;
  userB: SupabaseClient;
  nonMember: SupabaseClient;
};

const DEFAULT_PASSWORD = 'harness-test-password';

async function createConfirmedUser(
  admin: SupabaseClient,
  email: string,
  password: string
): Promise<{ id: string; email: string; password: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`createUser failed for ${email}: ${error?.message ?? 'no user'}`);
  }

  return { id: data.user.id, email, password };
}

async function readMembershipHouseholdId(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const { data, error } = await admin
    .from('memberships')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`membership lookup failed for ${userId}: ${error.message}`);
  }
  if (!data?.household_id) {
    throw new Error(`expected signup trigger membership for user ${userId}`);
  }

  return data.household_id as string;
}

async function insertStockRow(
  admin: SupabaseClient,
  householdId: string,
  barcode: string,
  name: string
): Promise<string> {
  const { data, error } = await admin
    .from('stock_items')
    .insert({
      household_id: householdId,
      barcode,
      quantity: 2,
      name,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(
      `stock seed failed for household ${householdId}: ${error?.message ?? 'no row'}`
    );
  }

  return data.id as string;
}

/**
 * Seed two distinct households with stock (shared barcode OK) plus a
 * session-capable user with no membership. Uses service role / admin only.
 * Does not assert product behavior.
 */
export async function seedIsolationFixture(
  admin: SupabaseClient
): Promise<IsolationFixture> {
  const runId = randomUUID();
  const sharedBarcode = `590${runId.replace(/-/g, '').slice(0, 10)}`;

  const createdA = await createConfirmedUser(
    admin,
    `harness-a-${runId}@example.com`,
    DEFAULT_PASSWORD
  );
  const createdB = await createConfirmedUser(
    admin,
    `harness-b-${runId}@example.com`,
    DEFAULT_PASSWORD
  );
  const createdNonMember = await createConfirmedUser(
    admin,
    `harness-nonmember-${runId}@example.com`,
    DEFAULT_PASSWORD
  );

  const householdA = await readMembershipHouseholdId(admin, createdA.id);
  const householdB = await readMembershipHouseholdId(admin, createdB.id);
  const nonMemberHousehold = await readMembershipHouseholdId(
    admin,
    createdNonMember.id
  );

  if (householdA === householdB) {
    throw new Error('fixture invariant broken: A and B share a household_id');
  }

  const stockAId = await insertStockRow(
    admin,
    householdA,
    sharedBarcode,
    'Harness A milk'
  );
  const stockBId = await insertStockRow(
    admin,
    householdB,
    sharedBarcode,
    'Harness B milk'
  );

  const { error: deleteMembershipError } = await admin
    .from('memberships')
    .delete()
    .eq('user_id', createdNonMember.id);

  if (deleteMembershipError) {
    throw new Error(
      `failed to strip non-member membership: ${deleteMembershipError.message}`
    );
  }

  // Empty household left by signup trigger — remove so it does not linger.
  const { error: deleteHouseholdError } = await admin
    .from('households')
    .delete()
    .eq('id', nonMemberHousehold);

  if (deleteHouseholdError) {
    throw new Error(
      `failed to delete non-member empty household: ${deleteHouseholdError.message}`
    );
  }

  return {
    sharedBarcode,
    userA: {
      ...createdA,
      householdId: householdA,
      stockItemId: stockAId,
    },
    userB: {
      ...createdB,
      householdId: householdB,
      stockItemId: stockBId,
    },
    nonMember: {
      id: createdNonMember.id,
      email: createdNonMember.email,
      password: createdNonMember.password,
    },
  };
}

/** Build assertion clients. Factories never fall back to the service role. */
export async function createAssertionClients(
  env: IntegrationEnv,
  fixture: IsolationFixture
): Promise<AssertionClients> {
  const [userA, userB, nonMember] = await Promise.all([
    createAuthedClient(env, fixture.userA.email, fixture.userA.password, 'a'),
    createAuthedClient(env, fixture.userB.email, fixture.userB.password, 'b'),
    createAuthedClient(
      env,
      fixture.nonMember.email,
      fixture.nonMember.password,
      'non-member'
    ),
  ]);

  return {
    anon: createAnonClient(env),
    userA,
    userB,
    nonMember,
  };
}

export async function teardownIsolationFixture(
  admin: SupabaseClient,
  fixture: IsolationFixture
): Promise<void> {
  const householdIds = [fixture.userA.householdId, fixture.userB.householdId];

  await admin.from('stock_items').delete().in('household_id', householdIds);

  for (const userId of [
    fixture.userA.id,
    fixture.userB.id,
    fixture.nonMember.id,
  ]) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(`deleteUser failed for ${userId}: ${error.message}`);
    }
  }

  // Memberships cascade from auth.users; remove leftover empty households.
  await admin.from('households').delete().in('id', householdIds);
}

export { createSeedClient };
