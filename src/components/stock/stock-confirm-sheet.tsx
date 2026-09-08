import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { parseAddDelta } from '@/components/stock/stock-quantity';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  invalidateOffIdentityCache,
  lookupOpenFoodFactsProduct,
  type OffMappedIdentity,
} from '@/services/open-food-facts';
import {
  abandonEnrichSession,
  beginEnrichSession,
  flushEnrichIfReady,
  identityFromStockRow,
  markEnrichConfirmed,
  setEnrichIdentity,
} from '@/services/stock-identity-enrich';
import { addStockByBarcode, getStockItemByBarcode } from '@/services/stock';

type StockConfirmSheetProps = {
  /** Trimmed barcode string; leading zeros preserved as text. */
  barcode: string;
  onDismiss: () => void;
  /** Called after a successful write (or delta-0 dismiss). */
  onSuccess: () => void;
};

type LookupStatus = 'idle' | 'looking' | 'found' | 'not_found' | 'error';

function secondaryLine(identity: OffMappedIdentity | null): string | null {
  if (!identity) {
    return null;
  }
  const parts = [identity.main_category, identity.pack_size].filter(
    (part): part is string => part != null && part.length > 0
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

function lookupStatusCopy(status: LookupStatus): string | null {
  switch (status) {
    case 'looking':
      return 'Looking up…';
    case 'not_found':
      return 'Not found';
    case 'error':
      return "Couldn't look up";
    default:
      return null;
  }
}

/**
 * Confirm sheet: shows current household qty for a barcode and writes an add-delta.
 * Mount fresh per open (parent keys by barcode) so delta defaults to 1.
 * Delta 0 Confirm = dismiss with no write. Save errors stay on sheet with Retry.
 * OFF enrich is soft / non-blocking; identity persists only after delta ≥ 1 Confirm.
 */
export function StockConfirmSheet({
  barcode,
  onDismiss,
  onSuccess,
}: StockConfirmSheetProps) {
  const theme = useTheme();
  const [currentQty, setCurrentQty] = useState(0);
  const [loadingQty, setLoadingQty] = useState(true);
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [deltaText, setDeltaText] = useState('1');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [preview, setPreview] = useState<OffMappedIdentity | null>(null);
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>('idle');

  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const hasOffIdentityRef = useRef(false);
  const lookupAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const generation = beginEnrichSession(barcode);
    generationRef.current = generation;
    hasOffIdentityRef.current = false;

    void (async () => {
      if (!cancelled && generation === generationRef.current) {
        setLookupStatus('looking');
      }

      try {
        const row = await getStockItemByBarcode(barcode);
        if (cancelled || generation !== generationRef.current) {
          return;
        }
        setCurrentQty(row?.quantity ?? 0);
        setQtyError(null);
        if (row) {
          const fromDb = identityFromStockRow(row);
          if (fromDb && !hasOffIdentityRef.current) {
            setPreview(fromDb);
          }
        }
      } catch (err) {
        if (!cancelled && generation === generationRef.current) {
          setCurrentQty(0);
          setQtyError(err instanceof Error ? err.message : 'Could not load quantity.');
        }
      } finally {
        if (!cancelled && generation === generationRef.current) {
          setLoadingQty(false);
        }
      }

      if (cancelled) {
        return;
      }

      await runLookup(generation, { bypassCache: false });
    })();

    return () => {
      cancelled = true;
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- barcode-keyed mount session
  }, [barcode]);

  async function runLookup(
    generation: number,
    options?: { bypassCache?: boolean }
  ) {
    if (options?.bypassCache) {
      invalidateOffIdentityCache(barcode);
    }

    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    if (mountedRef.current && generation === generationRef.current) {
      setLookupStatus('looking');
    }

    const result = await lookupOpenFoodFactsProduct(barcode, {
      bypassCache: options?.bypassCache,
      signal: controller.signal,
    });

    // Ignore stale lookups from a previous sheet generation or aborted request.
    if (
      generation !== generationRef.current ||
      controller.signal.aborted ||
      lookupAbortRef.current !== controller
    ) {
      return;
    }

    if (result.outcome === 'found') {
      hasOffIdentityRef.current = true;
      setEnrichIdentity(barcode, generation, result.identity);
      if (mountedRef.current) {
        setPreview(result.identity);
        setLookupStatus('found');
      }
      // May no-op unless Confirm already marked this generation.
      void flushEnrichIfReady(barcode, generation);
      return;
    }

    if (result.outcome === 'not_found') {
      if (mountedRef.current) {
        setLookupStatus('not_found');
      }
      return;
    }

    if (mountedRef.current) {
      setLookupStatus('error');
      console.warn('[stock-confirm] OFF lookup failed', result.error);
    }
  }

  const delta = parseAddDelta(deltaText);
  const statusCopy = lookupStatusCopy(lookupStatus);
  const meta = secondaryLine(preview);
  const title = preview?.name ?? barcode;
  const showBarcodeUnderTitle = preview?.name != null;

  function adjustDelta(step: number) {
    const next = Math.max(0, delta + step);
    setDeltaText(String(next));
  }

  async function handleConfirm() {
    if (busy || qtyError) {
      return;
    }

    setSaveError(null);

    if (delta < 1) {
      abandonEnrichSession(barcode, generationRef.current);
      onSuccess();
      return;
    }

    setBusy(true);
    try {
      await addStockByBarcode(barcode, delta);
      const generation = generationRef.current;
      markEnrichConfirmed(barcode, generation);
      // Fire-and-forget: qty is primary; identity flush must not block dismiss.
      void flushEnrichIfReady(barcode, generation);
      onSuccess();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function dismissWithoutConfirm() {
    abandonEnrichSession(barcode, generationRef.current);
    onDismiss();
  }

  const confirmDisabled = busy || loadingQty || qtyError != null;
  const showLookupRetry =
    lookupStatus === 'error' || lookupStatus === 'not_found';

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) {
          dismissWithoutConfirm();
        }
      }}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
          ]}>
          <ThemedText type="smallBold">Add to stock</ThemedText>
          <ThemedText type="default" style={showBarcodeUnderTitle ? undefined : styles.barcode}>
            {title}
          </ThemedText>
          {showBarcodeUnderTitle ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.barcode}>
              {barcode}
            </ThemedText>
          ) : null}
          {meta ? (
            <ThemedText type="small" themeColor="textSecondary">
              {meta}
            </ThemedText>
          ) : null}

          {statusCopy ? (
            <View style={styles.lookupRow}>
              {lookupStatus === 'looking' ? (
                <ActivityIndicator color={theme.textSecondary} />
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {statusCopy}
              </ThemedText>
              {showLookupRetry ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry product lookup"
                  disabled={busy}
                  onPress={() =>
                    void runLookup(generationRef.current, { bypassCache: true })
                  }
                  style={({ pressed }) => [{ opacity: pressed || busy ? 0.6 : 1 }]}>
                  <ThemedText type="link">Retry</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {loadingQty ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Current quantity: {currentQty}
            </ThemedText>
          )}

          {qtyError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {qtyError}
            </ThemedText>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary">
            Amount to add
          </ThemedText>

          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease amount"
              disabled={busy}
              onPress={() => adjustDelta(-1)}
              style={({ pressed }) => [
                styles.stepButton,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed || busy ? 0.6 : 1,
                },
              ]}>
              <ThemedText type="smallBold">−</ThemedText>
            </Pressable>

            <TextInput
              accessibilityLabel="Amount to add"
              editable={!busy}
              keyboardType="number-pad"
              value={deltaText}
              onChangeText={setDeltaText}
              style={[
                styles.deltaInput,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase amount"
              disabled={busy}
              onPress={() => adjustDelta(1)}
              style={({ pressed }) => [
                styles.stepButton,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed || busy ? 0.6 : 1,
                },
              ]}>
              <ThemedText type="smallBold">+</ThemedText>
            </Pressable>
          </View>

          {saveError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {saveError}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              disabled={busy}
              onPress={dismissWithoutConfirm}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed || busy ? 0.6 : 1,
                },
              ]}>
              <ThemedText type="smallBold">Cancel</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={saveError ? 'Retry' : 'Confirm'}
              disabled={confirmDisabled}
              onPress={() => void handleConfirm()}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.backgroundSelected,
                  opacity: pressed || confirmDisabled ? 0.6 : 1,
                },
              ]}>
              {busy ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <ThemedText type="smallBold">{saveError ? 'Retry' : 'Confirm'}</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  barcode: {
    fontVariant: ['tabular-nums'],
  },
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
  },
  deltaInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    textAlign: 'center',
    minHeight: 44,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
});
