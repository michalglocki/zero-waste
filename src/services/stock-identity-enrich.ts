import {
  toStockIdentityFields,
  type OffMappedIdentity,
} from '@/services/open-food-facts';
import { updateStockItemIdentity } from '@/services/stock';

type EnrichSession = {
  generation: number;
  confirmed: boolean;
  identity: OffMappedIdentity | null;
  flushing: boolean;
};

/**
 * Module-level enrich sessions so Cancel never persists, while delta≥1 Confirm
 * can still apply a late OFF result after the sheet unmounts.
 */
const sessions = new Map<string, EnrichSession>();

/** Start (or restart) an enrich session for a barcode; returns the generation. */
export function beginEnrichSession(barcode: string): number {
  const trimmed = barcode.trim();
  const prev = sessions.get(trimmed);
  const generation = (prev?.generation ?? 0) + 1;
  sessions.set(trimmed, {
    generation,
    confirmed: false,
    identity: null,
    flushing: false,
  });
  return generation;
}

/** Store OFF/cache mapped identity for this session generation. */
export function setEnrichIdentity(
  barcode: string,
  generation: number,
  identity: OffMappedIdentity
): void {
  const trimmed = barcode.trim();
  const session = sessions.get(trimmed);
  if (!session || session.generation !== generation) {
    return;
  }
  session.identity = identity;
}

/** Allow identity persist for this barcode+generation after qty Confirm. */
export function markEnrichConfirmed(barcode: string, generation: number): void {
  const trimmed = barcode.trim();
  const session = sessions.get(trimmed);
  if (!session || session.generation !== generation) {
    return;
  }
  session.confirmed = true;
}

/**
 * Drop an unconfirmed enrich session (Cancel / delta 0).
 * Confirmed sessions stay so a late/background flush can still run.
 */
export function abandonEnrichSession(barcode: string, generation: number): void {
  const trimmed = barcode.trim();
  const session = sessions.get(trimmed);
  if (!session || session.generation !== generation || session.confirmed) {
    return;
  }
  sessions.delete(trimmed);
}

/**
 * Diff-only identity UPDATE when this session is confirmed and has OFF identity.
 * Soft-fails (logs); one background retry on failure; safe after sheet unmount.
 */
export async function flushEnrichIfReady(
  barcode: string,
  generation: number,
  options?: { isRetry?: boolean }
): Promise<void> {
  const trimmed = barcode.trim();
  const session = sessions.get(trimmed);
  if (
    !session ||
    session.generation !== generation ||
    !session.confirmed ||
    session.identity == null ||
    session.flushing
  ) {
    return;
  }

  session.flushing = true;
  const identity = session.identity;

  try {
    await updateStockItemIdentity(trimmed, toStockIdentityFields(identity));
    sessions.delete(trimmed);
  } catch (err) {
    session.flushing = false;
    console.warn('[stock-identity-enrich] identity update failed', {
      barcode: trimmed,
      generation,
      isRetry: options?.isRetry === true,
      err,
    });
    if (!options?.isRetry) {
      void flushEnrichIfReady(barcode, generation, { isRetry: true });
    } else {
      sessions.delete(trimmed);
    }
  }
}

export function identityFromStockRow(row: {
  name: string | null;
  main_category: string | null;
  auxiliary_category: string | null;
  pack_size: string | null;
}): OffMappedIdentity | null {
  const hasAny =
    row.name != null ||
    row.main_category != null ||
    row.auxiliary_category != null ||
    row.pack_size != null;
  if (!hasAny) {
    return null;
  }
  return {
    name: row.name,
    main_category: row.main_category,
    auxiliary_category: null,
    pack_size: row.pack_size,
  };
}
