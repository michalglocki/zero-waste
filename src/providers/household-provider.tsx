import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/providers/auth-provider';
import * as householdService from '@/services/household';
import type { Membership } from '@/types/household';

const MEMBERSHIP_RETRY_ATTEMPTS = 5;
const MEMBERSHIP_RETRY_DELAY_MS = 250;

type HouseholdContextValue = {
  membership: Membership | null;
  isMembershipReady: boolean;
  refreshMembership: () => Promise<Membership | null>;
  joinByInviteCode: (code: string) => Promise<{ error: Error | null }>;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMembershipWithRetry(userId: string): Promise<Membership | null> {
  for (let attempt = 0; attempt < MEMBERSHIP_RETRY_ATTEMPTS; attempt++) {
    const membership = await householdService.getMembership(userId);
    if (membership) {
      return membership;
    }
    if (attempt < MEMBERSHIP_RETRY_ATTEMPTS - 1) {
      await sleep(MEMBERSHIP_RETRY_DELAY_MS);
    }
  }
  return null;
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session, isReady: isAuthReady } = useAuth();
  const userId = session?.user?.id;
  const [membership, setMembership] = useState<Membership | null>(null);
  const [isMembershipReady, setIsMembershipReady] = useState(false);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    let cancelled = false;

    async function load() {
      if (!userId) {
        setMembership(null);
        setIsMembershipReady(true);
        return;
      }

      setIsMembershipReady(false);
      try {
        const next = await fetchMembershipWithRetry(userId);
        if (!cancelled) {
          setMembership(next);
        }
      } catch {
        if (!cancelled) {
          setMembership(null);
        }
      } finally {
        if (!cancelled) {
          setIsMembershipReady(true);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, userId]);

  async function refreshMembership() {
    if (!userId) {
      setMembership(null);
      setIsMembershipReady(true);
      return null;
    }

    setIsMembershipReady(false);
    try {
      const next = await fetchMembershipWithRetry(userId);
      setMembership(next);
      return next;
    } catch {
      setMembership(null);
      return null;
    } finally {
      setIsMembershipReady(true);
    }
  }

  async function joinByInviteCode(code: string) {
    try {
      await householdService.joinByInviteCode(code);
      await refreshMembership();
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join household';
      return { error: new Error(message) };
    }
  }

  return (
    <HouseholdContext.Provider
      value={{ membership, isMembershipReady, refreshMembership, joinByInviteCode }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const value = useContext(HouseholdContext);
  if (!value) {
    throw new Error('useHousehold must be used within HouseholdProvider');
  }
  return value;
}
