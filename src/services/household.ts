import { supabase } from '@/lib/supabase';
import type { Household, Membership } from '@/types/household';

export async function getMembership(userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('memberships')
    .select('user_id, household_id, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getInviteCode(householdId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('households')
    .select('invite_code')
    .eq('id', householdId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.invite_code ?? null;
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  const { data, error } = await supabase
    .from('households')
    .select('id, invite_code, created_at')
    .eq('id', householdId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/** Moves the caller's membership to the household for `code` (DB RPC). */
export async function joinByInviteCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_household_by_invite_code', {
    p_code: code,
  });

  if (error) {
    throw error;
  }

  return data as string;
}
