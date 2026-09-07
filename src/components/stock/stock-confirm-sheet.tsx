import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addStockByBarcode, getStockItemByBarcode } from '@/services/stock';

type StockConfirmSheetProps = {
  /** Trimmed barcode string; leading zeros preserved as text. */
  barcode: string;
  onDismiss: () => void;
  /** Called after a successful write (or delta-0 dismiss). */
  onSuccess: () => void;
};

/** Parse add-delta: integer ≥ 0; non-numeric / negative → 0. */
export function parseAddDelta(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return 0;
  }
  if (!/^\d+$/.test(trimmed)) {
    return 0;
  }
  return Number.parseInt(trimmed, 10);
}

/**
 * Confirm sheet: shows current household qty for a barcode and writes an add-delta.
 * Mount fresh per open (parent keys by barcode) so delta defaults to 1.
 * Delta 0 Confirm = dismiss with no write. Save errors stay on sheet with Retry.
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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const row = await getStockItemByBarcode(barcode);
        if (!cancelled) {
          setCurrentQty(row?.quantity ?? 0);
          setQtyError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCurrentQty(0);
          setQtyError(err instanceof Error ? err.message : 'Could not load quantity.');
        }
      } finally {
        if (!cancelled) {
          setLoadingQty(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [barcode]);

  const delta = parseAddDelta(deltaText);

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
      onSuccess();
      return;
    }

    setBusy(true);
    try {
      await addStockByBarcode(barcode, delta);
      onSuccess();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) {
          onDismiss();
        }
      }}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
          ]}>
          <ThemedText type="smallBold">Add to stock</ThemedText>
          <ThemedText type="default" style={styles.barcode}>
            {barcode}
          </ThemedText>

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
              onPress={onDismiss}
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
              disabled={busy || loadingQty || qtyError != null}
              onPress={() => void handleConfirm()}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.backgroundSelected,
                  opacity:
                    pressed || busy || loadingQty || qtyError != null ? 0.6 : 1,
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
