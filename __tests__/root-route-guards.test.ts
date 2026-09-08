import {
  resolveRootScreenFamily,
  rootRouteGuards,
  type RootRouteGuardInput,
} from '@/lib/root-route-guards';

/**
 * Secondary #5 coverage: session×membership → screen-family truth-table.
 * No auth-layout / chrome snapshots — boolean mapping only.
 */

type Case = {
  name: string;
  input: RootRouteGuardInput;
  family: '(app)' | 'bootstrap-household' | '(auth)' | null;
};

const cases: Case[] = [
  {
    name: 'no session → (auth)',
    input: {
      hasSession: false,
      hasMembership: false,
      isMembershipReady: false,
    },
    family: '(auth)',
  },
  {
    name: 'no session ignores membership flags → (auth)',
    input: {
      hasSession: false,
      hasMembership: true,
      isMembershipReady: true,
    },
    family: '(auth)',
  },
  {
    name: 'session + membership → (app)',
    input: {
      hasSession: true,
      hasMembership: true,
      isMembershipReady: true,
    },
    family: '(app)',
  },
  {
    name: 'session + membership even if ready=false → (app)',
    input: {
      hasSession: true,
      hasMembership: true,
      isMembershipReady: false,
    },
    family: '(app)',
  },
  {
    name: 'session + no membership + ready → bootstrap-household',
    input: {
      hasSession: true,
      hasMembership: false,
      isMembershipReady: true,
    },
    family: 'bootstrap-household',
  },
  {
    name: 'session + no membership + !ready → null (no flash of app)',
    input: {
      hasSession: true,
      hasMembership: false,
      isMembershipReady: false,
    },
    family: null,
  },
];

describe('root route guards (Protected truth-table)', () => {
  it.each(cases)('$name', ({ input, family }) => {
    expect(resolveRootScreenFamily(input)).toBe(family);

    const guards = rootRouteGuards(input);
    const active = [guards.app, guards.bootstrapHousehold, guards.auth].filter(
      Boolean
    );
    expect(active.length).toBeLessThanOrEqual(1);

    if (family === '(app)') {
      expect(guards).toEqual({
        app: true,
        bootstrapHousehold: false,
        auth: false,
      });
    } else if (family === 'bootstrap-household') {
      expect(guards).toEqual({
        app: false,
        bootstrapHousehold: true,
        auth: false,
      });
    } else if (family === '(auth)') {
      expect(guards).toEqual({
        app: false,
        bootstrapHousehold: false,
        auth: true,
      });
    } else {
      expect(guards).toEqual({
        app: false,
        bootstrapHousehold: false,
        auth: false,
      });
    }
  });
});
