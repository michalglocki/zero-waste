/**
 * Pure session×membership → screen-family mapping for RootNavigator.
 * Mirrors `Stack.Protected` guards in `src/app/_layout.tsx` — keep in sync.
 *
 * When session is present but membership is not ready yet, no family is active
 * (splash stays up; avoids flashing `(app)` or bootstrap).
 */

export type RootScreenFamily = '(app)' | 'bootstrap-household' | '(auth)';

export type RootRouteGuardInput = {
  hasSession: boolean;
  hasMembership: boolean;
  isMembershipReady: boolean;
};

export type RootRouteGuards = {
  app: boolean;
  bootstrapHousehold: boolean;
  auth: boolean;
};

/** Boolean guards passed to each `Stack.Protected` in RootNavigator. */
export function rootRouteGuards(input: RootRouteGuardInput): RootRouteGuards {
  const { hasSession, hasMembership, isMembershipReady } = input;

  return {
    app: hasSession && hasMembership,
    bootstrapHousehold: hasSession && !hasMembership && isMembershipReady,
    auth: !hasSession,
  };
}

/** Which screen family is active, or `null` while membership is still loading. */
export function resolveRootScreenFamily(
  input: RootRouteGuardInput
): RootScreenFamily | null {
  const guards = rootRouteGuards(input);

  if (guards.app) {
    return '(app)';
  }
  if (guards.bootstrapHousehold) {
    return 'bootstrap-household';
  }
  if (guards.auth) {
    return '(auth)';
  }

  return null;
}
